import type { JsonSchema } from "@/types/mcp";

/** Map saved / JSON args into form string values for tool parameter fields. */
export function argsRecordToFormStrings(
  args: Record<string, unknown>,
  schema: JsonSchema
): Record<string, string> {
  const props = schema.properties ?? {};
  const out: Record<string, string> = {};
  for (const key of Object.keys(props)) {
    const v = args[key];
    if (v === undefined || v === null) {
      out[key] = "";
      continue;
    }
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[key] = String(v);
    } else {
      try {
        out[key] = JSON.stringify(v);
      } catch {
        out[key] = String(v);
      }
    }
  }
  for (const [key, v] of Object.entries(args)) {
    if (key in out) continue;
    if (v === undefined || v === null) {
      out[key] = "";
    } else if (typeof v === "object") {
      try {
        out[key] = JSON.stringify(v);
      } catch {
        out[key] = String(v);
      }
    } else {
      out[key] = String(v);
    }
  }
  return out;
}
