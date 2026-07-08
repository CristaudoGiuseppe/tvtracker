"use client";

// Stored-status changer shared by Show detail + My Shows cards. Optimistic:
// the label swaps immediately, reverts + toasts on failure. The 4 STORED
// statuses (not the derived "In pari") with the brief's singular Italian labels.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "./ui";
import { ChevronDownIcon, CheckIcon } from "./icons";
import { toast } from "./toast";

export type StoredStatus = "watching" | "for_later" | "finished" | "stopped";

const OPTIONS: { value: StoredStatus; label: string; color: string }[] = [
  { value: "watching", label: "In visione", color: "var(--color-watching)" },
  { value: "for_later", label: "Da vedere più tardi", color: "var(--color-towatch)" },
  { value: "finished", label: "Finita", color: "var(--color-finished)" },
  { value: "stopped", label: "Abbandonata", color: "var(--color-dropped)" },
];

function labelOf(status: StoredStatus) {
  return OPTIONS.find((o) => o.value === status)!;
}

export function StatusMenu({
  showId,
  current,
  size = "md",
  className,
}: {
  showId: number;
  current: StoredStatus;
  size?: "sm" | "md";
  className?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<StoredStatus>(current);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setStatus(current), [current]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function choose(value: StoredStatus) {
    setOpen(false);
    if (value === status) return;
    const previous = status;
    setStatus(value); // optimistic
    try {
      const res = await fetch(`/api/library/shows/${showId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: value }),
      });
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
    } catch {
      setStatus(previous);
      toast("Impossibile aggiornare lo stato.");
    }
  }

  const active = labelOf(status);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg border border-line bg-surface-2 font-medium text-ink",
          "transition-colors duration-150 ease-quint hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
          size === "sm" ? "h-8 px-2.5 text-xs" : "h-10 px-3.5 text-sm",
        )}
      >
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: active.color }}
        />
        <span className="truncate">{active.label}</span>
        <ChevronDownIcon
          className={cn(
            "h-4 w-4 shrink-0 text-faint transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-56 origin-top-right animate-fade-up overflow-hidden rounded-xl border border-line bg-surface-2 p-1 shadow-pop"
        >
          {OPTIONS.map((o) => {
            const isActive = o.value === status;
            return (
              <button
                key={o.value}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  choose(o.value);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-150",
                  isActive ? "text-ink" : "text-muted hover:bg-surface hover:text-ink",
                )}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: o.color }}
                />
                <span className="flex-1">{o.label}</span>
                {isActive && <CheckIcon className="h-4 w-4 text-accent" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
