"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, cn } from "./ui";
import { StarIcon, PlusIcon } from "./icons";
import { StatusMenu, type StoredStatus } from "./status-menu";
import { toast } from "./toast";

/* --------------------------- 1–10 star rating --------------------------- */

function StarRating({ showId, initial }: { showId: number; initial: number | null }) {
  const router = useRouter();
  const [rating, setRating] = useState(initial ?? 0);
  const [hover, setHover] = useState(0);
  const shown = hover || rating;

  async function choose(value: number) {
    const previous = rating;
    setRating(value); // optimistic
    try {
      const res = await fetch("/api/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "show", targetId: showId, rating: value }),
      });
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
    } catch {
      setRating(previous);
      toast("Impossibile salvare il voto.");
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-faint">
          Il tuo voto
        </span>
        {rating > 0 && (
          <span className="text-sm font-bold tabular-nums text-accent">
            {rating}
            <span className="text-faint">/10</span>
          </span>
        )}
      </div>
      <div
        className="flex items-center gap-0.5"
        onMouseLeave={() => setHover(0)}
        role="radiogroup"
        aria-label="Vota da 1 a 10"
      >
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} su 10`}
            onMouseEnter={() => setHover(n)}
            onClick={() => choose(n)}
            className="p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded"
          >
            <StarIcon
              className={cn(
                "h-5 w-5 transition-colors duration-100",
                n <= shown ? "text-accent" : "text-line-strong hover:text-muted",
              )}
              fill={n <= shown ? "currentColor" : "none"}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ Favorite star --------------------------- */

function FavoriteToggle({ showId, initial }: { showId: number; initial: boolean }) {
  const router = useRouter();
  const [fav, setFav] = useState(initial);
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (pending) return;
    setPending(true);
    setFav((v) => !v); // optimistic (server flips unconditionally on favorite:true)
    try {
      const res = await fetch(`/api/library/shows/${showId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite: true }),
      });
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
    } catch {
      setFav((v) => !v);
      toast("Impossibile aggiornare i preferiti.");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={fav}
      aria-label={fav ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}
      title={fav ? "Nei preferiti" : "Aggiungi ai preferiti"}
      className={cn(
        "grid h-10 w-10 shrink-0 place-items-center rounded-lg border transition-colors duration-150 ease-quint",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-50",
        fav
          ? "border-accent/40 bg-[color-mix(in_oklab,var(--color-accent)_14%,transparent)] text-accent"
          : "border-line bg-surface-2 text-muted hover:border-line-strong hover:text-ink",
      )}
    >
      <StarIcon className="h-5 w-5" fill={fav ? "currentColor" : "none"} />
    </button>
  );
}

/* --------------------------- Add to library ----------------------------- */

function AddToLibrary({ tmdbId }: { tmdbId: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function add() {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch("/api/library/shows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId }),
      });
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
    } catch {
      toast("Impossibile aggiungere la serie.");
      setPending(false);
    }
  }

  return (
    <Button onClick={add} disabled={pending} className="gap-1.5">
      <PlusIcon className="h-4 w-4" />
      {pending ? "Aggiungo…" : "Aggiungi alla libreria"}
    </Button>
  );
}

/* -------------------------------- Header -------------------------------- */

export function ShowDetailControls({
  showId,
  inLibrary,
  storedStatus,
  favorite,
  rating,
}: {
  showId: number;
  inLibrary: boolean;
  storedStatus: StoredStatus | null;
  favorite: boolean;
  rating: number | null;
}) {
  if (!inLibrary) {
    return <AddToLibrary tmdbId={showId} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusMenu showId={showId} current={storedStatus ?? "watching"} />
        <FavoriteToggle showId={showId} initial={favorite} />
      </div>
      <StarRating showId={showId} initial={rating} />
    </div>
  );
}
