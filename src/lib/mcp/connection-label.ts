import type { McpConnectionConfig } from "@/types/mcp";

const FALLBACK = "MCP server";

/** User-facing label when `config.name` is blank (e.g. before the server reports a name). */
export function connectionDisplayName(config: McpConnectionConfig): string {
  const t = config.name.trim();
  return t || FALLBACK;
}
