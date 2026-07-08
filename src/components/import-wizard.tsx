"use client";

// TV Time import wizard. Five phases:
//   idle → uploading → preview → importing → report
// The picked File object is kept in state across every failure and re-analysis
// so the user never has to re-pick it. "Ri-analizza" re-POSTs the same File so
// manual match overrides (saved via /api/import/match) are honored.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, cn } from "./ui";
import { CheckIcon, SearchIcon } from "./icons";
import { toast } from "./toast";

/* --------------------------------- types --------------------------------- */

type UnmatchedShow = { tvdbSeriesId: number; seriesName: string };
type UnmatchedMovie = { movieName: string; releaseYear: number | null };

type Preview = {
  shows: number;
  episodesOfMatchedShows: number;
  movies: number;
  watchlist: number;
  follows: number;
  unmatchedShows: string[];
  unmatchedMovies: string[];
  unmatchedShowItems?: UnmatchedShow[];
  unmatchedMovieItems?: UnmatchedMovie[];
};

type Report = {
  imported: { shows: number; episodes: number; movies: number; watchlist: number; follows: number };
  skippedDuplicates: number;
  errors: string[];
  episodeMismatches: { show: string; season: number; episode: number; count: number }[];
};

type SearchResult = {
  id: number;
  kind: "tv" | "movie";
  name: string;
  first_air_date?: string;
  release_date?: string;
};

type Phase =
  | { name: "idle" }
  | { name: "uploading" }
  | { name: "preview"; preview: Preview; warnings: string[] }
  | { name: "importing" }
  | { name: "report"; report: Report };

/* -------------------------------- helpers -------------------------------- */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function yearOf(r: SearchResult): string | null {
  const d = r.kind === "tv" ? r.first_air_date : r.release_date;
  return d ? d.slice(0, 4) : null;
}

async function errorOf(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.error === "string") return body.error;
  } catch {
    /* non-JSON body */
  }
  return `Errore ${res.status}`;
}

/* --------------------------- IndeterminateBar ----------------------------- */

function IndeterminateBar() {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
      <div className="h-full w-1/3 rounded-full bg-accent animate-indeterminate" />
    </div>
  );
}

/* ------------------------------ MatchSearch ------------------------------ */
// Inline search-and-match for one unmatched title. Debounced /api/search
// filtered by kind; picking a result persists the override via
// /api/import/match and flips the row to "Abbinato ✓".

const DEBOUNCE_MS = 300;

function MatchSearch({
  kind,
  initialQuery,
  onPick,
}: {
  kind: "tv" | "movie";
  initialQuery: string;
  onPick: (tmdbId: number) => Promise<void>;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<number | null>(null);
  const reqId = useRef(0);

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
        const data = (await res.json()) as { results: SearchResult[] };
        if (id === reqId.current) setResults(data.results.filter((r) => r.kind === kind));
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
  }, [trimmed, kind]);

  async function pick(tmdbId: number) {
    if (saving !== null) return;
    setSaving(tmdbId);
    try {
      await onPick(tmdbId);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={kind === "tv" ? "Cerca la serie su TMDB…" : "Cerca il film su TMDB…"}
          aria-label={kind === "tv" ? "Cerca la serie su TMDB" : "Cerca il film su TMDB"}
          className={cn(
            "w-full rounded-lg border border-line bg-canvas/60 py-2 pl-9 pr-3 text-sm text-ink",
            "placeholder:text-faint transition-colors duration-150 ease-quint",
            "focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/30",
          )}
        />
      </div>
      {trimmed !== "" && (
        <ul className="max-h-44 space-y-0.5 overflow-y-auto" aria-busy={loading}>
          {loading && results === null ? (
            <li className="px-2 py-1.5 text-xs text-faint">Cerco…</li>
          ) : results && results.length > 0 ? (
            results.slice(0, 6).map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => pick(r.id)}
                  disabled={saving !== null}
                  className={cn(
                    "flex w-full items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-sm",
                    "text-ink transition-colors duration-150 ease-quint hover:bg-surface-2",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                    "disabled:pointer-events-none disabled:opacity-50",
                  )}
                >
                  <span className="truncate">
                    {saving === r.id ? "Abbino…" : r.name}
                  </span>
                  {yearOf(r) && (
                    <span className="shrink-0 text-xs tabular-nums text-faint">{yearOf(r)}</span>
                  )}
                </button>
              </li>
            ))
          ) : (
            <li className="px-2 py-1.5 text-xs text-faint">Nessun risultato.</li>
          )}
        </ul>
      )}
    </div>
  );
}

/* ----------------------------- UnmatchedList ----------------------------- */

function UnmatchedList({
  title,
  kind,
  items,
  matchedKeys,
}: {
  title: string;
  kind: "tv" | "movie";
  items: { key: string; label: string; query: string; save: (tmdbId: number) => Promise<void> }[];
  matchedKeys: Set<string>;
}) {
  const [open, setOpen] = useState<string | null>(null);

  if (items.length === 0) return null;

  return (
    <div>
      <h3 className="text-[0.8125rem] font-semibold uppercase tracking-wide text-muted">
        {title}
        <span className="ml-2 tabular-nums text-faint">{items.length}</span>
      </h3>
      <ul className="mt-2 divide-y divide-line/60">
        {items.map((item) => {
          const matched = matchedKeys.has(item.key);
          const isOpen = open === item.key && !matched;
          return (
            <li key={item.key} className="py-2">
              <div className="flex items-center justify-between gap-3">
                <span className={cn("truncate text-sm", matched ? "text-muted" : "text-ink")}>
                  {item.label}
                </span>
                {matched ? (
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-finished">
                    <CheckIcon className="h-3.5 w-3.5" strokeWidth={2.5} />
                    Abbinato
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : item.key)}
                    className={cn(
                      "shrink-0 rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted",
                      "transition-colors duration-150 ease-quint hover:border-accent hover:text-accent",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                    )}
                    aria-expanded={isOpen}
                  >
                    {isOpen ? "Chiudi" : "Abbina"}
                  </button>
                )}
              </div>
              {isOpen && (
                <MatchSearch kind={kind} initialQuery={item.query} onPick={item.save} />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------------ ImportWizard ------------------------------ */

const COUNT_LABELS: { key: keyof Pick<Preview, "shows" | "episodesOfMatchedShows" | "movies" | "watchlist" | "follows">; label: string }[] = [
  { key: "shows", label: "Serie" },
  { key: "episodesOfMatchedShows", label: "Episodi di serie riconosciute" },
  { key: "movies", label: "Film" },
  { key: "watchlist", label: "Watchlist" },
  { key: "follows", label: "Follow" },
];

export function ImportWizard() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [matchedKeys, setMatchedKeys] = useState<Set<string>>(new Set());
  const [reanalyzing, setReanalyzing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /* ------------------------------ actions ------------------------------- */

  async function upload(f: File, opts: { reanalyze?: boolean } = {}) {
    setError(null);
    if (opts.reanalyze) setReanalyzing(true);
    else setPhase({ name: "uploading" });
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await fetch("/api/import", { method: "POST", body: form });
      if (!res.ok) throw new Error(await errorOf(res));
      const data = await res.json();
      setMatchedKeys(new Set());
      setPhase({ name: "preview", preview: data.preview as Preview, warnings: (data.warnings as string[]) ?? [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      if (!opts.reanalyze) setPhase({ name: "idle" });
    } finally {
      setReanalyzing(false);
    }
  }

  function selectFile(f: File | undefined | null) {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".zip")) {
      setError("Il file deve essere un archivio .zip (l'export GDPR di TV Time).");
      return;
    }
    setFile(f);
    void upload(f);
  }

  async function confirmImport() {
    setError(null);
    setPhase({ name: "importing" });
    try {
      const res = await fetch("/api/import", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "import-session", confirm: true }),
      });
      if (!res.ok) throw new Error(await errorOf(res));
      const report = (await res.json()) as Report;
      setPhase({ name: "report", report });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      // The session may still exist server-side; going back to idle would
      // force a re-upload, which is safe (re-POST recreates the session).
      setPhase({ name: "idle" });
    }
  }

  function reset() {
    setPhase({ name: "idle" });
    setFile(null);
    setError(null);
    setMatchedKeys(new Set());
  }

  async function saveMatch(key: string, body: Record<string, unknown>) {
    try {
      const res = await fetch("/api/import/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await errorOf(res));
      setMatchedKeys((prev) => new Set(prev).add(key));
    } catch {
      toast("Impossibile salvare l'abbinamento. Riprova.");
    }
  }

  /* ------------------------------- render ------------------------------- */

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-5 py-4 md:px-6">
        <h2 className="text-base font-semibold text-ink">Importa da TV Time</h2>
        <p className="mt-0.5 text-sm text-muted">
          Carica lo ZIP dell&apos;export GDPR: la tua cronologia entra qui, per sempre.
        </p>
      </div>

      <div className="px-5 py-5 md:px-6">
        {error && (
          <div
            role="alert"
            className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color-mix(in_oklab,var(--color-dropped)_55%,var(--color-line))] bg-[color-mix(in_oklab,var(--color-dropped)_8%,transparent)] px-4 py-3 text-sm text-ink"
          >
            <span>{error}</span>
            {file && phase.name === "idle" && (
              <Button size="sm" variant="secondary" onClick={() => void upload(file)}>
                Riprova con {file.name}
              </Button>
            )}
          </div>
        )}

        {phase.name === "idle" && (
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              selectFile(e.dataTransfer.files?.[0]);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-12 text-center",
              "transition-colors duration-150 ease-quint",
              dragging
                ? "border-accent bg-accent/5"
                : "border-line hover:border-line-strong",
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".zip,application/zip"
              className="sr-only"
              onChange={(e) => {
                selectFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <span className="text-sm font-medium text-ink">
              Trascina qui lo ZIP di TV Time
            </span>
            <span className="text-xs text-muted">
              oppure <span className="font-medium text-accent">scegli un file</span> — solo .zip
            </span>
            {file && (
              <span className="mt-1 text-xs tabular-nums text-faint">
                {file.name} · {formatBytes(file.size)}
              </span>
            )}
          </label>
        )}

        {phase.name === "uploading" && (
          <div className="space-y-3 py-6">
            {file && (
              <p className="text-sm text-ink">
                {file.name}{" "}
                <span className="tabular-nums text-faint">· {formatBytes(file.size)}</span>
              </p>
            )}
            <IndeterminateBar />
            <p className="text-sm text-muted">
              Analizzo l&apos;archivio e cerco le corrispondenze su TMDB… Con molte serie può
              volerci qualche minuto.
            </p>
          </div>
        )}

        {phase.name === "preview" && (
          <PreviewPanel
            preview={phase.preview}
            warnings={phase.warnings}
            file={file}
            matchedKeys={matchedKeys}
            reanalyzing={reanalyzing}
            onReanalyze={() => file && void upload(file, { reanalyze: true })}
            onConfirm={() => void confirmImport()}
            onSaveMatch={saveMatch}
          />
        )}

        {phase.name === "importing" && (
          <div className="space-y-3 py-6">
            <IndeterminateBar />
            <p className="text-sm text-muted">
              Importo la tua cronologia: serie, episodi, film e watchlist. Con migliaia di
              episodi possono servire diversi minuti — non chiudere questa pagina.
            </p>
          </div>
        )}

        {phase.name === "report" && <ReportPanel report={phase.report} onDone={reset} />}
      </div>
    </Card>
  );
}

/* ------------------------------ PreviewPanel ------------------------------ */

function PreviewPanel({
  preview,
  warnings,
  file,
  matchedKeys,
  reanalyzing,
  onReanalyze,
  onConfirm,
  onSaveMatch,
}: {
  preview: Preview;
  warnings: string[];
  file: File | null;
  matchedKeys: Set<string>;
  reanalyzing: boolean;
  onReanalyze: () => void;
  onConfirm: () => void;
  onSaveMatch: (key: string, body: Record<string, unknown>) => Promise<void>;
}) {
  // Fall back to the plain string lists if the structured items are missing
  // (they only lack the ids needed to save an override, never the names).
  const showItems = (
    preview.unmatchedShowItems ??
    preview.unmatchedShows.map((name) => ({ tvdbSeriesId: NaN, seriesName: name }))
  ).map((s) => ({
    key: `show-${s.tvdbSeriesId}-${s.seriesName}`,
    label: s.seriesName,
    query: s.seriesName,
    save: (tmdbId: number) =>
      onSaveMatch(`show-${s.tvdbSeriesId}-${s.seriesName}`, {
        kind: "show",
        tvdbSeriesId: s.tvdbSeriesId,
        tmdbId,
      }),
  }));

  const movieItems = (
    preview.unmatchedMovieItems ??
    preview.unmatchedMovies.map((name) => ({ movieName: name, releaseYear: null }))
  ).map((m) => ({
    key: `movie-${m.movieName}-${m.releaseYear ?? ""}`,
    label: m.releaseYear ? `${m.movieName} (${m.releaseYear})` : m.movieName,
    query: m.movieName,
    save: (tmdbId: number) =>
      onSaveMatch(`movie-${m.movieName}-${m.releaseYear ?? ""}`, {
        kind: "movie",
        movieName: m.movieName,
        releaseYear: m.releaseYear,
        tmdbId,
      }),
  }));

  const unmatchedCount = showItems.length + movieItems.length;
  const matchedCount = [...showItems, ...movieItems].filter((i) => matchedKeys.has(i.key)).length;

  return (
    <div className="space-y-6" aria-busy={reanalyzing}>
      {file && (
        <p className="text-sm text-muted">
          <span className="font-medium text-ink">{file.name}</span>{" "}
          <span className="tabular-nums text-faint">· {formatBytes(file.size)}</span>
        </p>
      )}

      {/* Counts — one bordered row, not five cards */}
      <dl className="grid grid-cols-2 overflow-hidden rounded-xl border border-line sm:grid-cols-5">
        {COUNT_LABELS.map(({ key, label }, i) => (
          <div
            key={key}
            className={cn(
              "border-line bg-canvas/40 px-4 py-3",
              i > 0 && "border-t sm:border-t-0 sm:border-l",
              i === 1 && "border-l sm:border-l",
            )}
          >
            <dd className="text-xl font-extrabold tabular-nums tracking-tight text-ink">
              {preview[key].toLocaleString("it-IT")}
            </dd>
            <dt className="mt-0.5 text-[0.7rem] leading-tight text-muted">{label}</dt>
          </div>
        ))}
      </dl>

      {warnings.length > 0 && (
        <details className="rounded-xl border border-line bg-canvas/40 px-4 py-3 text-sm">
          <summary className="cursor-pointer select-none font-medium text-muted">
            {warnings.length === 1 ? "1 avviso" : `${warnings.length} avvisi`} durante l&apos;analisi
          </summary>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-faint">
            {warnings.slice(0, 20).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
            {warnings.length > 20 && <li>… e altri {warnings.length - 20}</li>}
          </ul>
        </details>
      )}

      {unmatchedCount > 0 && (
        <div className="space-y-5">
          <p className="text-sm text-muted">
            {unmatchedCount === 1 ? "1 titolo non riconosciuto" : `${unmatchedCount} titoli non riconosciuti`} su
            TMDB. Puoi abbinarli a mano, poi premere{" "}
            <span className="font-medium text-ink">Ri-analizza</span>; oppure importare subito e
            sistemarli in seguito ripetendo l&apos;import.
          </p>
          <UnmatchedList title="Serie non riconosciute" kind="tv" items={showItems} matchedKeys={matchedKeys} />
          <UnmatchedList title="Film non riconosciuti" kind="movie" items={movieItems} matchedKeys={matchedKeys} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <Button onClick={onConfirm} disabled={reanalyzing}>
          Importa
        </Button>
        {unmatchedCount > 0 && file && (
          <Button variant="secondary" onClick={onReanalyze} disabled={reanalyzing || matchedCount === 0}>
            {reanalyzing ? "Ri-analizzo…" : "Ri-analizza"}
          </Button>
        )}
        {reanalyzing && (
          <span className="text-xs text-faint">Riapplico gli abbinamenti manuali…</span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ ReportPanel ------------------------------- */

const REPORT_LABELS: { key: keyof Report["imported"]; label: string }[] = [
  { key: "shows", label: "Serie" },
  { key: "episodes", label: "Episodi" },
  { key: "movies", label: "Film" },
  { key: "watchlist", label: "Watchlist" },
  { key: "follows", label: "Follow" },
];

function ReportPanel({ report, onDone }: { report: Report; onDone: () => void }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[color-mix(in_oklab,var(--color-finished)_18%,transparent)] text-finished">
          <CheckIcon className="h-4 w-4" strokeWidth={2.5} />
        </span>
        <p className="text-sm font-semibold text-ink">Importazione completata</p>
      </div>

      <dl className="grid grid-cols-2 overflow-hidden rounded-xl border border-line sm:grid-cols-5">
        {REPORT_LABELS.map(({ key, label }, i) => (
          <div
            key={key}
            className={cn(
              "border-line bg-canvas/40 px-4 py-3",
              i > 0 && "border-t sm:border-t-0 sm:border-l",
              i === 1 && "border-l sm:border-l",
            )}
          >
            <dd className="text-xl font-extrabold tabular-nums tracking-tight text-ink">
              {report.imported[key].toLocaleString("it-IT")}
            </dd>
            <dt className="mt-0.5 text-[0.7rem] leading-tight text-muted">{label}</dt>
          </div>
        ))}
      </dl>

      <p className="text-sm text-muted">
        <span className="font-medium tabular-nums text-ink">
          {report.skippedDuplicates.toLocaleString("it-IT")}
        </span>{" "}
        visioni saltate perché già presenti.
      </p>

      {report.episodeMismatches.length > 0 && (
        <div>
          <h3 className="text-[0.8125rem] font-semibold uppercase tracking-wide text-muted">
            Episodi non trovati su TMDB
            <span className="ml-2 tabular-nums text-faint">{report.episodeMismatches.length}</span>
          </h3>
          <p className="mt-1 text-xs text-faint">
            La numerazione di TV Time non corrisponde a quella di TMDB per questi episodi.
          </p>
          <div className="mt-2 overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[26rem] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="px-3 py-2 font-medium">Serie</th>
                  <th className="px-3 py-2 font-medium">S</th>
                  <th className="px-3 py-2 font-medium">E</th>
                  <th className="px-3 py-2 font-medium">Visioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {report.episodeMismatches.map((m, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-ink">{m.show}</td>
                    <td className="px-3 py-2 tabular-nums text-muted">{m.season}</td>
                    <td className="px-3 py-2 tabular-nums text-muted">{m.episode}</td>
                    <td className="px-3 py-2 tabular-nums text-muted">{m.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {report.errors.length > 0 && (
        <div>
          <h3 className="text-[0.8125rem] font-semibold uppercase tracking-wide text-dropped">
            Errori
            <span className="ml-2 tabular-nums">{report.errors.length}</span>
          </h3>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted">
            {report.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-t border-line pt-5">
        <Button onClick={onDone}>Fatto</Button>
      </div>
    </div>
  );
}

/* ---------------------------- LanguageControl ---------------------------- */
// Segmented it-IT / en-US control for the TMDB metadata language.

const LANGUAGES = [
  { value: "it-IT", label: "Italiano" },
  { value: "en-US", label: "English" },
] as const;

type Language = (typeof LANGUAGES)[number]["value"];

export function LanguageControl({ initial }: { initial: Language }) {
  const [value, setValue] = useState<Language>(initial);
  const [pending, setPending] = useState(false);

  async function select(next: Language) {
    if (next === value || pending) return;
    const prev = value;
    setValue(next); // optimistic
    setPending(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast("Lingua dei metadati aggiornata.", "success");
    } catch {
      setValue(prev);
      toast("Impossibile salvare la lingua. Riprova.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Lingua dei metadati"
      className="inline-flex rounded-lg border border-line bg-canvas/60 p-0.5"
    >
      {LANGUAGES.map((l) => (
        <button
          key={l.value}
          type="button"
          role="radio"
          aria-checked={value === l.value}
          onClick={() => void select(l.value)}
          className={cn(
            "rounded-[0.4rem] px-3.5 py-1.5 text-sm font-medium transition-colors duration-150 ease-quint",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
            value === l.value
              ? "bg-accent/15 text-accent"
              : "text-muted hover:text-ink",
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
