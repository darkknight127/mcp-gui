import type { JsonSchema } from "@/types/mcp";

export function schemaPrimaryType(schema: JsonSchema): string | undefined {
  const t = schema.type;
  if (Array.isArray(t)) {
    const nn = t.filter((x) => x !== "null");
    return (nn[0] ?? t[0]) as string | undefined;
  }
  return t;
}

/** Build MCP tool args from string form state (same rules as tool detail Run). */
export function coerceArgs(raw: Record<string, string>, schema: JsonSchema): Record<string, unknown> {
  const props = schema.properties ?? {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === "") continue;
    const s = props[k];
    if (!s) {
      continue;
    }
    const t = schemaPrimaryType(s);
    if (t === "number" || t === "integer") out[k] = Number(v);
    else if (t === "boolean") out[k] = v === "true";
    else out[k] = v;
  }
  return out;
}
