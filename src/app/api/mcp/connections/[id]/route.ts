import { NextRequest, NextResponse } from "next/server";
import {
  connectServer,
  disconnectServer,
  removeConnection,
  updateConnection,
} from "@/services/mcp-service";
import type { ApiResponse, McpConnection, McpConnectionConfig } from "@/types/mcp";

type Params = { params: Promise<{ id: string }> };

export async function POST(
  _req: NextRequest,
  { params }: Params
): Promise<NextResponse<ApiResponse<McpConnection>>> {
  const { id } = await params;
  try {
    const connection = await connectServer(id);
    return NextResponse.json({ ok: true, data: connection });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Connection failed", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: Params
): Promise<NextResponse<ApiResponse<null>>> {
  const { id } = await params;
  try {
    await disconnectServer(id);
    return NextResponse.json({ ok: true, data: null });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Disconnect failed", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function PUT(
  _req: NextRequest,
  { params }: Params
): Promise<NextResponse<ApiResponse<null>>> {
  const { id } = await params;
  try {
    await removeConnection(id);
    return NextResponse.json({ ok: true, data: null });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Remove failed", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: Params
): Promise<NextResponse<ApiResponse<McpConnection>>> {
  const { id } = await params;
  try {
    const body = (await req.json()) as Omit<McpConnectionConfig, "id">;
    const connection = await updateConnection(id, body);
    return NextResponse.json({ ok: true, data: connection });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Update failed", detail: String(err) },
      { status: 400 }
    );
  }
}
