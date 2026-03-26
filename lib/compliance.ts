import { createClient } from "@supabase/supabase-js"
import type { NextRequest } from "next/server"

export const DATA_SUBJECT_REQUEST_TYPES = [
  "acceso",
  "rectificacion",
  "supresion",
  "oposicion",
  "portabilidad",
  "bloqueo",
] as const

export type DataSubjectRequestType = (typeof DATA_SUBJECT_REQUEST_TYPES)[number]

const parseBearerToken = (value: string | null) => {
  if (!value) return ""
  const [scheme, token] = value.trim().split(/\s+/, 2)
  if (!scheme || !token) return ""
  if (scheme.toLowerCase() !== "bearer") return ""
  return token
}

export const isAuthorizedComplianceRequest = (request: NextRequest) => {
  const secret = process.env.COMPLIANCE_API_SECRET || process.env.CRON_SECRET || ""
  if (!secret) return true

  const headerSecret = request.headers.get("x-compliance-secret") || request.headers.get("x-cron-secret") || ""
  const bearerSecret = parseBearerToken(request.headers.get("authorization"))

  return headerSecret === secret || bearerSecret === secret
}

export const getSupabaseServiceClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

  if (!supabaseUrl || !serviceRoleKey) {
    return null
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })
}

export const toPositiveInt = (value: unknown, fallback: number, min = 1, max = Number.MAX_SAFE_INTEGER) => {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value || ""), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

export const toNullableString = (value: unknown) => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

