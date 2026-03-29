import { NextResponse } from "next/server"

const responseBody = {
  success: false,
  error: "Endpoint desactivado. Usa /api/onboarding/[id] con token UUID.",
}

const responseInit = {
  status: 410,
  headers: { "Cache-Control": "no-store" },
}

export async function POST() {
  return NextResponse.json(responseBody, responseInit)
}

export async function GET() {
  return NextResponse.json(responseBody, responseInit)
}
