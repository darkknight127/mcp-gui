"use client";

import type { MainWorkspaceTab } from "./main-workspace-types";

export type { MainWorkspaceTab } from "./main-workspace-types";

interface Props {
  active: MainWorkspaceTab;
  onChange: (tab: MainWorkspaceTab) => void;
}

const TABS: { id: MainWorkspaceTab; label: string }[] = [
  { id: "detail", label: "Detail" },
  { id: "testing", label: "Testing" },
];

export function MainWorkspaceTabs({ active, onChange }: Props) {
  return (
    <div className="main-workspace-tabs" role="tablist">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          className={`workspace-tab ${active === t.id ? "active" : ""}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
