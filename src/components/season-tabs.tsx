"use client";

import { useRef, useState } from "react";
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

// What the picker actually renders: a season plus its server-derived counts.
export type SeasonChipVM = SeasonVM & {
  airedCount: number;
  watchedCount: number;
};

function seasonLabel(s: SeasonChipVM): string {
  if (s.seasonNumber === 0) return "Speciali";
  return `Stagione ${s.seasonNumber}`;
}

// Short glyph shown inside the compact chip; full label lives in aria-label.
function chipGlyph(s: SeasonChipVM): string {
  return s.seasonNumber === 0 ? "Sp" : String(s.seasonNumber);
}

type ChipState = "unwatched" | "partial" | "complete";

function chipState(s: SeasonChipVM): ChipState {
  if (s.airedCount === 0) return "unwatched";
  if (s.watchedCount >= s.airedCount) return "complete";
  if (s.watchedCount > 0) return "partial";
  return "unwatched";
}

export function SeasonTabs({
  showId,
  seasons,
  inLibrary,
}: {
  showId: number;
  seasons: SeasonChipVM[];
  inLibrary: boolean;
}) {
  const router = useRouter();
  const firstUnfinished = seasons.findIndex(
    (s) => s.airedCount > 0 && s.watchedCount < s.airedCount,
  );
  const [active, setActive] = useState(
    firstUnfinished >= 0 ? firstUnfinished : Math.max(0, seasons.length - 1),
  );
  const [busy, setBusy] = useState<null | "season" | "all">(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

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

  // Roving-tabindex keyboard nav across the wrapped grid (APG tablist pattern).
  function onKeyDown(e: React.KeyboardEvent, i: number) {
    let next = i;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % seasons.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = (i - 1 + seasons.length) % seasons.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = seasons.length - 1;
    else return;
    e.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  }

  const seasonComplete = current.airedCount > 0 && current.watchedCount >= current.airedCount;
  const currentHasAired = current.airedCount > 0;
  const panelId = `season-panel-${showId}`;

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4">
        {/* Wrapping season chip grid — every season visible, no horizontal scroll. */}
        <div
          role="tablist"
          aria-label="Stagioni"
          className="flex flex-wrap gap-2"
        >
          {seasons.map((s, i) => {
            const isActive = i === active;
            const isSpecials = s.seasonNumber === 0;
            const state = inLibrary ? chipState(s) : "unwatched";
            const pct =
              s.airedCount > 0 ? Math.min(1, s.watchedCount / s.airedCount) : 0;
            return (
              <button
                key={s.seasonNumber}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                role="tab"
                type="button"
                aria-selected={isActive}
                aria-controls={panelId}
                aria-label={seasonLabel(s)}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActive(i)}
                onKeyDown={(e) => onKeyDown(e, i)}
                className={cn(
                  "group relative grid h-11 min-w-[2.75rem] place-items-center overflow-hidden rounded-xl px-2.5",
                  "text-sm font-bold tabular-nums",
                  "transition-[transform,background-color,color,box-shadow] duration-200 ease-quint",
                  // House focus pattern. While focused, the focus-visible ring
                  // replaces the watch-state ring deterministically: the variant
                  // selector's specificity (0,2,0) beats the base ring's (0,1,0)
                  // regardless of stylesheet order.
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                  "active:scale-[0.94]",
                  // Watch-state skin — SOLE owner of bg/text/ring on the button.
                  // Branches are mutually exclusive, so no two utilities compete
                  // for the same property here.
                  state === "complete" &&
                    "bg-[color-mix(in_oklab,var(--color-accent)_16%,var(--color-surface))] text-accent-hi ring-1 ring-inset ring-accent/35",
                  state === "partial" &&
                    "bg-surface-2 text-ink ring-1 ring-inset ring-line",
                  state === "unwatched" &&
                    cn(
                      "bg-surface ring-1 ring-inset ring-line",
                      isActive
                        ? "text-ink"
                        : "text-muted hover:text-ink hover:ring-line-strong",
                    ),
                  // Specials: de-emphasized.
                  isSpecials && !isActive && "opacity-60",
                  // Selection lift only — the visible frame is the border span
                  // below (border property on a child element: structurally
                  // unable to collide with the button's ring utilities).
                  isActive && "shadow-pop",
                )}
              >
                {/* Selection frame: dedicated element + border property, fully
                    independent of the watch-state ring styling. */}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-[inherit] border-2 border-ink/85"
                  />
                )}
                <span className="relative z-10 flex items-center gap-1">
                  {chipGlyph(s)}
                  {state === "complete" && (
                    <CheckIcon
                      className="h-3.5 w-3.5"
                      strokeWidth={3}
                      aria-hidden="true"
                    />
                  )}
                </span>
                {/* Partial progress: a thin fill pinned to the chip's bottom edge. */}
                {state === "partial" && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-1 bottom-1 h-[3px] origin-left rounded-full bg-accent/80 transition-transform duration-500 ease-quint"
                    style={{ transform: `scaleX(${pct})` }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {inLibrary && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {currentHasAired && (
              <span className="text-xs text-muted tabular-nums">
                {current.watchedCount}/{current.airedCount} episodi visti in{" "}
                {seasonLabel(current).toLowerCase()}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {currentHasAired && (
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
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={busy !== null}
                onClick={() => markWatched({ showId }, "all")}
              >
                {busy === "all" ? "Aggiorno…" : "Segna tutte come viste"}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div
        id={panelId}
        role="tabpanel"
        aria-label={seasonLabel(current)}
        className="divide-y divide-line/60"
      >
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
