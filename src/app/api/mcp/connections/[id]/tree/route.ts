import { NextRequest, NextResponse } from "next/server";
import { getTree } from "@/services/mcp-service";
import type { ApiResponse, McpTreeNode } from "@/types/mcp";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<McpTreeNode>>> {
  const { id } = await params;
  try {
    const tree = await getTree(id);
    return NextResponse.json({ ok: true, data: tree });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Failed to build tree", detail: String(err) },
      { status: 500 }
    );
  }
}
