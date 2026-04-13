"use client";

import { useEffect, useRef } from "react";
import { api } from "@/lib/api-client";
import type { McpConnection } from "@/types/mcp";

const DEFAULT_TTL_MS = 30_000;

interface Props {
  connections: McpConnection[];
  /** Only poll when a trace secret exists (avoid 400 spam before user enables tracing). */
  enabled?: boolean;
  intervalMs?: number;
}

/**
 * Periodically calls __debug_trace via the API for each connected server so SQLite stays warm.
 * Secrets are created from Edit MCP Server; until then pulls return no_trace_secret.
 * (Repo: https://github.com/darkknight127/mcp-gui — server-side pull skips duplicate trace writes.)
 */
export function TracePollHeartbeat({
  connections,
  enabled = true,
  intervalMs = DEFAULT_TTL_MS,
}: Props) {
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    async function tick() {
      for (const c of connections) {
        if (c.status !== "connected") continue;
        try {
          const res = await api.pullTrace(c.config.id);
          if (!mounted.current) return;
          if (
            res.ok &&
            !res.data.ok &&
            res.data.error === "no_trace_secret"
          ) {
            continue;
          }
        } catch {
          /* ignore network errors */
        }
      }
    }

    const id = window.setInterval(() => {
      void tick();
    }, intervalMs);
    void tick();
    return () => window.clearInterval(id);
  }, [connections, enabled, intervalMs]);

  return null;
}
