import { NextRequest, NextResponse } from "next/server";
import { executeTool } from "@/services/mcp-service";
import type { ApiResponse, ToolCallResponse } from "@/types/mcp";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<ToolCallResponse>>> {
  const { id } = await params;
  try {
    const body = await req.json();
    const result = await executeTool({
      connectionId: id,
      toolName: body.toolName,
      args: body.args ?? {},
    });
    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Tool call failed", detail: String(err) },
      { status: 500 }
    );
  }
}
