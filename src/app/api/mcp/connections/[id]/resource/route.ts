import { NextRequest, NextResponse } from "next/server";
import { fetchResource } from "@/services/mcp-service";
import type { ApiResponse, McpContent } from "@/types/mcp";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<McpContent[]>>> {
  const { id } = await params;
  try {
    const { uri } = await req.json();
    const content = await fetchResource({ connectionId: id, uri });
    return NextResponse.json({ ok: true, data: content });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Resource read failed", detail: String(err) },
      { status: 500 }
    );
  }
}
