import type { McpTransportType } from "@/types/mcp";

/** Short label for chips in the UI */
export function transportChipLabel(t: McpTransportType): string {
  switch (t) {
    case "stdio":
      return "stdio";
    case "sse":
      return "SSE";
    case "streamable-http":
      return "Streamable";
    default:
      return t;
  }
}

/** Longer description for tooltips */
export function transportTitle(t: McpTransportType): string {
  switch (t) {
    case "stdio":
      return "Standard I/O (local process)";
    case "sse":
      return "SSE (legacy HTTP + EventSource)";
    case "streamable-http":
      return "Streamable HTTP (MCP)";
    default:
      return t;
  }
}
