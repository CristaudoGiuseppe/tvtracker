"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckinButton, ProgressBar, cn } from "./ui";
import { toast } from "./toast";
import { relativeTimeIt } from "@/lib/format";

const TMDB_IMG = "https://image.tmdb.org/t/p";

export type WatchNextEpisode = {
  tmdbId: number;
  seasonNumber: number;
  episodeNumber: number;
  name: string | null;
};

export type WatchNextProgress = { airedCount: number; watchedCount: number };

export type WatchNextItem = {
  showId: number;
  showName: string;
  backdropPath: string | null;
  posterPath: string | null;
  next: WatchNextEpisode;
  lastWatchedAt: string | null;
  progress: WatchNextProgress;
};

function episodeLabel(ep: WatchNextEpisode): string {
  const code = `S${ep.seasonNumber} · E${ep.episodeNumber}`;
  return ep.name ? `${code} — ${ep.name}` : code;
}

function remainingLabel(p: WatchNextProgress): string {
  const remaining = Math.max(0, p.airedCount - p.watchedCount);
  return remaining === 1 ? "Ti manca 1 episodio" : `Ti mancano ${remaining} episodi`;
}

/** Fires the self-throttled sync once when the Watch Next screen mounts. */
export function SyncOnMount() {
  useEffect(() => {
    fetch("/api/sync", { method: "POST" }).catch(() => {});
  }, []);
  return null;
}

export function WatchNextCard({ item }: { item: WatchNextItem }) {
  const router = useRouter();
  const [next, setNext] = useState<WatchNextEpisode>(item.next);
  const [progress, setProgress] = useState<WatchNextProgress>(item.progress);
  const [checked, setChecked] = useState(false);
  const [pending, setPending] = useState(false);
  const [justWatched, setJustWatched] = useState(false);
  const [done, setDone] = useState(false);

  const backdrop = item.backdropPath
    ? `${TMDB_IMG}/w780${item.backdropPath}`
    : item.posterPath
      ? `${TMDB_IMG}/w780${item.posterPath}`
      : null;

  async function handleCheckin() {
    if (pending) return;
    const episodeId = next.tmdbId;
    const prevProgress = progress;
    setPending(true);
    setChecked(true);
    // Optimistic: advance the bar immediately; reconcile with the server below.
    setProgress((p) => ({
      ...p,
      watchedCount: Math.min(p.watchedCount + 1, p.airedCount),
    }));
    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as {
        next: WatchNextEpisode | null;
        progress: WatchNextProgress | null;
      };
      if (data.progress) setProgress(data.progress);
      if (data.next) {
        // Advance in place: swap the episode line, reset the button.
        setNext(data.next);
        setChecked(false);
        setJustWatched(true);
      } else {
        // No more aired episodes — the show is up to date; retire the card.
        setDone(true);
      }
      router.refresh();
    } catch {
      setChecked(false);
      setProgress(prevProgress);
      toast("Check-in non riuscito. Riprova.");
    } finally {
      setPending(false);
    }
  }

  if (done) return null;

  const lastLabel = justWatched
    ? "Segnato ora"
    : item.lastWatchedAt
      ? `Visto ${relativeTimeIt(item.lastWatchedAt)}`
      : "Mai iniziata";

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <Link
        href={`/show/${item.showId}`}
        className="block focus-visible:outline-none"
        aria-label={item.showName}
      >
        <div className="relative aspect-[16/10] overflow-hidden">
          {backdrop ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={backdrop}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-700 ease-quint group-hover:scale-[1.04]"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-surface-2 to-surface" />
          )}
          {/* Scrim: darken toward the card body so the episode line stays legible */}
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/55 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4 pr-20 sm:p-5 sm:pr-24">
            <h3 className="truncate text-base font-extrabold tracking-tight text-ink sm:text-lg">
              {item.showName}
            </h3>
            <p
              key={next.tmdbId}
              className="mt-1 animate-fade-up truncate text-sm text-muted"
            >
              {episodeLabel(next)}
            </p>
            {progress.airedCount > 0 && (
              <div className="mt-3">
                <ProgressBar
                  value={progress.watchedCount}
                  max={progress.airedCount}
                  label={remainingLabel(progress)}
                />
              </div>
            )}
          </div>
        </div>
      </Link>

      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <span
          className={cn(
            "text-xs font-medium tabular-nums",
            justWatched ? "text-accent" : "text-faint",
          )}
        >
          {lastLabel}
        </span>
      </div>

      {/* Check-in floats over the backdrop's bottom-right corner. */}
      <div className="absolute bottom-14 right-4 sm:right-5">
        <CheckinButton
          checked={checked}
          disabled={pending}
          size={52}
          onCheckin={handleCheckin}
          label={`Segna ${episodeLabel(next)} come visto`}
          className="shadow-pop"
        />
      </div>
    </article>
  );
}
