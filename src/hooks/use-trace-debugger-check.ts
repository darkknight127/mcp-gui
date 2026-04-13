"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";

export type TraceDebuggerPhase = "idle" | "checking" | "ok" | "error";

/**
 * Probes the live MCP session for `__debug_trace` (invalid password is OK).
 * When `enabled`, runs once on mount / when `connectionId` changes.
 */
export function useTraceDebuggerCheck(
  connectionId: string | null,
  enabled: boolean
) {
  const [phase, setPhase] = useState<TraceDebuggerPhase>("idle");
  const [detail, setDetail] = useState<string | null>(null);

  const runCheck = useCallback(async () => {
    if (!connectionId || !enabled) return;
    setPhase("checking");
    setDetail(null);
    const res = await api.checkTraceDebugger(connectionId);
    if (!res.ok) {
      setPhase("error");
      setDetail(res.error);
      return;
    }
    if (res.data.reachable) {
      setPhase("ok");
      setDetail(null);
    } else {
      setPhase("error");
      setDetail(res.data.message ?? "Debugger did not respond.");
    }
  }, [connectionId, enabled]);

  useEffect(() => {
    if (!connectionId || !enabled) {
      setPhase("idle");
      setDetail(null);
      return;
    }
    void runCheck();
  }, [connectionId, enabled, runCheck]);

  return { phase, detail, runCheck };
}
