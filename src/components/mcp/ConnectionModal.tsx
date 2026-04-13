"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Plus, Save, Terminal, Radio, Link2, Trash2, RefreshCw } from "lucide-react";
import { api } from "@/lib/api-client";
import type {
  McpAuthType,
  McpBearerProfile,
  McpConnectionConfig,
  McpTransportType,
} from "@/types/mcp";
import type { TraceSetupPayload } from "@/types/trace";

interface HeaderRow {
  name: string;
  value: string;
}

interface FormFields {
  transport: McpTransportType;
  name: string;
  command: string;
  args: string;
  url: string;
  authType: McpAuthType;
  bearerProfiles: McpBearerProfile[];
  activeBearerProfileIndex: number;
  authHeaders: HeaderRow[];
  oauthManualTokenUrl: string;
  oauthManualClientId: string;
  oauthManualSecret: string;
  oauthManualScope: string;
  oauthMcpClientId: string;
  oauthMcpSecret: string;
  oauthMcpScope: string;
}

function initialBearerProfiles(initial: McpConnectionConfig | null): McpBearerProfile[] {
  if (!initial) return [{ label: "Token A", token: "" }];
  if (initial.bearerProfiles?.length) {
    return initial.bearerProfiles.map((p) => ({
      label: p.label ?? "",
      token: p.token ?? "",
    }));
  }
  if (initial.bearerToken?.trim()) {
    return [{ label: "Default", token: initial.bearerToken }];
  }
  return [{ label: "Token A", token: "" }];
}

function formFieldsFromProps(
  mode: "add" | "edit",
  initial: McpConnectionConfig | null
): FormFields {
  if (mode === "add" || !initial) {
    return {
      transport: "stdio",
      name: "",
      command: "",
      args: "",
      url: "",
      authType: "none",
      bearerProfiles: initialBearerProfiles(null),
      activeBearerProfileIndex: 0,
      authHeaders: [],
      oauthManualTokenUrl: "",
      oauthManualClientId: "",
      oauthManualSecret: "",
      oauthManualScope: "",
      oauthMcpClientId: "",
      oauthMcpSecret: "",
      oauthMcpScope: "",
    };
  }
  if (initial.transport === "stdio") {
    return {
      transport: "stdio",
      name: initial.name,
      command: initial.command ?? "",
      args: (initial.args ?? []).join(" "),
      url: "",
      authType: "none",
      bearerProfiles: [{ label: "", token: "" }],
      activeBearerProfileIndex: 0,
      authHeaders: [],
      oauthManualTokenUrl: "",
      oauthManualClientId: "",
      oauthManualSecret: "",
      oauthManualScope: "",
      oauthMcpClientId: "",
      oauthMcpSecret: "",
      oauthMcpScope: "",
    };
  }
  const profiles = initialBearerProfiles(initial);
  return {
    transport: initial.transport,
    name: initial.name,
    command: "",
    args: "",
    url: initial.url ?? "",
    authType: initial.authType ?? "none",
    bearerProfiles: profiles,
    activeBearerProfileIndex: Math.min(
      Math.max(0, initial.activeBearerProfileIndex ?? 0),
      Math.max(0, profiles.length - 1)
    ),
    authHeaders: (initial.authHeaders ?? []).map((h) => ({
      name: h.name,
      value: h.value,
    })),
    oauthManualTokenUrl: initial.oauth2Manual?.tokenUrl ?? "",
    oauthManualClientId: initial.oauth2Manual?.clientId ?? "",
    oauthManualSecret: initial.oauth2Manual?.clientSecret ?? "",
    oauthManualScope: initial.oauth2Manual?.scope ?? "",
    oauthMcpClientId: initial.oauth2Mcp?.clientId ?? "",
    oauthMcpSecret: initial.oauth2Mcp?.clientSecret ?? "",
    oauthMcpScope: initial.oauth2Mcp?.scope ?? "",
  };
}

interface Props {
  mode: "add" | "edit";
  initial: McpConnectionConfig | null;
  onAdd: (input: Omit<McpConnectionConfig, "id">) => Promise<void>;
  onUpdate: (id: string, input: Omit<McpConnectionConfig, "id">) => Promise<void>;
  onClose: () => void;
  loading: boolean;
}

export function ConnectionModal({
  mode,
  initial,
  onAdd,
  onUpdate,
  onClose,
  loading,
}: Props) {
  const init = formFieldsFromProps(mode, initial);
  const [transport, setTransport] = useState(init.transport);
  const [name, setName] = useState(init.name);
  const [command, setCommand] = useState(init.command);
  const [args, setArgs] = useState(init.args);
  const [url, setUrl] = useState(init.url);
  const [authType, setAuthType] = useState<McpAuthType>(init.authType);
  const [bearerProfiles, setBearerProfiles] = useState<McpBearerProfile[]>(
    init.bearerProfiles
  );
  const [activeBearerProfileIndex, setActiveBearerProfileIndex] = useState(
    init.activeBearerProfileIndex
  );
  const [authHeaders, setAuthHeaders] = useState<HeaderRow[]>(init.authHeaders);
  const [oauthManualTokenUrl, setOauthManualTokenUrl] = useState(
    init.oauthManualTokenUrl
  );
  const [oauthManualClientId, setOauthManualClientId] = useState(
    init.oauthManualClientId
  );
  const [oauthManualSecret, setOauthManualSecret] = useState(init.oauthManualSecret);
  const [oauthManualScope, setOauthManualScope] = useState(init.oauthManualScope);
  const [oauthMcpClientId, setOauthMcpClientId] = useState(init.oauthMcpClientId);
  const [oauthMcpSecret, setOauthMcpSecret] = useState(init.oauthMcpSecret);
  const [oauthMcpScope, setOauthMcpScope] = useState(init.oauthMcpScope);

  const [traceSetup, setTraceSetup] = useState<TraceSetupPayload | null>(null);
  const [traceSetupErr, setTraceSetupErr] = useState<string | null>(null);
  const [tracePwd, setTracePwd] = useState<string | null>(null);
  const [traceRotate, setTraceRotate] = useState(false);
  const [traceRotateErr, setTraceRotateErr] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (mode !== "edit" || !initial?.id) return;
    let cancelled = false;
    setTraceSetup(null);
    setTraceSetupErr(null);
    setTracePwd(null);
    setTraceRotateErr(null);
    void api.getTraceSetup(initial.id).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setTraceSetupErr(res.error ?? "Could not check trace tool");
        return;
      }
      setTraceSetup(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [mode, initial?.id]);

  useEffect(() => {
    if (
      traceSetup &&
      traceSetup.advertised &&
      traceSetup.reachable &&
      !traceSetup.passwordError
    ) {
      setTracePwd(traceSetup.password);
    }
  }, [traceSetup]);

  async function rotateTracePassword() {
    if (!initial?.id) return;
    setTraceRotateErr(null);
    setTraceRotate(true);
    try {
      const res = await api.regenerateTraceSecret(initial.id);
      if (res.ok) setTracePwd(res.data.password);
      else setTraceRotateErr(res.error ?? "Could not generate password");
    } catch (e) {
      setTraceRotateErr(e instanceof Error ? e.message : String(e));
    } finally {
      setTraceRotate(false);
    }
  }

  function addBearerProfile() {
    setBearerProfiles((p) => [
      ...p,
      { label: `Token ${p.length + 1}`, token: "" },
    ]);
  }

  function removeBearerProfile(i: number) {
    setBearerProfiles((p) => {
      const next = p.filter((_, j) => j !== i);
      setActiveBearerProfileIndex((idx) => {
        if (next.length === 0) return 0;
        if (idx === i) return Math.min(i, next.length - 1);
        if (idx > i) return idx - 1;
        return idx;
      });
      return next.length ? next : [{ label: "Token A", token: "" }];
    });
  }

  function addAuthHeaderRow() {
    setAuthHeaders((h) => [...h, { name: "", value: "" }]);
  }

  function removeAuthHeaderRow(i: number) {
    setAuthHeaders((h) => h.filter((_, j) => j !== i));
  }

  async function handleSubmit() {
    const nameTrim = name.trim();
    let payload: Omit<McpConnectionConfig, "id">;

    if (transport === "stdio") {
      payload = {
        name: nameTrim,
        transport: "stdio",
        command,
        args: args ? args.split(/\s+/).filter(Boolean) : [],
      };
    } else {
      payload = {
        name: nameTrim,
        transport,
        url,
        authType,
      };

      const trimmedProfiles = bearerProfiles
        .map((p) => ({
          label: p.label?.trim() || undefined,
          token: p.token.trim(),
        }))
        .filter((p) => p.token);

      if (authType === "bearer") {
        if (trimmedProfiles.length > 0) {
          payload.bearerProfiles = trimmedProfiles;
          payload.activeBearerProfileIndex = Math.min(
            activeBearerProfileIndex,
            trimmedProfiles.length - 1
          );
          payload.bearerToken = trimmedProfiles[payload.activeBearerProfileIndex]?.token;
        }
      } else {
        payload.bearerProfiles = undefined;
        payload.activeBearerProfileIndex = undefined;
        payload.bearerToken = undefined;
      }

      const headerRows = authHeaders
        .map((h) => ({ name: h.name.trim(), value: h.value }))
        .filter((h) => h.name);
      if (headerRows.length > 0) payload.authHeaders = headerRows;
      else payload.authHeaders = undefined;

      if (authType === "oauth2_manual") {
        payload.oauth2Manual = {
          tokenUrl: oauthManualTokenUrl.trim(),
          clientId: oauthManualClientId.trim(),
          clientSecret: oauthManualSecret.trim(),
          scope: oauthManualScope.trim() || undefined,
        };
      } else payload.oauth2Manual = undefined;

      if (authType === "oauth2_mcp") {
        payload.oauth2Mcp = {
          clientId: oauthMcpClientId.trim(),
          clientSecret: oauthMcpSecret.trim(),
          scope: oauthMcpScope.trim() || undefined,
        };
      } else payload.oauth2Mcp = undefined;
    }

    if (mode === "add") {
      await onAdd(payload);
    } else if (initial) {
      await onUpdate(initial.id, payload);
    }
    onClose();
  }

  const modal = (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-panel modal-panel-lg modal-panel-auth"
        role="dialog"
        aria-modal="true"
        aria-labelledby="connection-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title" id="connection-modal-title">
            {mode === "add" ? "Add MCP Server" : "Edit MCP Server"}
          </h2>
          <button type="button" onClick={onClose} className="icon-btn">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body modal-body-stack">
          <div className="field">
            <label className="label">Display name (optional)</label>
            <input
              className="input"
              placeholder="Leave empty to use the server’s reported name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="label">Connection type</label>
            <div className="transport-tabs transport-tabs-wrap">
              <button
                type="button"
                className={`transport-tab ${transport === "stdio" ? "active" : ""}`}
                onClick={() => setTransport("stdio")}
              >
                <Terminal size={14} /> stdio
              </button>
              <button
                type="button"
                className={`transport-tab ${transport === "sse" ? "active" : ""}`}
                onClick={() => setTransport("sse")}
              >
                <Radio size={14} /> SSE
              </button>
              <button
                type="button"
                className={`transport-tab ${transport === "streamable-http" ? "active" : ""}`}
                onClick={() => setTransport("streamable-http")}
              >
                <Link2 size={14} /> Streamable HTTP
              </button>
            </div>
            <p className="field-hint">
              {transport === "stdio" && "Local process via standard input/output."}
              {transport === "sse" &&
                "Legacy MCP over SSE + POST. Use the server’s SSE URL (often ends with /sse)."}
              {transport === "streamable-http" &&
                "Modern MCP Streamable HTTP endpoint (often the server’s main HTTP MCP path)."}
            </p>
          </div>

          {mode === "edit" &&
            initial &&
            (traceSetupErr ? (
              <div className="field">
                <p className="field-hint trace-password-err">{traceSetupErr}</p>
              </div>
            ) : traceSetup && !traceSetup.advertised ? null : traceSetup &&
              !traceSetup.reachable ? (
              <div className="field">
                <label className="label">Debug trace</label>
                <p className="field-hint muted">{traceSetup.message}</p>
              </div>
            ) : traceSetup &&
              traceSetup.reachable &&
              traceSetup.passwordError ? (
              <div className="field">
                <label className="label">Debug trace password</label>
                <p className="field-hint trace-password-err">
                  {traceSetup.passwordError}
                </p>
              </div>
            ) : traceSetup && traceSetup.reachable ? (
              <div className="field">
                <label className="label">Debug trace password</label>
                <p className="field-hint">
                  Set the same value as{" "}
                  <code className="inline-code">MCP_DEBUG_PASSWORD</code> on your
                  MCP process. The <code className="inline-code">__debug_trace</code>{" "}
                  tool stays hidden in the API tree.
                </p>
                <div className="trace-password-row">
                  <span className="trace-password-prefix mono">
                    MCP_DEBUG_PASSWORD=
                  </span>
                  <input
                    className="input input-mono trace-password-value"
                    readOnly
                    value={tracePwd ?? ""}
                    placeholder="Click refresh to generate"
                    aria-label="Trace password value"
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    title="Generate new random password"
                    onClick={() => void rotateTracePassword()}
                    disabled={traceRotate}
                  >
                    <RefreshCw size={16} className={traceRotate ? "spin" : ""} />
                  </button>
                </div>
                {traceRotateErr && (
                  <p className="field-hint trace-password-err">{traceRotateErr}</p>
                )}
              </div>
            ) : null)}

          {transport === "stdio" ? (
            <>
              <div className="field">
                <label className="label">Command</label>
                <input
                  className="input input-mono"
                  placeholder="npx -y @modelcontextprotocol/server-filesystem"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="label">Args (space-separated)</label>
                <input
                  className="input input-mono"
                  placeholder="/path/to/dir"
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                />
              </div>
            </>
          ) : (
            <>
              <div className="field">
                <label className="label">URL</label>
                <input
                  className="input input-mono"
                  placeholder={
                    transport === "sse"
                      ? "http://localhost:8765/sse"
                      : "http://127.0.0.1:8765/mcp"
                  }
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>

              <div className="field">
                <label className="label">Primary authentication</label>
                <select
                  className="input"
                  value={authType}
                  onChange={(e) =>
                    setAuthType(e.target.value as McpAuthType)
                  }
                >
                  <option value="none">None</option>
                  <option value="bearer">Bearer tokens (one active)</option>
                  <option value="custom_headers">Custom headers only</option>
                  <option value="oauth2_manual">
                    OAuth 2 client credentials (token URL)
                  </option>
                  <option value="oauth2_mcp">
                    OAuth 2 MCP (metadata + client credentials)
                  </option>
                </select>
                <p className="field-hint">
                  {authType === "oauth2_mcp" &&
                    "Server must advertise OAuth protected-resource metadata (401 + WWW-Authenticate). Use OAuth 2 manual for simple token endpoints."}
                  {authType === "custom_headers" &&
                    "Set Authorization, X-API-Key, or any headers below. No automatic Bearer from profiles."}
                </p>
              </div>

              {authType === "bearer" && (
                <div className="field field-tight">
                  <div className="label-row">
                    <label className="label">Bearer profiles</label>
                    <button
                      type="button"
                      className="btn-ghost btn-ghost-sm"
                      onClick={addBearerProfile}
                    >
                      <Plus size={12} /> Add token
                    </button>
                  </div>
                  <p className="field-hint">
                    Save several keys and choose which is sent on connect. Example demo tokens:
                    demo-admin, demo-readonly (see scripts/fastmcp-example).
                  </p>
                  <div className="bearer-profile-list">
                    {bearerProfiles.map((p, i) => (
                      <div key={i} className="bearer-profile-row">
                        <label className="bearer-profile-radio">
                          <input
                            type="radio"
                            name="active-bearer"
                            checked={activeBearerProfileIndex === i}
                            onChange={() => setActiveBearerProfileIndex(i)}
                          />
                          <span className="sr-only">Use token {i + 1}</span>
                        </label>
                        <input
                          className="input input-mono input-compact"
                          placeholder="Label"
                          value={p.label ?? ""}
                          onChange={(e) =>
                            setBearerProfiles((rows) =>
                              rows.map((r, j) =>
                                j === i ? { ...r, label: e.target.value } : r
                              )
                            )
                          }
                        />
                        <input
                          className="input input-mono bearer-token-input"
                          type="password"
                          autoComplete="off"
                          placeholder="Token value"
                          value={p.token}
                          onChange={(e) =>
                            setBearerProfiles((rows) =>
                              rows.map((r, j) =>
                                j === i ? { ...r, token: e.target.value } : r
                              )
                            )
                          }
                        />
                        {bearerProfiles.length > 1 && (
                          <button
                            type="button"
                            className="icon-btn"
                            title="Remove token"
                            onClick={() => removeBearerProfile(i)}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {authType === "oauth2_manual" && (
                <>
                  <div className="field">
                    <label className="label">Token URL</label>
                    <input
                      className="input input-mono"
                      placeholder="http://127.0.0.1:8765/oauth/token"
                      value={oauthManualTokenUrl}
                      onChange={(e) => setOauthManualTokenUrl(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label className="label">Client ID</label>
                    <input
                      className="input input-mono"
                      placeholder="mcp-demo-client"
                      value={oauthManualClientId}
                      onChange={(e) => setOauthManualClientId(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label className="label">Client secret</label>
                    <input
                      className="input input-mono"
                      type="password"
                      autoComplete="off"
                      placeholder="mcp-demo-secret"
                      value={oauthManualSecret}
                      onChange={(e) => setOauthManualSecret(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label className="label">Scope (optional)</label>
                    <input
                      className="input input-mono"
                      placeholder="mcp.read"
                      value={oauthManualScope}
                      onChange={(e) => setOauthManualScope(e.target.value)}
                    />
                  </div>
                </>
              )}

              {authType === "oauth2_mcp" && (
                <>
                  <div className="field">
                    <label className="label">Client ID</label>
                    <input
                      className="input input-mono"
                      value={oauthMcpClientId}
                      onChange={(e) => setOauthMcpClientId(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label className="label">Client secret</label>
                    <input
                      className="input input-mono"
                      type="password"
                      autoComplete="off"
                      value={oauthMcpSecret}
                      onChange={(e) => setOauthMcpSecret(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label className="label">Scope (optional)</label>
                    <input
                      className="input input-mono"
                      value={oauthMcpScope}
                      onChange={(e) => setOauthMcpScope(e.target.value)}
                    />
                  </div>
                </>
              )}

              <div className="field field-tight">
                <div className="label-row">
                  <label className="label">Additional HTTP headers</label>
                  <button
                    type="button"
                    className="btn-ghost btn-ghost-sm"
                    onClick={addAuthHeaderRow}
                  >
                    <Plus size={12} /> Add header
                  </button>
                </div>
                <p className="field-hint">
                  Merged on every request with primary auth (e.g. X-Request-Id plus Bearer).
                </p>
                {authHeaders.length === 0 ? (
                  <p className="field-hint muted">No extra headers.</p>
                ) : (
                  <div className="auth-headers-list">
                    {authHeaders.map((h, i) => (
                      <div key={i} className="auth-header-row">
                        <input
                          className="input input-mono input-compact"
                          placeholder="Header-Name"
                          value={h.name}
                          onChange={(e) =>
                            setAuthHeaders((rows) =>
                              rows.map((r, j) =>
                                j === i ? { ...r, name: e.target.value } : r
                              )
                            )
                          }
                        />
                        <input
                          className="input input-mono flex-grow-header"
                          placeholder="Value"
                          value={h.value}
                          onChange={(e) =>
                            setAuthHeaders((rows) =>
                              rows.map((r, j) =>
                                j === i ? { ...r, value: e.target.value } : r
                              )
                            )
                          }
                        />
                        <button
                          type="button"
                          className="icon-btn"
                          title="Remove header"
                          onClick={() => removeAuthHeaderRow(i)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSubmit}
            disabled={loading}
          >
            {mode === "add" ? <Plus size={14} /> : <Save size={14} />}
            {loading
              ? mode === "add"
                ? "Connecting…"
                : "Saving…"
              : mode === "add"
                ? "Connect"
                : "Save & reconnect"}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}
