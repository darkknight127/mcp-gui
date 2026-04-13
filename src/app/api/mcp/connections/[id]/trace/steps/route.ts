import { NextRequest, NextResponse } from "next/server";
import { listAllTraceSteps, listTraceSteps } from "@/services/trace-service";
import type { ApiResponse } from "@/types/mcp";
import type { TraceStepDTO } from "@/types/trace";

type Params = { params: Promise<{ id: string }> };

export async function GET(
  req: NextRequest,
  { params }: Params
): Promise<NextResponse<ApiResponse<TraceStepDTO[]>>> {
  const { id } = await params;
  const toolName = (req.nextUrl.searchParams.get("toolName") ?? "").trim();
  try {
    const limit = Math.min(
      500,
      Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 100)
    );
    const rows = toolName
      ? listTraceSteps(id, toolName, limit)
      : listAllTraceSteps(id, limit);
    return NextResponse.json({ ok: true, data: rows });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "List steps failed", detail: String(err) },
      { status: 500 }
    );
  }
}
