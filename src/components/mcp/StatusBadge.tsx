"use client";

import { Loader2, Wifi, WifiOff, AlertTriangle } from "lucide-react";
import type { McpConnectionStatus } from "@/types/mcp";

interface Props {
  status: McpConnectionStatus;
}

const STATUS_CONFIG: Record<
  McpConnectionStatus,
  { label: string; icon: React.ReactNode; cls: string }
> = {
  connected: {
    label: "Connected",
    icon: <Wifi size={11} />,
    cls: "status-connected",
  },
  connecting: {
    label: "Connecting",
    icon: <Loader2 size={11} className="spin" />,
    cls: "status-connecting",
  },
  disconnected: {
    label: "Disconnected",
    icon: <WifiOff size={11} />,
    cls: "status-disconnected",
  },
  error: {
    label: "Error",
    icon: <AlertTriangle size={11} />,
    cls: "status-error",
  },
};

export function StatusBadge({ status }: Props) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`status-badge ${cfg.cls}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}
