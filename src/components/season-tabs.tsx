"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, cn } from "./ui";
import { CheckIcon } from "./icons";
import { toast } from "./toast";
import { EpisodeRow, type EpisodeVM } from "./episode-row";

export type SeasonVM = {
  seasonNumber: number;
  name: string | null;
  episodes: EpisodeVM[];
};

function seasonLabel(s: SeasonVM): string {
  if (s.seasonNumber === 0) return "Speciali";
  return `Stagione ${s.seasonNumber}`;
}

function seasonProgress(s: SeasonVM): { watched: number; aired: number } {
  const today = new Date().toISOString().slice(0, 10);
  const aired = s.episodes.filter((e) => e.airDate !== null && e.airDate <= today);
  const watched = aired.filter((e) => e.watched);
  return { watched: watched.length, aired: aired.length };
}

export function SeasonTabs({
  showId,
  seasons,
  inLibrary,
}: {
  showId: number;
  seasons: SeasonVM[];
  inLibrary: boolean;
}) {
  const router = useRouter();
  const firstUnfinished = seasons.findIndex((s) => {
    const p = seasonProgress(s);
    return p.aired > 0 && p.watched < p.aired;
  });
  const [active, setActive] = useState(
    firstUnfinished >= 0 ? firstUnfinished : Math.max(0, seasons.length - 1),
  );
  const [busy, setBusy] = useState<null | "season" | "all">(null);

  if (seasons.length === 0) return null;
  const current = seasons[active] ?? seasons[0];

  async function markWatched(body: object, which: "season" | "all") {
    if (busy) return;
    setBusy(which);
    try {
      const res = await fetch("/api/season-watched", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
    } catch {
      toast("Impossibile segnare gli episodi.");
    } finally {
      setBusy(null);
    }
  }

  const cp = seasonProgress(current);
  const seasonComplete = cp.aired > 0 && cp.watched >= cp.aired;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Season tab strip */}
        <div
          role="tablist"
          aria-label="Stagioni"
          className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
        >
          {seasons.map((s, i) => {
            const isActive = i === active;
            const p = seasonProgress(s);
            const complete = p.aired > 0 && p.watched >= p.aired;
            return (
              <button
                key={s.seasonNumber}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(i)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors duration-150 ease-quint",
                  isActive
                    ? "bg-surface-2 text-ink ring-1 ring-line-strong"
                    : "text-muted hover:bg-surface hover:text-ink",
                )}
              >
                {seasonLabel(s)}
                {complete && inLibrary && (
                  <CheckIcon className="h-3.5 w-3.5 text-accent" strokeWidth={3} />
                )}
              </button>
            );
          })}
        </div>

        {inLibrary && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy !== null}
            onClick={() => markWatched({ showId }, "all")}
          >
            {busy === "all" ? "Aggiorno…" : "Segna tutte come viste"}
          </Button>
        )}
      </div>

      {inLibrary && current.episodes.some((e) => e.airDate !== null) && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5">
          <span className="text-xs text-muted tabular-nums">
            {cp.watched}/{cp.aired} episodi visti in questa stagione
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy !== null || seasonComplete}
            onClick={() =>
              markWatched({ showId, seasonNumber: current.seasonNumber }, "season")
            }
          >
            {busy === "season"
              ? "Aggiorno…"
              : seasonComplete
                ? "Stagione completata"
                : "Segna stagione come vista"}
          </Button>
        </div>
      )}

      <div className="divide-y divide-line/60">
        {current.episodes.map((ep) => (
          <EpisodeRow
            key={`${ep.tmdbId}-${ep.watchCount}`}
            episode={ep}
            inLibrary={inLibrary}
          />
        ))}
      </div>
    </section>
  );
}
