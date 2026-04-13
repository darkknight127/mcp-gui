import type {
  McpServerSnapshot,
  McpTreeNode,
  McpTool,
  McpResource,
  McpPrompt,
} from "@/types/mcp";
import { DEBUG_TRACE_TOOL_NAME } from "@/lib/mcp/debug-trace";

export function buildApiTree(
  snapshot: McpServerSnapshot,
  traceStepCount = 0
): McpTreeNode {
  const { connection, info, tools, resources, prompts } = snapshot;
  const visibleTools = tools.filter((t) => t.name !== DEBUG_TRACE_TOOL_NAME);

  const children: McpTreeNode[] = [];

  if (visibleTools.length > 0) {
    children.push({
      id: `${connection.config.id}:tools`,
      kind: "section",
      label: "Tools",
      badge: visibleTools.length,
      children: visibleTools.map((t) => toolNode(connection.config.id, t)),
    });
  }

  if (resources.length > 0) {
    children.push({
      id: `${connection.config.id}:resources`,
      kind: "section",
      label: "Resources",
      badge: resources.length,
      children: resources.map((r) => resourceNode(connection.config.id, r)),
    });
  }

  if (prompts.length > 0) {
    children.push({
      id: `${connection.config.id}:prompts`,
      kind: "section",
      label: "Prompts",
      badge: prompts.length,
      children: prompts.map((p) => promptNode(connection.config.id, p)),
    });
  }

  children.push({
    id: `${connection.config.id}:executions_section`,
    kind: "section",
    label: "Executions",
    children: [
      {
        id: `${connection.config.id}:executions`,
        kind: "executions_hub",
        label: "Trace log",
        description: "Server trace log (tools, resources, prompts)",
        badge: traceStepCount > 0 ? traceStepCount : undefined,
      },
      {
        id: `${connection.config.id}:testing_section`,
        kind: "section",
        label: "Testing",
        badge: 0,
        children: [],
      },
    ],
  });

  const label =
    (info?.name?.trim() ||
      connection.config.name.trim() ||
      "MCP server");

  return {
    id: connection.config.id,
    kind: "server",
    label,
    description: info ? `v${info.version}` : connection.config.transport,
    children,
  };
}

function toolNode(serverId: string, tool: McpTool): McpTreeNode {
  const paramCount = Object.keys(tool.inputSchema?.properties ?? {}).length;
  return {
    id: `${serverId}:tool:${tool.name}`,
    kind: "tool",
    label: tool.name,
    description: tool.description,
    badge: paramCount > 0 ? `${paramCount}p` : undefined,
    data: tool,
  };
}

function resourceNode(serverId: string, resource: McpResource): McpTreeNode {
  return {
    id: `${serverId}:resource:${resource.uri}`,
    kind: "resource",
    label: resource.name,
    description: resource.uri,
    data: resource,
  };
}

function promptNode(serverId: string, prompt: McpPrompt): McpTreeNode {
  const argCount = prompt.arguments?.length ?? 0;
  return {
    id: `${serverId}:prompt:${prompt.name}`,
    kind: "prompt",
    label: prompt.name,
    description: prompt.description,
    badge: argCount > 0 ? `${argCount}a` : undefined,
    data: prompt,
  };
}
