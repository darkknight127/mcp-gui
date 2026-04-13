"use client";

import { RefreshCw, Trash2, Power, Pencil } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { connectionDisplayName } from "@/lib/mcp/connection-label";
import { transportChipLabel, transportTitle } from "@/lib/mcp/transport-label";
import type { McpConnection } from "@/types/mcp";

interface Props {
  connection: McpConnection;
  isActive: boolean;
  onClick: () => void;
  onDisconnect: () => void;
  onReconnect: () => void;
  reconnectBusy?: boolean;
  onRemove: () => void;
  onRefresh: () => void;
  onEdit: () => void;
}

export function ServerCard({
  connection,
  isActive,
  onClick,
  onDisconnect,
  onReconnect,
  reconnectBusy = false,
  onRemove,
  onRefresh,
  onEdit,
}: Props) {
  const { config, status, error } = connection;
  const connected = status === "connected";
  const target =
    config.transport === "stdio" ? config.command : config.url;

  return (
    <div
      className={`server-card ${isActive ? "active" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      title={
        isActive
          ? "Click again to refresh the API tree"
          : undefined
      }
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="server-card-top">
        <div className="server-card-info">
          <span className="server-name">{connectionDisplayName(config)}</span>
          <StatusBadge status={status} />
        </div>
        <div className="server-card-actions" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="icon-btn"
            title="Edit server"
            onClick={onEdit}
          >
            <Pencil size={12} />
          </button>
          {connected && (
            <button
              type="button"
              className="icon-btn"
              title="Refresh API tree — re-fetch tools, resources, and prompts over the current MCP session. Does not disconnect or restart the server process."
              onClick={onRefresh}
            >
              <RefreshCw size={12} />
            </button>
          )}
          <button
            type="button"
            className={`icon-btn icon-btn-reconnect ${connected ? "icon-btn-reconnect-on" : ""}`}
            title={connected ? "Disconnect" : "Connect"}
            aria-pressed={connected}
            disabled={reconnectBusy}
            onClick={() => (connected ? onDisconnect() : onReconnect())}
          >
            <Power size={12} />
          </button>
          {!connected && (
            <button
              type="button"
              className="icon-btn danger"
              title="Remove server"
              onClick={() => {
                const label = connectionDisplayName(config);
                if (
                  !globalThis.confirm(
                    `Remove “${label}” from MCP GUI?\n\nThis deletes the saved connection and its trace data in this app. It does not stop a remote server — disconnect first if you only want to close the session.`
                  )
                ) {
                  return;
                }
                onRemove();
              }}
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="server-transport">
        <span
          className="transport-chip"
          title={transportTitle(config.transport)}
        >
          {transportChipLabel(config.transport)}
        </span>
        <span className="transport-target" title={target ?? ""}>
          {target || "—"}
        </span>
      </div>

      {error && <p className="server-error">{error}</p>}
    </div>
  );
}
