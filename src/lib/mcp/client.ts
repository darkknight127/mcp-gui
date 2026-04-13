import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  McpConnectionConfig,
  McpServerInfo,
  McpTool,
  McpResource,
  McpPrompt,
  ToolCallResponse,
  McpContent,
} from "@/types/mcp";
import { buildRemoteTransportAuth } from "@/lib/mcp/remote-auth";

export interface McpClientHandle {
  client: Client;
  close: () => Promise<void>;
}

export async function createMcpClient(config: McpConnectionConfig): Promise<McpClientHandle> {
  const client = new Client(
    { name: "mcp-gui", version: "1.0.0" },
    { capabilities: { sampling: {} } }
  );

  let transport;
  if (config.transport === "stdio") {
    if (!config.command) throw new Error("stdio transport requires `command`");
    transport = new StdioClientTransport({ command: config.command, args: config.args ?? [], env: config.env });
  } else if (config.transport === "sse") {
    if (!config.url) throw new Error("sse transport requires `url`");
    const remote = await buildRemoteTransportAuth(config);
    const sseOpts: {
      requestInit?: RequestInit;
      authProvider?: NonNullable<Awaited<ReturnType<typeof buildRemoteTransportAuth>>["authProvider"]>;
    } = {};
    if (remote.requestInit) sseOpts.requestInit = remote.requestInit;
    if (remote.authProvider) sseOpts.authProvider = remote.authProvider;
    transport = new SSEClientTransport(
      new URL(config.url),
      Object.keys(sseOpts).length ? sseOpts : undefined
    );
  } else if (config.transport === "streamable-http") {
    if (!config.url) throw new Error("streamable-http transport requires `url`");
    const remote = await buildRemoteTransportAuth(config);
    const httpOpts: {
      requestInit?: RequestInit;
      authProvider?: NonNullable<Awaited<ReturnType<typeof buildRemoteTransportAuth>>["authProvider"]>;
    } = {};
    if (remote.requestInit) httpOpts.requestInit = remote.requestInit;
    if (remote.authProvider) httpOpts.authProvider = remote.authProvider;
    transport = new StreamableHTTPClientTransport(
      new URL(config.url),
      Object.keys(httpOpts).length ? httpOpts : undefined
    );
  } else {
    throw new Error(`Unsupported transport: ${config.transport}`);
  }

  await client.connect(transport);
  return { client, close: async () => { await client.close(); } };
}

export async function fetchServerInfo(client: Client): Promise<McpServerInfo | undefined> {
  try {
    const info = client.getServerVersion();
    if (!info) return undefined;
    return { name: info.name, version: info.version, protocolVersion: "2024-11-05" };
  } catch { return undefined; }
}

export async function fetchTools(client: Client): Promise<McpTool[]> {
  const res = await client.listTools();
  return (res.tools ?? []).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema as McpTool["inputSchema"],
  }));
}

export async function fetchResources(client: Client): Promise<McpResource[]> {
  try {
    const res = await client.listResources();
    return (res.resources ?? []).map((r) => ({
      uri: r.uri, name: r.name, description: r.description, mimeType: r.mimeType,
    }));
  } catch { return []; }
}

export async function fetchPrompts(client: Client): Promise<McpPrompt[]> {
  try {
    const res = await client.listPrompts();
    return (res.prompts ?? []).map((p) => ({
      name: p.name, description: p.description,
      arguments: p.arguments?.map((a) => ({ name: a.name, description: a.description, required: a.required })),
    }));
  } catch { return []; }
}

export async function callTool(client: Client, toolName: string, args: Record<string, unknown>): Promise<ToolCallResponse> {
  const res = await client.callTool({ name: toolName, arguments: args });
  return { content: (res.content ?? []) as McpContent[], isError: res.isError as boolean | undefined };
}

export async function readResource(client: Client, uri: string): Promise<McpContent[]> {
  const res = await client.readResource({ uri });
  return (res.contents ?? []).map((c) => {
    const asAny = c as Record<string, unknown>;
    return {
      type: "resource" as const,
      text: typeof asAny.text === "string" ? asAny.text : undefined,
      data: typeof asAny.blob === "string" ? asAny.blob : undefined,
      mimeType: c.mimeType,
    };
  });
}

export async function getPrompt(client: Client, name: string, args?: Record<string, string>): Promise<McpContent[]> {
  const res = await client.getPrompt({ name, arguments: args });
  return (res.messages ?? []).map((m) => ({
    type: "text" as const,
    text: typeof m.content === "string" ? m.content : (m.content as { text?: string })?.text ?? "",
  }));
}
