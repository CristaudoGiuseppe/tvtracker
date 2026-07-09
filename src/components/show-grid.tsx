"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Poster, ProgressBar } from "./ui";
import { StarIcon, TvIcon } from "./icons";
import { StatusMenu, type StoredStatus } from "./status-menu";
import {
  LibraryToolbar,
  DEFAULT_VIEW,
  isDefaultView,
  type MyShowsView,
  type MyShowsSort,
  type PlatformOption,
  type StatusOption,
} from "./library-toolbar";

export type ShowCardVM = {
  showId: number;
  name: string;
  posterPath: string | null;
  storedStatus: StoredStatus;
  favorite: boolean;
  watchedCount: number;
  airedCount: number;
  genres: string[];
  providerIds: number[];
  lastWatchedAt: string | null;
};

export type LibrarySection = { key: string; label: string; items: ShowCardVM[] };

function ShowCard({ item }: { item: ShowCardVM }) {
  return (
    <div className="group flex flex-col gap-2.5">
      <Link
        href={`/show/${item.showId}`}
        className="relative block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        aria-label={item.name}
      >
        <Poster path={item.posterPath} alt={item.name} size="w342" />
        {item.favorite && (
          <span
            className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-canvas/70 text-accent backdrop-blur-sm"
            title="Preferita"
          >
            <StarIcon className="h-4 w-4" fill="currentColor" />
          </span>
        )}
      </Link>

      <div className="min-w-0">
        <Link
          href={`/show/${item.showId}`}
          className="block truncate text-sm font-semibold text-ink transition-colors hover:text-accent"
        >
          {item.name}
        </Link>
        {item.airedCount > 0 && (
          <div className="mt-2">
            <ProgressBar value={item.watchedCount} max={item.airedCount} />
          </div>
        )}
        <div className="mt-2.5">
          <StatusMenu
            showId={item.showId}
            current={item.storedStatus}
            size="sm"
            className="w-full [&>button]:w-full [&>button]:justify-start"
          />
        </div>
      </div>
    </div>
  );
}

export function ShowGrid({ items }: { items: ShowCardVM[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
      {items.map((item) => (
        <ShowCard key={item.showId} item={item} />
      ))}
    </div>
  );
}

/* --------------------------- filter / sort logic -------------------------- */

function progressPct(item: ShowCardVM): number {
  return item.airedCount > 0 ? item.watchedCount / item.airedCount : 0;
}

function comparator(sort: MyShowsSort): (a: ShowCardVM, b: ShowCardVM) => number {
  const byName = (a: ShowCardVM, b: ShowCardVM) => a.name.localeCompare(b.name, "it");
  if (sort === "name") return byName;
  if (sort === "activity") {
    return (a, b) => {
      if (a.lastWatchedAt === b.lastWatchedAt) return byName(a, b);
      if (a.lastWatchedAt === null) return 1;
      if (b.lastWatchedAt === null) return -1;
      return b.lastWatchedAt.localeCompare(a.lastWatchedAt) || byName(a, b);
    };
  }
  // progress: most-watched first (% desc), ties alphabetical
  return (a, b) => progressPct(b) - progressPct(a) || byName(a, b);
}

function applyView(sections: LibrarySection[], view: MyShowsView): LibrarySection[] {
  const cmp = comparator(view.sort);
  return sections
    .filter((s) => view.status === null || s.key === view.status)
    .map((s) => ({
      ...s,
      items: s.items
        .filter((it) => {
          if (view.favOnly && !it.favorite) return false;
          if (view.platform !== null && !it.providerIds.includes(view.platform)) return false;
          if (view.genre !== null && !it.genres.includes(view.genre)) return false;
          return true;
        })
        .sort(cmp),
    }))
    .filter((s) => s.items.length > 0);
}

/* ----------------------------- My Shows view ------------------------------ */

export function MyShowsLibrary({
  sections,
  platformOptions,
  genreOptions,
  statusOptions,
  initialView,
}: {
  sections: LibrarySection[];
  platformOptions: PlatformOption[];
  genreOptions: string[];
  statusOptions: StatusOption[];
  initialView: MyShowsView;
}) {
  const [view, setView] = useState<MyShowsView>(initialView);
  const mounted = useRef(false);

  // Auto-save the toolbar state, debounced. Returning to the default clears the
  // stored key so a fresh load starts clean (unifies "Reimposta" with manual reset).
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const t = setTimeout(() => {
      const body = isDefaultView(view)
        ? { key: "view.myshows", value: null }
        : { key: "view.myshows", value: JSON.stringify(view) };
      fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => {
        /* best-effort persistence; the UI stays authoritative */
      });
    }, 500);
    return () => clearTimeout(t);
  }, [view]);

  const visible = useMemo(() => applyView(sections, view), [sections, view]);

  return (
    <div className="space-y-8">
      <LibraryToolbar
        view={view}
        onChange={setView}
        onReset={() => setView(DEFAULT_VIEW)}
        platformOptions={platformOptions}
        genreOptions={genreOptions}
        statusOptions={statusOptions}
      />

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line py-16 text-center">
          <TvIcon className="h-8 w-8 text-faint" />
          <p className="text-sm text-muted">Nessuna serie corrisponde ai filtri.</p>
          <button
            type="button"
            onClick={() => setView(DEFAULT_VIEW)}
            className="text-sm font-medium text-accent hover:text-accent-hi"
          >
            Azzera i filtri
          </button>
        </div>
      ) : (
        <div className="space-y-12">
          {visible.map((section) => (
            <section key={section.key} className="space-y-5">
              <div className="flex items-baseline gap-3">
                <h2 className="text-lg font-bold tracking-tight text-ink">{section.label}</h2>
                <span className="text-sm tabular-nums text-faint">{section.items.length}</span>
              </div>
              <ShowGrid items={section.items} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
