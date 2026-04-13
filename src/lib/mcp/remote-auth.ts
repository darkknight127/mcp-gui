import { ClientCredentialsProvider } from "@modelcontextprotocol/sdk/client/auth-extensions.js";
import type { McpConnectionConfig, McpOAuth2Manual } from "@/types/mcp";

export function resolveBearerToken(config: McpConnectionConfig): string | undefined {
  const profiles = config.bearerProfiles?.length
    ? config.bearerProfiles
    : config.bearerToken?.trim()
      ? [{ token: config.bearerToken.trim() }]
      : [];
  if (profiles.length === 0) return undefined;
  const idx = Math.min(
    Math.max(0, config.activeBearerProfileIndex ?? 0),
    profiles.length - 1
  );
  const tok = profiles[idx]?.token?.trim();
  return tok || undefined;
}

function mergeHeaderRecords(
  base: Record<string, string>,
  config: McpConnectionConfig
): Record<string, string> {
  const out = { ...base, ...(config.headers ?? {}) };
  for (const h of config.authHeaders ?? []) {
    const n = h.name.trim();
    if (n) out[n] = h.value;
  }
  return out;
}

export async function fetchOAuth2ManualAccessToken(
  cfg: McpOAuth2Manual
): Promise<string> {
  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("client_id", cfg.clientId);
  body.set("client_secret", cfg.clientSecret);
  if (cfg.scope?.trim()) body.set("scope", cfg.scope.trim());

  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`OAuth token request failed (${res.status}): ${text.slice(0, 500)}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    throw new Error("OAuth token response was not JSON");
  }
  const token =
    json && typeof json === "object" && "access_token" in json
      ? (json as { access_token?: unknown }).access_token
      : undefined;
  if (typeof token !== "string" || !token.trim()) {
    throw new Error("OAuth token response missing access_token");
  }
  return token.trim();
}

export interface RemoteTransportAuthOptions {
  requestInit?: RequestInit;
  authProvider?: ClientCredentialsProvider;
}

/**
 * Builds options for SSE / Streamable HTTP transports.
 * - `oauth2_mcp`: uses SDK OAuth discovery + client_credentials (server must advertise metadata).
 * - `oauth2_manual`: fetches a token from `oauth2Manual.tokenUrl`, then sends `Authorization: Bearer`.
 * - `bearer`: static bearer from profiles / legacy `bearerToken`.
 * - `custom_headers`: only merged headers (API keys, etc.).
 * - `none`: optional merged headers only.
 */
export async function buildRemoteTransportAuth(
  config: McpConnectionConfig
): Promise<RemoteTransportAuthOptions> {
  const authType = config.authType ?? "none";
  const headers: Record<string, string> = mergeHeaderRecords({}, config);

  if (authType === "oauth2_mcp" && config.oauth2Mcp) {
    const provider = new ClientCredentialsProvider({
      clientId: config.oauth2Mcp.clientId,
      clientSecret: config.oauth2Mcp.clientSecret,
      scope: config.oauth2Mcp.scope,
    });
    const initKeys = Object.keys(headers);
    return {
      authProvider: provider,
      requestInit: initKeys.length ? { headers } : undefined,
    };
  }

  if (authType === "oauth2_manual" && config.oauth2Manual) {
    const access = await fetchOAuth2ManualAccessToken(config.oauth2Manual);
    headers.Authorization = `Bearer ${access}`;
    return { requestInit: { headers } };
  }

  if (authType === "bearer") {
    const tok = resolveBearerToken(config);
    if (tok) headers.Authorization = `Bearer ${tok}`;
    return Object.keys(headers).length ? { requestInit: { headers } } : {};
  }

  if (authType === "custom_headers") {
    return Object.keys(headers).length ? { requestInit: { headers } } : {};
  }

  return Object.keys(headers).length ? { requestInit: { headers } } : {};
}
