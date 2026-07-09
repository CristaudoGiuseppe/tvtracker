"use client";

// Add-with-intent split control for SHOWS (spec §6): default tap starts watching,
// the caret opens a menu to add as "Da vedere più tardi" (for_later) instead.
// Shared by Esplora cards (variant "card") and the show-detail hero (variant "hero").
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "./ui";
import { PlusIcon, ChevronDownIcon, CheckIcon } from "./icons";
import { toast } from "./toast";

type Intent = "watching" | "for_later";

const INTENTS: { value: Intent; label: string }[] = [
  { value: "watching", label: "Inizio a guardarla" },
  { value: "for_later", label: "Da vedere più tardi" },
];

export function AddShowIntent({
  tmdbId,
  variant = "card",
  onAdded,
}: {
  tmdbId: number;
  variant?: "card" | "hero";
  onAdded?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [added, setAdded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  async function add(status: Intent) {
    setOpen(false);
    if (pending || added) return;
    setPending(true);
    try {
      const res = await fetch("/api/library/shows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId, status }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setAdded(true);
      onAdded?.();
      router.refresh();
    } catch {
      toast("Impossibile aggiungere la serie.");
    } finally {
      setPending(false);
    }
  }

  const isHero = variant === "hero";

  if (added && !isHero) {
    return (
      <span className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs font-medium text-finished">
        <CheckIcon className="h-3.5 w-3.5" strokeWidth={2.5} />
        In libreria
      </span>
    );
  }

  const primaryClasses = isHero
    ? "bg-accent text-accent-ink hover:bg-accent-hi"
    : "border border-line bg-surface-2 text-muted hover:border-accent hover:text-accent";
  const heightPad = isHero ? "h-10 px-4 text-sm" : "px-3 py-1.5 text-xs";

  return (
    <div ref={ref} className={cn("relative inline-flex", isHero ? "" : "w-full")}>
      <div className={cn("inline-flex w-full rounded-lg", isHero && "shadow-[0_6px_16px_-8px_color-mix(in_oklab,var(--color-accent)_70%,transparent)]")}>
        <button
          type="button"
          onClick={() => add("watching")}
          disabled={pending}
          className={cn(
            "inline-flex flex-1 items-center justify-center gap-1.5 rounded-l-lg font-medium",
            "transition-colors duration-150 ease-quint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
            "disabled:pointer-events-none disabled:opacity-50",
            primaryClasses,
            heightPad,
          )}
        >
          <PlusIcon className={isHero ? "h-4 w-4" : "h-3.5 w-3.5"} />
          {pending ? "Aggiungo…" : isHero ? "Aggiungi alla libreria" : "Aggiungi"}
        </button>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Altre opzioni di aggiunta"
          onClick={() => setOpen((v) => !v)}
          disabled={pending}
          className={cn(
            "inline-flex items-center justify-center rounded-r-lg border-l font-medium",
            "transition-colors duration-150 ease-quint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
            "disabled:pointer-events-none disabled:opacity-50",
            isHero
              ? "border-accent-ink/20 bg-accent text-accent-ink hover:bg-accent-hi px-2"
              : "border-line bg-surface-2 text-muted hover:text-accent px-2",
          )}
        >
          <ChevronDownIcon className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-180")} />
        </button>
      </div>

      {open && (
        <div
          role="menu"
          className={cn(
            "absolute z-40 mt-2 w-56 origin-top-right animate-fade-up overflow-hidden rounded-xl border border-line bg-surface-2 p-1 shadow-pop",
            isHero ? "left-0 top-full" : "right-0 top-full",
          )}
        >
          {INTENTS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="menuitem"
              onClick={() => add(o.value)}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-muted transition-colors duration-150 hover:bg-surface hover:text-ink"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{
                  backgroundColor:
                    o.value === "watching" ? "var(--color-watching)" : "var(--color-towatch)",
                }}
              />
              <span className="flex-1">{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
