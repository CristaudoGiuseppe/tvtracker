"use client";

// Minimal event-driven toaster. `toast(message)` dispatches a window event;
// a single <Toaster/> mounted in the layout renders the stack. No context
// threading — mutation components just call toast() on failure.
import { useEffect, useState } from "react";
import { cn } from "./ui";

type Variant = "error" | "success";
type ToastItem = { id: number; message: string; variant: Variant };

const EVENT = "tvt-toast";

export function toast(message: string, variant: Variant = "error") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { message, variant } }));
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    let seq = 0;
    function onToast(e: Event) {
      const { message, variant } = (e as CustomEvent).detail as {
        message: string;
        variant: Variant;
      };
      const id = ++seq;
      setItems((cur) => [...cur, { id, message, variant }]);
      window.setTimeout(() => {
        setItems((cur) => cur.filter((t) => t.id !== id));
      }, 4000);
    }
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 md:inset-x-auto md:bottom-6 md:right-6 md:items-end"
      role="status"
      aria-live="polite"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto flex max-w-sm animate-fade-up items-center gap-2.5 rounded-xl border bg-surface-2 px-4 py-3 text-sm font-medium text-ink shadow-pop",
            t.variant === "error"
              ? "border-[color-mix(in_oklab,var(--color-dropped)_55%,var(--color-line))]"
              : "border-[color-mix(in_oklab,var(--color-finished)_55%,var(--color-line))]",
          )}
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{
              backgroundColor:
                t.variant === "error"
                  ? "var(--color-dropped)"
                  : "var(--color-finished)",
            }}
          />
          {t.message}
        </div>
      ))}
    </div>
  );
}
