"use client";

import { Server } from "lucide-react";
import { ServerCard } from "./ServerCard";
import type { McpConnection } from "@/types/mcp";

interface Props {
  connections: McpConnection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onReconnect: (id: string) => void;
  reconnectBusy?: boolean;
  onRemove: (id: string) => void;
  onRefresh: (id: string) => void;
  onEdit: (id: string) => void;
}

export function ConnectionList({
  connections,
  selectedId,
  onSelect,
  onDisconnect,
  onReconnect,
  reconnectBusy = false,
  onRemove,
  onRefresh,
  onEdit,
}: Props) {
  if (connections.length === 0) {
    return (
      <div className="empty-servers">
        <Server size={28} className="empty-icon" />
        <p>No servers yet</p>
        <p className="empty-sub">Add an MCP server to get started</p>
      </div>
    );
  }

  return (
    <>
      {connections.map((conn) => (
        <ServerCard
          key={conn.config.id}
          connection={conn}
          isActive={selectedId === conn.config.id}
          onClick={() => onSelect(conn.config.id)}
          onDisconnect={() => onDisconnect(conn.config.id)}
          onReconnect={() => onReconnect(conn.config.id)}
          reconnectBusy={reconnectBusy}
          onRemove={() => onRemove(conn.config.id)}
          onRefresh={() => onRefresh(conn.config.id)}
          onEdit={() => onEdit(conn.config.id)}
        />
      ))}
    </>
  );
}
