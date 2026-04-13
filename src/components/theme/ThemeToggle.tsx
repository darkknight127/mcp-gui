"use client";

import { useCallback, useLayoutEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "mcp-gui-theme";

function persistAndApply(mode: "light" | "dark") {
  localStorage.setItem(STORAGE_KEY, mode);
  document.documentElement.classList.toggle("dark", mode === "dark");
}

export function ThemeToggle() {
  const [mode, setMode] = useState<"light" | "dark">("light");

  useLayoutEffect(() => {
    const fromDom = document.documentElement.classList.contains("dark");
    setMode(fromDom ? "dark" : "light");
  }, []);

  const toggle = useCallback(() => {
    setMode((m) => {
      const next = m === "dark" ? "light" : "dark";
      persistAndApply(next);
      return next;
    });
  }, []);

  const isDark = mode === "dark";

  return (
    <button
      type="button"
      className="theme-toggle"
      data-mode={isDark ? "dark" : "light"}
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggle}
    >
      <span className="theme-toggle-track" aria-hidden>
        <span className="theme-toggle-thumb" aria-hidden>
          {isDark ? (
            <Moon size={11} strokeWidth={2.25} />
          ) : (
            <Sun size={11} strokeWidth={2.25} />
          )}
        </span>
      </span>
      <span className="theme-toggle-label">{isDark ? "Dark" : "Light"}</span>
    </button>
  );
}
