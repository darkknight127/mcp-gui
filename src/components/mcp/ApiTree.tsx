"use client";

import { useState, useRef, useLayoutEffect, type ReactNode } from "react";
import {
  ChevronRight,
  ChevronDown,
  Wrench,
  FileText,
  MessageSquare,
  Server,
  Layers,
  Bookmark,
  FlaskConical,
  Plus,
  Activity,
  Cog,
  Terminal,
} from "lucide-react";
import type { McpTreeNode, McpNodeKind } from "@/types/mcp";
import { SpinnerSvg } from "@/components/ui/SpinnerSvg";

function subtreeContainsId(n: McpTreeNode, id: string): boolean {
  if (n.id === id) return true;
  if (!n.children?.length) return false;
  return n.children.some((c) => subtreeContainsId(c, id));
}

interface Props {
  node: McpTreeNode;
  depth?: number;
  onSelect: (node: McpTreeNode) => void;
  selectedId?: string;
  /** Tool node ids with at least one in-flight MCP call */
  busyToolNodeIds?: ReadonlySet<string>;
  /** Tool nodes with a successful result newer than last focus ack (not the selected tool). */
  backgroundResultToolNodeIds?: ReadonlySet<string>;
  /** Executions → Testing row: add suite (+) */
  onAddTestSuite?: (connectionId: string) => void;
}

const KIND_ICON: Record<McpNodeKind, React.ReactNode> = {
  server: <Server size={14} />,
  section: <Layers size={14} />,
  tool: <Wrench size={14} />,
  resource: <FileText size={14} />,
  prompt: <MessageSquare size={14} />,
  saved_response: <Bookmark size={14} />,
  executions_hub: <Terminal size={14} />,
  test_suite: <FlaskConical size={14} />,
};

const KIND_COLOR: Record<McpNodeKind, string> = {
  server: "node-server",
  section: "node-section",
  tool: "node-tool",
  resource: "node-resource",
  prompt: "node-prompt",
  saved_response: "node-saved",
  executions_hub: "node-executions",
  test_suite: "node-test-suite",
};

function iconForTreeNode(node: McpTreeNode): ReactNode {
  if (node.kind === "section") {
    if (node.id.endsWith(":saved")) return <Bookmark size={14} />;
    if (node.id.endsWith(":executions_section"))
      return <Activity size={14} />;
    if (node.id.endsWith(":testing_section")) return <Cog size={14} />;
  }
  return KIND_ICON[node.kind];
}

export function ApiTreeNode({
  node,
  depth = 0,
  onSelect,
  selectedId,
  busyToolNodeIds,
  backgroundResultToolNodeIds,
  onAddTestSuite,
}: Props) {
  const hasChildren = node.children && node.children.length > 0;
  const [open, setOpen] = useState(depth < 2);
  const isSelected = selectedId === node.id;
  const nodeRef = useRef(node);

  useLayoutEffect(() => {
    nodeRef.current = node;
  });

  useLayoutEffect(() => {
    if (!selectedId || !hasChildren) return;
    if (subtreeContainsId(nodeRef.current, selectedId)) {
      // Reveal nested selection (e.g. saved response under Saved).
      setOpen(true);
    }
  }, [selectedId, hasChildren]);
  const toolBusy =
    node.kind === "tool" && busyToolNodeIds?.has(node.id) === true;
  const toolBackgroundResult =
    node.kind === "tool" &&
    !toolBusy &&
    backgroundResultToolNodeIds?.has(node.id) === true;
  const isTestingSection =
    node.kind === "section" && node.id.endsWith(":testing_section");
  const testingConnectionId =
    isTestingSection && onAddTestSuite
      ? node.id.slice(0, -":testing_section".length)
      : null;
  const selectable =
    node.kind !== "server" && node.kind !== "section";

  function handleClick() {
    if (hasChildren) setOpen((o) => !o);
    if (selectable) onSelect(node);
  }

  return (
    <div className="tree-node-wrapper">
      <div
        data-tree-node-id={node.id}
        className={`tree-node ${KIND_COLOR[node.kind]} ${isSelected ? "selected" : ""} ${!hasChildren ? "leaf" : ""} ${toolBusy ? "tree-node-tool-busy" : ""}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
      >
        {/* Expand toggle */}
        <span className="tree-node-chevron">
          {hasChildren ? (
            open ? <ChevronDown size={12} /> : <ChevronRight size={12} />
          ) : (
            <span style={{ width: 12, display: "inline-block" }} />
          )}
        </span>

        <span className={`tree-node-icon kind-${node.kind}`}>
          {iconForTreeNode(node)}
        </span>

        <span
          className={
            node.kind === "executions_hub"
              ? "tree-node-label tree-node-label-trace"
              : "tree-node-label"
          }
        >
          {node.label}
        </span>

        {toolBusy && (
          <SpinnerSvg
            size={14}
            label="Tool call in progress"
            className="tree-tool-run-spinner"
          />
        )}

        {toolBackgroundResult && (
          <span
            className="tree-tool-result-ready-dot"
            title="New result — open this tool to view"
            role="status"
            aria-label="New tool result available"
          />
        )}

        {/* Badge */}
        {node.badge !== undefined && (
          <span className="tree-badge">{node.badge}</span>
        )}

        {testingConnectionId && (
          <button
            type="button"
            className="tree-node-add-suite"
            title="New test suite"
            aria-label="New test suite"
            onClick={(e) => {
              e.stopPropagation();
              onAddTestSuite!(testingConnectionId);
            }}
          >
            <Plus size={12} strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* Children */}
      {hasChildren && open && (
        <div className="tree-children">
          {node.children!.map((child) => (
            <ApiTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onSelect={onSelect}
              selectedId={selectedId}
              busyToolNodeIds={busyToolNodeIds}
              backgroundResultToolNodeIds={backgroundResultToolNodeIds}
              onAddTestSuite={onAddTestSuite}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface TreeProps {
  nodes: McpTreeNode[];
  onSelect: (node: McpTreeNode) => void;
  selectedId?: string;
  busyToolNodeIds?: ReadonlySet<string>;
  backgroundResultToolNodeIds?: ReadonlySet<string>;
  onAddTestSuite?: (connectionId: string) => void;
}

export function ApiTree({
  nodes,
  onSelect,
  selectedId,
  busyToolNodeIds,
  backgroundResultToolNodeIds,
  onAddTestSuite,
}: TreeProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!selectedId || !rootRef.current) return;
    const q =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(selectedId)
        : selectedId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const el = rootRef.current.querySelector(`[data-tree-node-id="${q}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  if (nodes.length === 0) {
    return (
      <div className="tree-empty">
        <Server size={32} className="empty-icon" />
        <p>No servers connected</p>
        <p className="empty-sub">Add an MCP server to get started</p>
      </div>
    );
  }

  return (
    <div className="api-tree" ref={rootRef}>
      {nodes.map((node) => (
        <ApiTreeNode
          key={node.id}
          node={node}
          depth={0}
          onSelect={onSelect}
          selectedId={selectedId}
          busyToolNodeIds={busyToolNodeIds}
          backgroundResultToolNodeIds={backgroundResultToolNodeIds}
          onAddTestSuite={onAddTestSuite}
        />
      ))}
    </div>
  );
}
