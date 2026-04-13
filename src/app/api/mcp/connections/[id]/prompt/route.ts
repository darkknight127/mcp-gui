import { NextRequest, NextResponse } from "next/server";
import { fetchPrompt } from "@/services/mcp-service";
import type { ApiResponse, McpContent } from "@/types/mcp";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<McpContent[]>>> {
  const { id } = await params;
  try {
    const { promptName, args } = await req.json();
    const content = await fetchPrompt({ connectionId: id, promptName, args });
    return NextResponse.json({ ok: true, data: content });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Prompt get failed", detail: String(err) },
      { status: 500 }
    );
  }
}
