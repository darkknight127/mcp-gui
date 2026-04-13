"use client";
// Main MCP GUI workspace — upstream: https://github.com/darkknight127/mcp-gui

import { useState, useMemo, useCallback, useEffect } from "react";
import { nanoid } from "nanoid";
import { Plus, AlertCircle } from "lucide-react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useMcp, type UseMcpReturn } from "@/hooks/use-mcp";
import { ToolRunProvider, useToolRuns } from "@/context/tool-run-context";
import { ApiTree } from "@/components/mcp/ApiTree";
import { DetailPanel } from "@/components/mcp/DetailPanel";
import { TracePollHeartbeat } from "@/components/mcp/TracePollHeartbeat";
import { ConnectionList } from "@/components/mcp/ConnectionList";
import { ConnectionModal } from "@/components/mcp/ConnectionModal";
import { connectionDisplayName } from "@/lib/mcp/connection-label";
import {
  enrichForest,
  enrichForestWithTestSuites,
  findNodeInForest,
  collectToolsFromTree,
  findToolNode,
  findResourceNode,
  findPromptNode,
} from "@/lib/mcp/tree-tools";
import { loadSavedToolResponses } from "@/lib/saved-responses-storage";
import { api } from "@/lib/api-client";
import {
  readLegacyLocalTestSuites,
  clearLegacyLocalTestSuites,
  TEST_SUITES_MUTATED,
  notifyTestSuitesMutated,
} from "@/lib/mcp/test-suites-storage";
import {
  createEmptyPersistedStep,
  nextSuiteNameFromList,
} from "@/lib/mcp/test-suite-helpers";
import type { PersistedTestSuite } from "@/lib/mcp/test-suites-types";
import type {
  McpTreeNode,
  McpTool,
  McpResource,
  McpPrompt,
  McpConnectionConfig,
  SavedToolResponse,
  TestSuiteTreePayload,
} from "@/types/mcp";

async function loadSuitesForConnection(
  connectionId: string,
  tools: McpTool[]
): Promise<PersistedTestSuite[]> {
  const res = await api.getTestSuites(connectionId);
  if (!res.ok) return [];
  let raw = res.data;
  if (raw.length === 0 && tools.length > 0) {
    const legacy = readLegacyLocalTestSuites(connectionId, tools);
    if (legacy.length > 0) {
      const put = await api.putTestSuites(connectionId, legacy);
      if (put.ok) clearLegacyLocalTestSuites(connectionId);
      raw = legacy;
    }
  }
  return raw;
}

export default function Home() {
  const mcp = useMcp();
  return (
    <ToolRunProvider callTool={mcp.callTool}>
      <HomeContent mcp={mcp} />
    </ToolRunProvider>
  );
}

function HomeContent({ mcp }: { mcp: UseMcpReturn }) {
  const { busyToolNodeIds, callToolTracked, completedByNodeId } = useToolRuns();
  const [modal, setModal] = useState<{
    mode: "add" | "edit";
    initial: McpConnectionConfig | null;
  } | null>(null);
  const [modalSeq, setModalSeq] = useState(0);
  const [selectedConn, setSelectedConn] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<McpTreeNode | null>(null);
  const [savedEpoch, setSavedEpoch] = useState(0);
  const [suitesByConn, setSuitesByConn] = useState<
    Record<string, PersistedTestSuite[]>
  >({});
  const [toolArgsPrefill, setToolArgsPrefill] = useState<{
    connectionId: string;
    toolName: string;
    args: Record<string, unknown>;
  } | null>(null);

  /** Latest tool completion `at` (ms) treated as "seen" while that tool is the open detail tab. */
  const [toolCompletionAckAt, setToolCompletionAckAt] = useState<
    Record<string, number>
  >({});

  const bumpSaved = useCallback(() => setSavedEpoch((e) => e + 1), []);

  useEffect(() => {
    const toolId =
      selectedNode?.kind === "tool" ? selectedNode.id : null;
    if (!toolId) return;
    const done = completedByNodeId[toolId];
    if (!done) return;
    setToolCompletionAckAt((prev) => {
      const next = Math.max(prev[toolId] ?? 0, done.at);
      if (next === (prev[toolId] ?? 0)) return prev;
      return { ...prev, [toolId]: next };
    });
  }, [selectedNode?.id, selectedNode?.kind, completedByNodeId]);

  const backgroundResultToolNodeIds = useMemo(() => {
    const sel = selectedNode?.id;
    const next = new Set<string>();
    for (const [nodeId, done] of Object.entries(completedByNodeId)) {
      if (!nodeId.includes(":tool:")) continue;
      if (sel === nodeId) continue;
      if (!done.result || done.error) continue;
      const ack = toolCompletionAckAt[nodeId] ?? 0;
      if (done.at > ack) next.add(nodeId);
    }
    return next;
  }, [completedByNodeId, selectedNode?.id, toolCompletionAckAt]);

  /** Empty until mount so SSR and the first client render match (localStorage only exists in the browser). */
  const [savedList, setSavedList] = useState<SavedToolResponse[]>([]);
  useEffect(() => {
    setSavedList(loadSavedToolResponses());
  }, [savedEpoch]);

  const refreshTestSuites = useCallback(async () => {
    const entries = await Promise.all(
      mcp.connections.map(async (c) => {
        const id = c.config.id;
        const root = mcp.trees[id];
        const tools = collectToolsFromTree(root ?? null);
        const suites = await loadSuitesForConnection(id, tools);
        return [id, suites] as const;
      })
    );
    setSuitesByConn(Object.fromEntries(entries));
  }, [mcp.connections, mcp.trees]);

  useEffect(() => {
    void refreshTestSuites();
  }, [refreshTestSuites]);

  useEffect(() => {
    function onMutate() {
      void refreshTestSuites();
    }
    window.addEventListener(TEST_SUITES_MUTATED, onMutate);
    return () => window.removeEventListener(TEST_SUITES_MUTATED, onMutate);
  }, [refreshTestSuites]);

  const displayTrees = useMemo(() => {
    const withSaved = enrichForest(Object.values(mcp.trees), savedList);
    return enrichForestWithTestSuites(withSaved, suitesByConn);
  }, [mcp.trees, savedList, suitesByConn]);

  useEffect(() => {
    setSelectedNode((prev) => {
      if (!prev?.id) return prev;
      const fresh = findNodeInForest(displayTrees, prev.id);
      return fresh ?? prev;
    });
  }, [displayTrees]);

  /** If the tree loads after picking a connection, open Trace log once the hub exists. */
  useEffect(() => {
    if (!selectedConn || selectedNode != null) return;
    const hub = findNodeInForest(displayTrees, `${selectedConn}:executions`);
    if (hub) setSelectedNode(hub);
  }, [selectedConn, selectedNode, displayTrees]);

  const createTestSuite = useCallback(
    async (connectionId: string) => {
      const tools = collectToolsFromTree(mcp.trees[connectionId] ?? null);
      if (tools.length === 0) return;
      const res = await api.getTestSuites(connectionId);
      if (!res.ok) return;
      const list = res.data;
      const newSuite: PersistedTestSuite = {
        id: nanoid(8),
        name: nextSuiteNameFromList(list),
        steps: [createEmptyPersistedStep(tools)],
      };
      const put = await api.putTestSuites(connectionId, [...list, newSuite]);
      if (!put.ok) return;
      notifyTestSuitesMutated(connectionId);
      await refreshTestSuites();
      setSelectedConn(connectionId);
      setSelectedNode({
        id: `${connectionId}:test_suite:${newSuite.id}`,
        kind: "test_suite",
        label: newSuite.name,
        description: `${newSuite.steps.length} step(s)`,
        data: { suiteId: newSuite.id },
      });
    },
    [mcp.trees, refreshTestSuites]
  );

  const toolsForSelected = useMemo(() => {
    if (!selectedConn || !mcp.trees[selectedConn]) return [];
    return collectToolsFromTree(mcp.trees[selectedConn]);
  }, [selectedConn, mcp.trees]);

  function connectionIdFromTreeNode(node: McpTreeNode): string {
    if (node.kind === "saved_response") {
      return (node.data as SavedToolResponse).connectionId;
    }
    if (node.kind === "executions_hub") {
      const suf = ":executions";
      return node.id.endsWith(suf)
        ? node.id.slice(0, -suf.length)
        : node.id.split(":")[0] ?? node.id;
    }
    if (node.kind === "test_suite") {
      const payload = node.data as TestSuiteTreePayload;
      const suf = `:test_suite:${payload.suiteId}`;
      if (node.id.endsWith(suf)) {
        return node.id.slice(0, -suf.length);
      }
      const split = node.id.split(":test_suite:");
      return split[0] ?? node.id;
    }
    return node.id.split(":")[0] ?? node.id;
  }

  function handleSelectNode(node: McpTreeNode) {
    setSelectedNode(node);
    setSelectedConn(connectionIdFromTreeNode(node));
  }

  function jumpToTool(connectionId: string, toolName: string) {
    setToolArgsPrefill(null);
    const root = mcp.trees[connectionId];
    const toolNode = findToolNode(root, toolName);
    if (toolNode) {
      setSelectedConn(connectionId);
      setSelectedNode(toolNode);
    }
  }

  function jumpToTraceTarget(
    connectionId: string,
    stepType: string | null,
    logicalName: string
  ) {
    setToolArgsPrefill(null);
    const root = mcp.trees[connectionId];
    if (!root) return;
    const k = (stepType ?? "tool").toLowerCase();
    if (k === "resource") {
      const n = findResourceNode(root, logicalName);
      if (n) {
        setSelectedConn(connectionId);
        setSelectedNode(n);
      }
      return;
    }
    if (k === "prompt") {
      const n = findPromptNode(root, logicalName);
      if (n) {
        setSelectedConn(connectionId);
        setSelectedNode(n);
      }
      return;
    }
    jumpToTool(connectionId, logicalName);
  }

  function jumpToToolWithArgs(
    connectionId: string,
    toolName: string,
    args: Record<string, unknown>
  ) {
    const root = mcp.trees[connectionId];
    const toolNode = findToolNode(root, toolName);
    if (toolNode) {
      setToolArgsPrefill({ connectionId, toolName, args });
      setSelectedConn(connectionId);
      setSelectedNode(toolNode);
    }
  }

  const consumeToolPrefill = useCallback(() => setToolArgsPrefill(null), []);

  const boundCallTool = useCallback(
    (tool: McpTool, args: Record<string, unknown>) => {
      if (!selectedConn) throw new Error("No connection");
      return callToolTracked(selectedConn, tool, args);
    },
    [selectedConn, callToolTracked]
  );
  const boundReadResource = (resource: McpResource) =>
    mcp.readResource(selectedConn!, resource);
  const boundGetPrompt = (prompt: McpPrompt, args?: Record<string, string>) =>
    mcp.getPrompt(selectedConn!, prompt, args);

  function openAdd() {
    setModalSeq((s) => s + 1);
    setModal({ mode: "add", initial: null });
  }

  function openEdit(id: string) {
    const c = mcp.connections.find((x) => x.config.id === id);
    if (!c) return;
    setModalSeq((s) => s + 1);
    setModal({ mode: "edit", initial: c.config });
  }

  const selectedConnection = selectedConn
    ? mcp.connections.find((c) => c.config.id === selectedConn)
    : undefined;
  const breadcrumbServerLabel = selectedConn
    ? mcp.trees[selectedConn]?.label ??
      (selectedConnection
        ? connectionDisplayName(selectedConnection.config)
        : "—")
    : "—";

  const hasConnection = selectedConn !== null;

  return (
    <div className="app-shell">
      <TracePollHeartbeat connections={mcp.connections} />
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-header-row">
            <div className="logo">
              <span className="logo-text">MCP GUI</span>
            </div>
          </div>
          <button type="button" className="btn-add" onClick={openAdd}>
            <Plus size={14} />
            Add Server
          </button>
        </div>

        {mcp.error && (
          <div className="sidebar-error">
            <AlertCircle size={12} />
            {mcp.error}
          </div>
        )}

        <div className="sidebar-block sidebar-block-grow">
          <div className="sidebar-section-title">Connections</div>
          <div className="sidebar-servers">
            <ConnectionList
              connections={mcp.connections}
              selectedId={selectedConn}
              onSelect={(id) => {
                if (id === selectedConn) {
                  void mcp.refreshTree(id);
                  return;
                }
                setSelectedConn(id);
                const hubId = `${id}:executions`;
                const hub = findNodeInForest(displayTrees, hubId);
                setSelectedNode(hub);
              }}
              onDisconnect={mcp.disconnect}
              onReconnect={mcp.reconnect}
              reconnectBusy={mcp.loading}
              onRemove={mcp.remove}
              onRefresh={mcp.refreshTree}
              onEdit={openEdit}
            />
          </div>
        </div>
      </aside>

      <div className="tree-panel">
        <div className="tree-panel-header">
          <span className="sidebar-section-title tree-panel-title">API Tree</span>
        </div>
        <div className="tree-scroll">
          <ApiTree
            nodes={displayTrees}
            onSelect={handleSelectNode}
            selectedId={selectedNode?.id}
            busyToolNodeIds={busyToolNodeIds}
            backgroundResultToolNodeIds={backgroundResultToolNodeIds}
            onAddTestSuite={createTestSuite}
          />
        </div>
      </div>

      <main className="main-content">
        <div className="topbar">
          <div className="breadcrumb">
            {selectedNode ? (
              <>
                <span className="bc-server">{breadcrumbServerLabel}</span>
                <span className="bc-sep">/</span>
                <span className="bc-node">{selectedNode.label}</span>
              </>
            ) : (
              <span className="bc-placeholder">Select an item from the tree</span>
            )}
          </div>
          <ThemeToggle />
        </div>

        <div className="detail-area workspace-detail-area">
          <DetailPanel
            node={selectedNode}
            hasConnection={hasConnection}
            connectionId={selectedConn}
            debugTraceAvailable={selectedConnection?.debugTraceAvailable === true}
            savedList={savedList}
            toolsForConnection={toolsForSelected}
            testSuitesForConnection={
              selectedConn ? suitesByConn[selectedConn] ?? [] : []
            }
            onTestSuiteDeleted={() => setSelectedNode(null)}
            callToolTracked={callToolTracked}
            onCallTool={boundCallTool}
            onReadResource={boundReadResource}
            onGetPrompt={boundGetPrompt}
            onSavedMutate={bumpSaved}
            onJumpToTool={jumpToTool}
            onJumpToTraceTarget={jumpToTraceTarget}
            onJumpToToolWithArgs={jumpToToolWithArgs}
            toolArgsPrefill={toolArgsPrefill}
            onConsumeToolPrefill={consumeToolPrefill}
          />
        </div>
      </main>

      {modal && (
        <ConnectionModal
          key={modalSeq}
          mode={modal.mode}
          initial={modal.initial}
          onAdd={mcp.addAndConnect}
          onUpdate={mcp.updateAndReconnect}
          onClose={() => setModal(null)}
          loading={mcp.loading}
        />
      )}
    </div>
  );
}
