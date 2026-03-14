import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendToZohoFlow, type ZohoPayload } from "@/lib/backend"
import ExcelJS from "exceljs"
import * as XLSX from "xlsx"
import path from "path"

const TEMPLATE_PATH = path.join(process.cwd(), "assets", "templates", "PLANTILLA_INGRESO.xlsx")
const STORAGE_BUCKET = "onboarding-excels"
const SIGNED_URL_TTL_SECONDS = 14 * 24 * 60 * 60
const MODULO_DASHBOARD_BI = "Dashboard BI"
const MODULO_DASHBOARD_BI_LEGACY = "Dasboard BI"

const sanitizeRut = (rut?: string) => (rut || "sin-rut").replace(/\./g, "").replace(/-/g, "").trim() || "sin-rut"

const normalizeModuloAdicional = (value: string = "") => {
  const normalized = value.trim()
  if (!normalized) return ""
  return normalized === MODULO_DASHBOARD_BI_LEGACY ? MODULO_DASHBOARD_BI : normalized
}

const normalizeModulosAdicionales = (values?: string[]) => {
  const normalizedValues = Array.isArray(values)
    ? values.map((value) => normalizeModuloAdicional(value || "")).filter((value) => value.length > 0)
    : []
  return Array.from(new Set(normalizedValues))
}

const formatTimestamp = () => {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(
    now.getMinutes(),
  )}${pad(now.getSeconds())}`
}

const splitNombre = (nombreCompleto?: string) => {
  const trimmed = (nombreCompleto || "").trim()
  if (!trimmed) return { nombres: "", apellidos: "" }
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return { nombres: parts[0], apellidos: "" }
  return { nombres: parts.slice(0, -1).join(" "), apellidos: parts.slice(-1).join(" ") }
}

const normalizeRutForExcel = (rut?: string) => (rut || "").replace(/[^0-9A-Za-z]/g, "").toUpperCase()

const pickPhone = (trabajador: any, index: number) => {
  const direct = trabajador?.[`telefono${index}`] || trabajador?.[`telefono_${index}`]
  if (direct) return direct
  if (Array.isArray(trabajador?.telefonos)) {
    const fromArray = trabajador.telefonos[index - 1]
    if (fromArray) return fromArray
  }
  if (index === 1) {
    return trabajador?.telefono || trabajador?.telefonoContacto || ""
  }
  return ""
}

const resolveTrabajadorGrupo = (trabajador: any, grupos: any[] = []) => {
  const grupoDesdeId = grupos.find((grupo: any) => String(grupo?.id) === String(trabajador?.grupoId))
  return trabajador?.grupoNombre || trabajador?.grupo || grupoDesdeId?.nombre || ""
}

const setExcelCell = (
  sheet: ExcelJS.Worksheet,
  cellAddress: string,
  value: string | number | null | undefined,
) => {
  if (value === undefined || value === null || value === "") return
  sheet.getCell(cellAddress).value = value
}

const buildUsuariosWorkbook = (payload: ZohoPayload) => {
  const headers = [
    "identificador",
    "email",
    "email alternativo comprobantes",
    "nombre",
    "apellido",
    "grupo",
    "fono1",
    "fono2",
    "fono3",
    "identificador razon social",
    "tipo",
  ]

  const empresaRut = normalizeRutForExcel(payload.formData?.empresa?.rut)
  const grupos = payload.formData?.empresa?.grupos || []
  const trabajadoresRows = (payload.formData?.trabajadores || []).map((trabajador: any) => {
    const { nombres, apellidos } = splitNombre(trabajador?.nombre)
    return [
      normalizeRutForExcel(trabajador?.rut),
      trabajador?.correo || "",
      "",
      nombres,
      apellidos,
      resolveTrabajadorGrupo(trabajador, grupos),
      pickPhone(trabajador, 1),
      pickPhone(trabajador, 2),
      pickPhone(trabajador, 3),
      empresaRut,
      "usuario",
    ]
  })
  const adminsRows = (payload.formData?.admins || []).map((admin: any) => {
    const nombres = admin?.nombre || ""
    const apellidos = admin?.apellido || ""
    return [
      normalizeRutForExcel(admin?.rut),
      admin?.email || "",
      "",
      nombres,
      apellidos,
      "",
      admin?.telefono || "",
      "",
      "",
      empresaRut,
      "administrador",
    ]
  })
  const rows = [...adminsRows, ...trabajadoresRows]

  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, "Usuarios")
  return wb
}

const buildPlanificacionWorkbook = async (payload: ZohoPayload) => {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(TEMPLATE_PATH)
  const sheet = wb.getWorksheet("Trabajadores")
  if (!sheet) {
    throw new Error("No se encontro la hoja 'Trabajadores' en la plantilla.")
  }

  const empresa = payload.formData?.empresa || ({} as any)
  const admin = payload.formData?.admins?.[0] || {}

  setExcelCell(sheet, "C7", empresa.razonSocial || "")
  setExcelCell(sheet, "C8", empresa.nombreFantasia || "")
  setExcelCell(sheet, "C9", empresa.rut || "")
  setExcelCell(sheet, "C10", empresa.giro || "")
  setExcelCell(sheet, "C11", empresa.direccion || "")
  setExcelCell(sheet, "C12", empresa.comuna || "")
  setExcelCell(sheet, "C13", empresa.emailFacturacion || "")
  setExcelCell(sheet, "C14", empresa.telefonoContacto || "")
  setExcelCell(
    sheet,
    "C15",
    Array.isArray(empresa.sistema) ? empresa.sistema.join(", ") : empresa.sistema || "",
  )
  setExcelCell(sheet, "C16", empresa.rubro || "")

  const turnos = payload.formData?.turnos || []
  const planificaciones = payload.formData?.planificaciones || []
  const asignaciones = payload.formData?.asignaciones || []
  const trabajadores = payload.formData?.trabajadores || []
  const admins = payload.formData?.admins || []
  const grupos = payload.formData?.empresa?.grupos || []

  const workerHeaderRowIndex = 25
  const adminBlockStartRow = 18
  const adminBlockHeight = 5
  const adminSpacerRows = 1
  const cloneStyle = (style: ExcelJS.Style | undefined) =>
    style ? (JSON.parse(JSON.stringify(style)) as ExcelJS.Style) : undefined
  const adminCount = admins.length > 0 ? admins.length : 1

  const merges = ((sheet as any)._merges && Object.keys((sheet as any)._merges)) || []
  const baseMergeRanges = merges
    .map((range: string) => {
      const match = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/)
      if (!match) return null
      const startRow = Number(match[2])
      const endRow = Number(match[4])
      if (startRow >= adminBlockStartRow && endRow <= adminBlockStartRow + adminBlockHeight - 1) {
        return { range, startRow, endRow }
      }
      return null
    })
    .filter(Boolean) as Array<{ range: string; startRow: number; endRow: number }>

  for (let i = 1; i < adminCount; i += 1) {
    const insertRow = adminBlockStartRow + i * (adminBlockHeight + adminSpacerRows)
    sheet.spliceRows(insertRow, 0, ...Array(adminBlockHeight + adminSpacerRows).fill([]))

    for (let rowOffset = 0; rowOffset < adminBlockHeight; rowOffset += 1) {
      const sourceRow = sheet.getRow(adminBlockStartRow + rowOffset)
      const targetRow = sheet.getRow(insertRow + rowOffset)
      targetRow.height = sourceRow.height
      sourceRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const targetCell = targetRow.getCell(colNumber)
        targetCell.style = cloneStyle(cell.style) || {}
        if (colNumber === 2) {
          targetCell.value = cell.value
        } else {
          targetCell.value = null
        }
      })
    }

    baseMergeRanges.forEach((merge) => {
      const rowOffset = insertRow - adminBlockStartRow
      const range = merge.range.replace(/(\d+)/g, (match) => String(Number(match) + rowOffset))
      sheet.mergeCells(range)
    })
  }

  for (let i = 0; i < adminCount; i += 1) {
    const admin = admins[i] || null
    const blockStartRow = adminBlockStartRow + i * (adminBlockHeight + adminSpacerRows)
    const adminNombre = admin ? [admin?.nombre, admin?.apellido].filter(Boolean).join(" ") : "Sin administradores"
    setExcelCell(sheet, `B${blockStartRow}`, `Datos Administrador ${i + 1} del Sistema`)
    setExcelCell(sheet, `C${blockStartRow + 1}`, adminNombre)
    setExcelCell(sheet, `C${blockStartRow + 2}`, admin?.rut || "")
    setExcelCell(sheet, `C${blockStartRow + 3}`, admin?.telefono || "")
    setExcelCell(sheet, `C${blockStartRow + 4}`, admin?.email || "")
  }

  const insertedRows = (adminCount - 1) * (adminBlockHeight + adminSpacerRows)
  const newWorkerHeaderRowIndex = workerHeaderRowIndex + insertedRows
  setExcelCell(sheet, `J${newWorkerHeaderRowIndex}`, "Col")

  // Columnas fijas de la plantilla para teléfonos (AD, AE, AF).
  const phoneColumns = [30, 31, 32]
  phoneColumns.forEach((col) => {
    const column = sheet.getColumn(col)
    if (!column.width || column.width < 16) {
      column.width = 16
    }
  })

  const findTurno = (turnoId: string | number | null | undefined) =>
    turnos.find((turno: any) => String(turno.id) === String(turnoId))

  const hasLibre = (turno: any) => {
    const nombre = String(turno?.nombre || "").toLowerCase()
    return nombre.includes("libre") || nombre.includes("descanso")
  }

  const findAsignacion = (trabajadorId: string | number) =>
    asignaciones.find(
      (asig: any) =>
        String(asig.trabajadorId) === String(trabajadorId) &&
        asig.planificacionId &&
        asig.desde &&
        asig.hasta,
    )

  const startRow = newWorkerHeaderRowIndex + 1
  trabajadores.forEach((trabajador: any, index: number) => {
    const rowIndex = startRow + index
    const { nombres, apellidos } = splitNombre(trabajador?.nombre)
    const grupo = resolveTrabajadorGrupo(trabajador, grupos)

    const asignacion = findAsignacion(trabajador?.id)
    const plan = planificaciones.find((p: any) => String(p.id) === String(asignacion?.planificacionId))
    const fechaInicio = asignacion?.desde || ""
    const fechaFin = asignacion?.hasta === "permanente" ? "PERMANENTE" : asignacion?.hasta || ""

    const rowValues: (string | number)[] = [
      trabajador?.rut || "",
      trabajador?.correo || "",
      nombres,
      apellidos,
      grupo,
      fechaInicio,
      fechaFin,
    ]

    const diasTurnos = Array.isArray(plan?.diasTurnos) ? plan.diasTurnos : Array(7).fill(null)

    diasTurnos.forEach((turnoId: any) => {
      const turno = findTurno(turnoId)
      if (!turno || hasLibre(turno)) {
        rowValues.push("", "", "")
        return
      }
      let colacionValue = ""
      if (turno?.tipoColacion) {
        const tipo = turno.tipoColacion.toLowerCase()
        if (tipo === "sin") {
          colacionValue = "Sin Colaci\u00f3n"
        } else if (tipo === "libre") {
          colacionValue = turno.colacionMinutos ? `${turno.colacionMinutos} min libre` : "Colaci\u00f3n libre"
        } else if (tipo === "fija") {
          colacionValue =
            turno.colacionInicio && turno.colacionFin
              ? `${turno.colacionInicio} - ${turno.colacionFin}`
              : "Colaci\u00f3n fija"
        }
      } else {
        colacionValue = turno.colacionMinutos || ""
      }
      rowValues.push(turno.horaInicio || "", colacionValue, turno.horaFin || "")
    })

    const row = sheet.getRow(rowIndex)
    rowValues.forEach((value, valueIndex) => {
      if (value === undefined || value === null || value === "") return
      row.getCell(2 + valueIndex).value = value
    })
    phoneColumns.forEach((col, idx) => {
      if (!col) return
      const phoneValue = pickPhone(trabajador, idx + 1)
      if (phoneValue) {
        row.getCell(col).value = phoneValue
      }
    })
  })

  return wb
}

export async function POST(request: NextRequest) {
  try {
    console.log("[v0] ===== /api/submit-to-zoho: INICIO =====")

    const incomingPayload = (await request.json()) as Partial<ZohoPayload>
    const incomingFormData = incomingPayload.formData ?? ({} as Partial<ZohoPayload["formData"]>)
    const incomingEmpresa = incomingFormData.empresa ?? ({} as Partial<ZohoPayload["formData"]["empresa"]>)

    // Normaliza y completa el payload para mantener estructura/orden estable en todos los pasos.
    const safeEmpresa: ZohoPayload["formData"]["empresa"] = {
      id_zoho: incomingEmpresa.id_zoho ?? incomingPayload.id_zoho ?? null,
      razonSocial: incomingEmpresa.razonSocial || "",
      nombreFantasia: incomingEmpresa.nombreFantasia || "",
      rut: incomingEmpresa.rut || "",
      giro: incomingEmpresa.giro || "",
      direccion: incomingEmpresa.direccion || "",
      comuna: incomingEmpresa.comuna || "",
      emailFacturacion: incomingEmpresa.emailFacturacion || "",
      telefonoContacto: incomingEmpresa.telefonoContacto || "",
      ejecutivoTelefono: incomingEmpresa.ejecutivoTelefono || "",
      ejecutivoNombre: incomingEmpresa.ejecutivoNombre || "",
      sistema: Array.isArray(incomingEmpresa.sistema) ? incomingEmpresa.sistema : [],
      modulosAdicionales: normalizeModulosAdicionales(incomingEmpresa.modulosAdicionales),
      modulosAdicionalesOtro: incomingEmpresa.modulosAdicionalesOtro || "",
      rubro: incomingEmpresa.rubro || "",
      grupos: Array.isArray((incomingEmpresa as any).grupos) ? (incomingEmpresa as any).grupos : [],
    }

    const safeFormData: ZohoPayload["formData"] = {
      empresa: safeEmpresa,
      admins: Array.isArray(incomingFormData.admins) ? incomingFormData.admins : [],
      trabajadores: Array.isArray(incomingFormData.trabajadores) ? incomingFormData.trabajadores : [],
      turnos: Array.isArray(incomingFormData.turnos) ? incomingFormData.turnos : [],
      planificaciones: Array.isArray(incomingFormData.planificaciones) ? incomingFormData.planificaciones : [],
      asignaciones: Array.isArray(incomingFormData.asignaciones) ? incomingFormData.asignaciones : [],
      configureNow: Boolean(incomingFormData.configureNow),
    }

    const metadataPasoActual =
      typeof incomingPayload.metadata?.pasoActual === "number"
        ? incomingPayload.metadata.pasoActual
        : typeof incomingPayload.currentStep === "number"
          ? incomingPayload.currentStep
          : 0
    const metadataTotalPasos =
      typeof incomingPayload.metadata?.totalPasos === "number" ? incomingPayload.metadata.totalPasos : 0
    const metadataPorcentaje =
      typeof incomingPayload.metadata?.porcentajeProgreso === "number" ? incomingPayload.metadata.porcentajeProgreso : 0
    const metadataEmpresaRut = incomingPayload.metadata?.empresaRut || safeEmpresa.rut || "Sin RUT"
    const metadataEmpresaNombre =
      incomingPayload.metadata?.empresaNombre || safeEmpresa.razonSocial || safeEmpresa.nombreFantasia || "Sin nombre"
    const metadataPasoNombre = incomingPayload.metadata?.pasoNombre || `Paso ${metadataPasoActual}`
    const metadataTotalTrabajadores =
      typeof incomingPayload.metadata?.totalTrabajadores === "number"
        ? incomingPayload.metadata.totalTrabajadores
        : safeFormData.trabajadores.length
    const metadataTotalGrupos =
      typeof incomingPayload.metadata?.totalGrupos === "number"
        ? incomingPayload.metadata.totalGrupos
        : safeEmpresa.grupos.length
    const metadataDecision =
      typeof incomingPayload.metadata?.decision === "string" ? incomingPayload.metadata.decision : ""

    const payload: ZohoPayload = {
      accion: incomingPayload.accion === "completado" ? "completado" : "progreso",
      fechaHoraEnvio:
        typeof incomingPayload.fechaHoraEnvio === "string" && incomingPayload.fechaHoraEnvio.trim() !== ""
          ? incomingPayload.fechaHoraEnvio
          : new Date().toISOString(),
      eventType: incomingPayload.eventType === "complete" ? "complete" : "progress",
      id_zoho: incomingPayload.id_zoho ?? safeEmpresa.id_zoho ?? null,
      onboardingId: incomingPayload.onboardingId ?? null,
      currentStep: typeof incomingPayload.currentStep === "number" ? incomingPayload.currentStep : metadataPasoActual,
      navigationHistory: Array.isArray(incomingPayload.navigationHistory) ? incomingPayload.navigationHistory : [],
      estado:
        incomingPayload.estado ||
        (incomingPayload.eventType === "complete" || incomingPayload.accion === "completado" ? "Completado" : "En Curso"),
      fecha_completado: incomingPayload.fecha_completado ?? null,
      totalTrabajadores:
        typeof incomingPayload.totalTrabajadores === "number"
          ? incomingPayload.totalTrabajadores
          : safeFormData.trabajadores.length,
      formData: safeFormData,
      metadata: {
        empresaRut: metadataEmpresaRut,
        empresaNombre: metadataEmpresaNombre,
        pasoActual: metadataPasoActual,
        pasoNombre: metadataPasoNombre,
        totalPasos: metadataTotalPasos,
        porcentajeProgreso: metadataPorcentaje,
        totalTrabajadores: metadataTotalTrabajadores,
        totalGrupos: metadataTotalGrupos,
        decision: metadataDecision,
      },
      excelUrls: {
        usuarios: incomingPayload.excelUrls?.usuarios || { filename: "", url: "" },
        planificaciones: incomingPayload.excelUrls?.planificaciones || { filename: "", url: "" },
      },
      excelUrlUsuarios: incomingPayload.excelUrlUsuarios || incomingPayload.excelUrls?.usuarios?.url || "",
      excelUrlPlanificaciones:
        incomingPayload.excelUrlPlanificaciones || incomingPayload.excelUrls?.planificaciones?.url || "",
      excelFile: incomingPayload.excelFile ?? null,
    }

    const historySupabaseUrl = process.env.SUPABASE_URL
    const historySupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (historySupabaseUrl && historySupabaseServiceRoleKey) {
      try {
        const historyClient = createClient(historySupabaseUrl, historySupabaseServiceRoleKey, {
          auth: { persistSession: false },
        })
        const { error: historyError } = await historyClient.from("onboarding_history").insert({
          onboarding_id: payload.onboardingId || null,
          source: "submit_to_zoho",
          event_type: payload.eventType || payload.accion || null,
          current_step: typeof payload.currentStep === "number" ? payload.currentStep : null,
          estado: payload.estado || null,
          payload,
          created_at: new Date().toISOString(),
        })
        if (historyError) {
          console.error("[v0] /api/submit-to-zoho: Error insertando onboarding_history:", historyError)
        }
      } catch (historyInsertError) {
        console.error("[v0] /api/submit-to-zoho: Error inesperado insertando onboarding_history:", historyInsertError)
      }
    } else {
      console.warn("[v0] /api/submit-to-zoho: Supabase env no disponible para onboarding_history.")
    }

    console.log("[v0] /api/submit-to-zoho: Payload recibido")
    console.log("[v0] /api/submit-to-zoho: id_zoho:", payload.id_zoho)
    console.log("[v0] /api/submit-to-zoho: eventType:", payload.eventType)
    console.log("[v0] /api/submit-to-zoho: accion:", payload.accion)
    console.log("[v0] /api/submit-to-zoho: empresa:", safeFormData.empresa?.razonSocial)
    // </CHANGE>

    if (
      payload.eventType === "complete" &&
      safeFormData.empresa &&
      safeFormData.empresa.razonSocial &&
      safeFormData.empresa.razonSocial.trim() !== ""
    ) {
      console.log("[v0] /api/submit-to-zoho: Generando archivos Excel...")

      const supabaseUrl = process.env.SUPABASE_URL
      const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

      if (!supabaseUrl || !supabaseServiceRoleKey) {
        console.error("[v0] /api/submit-to-zoho: Faltan credenciales de Supabase.")
      } else {
        try {
          const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
            auth: { persistSession: false },
          })
          const { error: bucketError } = await supabase.storage.createBucket(STORAGE_BUCKET, { public: false })
          if (bucketError && !bucketError.message.toLowerCase().includes("already exists")) {
            throw bucketError
          }
          const rutKey = sanitizeRut(safeFormData.empresa.rut)
          const timestamp = formatTimestamp()
          const usuariosFilename = `usuarios-${rutKey}-${timestamp}.xlsx`
          const planificacionesFilename = `planificaciones-${rutKey}-${timestamp}.xlsx`
          const usuariosPath = `onboarding/${rutKey}/${usuariosFilename}`
          const planificacionesPath = `onboarding/${rutKey}/${planificacionesFilename}`

          const usuariosWorkbook = buildUsuariosWorkbook(payload)
          const planificacionesWorkbook = await buildPlanificacionWorkbook(payload)

          const usuariosBuffer = XLSX.write(usuariosWorkbook, { type: "buffer", bookType: "xlsx" })
          const planificacionesBuffer = Buffer.from(await planificacionesWorkbook.xlsx.writeBuffer())

          const uploadOptions = {
            contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            upsert: true,
          }

          const { error: usuariosUploadError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(usuariosPath, usuariosBuffer, uploadOptions)
          if (usuariosUploadError) throw usuariosUploadError

          const { error: planificacionesUploadError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(planificacionesPath, planificacionesBuffer, uploadOptions)
          if (planificacionesUploadError) throw planificacionesUploadError

          const { data: usuariosSigned, error: usuariosSignedError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .createSignedUrl(usuariosPath, SIGNED_URL_TTL_SECONDS)
          if (usuariosSignedError) throw usuariosSignedError

          const { data: planificacionesSigned, error: planificacionesSignedError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .createSignedUrl(planificacionesPath, SIGNED_URL_TTL_SECONDS)
          if (planificacionesSignedError) throw planificacionesSignedError

          payload.excelUrls = {
            usuarios: { filename: usuariosFilename, url: usuariosSigned?.signedUrl || "" },
            planificaciones: { filename: planificacionesFilename, url: planificacionesSigned?.signedUrl || "" },
          }
          payload.excelUrlUsuarios = usuariosSigned?.signedUrl || ""
          payload.excelUrlPlanificaciones = planificacionesSigned?.signedUrl || ""
          payload.excelFile = null

          console.log(
            "[v0] /api/submit-to-zoho: Excel subidos:",
            payload.excelUrlUsuarios,
            payload.excelUrlPlanificaciones,
          )

          const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString()
          if (payload.onboardingId) {
            const { data: onboardingRow, error: onboardingFetchError } = await supabase
              .from("onboardings")
              .select("datos_actuales")
              .eq("id", payload.onboardingId)
              .single()
            if (onboardingFetchError) {
              console.error("[v0] /api/submit-to-zoho: Error obteniendo onboarding:", onboardingFetchError)
            } else {
              const mergedDatos = {
                ...(onboardingRow?.datos_actuales || {}),
                ...safeFormData,
                excelUrls: payload.excelUrls,
                excelUrlUsuarios: payload.excelUrlUsuarios,
                excelUrlPlanificaciones: payload.excelUrlPlanificaciones,
              }
              const { error: onboardingUpdateError } = await supabase
                .from("onboardings")
                .update({
                  datos_actuales: mergedDatos,
                  fecha_ultima_actualizacion: new Date().toISOString(),
                })
                .eq("id", payload.onboardingId)
              if (onboardingUpdateError) {
                console.error("[v0] /api/submit-to-zoho: Error actualizando onboarding:", onboardingUpdateError)
              }
            }

            const rows = [
              {
                onboarding_id: payload.onboardingId,
                empresa_rut: safeFormData.empresa?.rut || null,
                tipo: "usuarios",
                filename: usuariosFilename,
                url: payload.excelUrlUsuarios,
                expires_at: expiresAt,
              },
              {
                onboarding_id: payload.onboardingId,
                empresa_rut: safeFormData.empresa?.rut || null,
                tipo: "planificaciones",
                filename: planificacionesFilename,
                url: payload.excelUrlPlanificaciones,
                expires_at: expiresAt,
              },
            ]

            const { error: insertError } = await supabase.from("onboarding_excels").insert(rows)
            if (insertError) {
              console.error("[v0] /api/submit-to-zoho: Error insertando onboarding_excels:", insertError)
            }
          }
        } catch (uploadError) {
          console.error("[v0] /api/submit-to-zoho: Error subiendo Excel:", uploadError)
        }
      }
    }

    console.log("[v0] /api/submit-to-zoho: Llamando a sendToZohoFlow()...")
    const result = await sendToZohoFlow(payload)
    console.log("[v0] /api/submit-to-zoho: Respuesta de sendToZohoFlow():", result)

    if (result.success) {
      console.log("[v0] /api/submit-to-zoho: ✅ ÉXITO - Datos enviados a Zoho Flow")
    } else {
      console.error("[v0] /api/submit-to-zoho: ❌ ERROR - No se pudo enviar a Zoho Flow:", result.error)
    }
    // </CHANGE>

    return NextResponse.json(result, {
      status: 200,
    })
  } catch (error) {
    console.error("[v0] /api/submit-to-zoho: ❌ ERROR CRÍTICO:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 },
    )
  }
}
