import { NextResponse } from "next/server";
import { getTraceToolSetupForEdit } from "@/services/trace-service";
import type { ApiResponse } from "@/types/mcp";
import type { TraceSetupPayload } from "@/types/trace";

type Params = { params: Promise<{ id: string }> };

export async function GET(
  _req: Request,
  { params }: Params
): Promise<NextResponse<ApiResponse<TraceSetupPayload>>> {
  const { id } = await params;
  try {
    const setup = await getTraceToolSetupForEdit(id);
    return NextResponse.json({ ok: true, data: setup });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Trace setup failed", detail: String(err) },
      { status: 500 }
    );
  }
}
