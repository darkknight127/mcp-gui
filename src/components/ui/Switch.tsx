"use client";

interface Props {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** When true, track uses a muted style (optional param not sent). */
  unset?: boolean;
}

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  id,
  className = "",
  unset = false,
}: Props) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      disabled={disabled}
      className={`ui-switch ${checked ? "ui-switch-on" : ""} ${unset ? "ui-switch-unset" : ""} ${className}`.trim()}
      onClick={() => !disabled && onCheckedChange(!checked)}
    >
      <span className="ui-switch-track" aria-hidden>
        <span className="ui-switch-thumb" />
      </span>
    </button>
  );
}
