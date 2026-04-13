import type { JsonSchema } from "@/types/mcp";

/**
 * Small subset of JSON Schema for MCP test assertions (no $ref, no allOf).
 * Enough for typical `type` / `properties` / `required` / `items` checks.
 */
export function validateJsonAgainstSchema(
  value: unknown,
  schema: JsonSchema,
  path = "$"
): string[] {
  const errors: string[] = [];

  const t = schema.type;
  if (t !== undefined) {
    const types = (Array.isArray(t) ? t : [t]) as string[];
    const vt =
      value === null
        ? "null"
        : Array.isArray(value)
          ? "array"
          : typeof value;
    if (!types.includes(vt)) {
      errors.push(`${path}: expected type ${types.join(" | ")}, got ${vt}`);
      return errors;
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const req = schema.required ?? [];
    for (const key of req) {
      if (!(key in value)) {
        errors.push(`${path}: missing required property ${JSON.stringify(key)}`);
      }
    }
    const props = schema.properties;
    if (props) {
      for (const [key, sub] of Object.entries(props)) {
        if (key in (value as Record<string, unknown>)) {
          errors.push(
            ...validateJsonAgainstSchema(
              (value as Record<string, unknown>)[key],
              sub,
              `${path}.${key}`
            )
          );
        }
      }
    }
  }

  if (Array.isArray(value) && schema.items && typeof schema.items === "object") {
    const itemSchema = schema.items as JsonSchema;
    value.forEach((item, i) => {
      errors.push(...validateJsonAgainstSchema(item, itemSchema, `${path}[${i}]`));
    });
  }

  return errors;
}
