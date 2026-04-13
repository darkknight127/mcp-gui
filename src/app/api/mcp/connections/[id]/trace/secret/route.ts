import { NextRequest, NextResponse } from "next/server";
import {
  getTraceSecretIfExists,
  regenerateTraceSecret,
} from "@/services/trace-service";
import type { ApiResponse } from "@/types/mcp";

type Params = { params: Promise<{ id: string }> };

export async function GET(
  _req: Request,
  { params }: Params
): Promise<NextResponse<ApiResponse<{ password: string | null }>>> {
  const { id } = await params;
  try {
    const password = getTraceSecretIfExists(id);
    return NextResponse.json({ ok: true, data: { password } });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Trace secret read failed", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(
  _req: NextRequest,
  { params }: Params
): Promise<NextResponse<ApiResponse<{ password: string }>>> {
  const { id } = await params;
  try {
    const { password } = regenerateTraceSecret(id);
    return NextResponse.json({ ok: true, data: { password } });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Trace secret rotate failed", detail: String(err) },
      { status: 500 }
    );
  }
}
