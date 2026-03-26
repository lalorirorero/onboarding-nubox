import { type NextRequest, NextResponse } from "next/server"
import {
  DATA_SUBJECT_REQUEST_TYPES,
  type DataSubjectRequestType,
  getSupabaseServiceClient,
  isAuthorizedComplianceRequest,
  toNullableString,
  toPositiveInt,
} from "@/lib/compliance"

type DataSubjectRequestRow = {
  id: string
  onboarding_id: string | null
  id_zoho: string | null
  source_crm: string | null
  request_type: DataSubjectRequestType
  status: string
  requested_by_name: string | null
  requested_by_email: string | null
  requested_by_rut: string | null
  request_details: string | null
  requested_at: string
  due_at: string
  closed_at: string | null
  handled_by: string | null
}

type DataSubjectResponse = {
  success: boolean
  error?: string
  request?: DataSubjectRequestRow
  requests?: DataSubjectRequestRow[]
  total?: number
}

const isValidRequestType = (value: string): value is DataSubjectRequestType =>
  DATA_SUBJECT_REQUEST_TYPES.includes(value as DataSubjectRequestType)

const parseDateIso = (value: unknown) => {
  if (typeof value !== "string" || value.trim() === "") return null
  const dateValue = new Date(value)
  if (Number.isNaN(dateValue.getTime())) return null
  return dateValue.toISOString()
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedComplianceRequest(request)) {
    return NextResponse.json<DataSubjectResponse>({ success: false, error: "No autorizado." }, { status: 401 })
  }

  const supabase = getSupabaseServiceClient()
  if (!supabase) {
    return NextResponse.json<DataSubjectResponse>(
      { success: false, error: "Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 },
    )
  }

  try {
    const { searchParams } = new URL(request.url)
    const limit = toPositiveInt(searchParams.get("limit"), 50, 1, 200)
    const status = toNullableString(searchParams.get("status"))
    const requestType = toNullableString(searchParams.get("requestType"))
    const idZoho = toNullableString(searchParams.get("idZoho"))

    let query = supabase
      .from("data_subject_requests")
      .select(
        "id,onboarding_id,id_zoho,source_crm,request_type,status,requested_by_name,requested_by_email,requested_by_rut,request_details,requested_at,due_at,closed_at,handled_by",
        { count: "exact" },
      )
      .order("requested_at", { ascending: false })
      .limit(limit)

    if (status) {
      query = query.eq("status", status)
    }
    if (requestType) {
      query = query.eq("request_type", requestType)
    }
    if (idZoho) {
      query = query.eq("id_zoho", idZoho)
    }

    const result = await query
    if (result.error) {
      console.error("[v0] compliance/data-subject-requests GET error:", result.error)
      return NextResponse.json<DataSubjectResponse>(
        { success: false, error: `Error consultando solicitudes: ${result.error.message}` },
        { status: 500 },
      )
    }

    return NextResponse.json<DataSubjectResponse>({
      success: true,
      requests: (result.data || []) as DataSubjectRequestRow[],
      total: result.count ?? 0,
    })
  } catch (error) {
    console.error("[v0] compliance/data-subject-requests GET critical error:", error)
    return NextResponse.json<DataSubjectResponse>(
      { success: false, error: error instanceof Error ? error.message : "Error desconocido." },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedComplianceRequest(request)) {
    return NextResponse.json<DataSubjectResponse>({ success: false, error: "No autorizado." }, { status: 401 })
  }

  const supabase = getSupabaseServiceClient()
  if (!supabase) {
    return NextResponse.json<DataSubjectResponse>(
      { success: false, error: "Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 },
    )
  }

  try {
    const body = await request.json().catch(() => ({}))
    const requestType = toNullableString(body?.requestType || body?.request_type) || ""

    if (!isValidRequestType(requestType)) {
      return NextResponse.json<DataSubjectResponse>(
        {
          success: false,
          error: `requestType inválido. Valores permitidos: ${DATA_SUBJECT_REQUEST_TYPES.join(", ")}.`,
        },
        { status: 400 },
      )
    }

    const onboardingId = toNullableString(body?.onboardingId || body?.onboarding_id)
    const idZoho = toNullableString(body?.idZoho || body?.id_zoho)
    const requestedByEmail = toNullableString(body?.requestedByEmail || body?.requested_by_email)
    const requestedByRut = toNullableString(body?.requestedByRut || body?.requested_by_rut)

    if (!onboardingId && !idZoho && !requestedByEmail && !requestedByRut) {
      return NextResponse.json<DataSubjectResponse>(
        {
          success: false,
          error: "Debes informar al menos onboardingId, idZoho, requestedByEmail o requestedByRut.",
        },
        { status: 400 },
      )
    }

    const dueAt = parseDateIso(body?.dueAt || body?.due_at)
    const metadata =
      body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {}

    const insertPayload = {
      onboarding_id: onboardingId,
      id_zoho: idZoho,
      source_crm: toNullableString(body?.sourceCrm || body?.source_crm),
      request_type: requestType,
      status: toNullableString(body?.status) || "recibida",
      requested_by_name: toNullableString(body?.requestedByName || body?.requested_by_name),
      requested_by_email: requestedByEmail,
      requested_by_rut: requestedByRut,
      request_details: toNullableString(body?.requestDetails || body?.request_details),
      resolution_notes: toNullableString(body?.resolutionNotes || body?.resolution_notes),
      requested_at: parseDateIso(body?.requestedAt || body?.requested_at) || new Date().toISOString(),
      due_at: dueAt,
      closed_at: parseDateIso(body?.closedAt || body?.closed_at),
      handled_by: toNullableString(body?.handledBy || body?.handled_by),
      metadata,
    }

    const result = await supabase
      .from("data_subject_requests")
      .insert(insertPayload)
      .select(
        "id,onboarding_id,id_zoho,source_crm,request_type,status,requested_by_name,requested_by_email,requested_by_rut,request_details,requested_at,due_at,closed_at,handled_by",
      )
      .single()

    if (result.error) {
      console.error("[v0] compliance/data-subject-requests POST error:", result.error)
      return NextResponse.json<DataSubjectResponse>(
        { success: false, error: `Error creando solicitud: ${result.error.message}` },
        { status: 500 },
      )
    }

    return NextResponse.json<DataSubjectResponse>({
      success: true,
      request: result.data as DataSubjectRequestRow,
    })
  } catch (error) {
    console.error("[v0] compliance/data-subject-requests POST critical error:", error)
    return NextResponse.json<DataSubjectResponse>(
      { success: false, error: error instanceof Error ? error.message : "Error desconocido." },
      { status: 500 },
    )
  }
}

