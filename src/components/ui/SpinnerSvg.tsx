"use client";

interface Props {
  size?: number;
  className?: string;
  label?: string;
}

/** Accessible animated SVG loader (replaces CSS-only spinner). */
export function SpinnerSvg({ size = 28, className = "", label }: Props) {
  return (
    <span
      className={`spinner-svg-wrap ${className}`.trim()}
      role={label ? "status" : undefined}
      aria-label={label}
    >
      <svg
        className="spinner-svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden={label ? undefined : true}
      >
        <circle
          className="spinner-svg-track"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="2"
          opacity="0.2"
        />
        <path
          className="spinner-svg-arc"
          d="M12 2 A10 10 0 0 1 22 12"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}
