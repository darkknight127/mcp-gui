import { NextResponse } from "next/server";
import { pullTraceFromServer } from "@/services/trace-service";
import type { ApiResponse } from "@/types/mcp";

type Params = { params: Promise<{ id: string }> };

export async function POST(
  _req: Request,
  { params }: Params
): Promise<
  NextResponse<
    ApiResponse<{ inserted: number; ok: boolean; error?: string }>
  >
> {
  const { id } = await params;
  try {
    const r = await pullTraceFromServer(id);
    return NextResponse.json({
      ok: true,
      data: {
        inserted: r.inserted,
        ok: r.ok,
        error: r.error,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Trace pull failed", detail: String(err) },
      { status: 500 }
    );
  }
}
