"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckinButton, Poster, cn } from "./ui";
import { CheckIcon } from "./icons";
import { toast } from "./toast";
import { formatDateIt, formatRuntime } from "@/lib/format";

export type MovieCardVM = {
  movieId: number;
  title: string;
  posterPath: string | null;
  runtime: number | null;
  year: string | null;
  watchedAt: string | null;
};

type Tab = "watchlist" | "watched";

function metaLine(m: MovieCardVM): string {
  return [m.year, formatRuntime(m.runtime)].filter(Boolean).join(" · ");
}

/* --------------------------- Watched movie card -------------------------- */

function WatchedCard({ movie }: { movie: MovieCardVM }) {
  return (
    <div className="group flex flex-col gap-2.5">
      <Link
        href={`/movie/${movie.movieId}`}
        className="relative block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        aria-label={movie.title}
      >
        <Poster path={movie.posterPath} alt={movie.title} size="w342" />
        <span
          className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-canvas/70 text-finished backdrop-blur-sm"
          title="Visto"
        >
          <CheckIcon className="h-4 w-4" strokeWidth={2.5} />
        </span>
      </Link>
      <div className="min-w-0">
        <Link
          href={`/movie/${movie.movieId}`}
          className="block truncate text-sm font-semibold text-ink transition-colors hover:text-accent"
        >
          {movie.title}
        </Link>
        <p className="mt-1 truncate text-xs text-faint">
          {movie.watchedAt ? `Visto ${formatDateIt(movie.watchedAt)}` : metaLine(movie)}
        </p>
      </div>
    </div>
  );
}

/* -------------------------- Watchlist movie card ------------------------- */

function WatchlistCard({
  movie,
  onWatched,
}: {
  movie: MovieCardVM;
  onWatched: (movie: MovieCardVM) => void;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [pending, setPending] = useState(false);

  async function checkIn() {
    if (pending) return;
    setPending(true);
    setChecked(true); // optimistic fill
    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movieId: movie.movieId }),
      });
      if (!res.ok) throw new Error(String(res.status));
      // Small beat so the check-pop reads before the card leaves the watchlist.
      setTimeout(() => onWatched(movie), 260);
      router.refresh();
    } catch {
      setChecked(false);
      setPending(false);
      toast("Check-in non riuscito. Riprova.");
    }
  }

  return (
    <div className="group flex flex-col gap-2.5">
      <div className="relative">
        <Link
          href={`/movie/${movie.movieId}`}
          className="relative block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          aria-label={movie.title}
        >
          <Poster path={movie.posterPath} alt={movie.title} size="w342" />
        </Link>
        <div className="absolute bottom-2 right-2">
          <CheckinButton
            checked={checked}
            disabled={pending}
            size={40}
            onCheckin={checkIn}
            label={`Segna ${movie.title} come visto`}
            className="shadow-pop"
          />
        </div>
      </div>
      <div className="min-w-0">
        <Link
          href={`/movie/${movie.movieId}`}
          className="block truncate text-sm font-semibold text-ink transition-colors hover:text-accent"
        >
          {movie.title}
        </Link>
        {metaLine(movie) && (
          <p className="mt-1 truncate text-xs text-faint">{metaLine(movie)}</p>
        )}
      </div>
    </div>
  );
}

/* -------------------------------- Library -------------------------------- */

const GRID = "grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5";

export function MoviesLibrary({
  watchlist: initialWatchlist,
  watched: initialWatched,
}: {
  watchlist: MovieCardVM[];
  watched: MovieCardVM[];
}) {
  const [tab, setTab] = useState<Tab>(
    initialWatchlist.length === 0 && initialWatched.length > 0 ? "watched" : "watchlist",
  );
  const [watchlist, setWatchlist] = useState(initialWatchlist);
  const [watched, setWatched] = useState(initialWatched);

  function markWatched(movie: MovieCardVM) {
    setWatchlist((cur) => cur.filter((m) => m.movieId !== movie.movieId));
    setWatched((cur) =>
      cur.some((m) => m.movieId === movie.movieId)
        ? cur
        : [{ ...movie, watchedAt: new Date().toISOString().slice(0, 10) }, ...cur],
    );
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "watchlist", label: "Da vedere", count: watchlist.length },
    { key: "watched", label: "Visti", count: watched.length },
  ];

  const items = tab === "watchlist" ? watchlist : watched;

  return (
    <div className="space-y-8">
      <div
        role="tablist"
        aria-label="Filtra i film"
        className="inline-flex gap-1 rounded-xl border border-line bg-surface p-1"
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors duration-150 ease-quint",
              tab === t.key
                ? "bg-surface-2 text-ink shadow-card"
                : "text-muted hover:text-ink",
            )}
          >
            {t.label}
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-xs tabular-nums",
                tab === t.key ? "bg-accent/15 text-accent" : "bg-surface-2 text-faint",
              )}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">
          {tab === "watchlist"
            ? "Nessun film in lista. Aggiungine uno da Esplora."
            : "Non hai ancora segnato film come visti."}
        </p>
      ) : (
        <div className={GRID}>
          {tab === "watchlist"
            ? watchlist.map((m) => (
                <WatchlistCard key={m.movieId} movie={m} onWatched={markWatched} />
              ))
            : watched.map((m) => <WatchedCard key={m.movieId} movie={m} />)}
        </div>
      )}
    </div>
  );
}
