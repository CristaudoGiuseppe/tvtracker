"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Poster, Skeleton, cn } from "./ui";
import { SearchIcon, PlusIcon, CheckIcon } from "./icons";
import { toast } from "./toast";

export type ExploreResult = {
  id: number;
  kind: "tv" | "movie";
  name: string;
  poster_path: string | null;
  first_air_date?: string;
  release_date?: string;
  vote_average: number;
};

const DEBOUNCE_MS = 300;

function yearOf(r: ExploreResult): string | null {
  const d = r.kind === "tv" ? r.first_air_date : r.release_date;
  return d ? d.slice(0, 4) : null;
}

/* -------------------------------- AddButton ------------------------------ */

function AddButton({
  id,
  kind,
  inLibrary,
}: {
  id: number;
  kind: "tv" | "movie";
  inLibrary: boolean;
}) {
  const router = useRouter();
  const [added, setAdded] = useState(inLibrary);
  const [pending, setPending] = useState(false);

  async function add() {
    if (pending || added) return;
    setPending(true);
    try {
      const [url, body] =
        kind === "tv"
          ? ["/api/library/shows", { tmdbId: id }]
          : ["/api/library/movies", { tmdbId: id, state: "watchlist" }];
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(String(res.status));
      setAdded(true);
      router.refresh();
    } catch {
      toast(kind === "tv" ? "Impossibile aggiungere la serie." : "Impossibile aggiungere il film.");
    } finally {
      setPending(false);
    }
  }

  if (added) {
    return (
      <span className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs font-medium text-finished">
        <CheckIcon className="h-3.5 w-3.5" strokeWidth={2.5} />
        In libreria
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={add}
      disabled={pending}
      className={cn(
        "inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium",
        "border-line bg-surface-2 text-muted transition-colors duration-150 ease-quint",
        "hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
        "disabled:pointer-events-none disabled:opacity-50",
      )}
    >
      <PlusIcon className="h-3.5 w-3.5" />
      {pending ? "Aggiungo…" : "Aggiungi"}
    </button>
  );
}

/* ------------------------------- ExploreCard ----------------------------- */

export function ExploreCard({
  result,
  inLibrary,
  className,
}: {
  result: ExploreResult;
  inLibrary: boolean;
  className?: string;
}) {
  const href = result.kind === "tv" ? `/show/${result.id}` : `/movie/${result.id}`;
  const year = yearOf(result);
  const kindLabel = result.kind === "tv" ? "Serie" : "Film";

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <Link
        href={href}
        className="relative block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        aria-label={result.name}
      >
        <Poster path={result.poster_path} alt={result.name} size="w342" />
        <span className="absolute left-2 top-2 rounded-md bg-canvas/70 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-muted backdrop-blur-sm">
          {kindLabel}
        </span>
      </Link>
      <div className="min-w-0">
        <Link
          href={href}
          className="block truncate text-sm font-semibold text-ink transition-colors hover:text-accent"
        >
          {result.name}
        </Link>
        {year && <p className="mt-0.5 text-xs text-faint tabular-nums">{year}</p>}
      </div>
      <div className="mt-0.5">
        <AddButton id={result.id} kind={result.kind} inLibrary={inLibrary} />
      </div>
    </div>
  );
}

/* -------------------------------- SearchBox ------------------------------ */

const GRID = "grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5";

export function SearchBox({
  libraryShowIds,
  libraryMovieIds,
  children,
}: {
  libraryShowIds: number[];
  libraryMovieIds: number[];
  children: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ExploreResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  const showSet = useRef(new Set(libraryShowIds));
  const movieSet = useRef(new Set(libraryMovieIds));

  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed === "") {
      setResults(null);
      setLoading(false);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { results: ExploreResult[] };
        if (id === reqId.current) setResults(data.results);
      } catch {
        if (id === reqId.current) {
          setResults([]);
          toast("Ricerca non riuscita. Riprova.");
        }
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [trimmed]);

  function inLibrary(r: ExploreResult): boolean {
    return r.kind === "tv" ? showSet.current.has(r.id) : movieSet.current.has(r.id);
  }

  const searching = trimmed !== "";

  return (
    <div className="space-y-8">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-faint" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca serie e film…"
          aria-label="Cerca serie e film"
          className={cn(
            "w-full rounded-xl border border-line bg-surface py-3.5 pl-12 pr-4 text-base text-ink",
            "placeholder:text-faint transition-colors duration-150 ease-quint",
            "focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/30",
          )}
        />
      </div>

      {searching ? (
        <div>
          {loading && results === null ? (
            <div className={GRID}>
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-2.5">
                  <Skeleton className="aspect-[2/3] w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ))}
            </div>
          ) : results && results.length > 0 ? (
            <div className={cn(GRID, loading && "opacity-60 transition-opacity")}>
              {results.map((r) => (
                <ExploreCard key={`${r.kind}-${r.id}`} result={r} inLibrary={inLibrary(r)} />
              ))}
            </div>
          ) : (
            <p className="py-16 text-center text-sm text-muted">
              Nessun risultato per “{trimmed}”.
            </p>
          )}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
