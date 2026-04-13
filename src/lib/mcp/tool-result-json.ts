import type { ToolCallResponse } from "@/types/mcp";

/** Pretty-printed JSON for test suite output (no explorer UI). */
export function toolResponseToPrettyJson(result: ToolCallResponse): string {
  try {
    return JSON.stringify(
      {
        isError: result.isError === true,
        content: result.content,
      },
      null,
      2
    );
  } catch {
    return String(result);
  }
}
