import { nanoid } from "nanoid";
import type { SavedToolResponse, ToolCallResponse } from "@/types/mcp";

const STORAGE_KEY = "mcp-gui.savedToolResponses.v1";

interface Payload {
  version: 1;
  items: SavedToolResponse[];
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

function normalizeSavedItem(raw: unknown): SavedToolResponse | null {
  if (!isRecord(raw)) return null;
  if (
    typeof raw.id !== "string" ||
    typeof raw.connectionId !== "string" ||
    typeof raw.toolName !== "string" ||
    typeof raw.title !== "string" ||
    typeof raw.createdAt !== "string" ||
    raw.response == null ||
    typeof raw.args !== "object" ||
    raw.args === null ||
    Array.isArray(raw.args)
  ) {
    return null;
  }
  return {
    id: raw.id,
    connectionId: raw.connectionId,
    toolName: raw.toolName,
    title: raw.title,
    args: raw.args as Record<string, unknown>,
    response: raw.response as ToolCallResponse,
    createdAt: raw.createdAt,
  };
}

function parse(raw: string | null): SavedToolResponse[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as Partial<Payload>;
    if (data.version !== 1 || !Array.isArray(data.items)) return [];
    const out: SavedToolResponse[] = [];
    for (const x of data.items) {
      const n = normalizeSavedItem(x);
      if (n) out.push(n);
    }
    return out;
  } catch {
    return [];
  }
}

export function loadSavedToolResponses(): SavedToolResponse[] {
  if (typeof window === "undefined") return [];
  return parse(localStorage.getItem(STORAGE_KEY));
}

function persist(items: SavedToolResponse[]): void {
  if (typeof window === "undefined") return;
  try {
    const payload: Payload = { version: 1, items };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function addSavedToolResponse(input: {
  connectionId: string;
  toolName: string;
  title?: string;
  args: Record<string, unknown>;
  response: ToolCallResponse;
}): SavedToolResponse {
  const items = loadSavedToolResponses();
  const createdAt = new Date().toISOString();
  const entry: SavedToolResponse = {
    id: nanoid(10),
    connectionId: input.connectionId,
    toolName: input.toolName,
    title:
      input.title?.trim() ||
      `${input.toolName} · ${new Date(createdAt).toLocaleString()}`,
    args: input.args,
    response: input.response,
    createdAt,
  };
  items.unshift(entry);
  persist(items);
  return entry;
}

export function removeSavedToolResponse(id: string): void {
  const items = loadSavedToolResponses().filter((x) => x.id !== id);
  persist(items);
}

export function updateSavedTitle(id: string, title: string): void {
  const items = loadSavedToolResponses().map((x) =>
    x.id === id ? { ...x, title: title.trim() || x.title } : x
  );
  persist(items);
}
