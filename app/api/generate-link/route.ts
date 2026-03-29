import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdminClient } from "@/lib/supabase/admin"

const DEFAULT_TOKEN_TTL_DAYS = 30

const toNonEmptyString = (value: unknown) => {
  if (typeof value !== "string") return ""
  return value.trim()
}

const toBoolean = (value: unknown, fallback = false) => {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value === 1
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (["true", "1", "si", "sí", "yes"].includes(normalized)) return true
    if (["false", "0", "no"].includes(normalized)) return false
  }
  return fallback
}

const getTokenTtlDays = () => {
  const raw = Number.parseInt(process.env.ONBOARDING_TOKEN_TTL_DAYS || "", 10)
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_TOKEN_TTL_DAYS
  return raw
}

const isSchemaCompatibilityError = (error: any) => {
  const code = String(error?.code || "")
  const message = String(error?.message || "").toLowerCase()
  return (
    code === "42703" ||
    code === "PGRST204" ||
    (message.includes("column") && message.includes("does not exist")) ||
    (message.includes("could not find") && message.includes("column"))
  )
}

export async function POST(request: NextRequest) {
  try {
    console.log("[v0] generate-link: Recibiendo solicitud")

    let body
    try {
      const text = await request.text()

      if (!text || text.trim() === "") {
        return NextResponse.json(
          {
            success: false,
            error: "El body de la solicitud está vacío. Debes enviar un JSON con los datos de la empresa.",
          },
          { status: 400 },
        )
      }

      body = JSON.parse(text)
      console.log("[v0] generate-link: Body parseado exitosamente")
    } catch (parseError) {
      console.error("[v0] generate-link: Error parseando JSON:", parseError)
      return NextResponse.json(
        {
          success: false,
          error: "El body de la solicitud no es un JSON válido. Verifica el formato.",
        },
        { status: 400 },
      )
    }

    if (!body.empresa && !body.empresaData) {
      return NextResponse.json(
        {
          success: false,
          error: "Se requiere el campo 'empresa' o 'empresaData' con los datos de la empresa",
        },
        { status: 400 },
      )
    }

    const id_zoho = body.id_zoho ? String(body.id_zoho) : null
    const tokenTtlDays = getTokenTtlDays()
    const tokenExpiresAt = new Date(Date.now() + tokenTtlDays * 24 * 60 * 60 * 1000).toISOString()

    const sourceCrm = toNonEmptyString(body.source_crm || body.sourceCRM) || "zoho_crm"
    const sourcePartner = toNonEmptyString(body.source_partner || body.sourcePartner) || null
    const processingPurpose =
      toNonEmptyString(body.processing_purpose || body.processingPurpose) || "onboarding_cliente"
    const legalBasis = toNonEmptyString(body.legal_basis || body.legalBasis) || "ejecucion_contractual"
    const policyVersion = toNonEmptyString(body.policy_version || body.policyVersion) || "v1"
    const representativeDeclarationAccepted = toBoolean(
      body.representative_declaration_accepted ?? body.representativeDeclarationAccepted,
      false,
    )

    const formData = {
      empresa: {
        razonSocial: body.empresa?.razonSocial || body.empresaData?.razonSocial || "",
        nombreFantasia: body.empresa?.nombreFantasia || body.empresaData?.nombreFantasia || "",
        rut: body.empresa?.rut || body.empresaData?.rut || "",
        giro: body.empresa?.giro || body.empresaData?.giro || "",
        direccion: body.empresa?.direccion || body.empresaData?.direccion || "",
        comuna: body.empresa?.comuna || body.empresaData?.comuna || "",
        emailFacturacion: body.empresa?.emailFacturacion || body.empresaData?.emailFacturacion || "",
        telefonoContacto: body.empresa?.telefonoContacto || body.empresaData?.telefonoContacto || "",
        ejecutivoTelefono: body.empresa?.ejecutivoTelefono || body.empresaData?.ejecutivoTelefono || "",
        ejecutivoNombre: body.empresa?.ejecutivoNombre || body.empresaData?.ejecutivoNombre || "",
        sistema: body.empresa?.sistema || body.empresaData?.sistema || [],
        modulosAdicionales: body.empresa?.modulosAdicionales || body.empresaData?.modulosAdicionales || [],
        modulosAdicionalesOtro:
          body.empresa?.modulosAdicionalesOtro || body.empresaData?.modulosAdicionalesOtro || "",
        rubro: body.empresa?.rubro || body.empresaData?.rubro || "",
        grupos: [],
        id_zoho: id_zoho,
      },
      admins: body.admins || body.empresaData?.admins || [],
      trabajadores: body.trabajadores || body.empresaData?.trabajadores || [],
      turnos: body.turnos || body.empresaData?.turnos || [],
      planificaciones: body.planificaciones || body.empresaData?.planificaciones || [],
      asignaciones: body.asignaciones || body.empresaData?.asignaciones || [],
      configureNow: false,
      loadWorkersNow: false,
    }

    console.log("[v0] generate-link: Creando registro en BD", {
      hasIdZoho: Boolean(id_zoho),
      sourceCrm,
      tokenExpiresAt,
    })

    const supabase = getSupabaseAdminClient()
    if (!supabase) {
      return NextResponse.json(
        {
          success: false,
          error: "Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el servidor.",
        },
        { status: 500 },
      )
    }

    const baseInsertPayload = {
      id_zoho: id_zoho || "sin-id",
      estado: "pendiente",
      datos_actuales: formData,
      ultimo_paso: 0,
      navigation_history: [0],
    }

    const complianceInsertPayload = {
      ...baseInsertPayload,
      source_crm: sourceCrm,
      source_partner: sourcePartner,
      processing_purpose: processingPurpose,
      legal_basis: legalBasis,
      policy_version: policyVersion,
      token_expires_at: tokenExpiresAt,
      representative_declaration_accepted: representativeDeclarationAccepted,
      compliance_metadata: {
        sourceTrigger: toNonEmptyString(body.source_trigger || body.sourceTrigger) || null,
        generatedBy: "api_generate_link",
      },
    }

    let data: any = null
    let error: any = null

    const firstInsert = await supabase.from("onboardings").insert(complianceInsertPayload).select().single()
    data = firstInsert.data
    error = firstInsert.error

    if (error && isSchemaCompatibilityError(error)) {
      console.warn("[v0] generate-link: Esquema sin columnas de compliance. Reintentando con esquema base.")
      const fallbackInsert = await supabase.from("onboardings").insert(baseInsertPayload).select().single()
      data = fallbackInsert.data
      error = fallbackInsert.error
    }

    if (error) {
      console.error("[v0] generate-link: Error creando registro en Supabase:", error)
      return NextResponse.json(
        {
          success: false,
          error: `Error al crear registro en base de datos: ${error.message}`,
          details: error,
        },
        { status: 500 },
      )
    }

    const token = data.id
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
    const link = `${baseUrl}?token=${token}`

    console.log("[v0] generate-link: Registro creado exitosamente", {
      id: data.id,
      tokenExpiresAt,
    })

    return NextResponse.json({
      success: true,
      link,
      token,
      tokenExpiresAt,
    })
  } catch (error) {
    console.error("[v0] generate-link: Error general:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error desconocido",
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    )
  }
}
