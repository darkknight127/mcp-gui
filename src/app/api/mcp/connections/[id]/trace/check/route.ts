import { NextResponse } from "next/server";
import { checkDebugTraceLoaded } from "@/services/trace-service";
import type { ApiResponse } from "@/types/mcp";

type Params = { params: Promise<{ id: string }> };

export async function POST(
  _req: Request,
  { params }: Params
): Promise<
  NextResponse<
    ApiResponse<{ reachable: boolean; message?: string }>
  >
> {
  const { id } = await params;
  try {
    const r = await checkDebugTraceLoaded(id);
    if (r.reachable) {
      return NextResponse.json({
        ok: true,
        data: { reachable: true },
      });
    }
    return NextResponse.json({
      ok: true,
      data: { reachable: false, message: r.message },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Debugger check failed", detail: String(err) },
      { status: 500 }
    );
  }
}
