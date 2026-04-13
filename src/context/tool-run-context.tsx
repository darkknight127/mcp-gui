"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { McpTool, ToolCallResponse } from "@/types/mcp";

export type ToolRunCompleted = {
  result?: ToolCallResponse;
  error?: string;
  at: number;
  /** Round-trip time for the MCP tool call (browser → Next API → MCP). */
  durationMs?: number;
};

type CallToolFn = (
  connectionId: string,
  tool: McpTool,
  args: Record<string, unknown>
) => Promise<ToolCallResponse>;

interface ToolRunContextValue {
  callToolTracked: CallToolFn;
  inFlightByNodeId: Readonly<Record<string, number>>;
  busyToolNodeIds: ReadonlySet<string>;
  completedByNodeId: Readonly<Record<string, ToolRunCompleted>>;
}

const ToolRunContext = createContext<ToolRunContextValue | null>(null);

export function ToolRunProvider({
  children,
  callTool,
}: {
  children: ReactNode;
  callTool: CallToolFn;
}) {
  const [inFlightByNodeId, setInFlightByNodeId] = useState<Record<string, number>>(
    {}
  );
  const [completedByNodeId, setCompletedByNodeId] = useState<
    Record<string, ToolRunCompleted>
  >({});

  const callToolTracked = useCallback(
    async (
      connectionId: string,
      tool: McpTool,
      args: Record<string, unknown>
    ): Promise<ToolCallResponse> => {
      const nodeId = `${connectionId}:tool:${tool.name}`;
      setInFlightByNodeId((p) => ({ ...p, [nodeId]: (p[nodeId] ?? 0) + 1 }));
      const t0 = typeof performance !== "undefined" ? performance.now() : 0;
      try {
        const res = await callTool(connectionId, tool, args);
        const durationMs =
          typeof performance !== "undefined"
            ? Math.round(performance.now() - t0)
            : undefined;
        setCompletedByNodeId((p) => ({
          ...p,
          [nodeId]: {
            result: res,
            error: undefined,
            at: Date.now(),
            durationMs,
          },
        }));
        return res;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const durationMs =
          typeof performance !== "undefined"
            ? Math.round(performance.now() - t0)
            : undefined;
        setCompletedByNodeId((p) => ({
          ...p,
          [nodeId]: {
            result: undefined,
            error: msg,
            at: Date.now(),
            durationMs,
          },
        }));
        throw e;
      } finally {
        setInFlightByNodeId((p) => {
          const prev = p[nodeId] ?? 1;
          const next = { ...p };
          const n = prev - 1;
          if (n <= 0) delete next[nodeId];
          else next[nodeId] = n;
          return next;
        });
      }
    },
    [callTool]
  );

  const busyToolNodeIds = useMemo(() => {
    return new Set(
      Object.entries(inFlightByNodeId)
        .filter(([, c]) => c > 0)
        .map(([id]) => id)
    );
  }, [inFlightByNodeId]);

  const value = useMemo(
    () => ({
      callToolTracked,
      inFlightByNodeId,
      busyToolNodeIds,
      completedByNodeId,
    }),
    [callToolTracked, inFlightByNodeId, busyToolNodeIds, completedByNodeId]
  );

  return (
    <ToolRunContext.Provider value={value}>{children}</ToolRunContext.Provider>
  );
}

export function useToolRuns(): ToolRunContextValue {
  const c = useContext(ToolRunContext);
  if (!c) throw new Error("useToolRuns must be used within ToolRunProvider");
  return c;
}
