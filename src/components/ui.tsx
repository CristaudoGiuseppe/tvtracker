"use client";

// TVTracker UI primitives. Client module: some primitives (Poster blur-up,
// CheckinButton press) need state, and pure ones (Card, Button, EmptyState)
// render fine as client components inside server pages.
import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { CheckIcon } from "./icons";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* --------------------------------- Button -------------------------------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
};

const BUTTON_VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-accent text-accent-ink hover:bg-accent-hi shadow-[0_6px_16px_-8px_color-mix(in_oklab,var(--color-accent)_70%,transparent)]",
  secondary:
    "bg-surface-2 text-ink border border-line hover:border-line-strong",
  ghost: "text-muted hover:text-ink hover:bg-surface",
};

const BUTTON_SIZES: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-8 px-3 text-[0.8125rem]",
  md: "h-10 px-4 text-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 rounded-lg font-medium",
        "transition-[transform,background-color,border-color,color] duration-150 ease-quint",
        "active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
        "disabled:pointer-events-none disabled:opacity-45",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    />
  );
}

/* ---------------------------------- Card --------------------------------- */

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-surface shadow-card",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/* --------------------------------- Poster -------------------------------- */
// Contract (binding for later tasks):
//   <Poster path={poster_path|null} alt size='w342'|'w185' className? />
// Renders https://image.tmdb.org/t/p/{size}{path} with a w92 blur-up,
// locked 2:3, rounded-xl, hover ring; initials fallback when path is null.

const TMDB_IMG = "https://image.tmdb.org/t/p";

function posterInitials(alt: string) {
  return (
    alt
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?"
  );
}

type PosterProps = {
  path: string | null | undefined;
  alt: string;
  size?: "w342" | "w185";
  className?: string;
  priority?: boolean;
};

export function Poster({
  path,
  alt,
  size = "w342",
  className,
  priority = false,
}: PosterProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  const shell =
    "group relative aspect-[2/3] overflow-hidden rounded-xl bg-surface-2 ring-1 ring-line/70";

  if (!path || errored) {
    return (
      <div className={cn(shell, "grid place-items-center", className)}>
        <span className="select-none text-2xl font-semibold tracking-wide text-faint">
          {posterInitials(alt)}
        </span>
        <span className="sr-only">{alt}</span>
      </div>
    );
  }

  return (
    <div className={cn(shell, className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${TMDB_IMG}/w92${path}`}
        alt=""
        aria-hidden="true"
        className={cn(
          "absolute inset-0 h-full w-full scale-110 object-cover blur-xl transition-opacity duration-700 ease-quint",
          loaded && "opacity-0",
        )}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${TMDB_IMG}/${size}${path}`}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        className={cn(
          "relative h-full w-full object-cover transition-opacity duration-700 ease-quint",
          loaded ? "opacity-100" : "opacity-0",
        )}
      />
      <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-transparent transition duration-200 group-hover:ring-accent/50" />
    </div>
  );
}

/* ------------------------------- ProgressBar ----------------------------- */

type ProgressBarProps = {
  value: number;
  max?: number;
  label?: string;
  className?: string;
};

export function ProgressBar({
  value,
  max = 100,
  label,
  className,
}: ProgressBarProps) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted">{label}</span>
          <span className="tabular-nums text-faint">
            {Math.round(pct * 100)}%
          </span>
        </div>
      )}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full origin-left rounded-full bg-accent transition-transform duration-500 ease-quint"
          style={{ transform: `scaleX(${pct})` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------- StatusBadge ----------------------------- */

const STATUS = {
  watching: { label: "In visione", color: "var(--color-watching)" },
  to_start: { label: "Da iniziare", color: "var(--color-tostart)" },
  caught_up: { label: "In pari", color: "var(--color-caughtup)" },
  to_watch: { label: "Da vedere più tardi", color: "var(--color-towatch)" },
  finished: { label: "Finite", color: "var(--color-finished)" },
  dropped: { label: "Abbandonate", color: "var(--color-dropped)" },
} as const;

export type LibraryStatus = keyof typeof STATUS;

export function StatusBadge({
  status,
  className,
}: {
  status: LibraryStatus;
  className?: string;
}) {
  const s = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        className,
      )}
      style={{
        color: s.color,
        backgroundColor: `color-mix(in oklab, ${s.color} 15%, transparent)`,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: s.color }}
      />
      {s.label}
    </span>
  );
}

/* -------------------------------- EmptyState ----------------------------- */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-20 text-center md:py-28",
        className,
      )}
    >
      {icon && (
        <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-surface-2 text-accent ring-1 ring-line [&_svg]:h-6 [&_svg]:w-6">
          {icon}
        </div>
      )}
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {description && (
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/* --------------------------------- Skeleton ------------------------------ */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("relative overflow-hidden rounded-xl bg-surface-2", className)}
    >
      <div
        className="absolute inset-0 animate-shimmer"
        style={{
          backgroundImage:
            "linear-gradient(90deg, transparent, color-mix(in oklab, var(--color-ink) 7%, transparent), transparent)",
          backgroundSize: "200% 100%",
        }}
      />
    </div>
  );
}

/* ------------------------------ CheckinButton ---------------------------- */
// Circular check-in with a satisfying ~150ms press (scale) + fill transition.
// Optimistic UI is the caller's job; this only renders + animates state.

export function CheckinButton({
  checked = false,
  onCheckin,
  size = 44,
  disabled = false,
  label = "Segna come visto",
  className,
}: {
  checked?: boolean;
  onCheckin?: () => void;
  size?: number;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onCheckin}
      style={{ width: size, height: size }}
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full border",
        "transition-[transform,background-color,border-color,box-shadow,color] duration-150 ease-quint",
        "active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
        "disabled:pointer-events-none disabled:opacity-40",
        checked
          ? "border-accent bg-accent text-accent-ink shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-accent)_18%,transparent)]"
          : "border-line bg-surface-2 text-muted hover:border-accent hover:text-accent",
        className,
      )}
    >
      <CheckIcon
        strokeWidth={2.75}
        className={cn(
          "h-1/2 w-1/2 transition-transform",
          checked && "animate-check-pop",
        )}
      />
    </button>
  );
}

/* ------------------------------- PageHeader ------------------------------ */
// Shared page title block used by every screen for a consistent shell rhythm.

export function PageHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6",
        className,
      )}
    >
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink md:text-[1.75rem]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
        )}
      </div>
      {action}
    </header>
  );
}
