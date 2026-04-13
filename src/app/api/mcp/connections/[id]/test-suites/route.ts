import { NextRequest, NextResponse } from "next/server";
import {
  appendToolCallToTestSuites,
  listConnectionTestSuites,
  replaceConnectionTestSuites,
  type AppendTarget,
  type PersistedTestSuite,
} from "@/services/test-suites-service";
import type { ApiResponse } from "@/types/mcp";

type Params = { params: Promise<{ id: string }> };

export async function GET(
  _req: NextRequest,
  { params }: Params
): Promise<NextResponse<ApiResponse<PersistedTestSuite[]>>> {
  const { id } = await params;
  try {
    const data = listConnectionTestSuites(id);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "List test suites failed", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: Params
): Promise<NextResponse<ApiResponse<null>>> {
  const { id } = await params;
  try {
    const body = (await req.json()) as { suites?: PersistedTestSuite[] };
    const suites = Array.isArray(body.suites) ? body.suites : [];
    replaceConnectionTestSuites(id, suites);
    return NextResponse.json({ ok: true, data: null });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Save test suites failed", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: Params
): Promise<NextResponse<ApiResponse<PersistedTestSuite[]>>> {
  const { id } = await params;
  try {
    const body = (await req.json()) as {
      toolName?: string;
      argValues?: Record<string, string>;
      target?: { mode: string; suiteId?: string };
    };
    const toolName = (body.toolName ?? "").trim();
    if (!toolName) {
      return NextResponse.json(
        { ok: false, error: "toolName required" },
        { status: 400 }
      );
    }
    const argValues =
      body.argValues && typeof body.argValues === "object" ? body.argValues : {};
    const target = body.target ?? { mode: "last" };
    if (
      target.mode !== "last" &&
      target.mode !== "new" &&
      target.mode !== "suiteId"
    ) {
      return NextResponse.json({ ok: false, error: "Invalid target" }, { status: 400 });
    }
    if (target.mode === "suiteId" && !String(target.suiteId ?? "").trim()) {
      return NextResponse.json(
        { ok: false, error: "suiteId required for suiteId target" },
        { status: 400 }
      );
    }
    const data = appendToolCallToTestSuites(
      id,
      toolName,
      argValues,
      target as AppendTarget
    );
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Append test suite step failed", detail: String(err) },
      { status: 500 }
    );
  }
}
