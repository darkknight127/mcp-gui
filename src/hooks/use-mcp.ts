"use client";

import { useState, useCallback, useEffect } from "react";
import { api } from "@/lib/api-client";
import {
  loadStoredConnectionConfigs,
  clearStoredConnectionConfigs,
} from "@/lib/connections-storage";
import type {
  McpConnection,
  McpConnectionConfig,
  McpTreeNode,
  McpTool,
  McpResource,
  McpPrompt,
  ToolCallResponse,
  McpContent,
} from "@/types/mcp";

export interface UseMcpReturn {
  connections: McpConnection[];
  trees: Record<string, McpTreeNode>;
  loading: boolean;
  error: string | null;

  addAndConnect: (input: Omit<McpConnectionConfig, "id">) => Promise<void>;
  updateAndReconnect: (
    id: string,
    input: Omit<McpConnectionConfig, "id">
  ) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
  reconnect: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  refreshTree: (id: string) => Promise<void>;

  callTool: (
    connectionId: string,
    tool: McpTool,
    args: Record<string, unknown>
  ) => Promise<ToolCallResponse>;

  readResource: (connectionId: string, resource: McpResource) => Promise<McpContent[]>;

  getPrompt: (
    connectionId: string,
    prompt: McpPrompt,
    args?: Record<string, string>
  ) => Promise<McpContent[]>;
}

export function useMcp(): UseMcpReturn {
  const [connections, setConnections] = useState<McpConnection[]>([]);
  const [trees, setTrees] = useState<Record<string, McpTreeNode>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      const stored = loadStoredConnectionConfigs();
      const listRes = await api.listConnections();
      if (cancelled) return;
      if (!listRes.ok) {
        setError(listRes.error);
        return;
      }
      const serverIds = new Set(listRes.data.map((c) => c.config.id));
      let migrated = false;
      for (const cfg of stored) {
        if (cancelled) return;
        if (!serverIds.has(cfg.id)) {
          const addRes = await api.addConnection({ ...cfg, id: cfg.id });
          if (!addRes.ok) {
            console.warn("[mcp-gui] Failed to restore connection", cfg.name, addRes.error);
            continue;
          }
          serverIds.add(cfg.id);
          migrated = true;
        }
      }
      const finalRes = await api.listConnections();
      if (cancelled) return;
      if (!finalRes.ok) {
        setError(finalRes.error);
        return;
      }
      setConnections(finalRes.data);
      if (migrated) clearStoredConnectionConfigs();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshTree = useCallback(async (id: string) => {
    const res = await api.getTree(id);
    if (res.ok) {
      setTrees((prev) => ({ ...prev, [id]: res.data }));
    }
  }, []);

  const addAndConnect = useCallback(
    async (input: Omit<McpConnectionConfig, "id">) => {
      setLoading(true);
      setError(null);
      try {
        const addRes = await api.addConnection(input);
        if (!addRes.ok) throw new Error(addRes.error);

        const id = addRes.data.config.id;
        setConnections((prev) => [...prev, addRes.data]);

        const connRes = await api.connectServer(id);
        if (!connRes.ok) throw new Error(connRes.error);

        setConnections((prev) =>
          prev.map((c) => (c.config.id === id ? connRes.data : c))
        );

        await refreshTree(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [refreshTree]
  );

  const updateAndReconnect = useCallback(
    async (id: string, input: Omit<McpConnectionConfig, "id">) => {
      setLoading(true);
      setError(null);
      try {
        const patchRes = await api.updateConnection(id, input);
        if (!patchRes.ok) throw new Error(patchRes.error);

        setConnections((prev) =>
          prev.map((c) => (c.config.id === id ? patchRes.data : c))
        );
        setTrees((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });

        const connRes = await api.connectServer(id);
        if (!connRes.ok) throw new Error(connRes.error);

        setConnections((prev) =>
          prev.map((c) => (c.config.id === id ? connRes.data : c))
        );

        await refreshTree(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [refreshTree]
  );

  const disconnect = useCallback(async (id: string) => {
    const res = await api.disconnectServer(id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setConnections((prev) =>
      prev.map((c) =>
        c.config.id === id ? { ...c, status: "disconnected" } : c
      )
    );
  }, []);

  const reconnect = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      try {
        const connRes = await api.connectServer(id);
        if (!connRes.ok) throw new Error(connRes.error);
        setConnections((prev) =>
          prev.map((c) => (c.config.id === id ? connRes.data : c))
        );
        await refreshTree(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [refreshTree]
  );

  const remove = useCallback(async (id: string) => {
    const res = await api.removeConnection(id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setConnections((prev) => prev.filter((c) => c.config.id !== id));
    setTrees((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const callTool = useCallback(
    async (
      connectionId: string,
      tool: McpTool,
      args: Record<string, unknown>
    ): Promise<ToolCallResponse> => {
      const res = await api.callTool(connectionId, tool.name, args);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    []
  );

  const readResource = useCallback(
    async (connectionId: string, resource: McpResource): Promise<McpContent[]> => {
      const res = await api.readResource(connectionId, resource.uri);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    []
  );

  const getPrompt = useCallback(
    async (
      connectionId: string,
      prompt: McpPrompt,
      args?: Record<string, string>
    ): Promise<McpContent[]> => {
      const res = await api.getPrompt(connectionId, prompt.name, args);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    []
  );

  return {
    connections,
    trees,
    loading,
    error,
    addAndConnect,
    updateAndReconnect,
    disconnect,
    reconnect,
    remove,
    refreshTree,
    callTool,
    readResource,
    getPrompt,
  };
}
