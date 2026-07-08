"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckinButton, cn } from "./ui";
import { PlusIcon } from "./icons";
import { toast } from "./toast";
import { countdownIt, daysUntil, formatDateIt, formatRuntime } from "@/lib/format";

const TMDB_IMG = "https://image.tmdb.org/t/p";

export type EpisodeVM = {
  tmdbId: number;
  seasonNumber: number;
  episodeNumber: number;
  name: string | null;
  stillPath: string | null;
  airDate: string | null;
  runtime: number | null;
  watched: boolean;
  watchCount: number;
};

function isAired(airDate: string | null): boolean {
  return airDate !== null && daysUntil(airDate) <= 0;
}

export function EpisodeRow({
  episode,
  inLibrary,
}: {
  episode: EpisodeVM;
  inLibrary: boolean;
}) {
  const router = useRouter();
  const [count, setCount] = useState(episode.watchCount);
  const [pending, setPending] = useState(false);

  const watched = count > 0;
  const aired = isAired(episode.airDate);

  async function mutate(
    method: "POST" | "DELETE",
    optimistic: () => void,
    revert: () => void,
  ) {
    if (pending) return;
    setPending(true);
    optimistic();
    try {
      const res = await fetch("/api/checkin", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId: episode.tmdbId }),
      });
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
    } catch {
      revert();
      toast("Operazione non riuscita. Riprova.");
    } finally {
      setPending(false);
    }
  }

  function toggle() {
    if (watched) {
      mutate("DELETE", () => setCount((c) => c - 1), () => setCount((c) => c + 1));
    } else {
      mutate("POST", () => setCount(1), () => setCount(0));
    }
  }

  function rewatch() {
    mutate("POST", () => setCount((c) => c + 1), () => setCount((c) => c - 1));
  }

  const still = episode.stillPath ? `${TMDB_IMG}/w300${episode.stillPath}` : null;
  const meta = [formatDateIt(episode.airDate), formatRuntime(episode.runtime)]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl px-2 py-2 transition-colors duration-150 sm:gap-4 sm:px-3",
        watched ? "bg-[color-mix(in_oklab,var(--color-accent)_6%,transparent)]" : "hover:bg-surface-2/60",
        !aired && "opacity-55",
      )}
    >
      <div className="relative aspect-[16/9] w-24 shrink-0 overflow-hidden rounded-lg bg-surface-2 ring-1 ring-line/70 sm:w-28">
        {still ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={still}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-xs font-semibold text-faint">
            E{episode.episodeNumber}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="shrink-0 text-xs font-bold tabular-nums text-faint">
            E{episode.episodeNumber}
          </span>
          <h4 className="truncate text-sm font-semibold text-ink">
            {episode.name || `Episodio ${episode.episodeNumber}`}
          </h4>
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted">
          {aired ? (
            <span className="tabular-nums">{meta || "In onda"}</span>
          ) : (
            <span className="font-medium text-towatch">
              {episode.airDate ? countdownIt(episode.airDate) : "Data da definire"}
            </span>
          )}
          {count > 1 && (
            <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[0.6875rem] font-semibold tabular-nums text-accent">
              ×{count}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {watched && aired && inLibrary && (
          <button
            type="button"
            onClick={rewatch}
            disabled={pending}
            aria-label="Aggiungi un riguardo"
            title="Riguardato"
            className={cn(
              "grid h-8 w-8 place-items-center rounded-full border border-line text-muted",
              "transition-colors duration-150 hover:border-accent hover:text-accent",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-40",
            )}
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        )}
        <CheckinButton
          checked={watched}
          disabled={pending || !aired || !inLibrary}
          size={40}
          onCheckin={toggle}
          label={
            watched
              ? `Rimuovi il segno da E${episode.episodeNumber}`
              : `Segna E${episode.episodeNumber} come visto`
          }
        />
      </div>
    </div>
  );
}
