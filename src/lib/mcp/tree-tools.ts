import type {
  McpTreeNode,
  McpTool,
  McpResource,
  McpPrompt,
  SavedToolResponse,
} from "@/types/mcp";
import type { PersistedTestSuite } from "@/lib/mcp/test-suites-types";

/** Find a tool node in the raw server tree (before saved-response enrichment). */
export function findToolNode(
  root: McpTreeNode | null | undefined,
  toolName: string
): McpTreeNode | null {
  if (!root?.children) return null;
  function walk(nodes: McpTreeNode[]): McpTreeNode | null {
    for (const n of nodes) {
      if (n.kind === "tool" && (n.data as McpTool).name === toolName) return n;
      if (n.children) {
        const f = walk(n.children);
        if (f) return f;
      }
    }
    return null;
  }
  return walk(root.children);
}

export function findResourceNode(
  root: McpTreeNode | null | undefined,
  resourceName: string
): McpTreeNode | null {
  if (!root?.children) return null;
  function walk(nodes: McpTreeNode[]): McpTreeNode | null {
    for (const n of nodes) {
      if (n.kind === "resource" && (n.data as McpResource).name === resourceName)
        return n;
      if (n.children) {
        const f = walk(n.children);
        if (f) return f;
      }
    }
    return null;
  }
  return walk(root.children);
}

export function findPromptNode(
  root: McpTreeNode | null | undefined,
  promptName: string
): McpTreeNode | null {
  if (!root?.children) return null;
  function walk(nodes: McpTreeNode[]): McpTreeNode | null {
    for (const n of nodes) {
      if (n.kind === "prompt" && (n.data as McpPrompt).name === promptName) return n;
      if (n.children) {
        const f = walk(n.children);
        if (f) return f;
      }
    }
    return null;
  }
  return walk(root.children);
}

/** Collect tool definitions from a server root tree (ignores synthetic nodes). */
export function collectToolsFromTree(root: McpTreeNode | null | undefined): McpTool[] {
  if (!root) return [];
  const out: McpTool[] = [];
  function walk(nodes: McpTreeNode[]) {
    for (const n of nodes) {
      if (n.kind === "tool" && n.data) out.push(n.data as McpTool);
      if (n.children) walk(n.children);
    }
  }
  if (root.children) walk(root.children);
  return out;
}

/** Strip saved leaves from tool nodes and restore param-only badges (legacy trees). */
function stripSavedFromTools(nodes: McpTreeNode[]): McpTreeNode[] {
  return nodes.map((node) => {
    if (node.kind === "tool") {
      const tool = node.data as McpTool;
      const rawChildren =
        node.children?.filter((c) => c.kind !== "saved_response") ?? undefined;
      const paramCount = Object.keys(tool.inputSchema?.properties ?? {}).length;
      const baseBadge = paramCount > 0 ? `${paramCount}p` : undefined;
      return {
        ...node,
        badge: baseBadge,
        children: rawChildren?.length ? rawChildren : undefined,
      };
    }
    if (node.children) {
      return { ...node, children: stripSavedFromTools(node.children) };
    }
    return node;
  });
}

/**
 * Add a per-server **Saved** section (before Executions) and keep tools free of saved children.
 */
export function enrichTreeWithSaved(
  root: McpTreeNode,
  savedForConnection: SavedToolResponse[]
): McpTreeNode {
  if (root.kind !== "server" || !root.children) {
    return root;
  }

  const connId = root.id;
  const children = stripSavedFromTools(root.children);

  const savedNodes: McpTreeNode[] = savedForConnection
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((s) => ({
      id: `${connId}:saved:${s.id}`,
      kind: "saved_response" as const,
      label: s.title,
      description: new Date(s.createdAt).toLocaleString(),
      data: s,
    }));

  let newChildren = [...children];

  newChildren = newChildren.filter(
    (c) => !(c.kind === "section" && c.id === `${connId}:saved`)
  );

  if (savedNodes.length > 0) {
    const savedSection: McpTreeNode = {
      id: `${connId}:saved`,
      kind: "section",
      label: "Saved",
      badge: savedNodes.length,
      children: savedNodes,
    };
    const execIdx = newChildren.findIndex(
      (c) =>
        c.kind === "executions_hub" ||
        (c.kind === "section" && c.id === `${connId}:executions_section`)
    );
    if (execIdx >= 0) {
      newChildren = [
        ...newChildren.slice(0, execIdx),
        savedSection,
        ...newChildren.slice(execIdx),
      ];
    } else {
      newChildren.push(savedSection);
    }
  }

  return { ...root, children: newChildren };
}

export function enrichForest(
  roots: McpTreeNode[],
  allSaved: SavedToolResponse[]
): McpTreeNode[] {
  return roots.map((root) => {
    if (root.kind !== "server") return root;
    const forConn = allSaved.filter((s) => s.connectionId === root.id);
    return enrichTreeWithSaved(root, forConn);
  });
}

/** Inject per-suite rows under Executions → Testing (section `${connId}:testing_section`). */
export function enrichTreeWithTestSuites(
  root: McpTreeNode,
  suites: PersistedTestSuite[]
): McpTreeNode {
  if (root.kind !== "server" || !root.children) return root;
  const connId = root.id;

  function walk(nodes: McpTreeNode[]): McpTreeNode[] {
    return nodes.map((n) => {
      if (n.id === `${connId}:testing_section`) {
        return {
          ...n,
          badge: suites.length,
          children: suites.map((s) => ({
            id: `${connId}:test_suite:${s.id}`,
            kind: "test_suite" as const,
            label: s.name,
            description: `${s.steps.length} step(s)`,
            data: { suiteId: s.id },
          })),
        };
      }
      if (n.children) {
        return { ...n, children: walk(n.children) };
      }
      return n;
    });
  }

  return { ...root, children: walk(root.children) };
}

export function enrichForestWithTestSuites(
  roots: McpTreeNode[],
  suitesByConn: Record<string, PersistedTestSuite[]>
): McpTreeNode[] {
  return roots.map((r) =>
    r.kind === "server"
      ? enrichTreeWithTestSuites(r, suitesByConn[r.id] ?? [])
      : r
  );
}

export function findTreeNodeById(
  root: McpTreeNode,
  id: string
): McpTreeNode | null {
  if (root.id === id) return root;
  if (!root.children) return null;
  for (const c of root.children) {
    const f = findTreeNodeById(c, id);
    if (f) return f;
  }
  return null;
}

export function findNodeInForest(
  roots: McpTreeNode[],
  id: string
): McpTreeNode | null {
  for (const r of roots) {
    const f = findTreeNodeById(r, id);
    if (f) return f;
  }
  return null;
}
