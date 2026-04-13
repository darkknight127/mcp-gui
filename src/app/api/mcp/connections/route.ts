import { NextRequest, NextResponse } from "next/server";
import { listConnections, addConnection } from "@/services/mcp-service";
import type { ApiResponse, McpConnection } from "@/types/mcp";

export async function GET(): Promise<NextResponse<ApiResponse<McpConnection[]>>> {
  try {
    return NextResponse.json({ ok: true, data: listConnections() });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Failed to list connections", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest
): Promise<NextResponse<ApiResponse<McpConnection>>> {
  try {
    const body = await req.json();
    const connection = await addConnection(body);
    return NextResponse.json({ ok: true, data: connection }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Failed to add connection", detail: String(err) },
      { status: 400 }
    );
  }
}
