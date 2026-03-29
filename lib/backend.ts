/**
 * BACKEND UNIFICADO - ARQUITECTURA SIMPLE
 * =======================================
 *
 * Este módulo centraliza toda la lógica del backend en un solo lugar.
 *
 * FUNCIONALIDADES:
 * 1. Generación y desencriptación de tokens para prellenar formularios
 * 2. Envío de datos a Zoho Flow con el parámetro "accion"
 * 3. Tracking de progreso (opcional, fire-and-forget)
 *
 * NO incluye:
 * - Persistencia en localStorage (se maneja en el componente)
 * - Protección de datos compleja (se simplifica en el componente)
 * - Hooks complejos con múltiples dependencias
 */

// ============================================================================
// TIPOS
// ============================================================================

export interface EmpresaData {
  id_zoho?: string // ID del registro en Zoho CRM que generó esta sesión
  razonSocial: string
  nombreFantasia?: string
  rut: string
  giro?: string
  direccion?: string
  comuna?: string
  emailFacturacion?: string
  telefonoContacto?: string
  ejecutivoTelefono?: string
  ejecutivoNombre?: string
  sistema?: string[]
  modulosAdicionales?: string[]
  modulosAdicionalesOtro?: string
  rubro?: string
  admins?: any[]
  trabajadores?: any[]
  turnos?: any[]
  planificaciones?: any[]
  asignaciones?: any[]
}

export interface FormData {
  empresa: EmpresaData
  admins: any[]
  trabajadores: any[]
  turnos: any[]
  planificaciones: any[]
  asignaciones: any[]
  configureNow: boolean
}

const getEncryptionSecret = () => {
  const secret = process.env.ENCRYPTION_SECRET?.trim()
  if (!secret) {
    throw new Error("ENCRYPTION_SECRET no configurado")
  }
  return secret
}

// ============================================================================
// ENCRIPTACIÓN/DESENCRIPTACIÓN
// ============================================================================

export async function encryptToken(empresaData: EmpresaData): Promise<string> {
  console.log("[v0] backend.encryptToken: Iniciando encriptación")

  const jsonString = JSON.stringify(empresaData)
  const encoder = new TextEncoder()
  const dataBuffer = encoder.encode(jsonString)

  const secret = getEncryptionSecret()
  const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "PBKDF2" }, false, [
    "deriveBits",
    "deriveKey",
  ])

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  )

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encryptedBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, dataBuffer)

  const resultBuffer = new Uint8Array(salt.length + iv.length + encryptedBuffer.byteLength)
  resultBuffer.set(salt, 0)
  resultBuffer.set(iv, salt.length)
  resultBuffer.set(new Uint8Array(encryptedBuffer), salt.length + iv.length)

  const token = Buffer.from(resultBuffer).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")

  console.log("[v0] backend.encryptToken: Token generado exitosamente")

  return token
}

export async function decryptToken(token: string): Promise<EmpresaData | null> {
  try {
    console.log("[v0] backend.decryptToken: Iniciando desencriptación")

    if (!token || typeof token !== "string") {
      console.error("[v0] backend.decryptToken: Token inválido: debe ser una cadena no vacía")
      return null
    }

    // Restaurar base64 desde URL-safe
    const base64 = token.replace(/-/g, "+").replace(/_/g, "/")
    const padding = "=".repeat((4 - (base64.length % 4)) % 4)

    let buffer: Buffer
    try {
      buffer = Buffer.from(base64 + padding, "base64")
    } catch (bufferError) {
      console.error("[v0] backend.decryptToken: Error al decodificar base64:", bufferError)
      return null
    }

    // Verificar que el buffer tenga el tamaño mínimo esperado
    if (buffer.length < 28) {
      console.error("[v0] backend.decryptToken: Token demasiado corto para ser válido")
      return null
    }

    const salt = buffer.slice(0, 16)
    const iv = buffer.slice(16, 28)
    const encryptedData = buffer.slice(28)

    if (encryptedData.length === 0) {
      console.error("[v0] backend.decryptToken: No hay datos encriptados en el token")
      return null
    }

    const secret = getEncryptionSecret()
    const encoder = new TextEncoder()
    const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "PBKDF2" }, false, [
      "deriveBits",
      "deriveKey",
    ])

    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    )

    const decryptedBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, encryptedData)

    const decoder = new TextDecoder()
    const jsonString = decoder.decode(decryptedBuffer)

    let parsed
    try {
      parsed = JSON.parse(jsonString)
    } catch (jsonError) {
      console.error("[v0] backend.decryptToken: Error al parsear JSON desencriptado:", jsonError)
      return null
    }

    console.log("[v0] backend.decryptToken: Desencriptación exitosa")

    return parsed
  } catch (error) {
    console.error("[v0] backend.decryptToken: Error decrypting token:", error)
    return null
  }
}

// ============================================================================
// ZOHO FLOW
// ============================================================================

export interface ZohoPayload {
  accion: "progreso" | "completado" // Renombrado para diferenciar tipo de evento en lugar de operación CRUD
  fechaHoraEnvio: string
  eventType: "progress" | "complete"
  id_zoho: string | null
  onboardingId?: string | null
  currentStep?: number
  navigationHistory?: number[]
  estado?: string
  fecha_completado?: string | null
  totalTrabajadores?: number
  formData: {
    empresa: {
      id_zoho: string | null
      razonSocial: string
      nombreFantasia: string
      rut: string
      giro: string
      direccion: string
      comuna: string
      emailFacturacion: string
      telefonoContacto: string
      ejecutivoTelefono?: string
      ejecutivoNombre?: string
      sistema: string[]
      modulosAdicionales: string[]
      modulosAdicionalesOtro: string
      rubro: string
      grupos?: Array<{
        id: number
        nombre: string
        descripcion?: string
      }>
    }
    admins: Array<{
      nombre: string
      apellido: string
      email: string
      telefono: string
      cargo: string
    }>
    trabajadores: Array<{
      nombre: string
      rut: string
      email: string
      grupo: string
    }>
    turnos: Array<{
      id: string
      nombre: string
      horaInicio: string
      horaFin: string
      diasSemana: number[]
      color: string
    }>
    planificaciones: Array<{
      id: string
      nombre: string
      fechaInicio: string
      fechaFin: string
      turnos: Array<{ turnoId: string; dias: string[] }>
    }>
    asignaciones: Array<{
      trabajadorRut: string
      planificacionId: string
    }>
    configureNow: boolean
  }
  metadata: {
    empresaRut: string
    empresaNombre: string
    pasoActual: number
    pasoNombre: string
    totalPasos: number
    porcentajeProgreso: number
    totalTrabajadores?: number
    totalGrupos?: number
    decision?: string
  }
  excelUrls?: {
    usuarios?: {
      filename: string
      url: string
    }
    planificaciones?: {
      filename: string
      url: string
    }
  }
  excelUrlUsuarios?: string
  excelUrlPlanificaciones?: string
  excelFile: {
    filename: string
    base64: string
    mimeType: string
  } | null
}

export async function sendToZohoFlow(payload: ZohoPayload): Promise<{
  success: boolean
  error?: string
  data?: any
}> {
  console.log("[v0] ===== sendToZohoFlow: INICIO =====")

  const url = process.env.ZOHO_FLOW_TEST_URL

  console.log("[v0] sendToZohoFlow: URL del webhook:", url ? url.substring(0, 50) + "..." : "NO CONFIGURADA")

  if (!url) {
    console.error("[v0] sendToZohoFlow: ❌ ERROR - ZOHO_FLOW_TEST_URL no configurado")
    return {
      success: false,
      error: "ZOHO_FLOW_TEST_URL no configurado",
    }
  }

  console.log("[v0] sendToZohoFlow: Preparando envío", {
    accion: payload.accion,
    eventType: payload.eventType,
    hasOnboardingId: Boolean(payload.onboardingId),
    hasIdZoho: Boolean(payload.id_zoho),
    payloadSizeBytes: JSON.stringify(payload).length,
  })

  try {
    console.log("[v0] sendToZohoFlow: Enviando POST request...")

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    console.log("[v0] sendToZohoFlow: Status:", response.status, response.statusText)
    const rawBody = await response.text()

    if (!response.ok) {
      console.error("[v0] sendToZohoFlow: ❌ ERROR HTTP", {
        status: response.status,
        statusText: response.statusText,
        responseLength: rawBody.length,
      })

      return {
        success: false,
        error: `Error ${response.status}: ${response.statusText}`,
      }
    }

    let data
    if (!rawBody || rawBody.trim() === "") {
      data = { success: true, emptyBody: true }
      console.log("[v0] sendToZohoFlow: ✅ Respuesta vacia con 200 (aceptada por Zoho).")
    } else {
      try {
        data = JSON.parse(rawBody)
        console.log("[v0] sendToZohoFlow: ✅ Respuesta JSON recibida.")
      } catch (jsonError) {
        data = rawBody
        console.log("[v0] sendToZohoFlow: ⚠️ Respuesta de Zoho en texto.")
      }
    }

    console.log("[v0] sendToZohoFlow: ✅ ÉXITO - Datos enviados correctamente a Zoho Flow")

    return {
      success: true,
      data,
    }
  } catch (error) {
    console.error("[v0] sendToZohoFlow: ❌ ERROR DE RED O FETCH:", error)

    return {
      success: false,
      error: error instanceof Error ? error.message : "Error desconocido",
    }
  }
}

/**
 * Envía un webhook de progreso a Zoho Flow (fire-and-forget)
 * NO bloquea la navegación si hay error
 */
export async function sendProgressWebhook(params: {
  pasoActual: number
  pasoNombre: string
  totalPasos: number
  empresaRut: string
  empresaNombre: string
  idZoho: string | null
}): Promise<void> {
  console.log("[v0] sendProgressWebhook: INICIO", {
    pasoActual: params.pasoActual,
    pasoNombre: params.pasoNombre,
    totalPasos: params.totalPasos,
    hasIdZoho: !!params.idZoho,
  })

  if (!params.idZoho) {
    console.log("[v0] sendProgressWebhook: SKIPPED - No hay id_zoho")
    return
  }

  if (params.pasoActual === 0) {
    console.log("[v0] sendProgressWebhook: SKIPPED - Paso 0 (Bienvenida)")
    return
  }

  const porcentajeProgreso = Math.round((params.pasoActual / params.totalPasos) * 100)

  const payload: ZohoPayload = {
    accion: "progreso",
    fechaHoraEnvio: new Date().toISOString(),
    eventType: "progress",
    id_zoho: params.idZoho,
    formData: {
      empresa: {
        id_zoho: params.idZoho,
        razonSocial: "",
        nombreFantasia: "",
        rut: params.empresaRut,
        giro: "",
        direccion: "",
        comuna: "",
        emailFacturacion: "",
        telefonoContacto: "",
        sistema: [],
        modulosAdicionales: [],
        modulosAdicionalesOtro: "",
        rubro: "",
      },
      admins: [],
      trabajadores: [],
      turnos: [],
      planificaciones: [],
      asignaciones: [],
      configureNow: false,
    },
    metadata: {
      empresaRut: params.empresaRut,
      empresaNombre: params.empresaNombre,
      pasoActual: params.pasoActual,
      pasoNombre: params.pasoNombre,
      totalPasos: params.totalPasos,
      porcentajeProgreso,
    },
    excelFile: null,
  }

  console.log("[v0] sendProgressWebhook: Enviando a través de API...")

  try {
    const response = await fetch("/api/submit-to-zoho", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    const result = await response.json()

    if (result.success) {
      console.log(`[v0] sendProgressWebhook: ✅ ÉXITO - Paso ${params.pasoActual}`)
    } else {
      console.warn(`[v0] sendProgressWebhook: ⚠️ ERROR (no bloqueante):`, result.error)
    }
  } catch (error) {
    console.warn("[v0] sendProgressWebhook: ⚠️ ERROR (no bloqueante):", error)
  }
}
