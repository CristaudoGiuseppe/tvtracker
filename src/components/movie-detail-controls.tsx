"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, cn } from "./ui";
import { StarIcon, PlusIcon, CheckIcon } from "./icons";
import { toast } from "./toast";
import { formatDateIt } from "@/lib/format";

type MovieState = "watchlist" | "watched";

/* ------------------------- 1–10 star rating (movie) --------------------- */

function StarRating({ movieId, initial }: { movieId: number; initial: number | null }) {
  const router = useRouter();
  const [rating, setRating] = useState(initial ?? 0);
  const [hover, setHover] = useState(0);
  const shown = hover || rating;

  async function choose(value: number) {
    const previous = rating;
    setRating(value);
    try {
      const res = await fetch("/api/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "movie", targetId: movieId, rating: value }),
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
            className="rounded p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
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

/* -------------------------------- Controls ------------------------------- */

export function MovieDetailControls({
  movieId,
  inLibrary,
  state,
  rating,
  watchedAt,
  watchCount,
}: {
  movieId: number;
  inLibrary: boolean;
  state: MovieState | null;
  rating: number | null;
  watchedAt: string | null;
  watchCount: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  async function post(url: string, body: unknown, key: string, failMsg: string) {
    if (pending) return false;
    setPending(key);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
      return true;
    } catch {
      toast(failMsg);
      return false;
    } finally {
      setPending(null);
    }
  }

  async function remove() {
    if (pending) return;
    setPending("remove");
    try {
      const res = await fetch(`/api/library/movies/${movieId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
      router.push("/movies");
      router.refresh();
    } catch {
      toast("Impossibile rimuovere il film.");
      setPending(null);
    }
  }

  // Not in library -----------------------------------------------------------
  if (!inLibrary) {
    return (
      <div className="flex flex-wrap items-center gap-2.5">
        <Button
          onClick={() =>
            post("/api/library/movies", { tmdbId: movieId, state: "watched" }, "watched", "Impossibile aggiornare il film.")
          }
          disabled={pending !== null}
          className="gap-1.5"
        >
          <CheckIcon className="h-4 w-4" strokeWidth={2.5} />
          Segna come visto
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            post("/api/library/movies", { tmdbId: movieId, state: "watchlist" }, "watchlist", "Impossibile aggiungere il film.")
          }
          disabled={pending !== null}
          className="gap-1.5"
        >
          <PlusIcon className="h-4 w-4" />
          Aggiungi alla lista
        </Button>
      </div>
    );
  }

  // In library ---------------------------------------------------------------
  const seen = state === "watched";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2.5">
        {seen ? (
          <Button
            variant="secondary"
            onClick={() =>
              post("/api/checkin", { movieId }, "rewatch", "Check-in non riuscito.")
            }
            disabled={pending !== null}
            className="gap-1.5"
          >
            <CheckIcon className="h-4 w-4" strokeWidth={2.5} />
            Guarda di nuovo
          </Button>
        ) : (
          <Button
            onClick={() => post("/api/checkin", { movieId }, "watch", "Check-in non riuscito.")}
            disabled={pending !== null}
            className="gap-1.5"
          >
            <CheckIcon className="h-4 w-4" strokeWidth={2.5} />
            Segna come visto
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={remove}
          disabled={pending !== null}
          className="text-faint hover:text-dropped"
        >
          Rimuovi
        </Button>
      </div>

      {seen && (
        <p className="text-xs text-faint">
          {watchedAt ? `Visto ${formatDateIt(watchedAt)}` : "Segnato come visto"}
          {watchCount > 1 && ` · ${watchCount} visioni`}
        </p>
      )}

      {seen && <StarRating movieId={movieId} initial={rating} />}
    </div>
  );
}
