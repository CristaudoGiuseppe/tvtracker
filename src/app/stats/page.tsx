import Link from "next/link";
import { getStats } from "@/lib/stats";
import { Card, EmptyState, PageHeader, Poster } from "@/components/ui";
import { ChartIcon } from "@/components/icons";
import { ActivityChart, GenreBars } from "@/components/stats-charts";
import { formatDateIt, formatRuntime } from "@/lib/format";

export const dynamic = "force-dynamic";

const UNITS: { min: number; one: string; many: string }[] = [
  { min: 525_600, one: "anno", many: "anni" },
  { min: 43_200, one: "mese", many: "mesi" },
  { min: 1_440, one: "giorno", many: "giorni" },
  { min: 60, one: "ora", many: "ore" },
  { min: 1, one: "minuto", many: "minuti" },
];

/** The largest ≤3 nonzero units of a minute total, TV Time-style. */
function watchTimeParts(totalMinutes: number): { value: number; unit: string }[] {
  let rem = totalMinutes;
  const parts: { value: number; unit: string }[] = [];
  for (const u of UNITS) {
    const v = Math.floor(rem / u.min);
    if (v > 0) {
      parts.push({ value: v, unit: v === 1 ? u.one : u.many });
      rem -= v * u.min;
    }
    if (parts.length >= 3) break;
  }
  return parts.length ? parts : [{ value: 0, unit: "minuti" }];
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <Card className="p-5">
      <div className="text-3xl font-extrabold tabular-nums tracking-tight text-ink">
        {value}
      </div>
      <div className="mt-1 text-sm text-muted">{label}</div>
    </Card>
  );
}

export default function StatsPage() {
  const stats = getStats();
  const hasActivity = stats.episodesWatched > 0 || stats.moviesWatched > 0;

  if (!hasActivity) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="Statistiche"
          subtitle="Ore guardate, episodi completati e le tue abitudini."
        />
        <EmptyState
          icon={<ChartIcon />}
          title="Ancora nessuna statistica"
          description="Guarda qualche episodio o film e qui compariranno i tuoi dati: tempo totale, serie completate, generi preferiti e altro."
        />
      </div>
    );
  }

  const time = watchTimeParts(stats.totalMinutes);

  return (
    <div className="space-y-10">
      <PageHeader
        title="Statistiche"
        subtitle="Il ritratto delle tue abitudini di visione."
      />

      {/* --------------------------- Time watched --------------------------- */}
      <section className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
        <p className="text-sm font-medium uppercase tracking-wide text-faint">
          Tempo davanti allo schermo
        </p>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {time.map((p) => (
            <span key={p.unit} className="flex items-baseline gap-1.5">
              <span className="text-4xl font-extrabold tabular-nums tracking-tight text-accent sm:text-5xl">
                {p.value}
              </span>
              <span className="text-base font-medium text-muted sm:text-lg">{p.unit}</span>
            </span>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
          {stats.firstWatchAt && (
            <span>
              Dal <span className="text-ink">{formatDateIt(stats.firstWatchAt.slice(0, 10))}</span>
            </span>
          )}
          {stats.streakDays > 0 && (
            <span>
              Serie record:{" "}
              <span className="text-ink">
                {stats.streakDays} {stats.streakDays === 1 ? "giorno" : "giorni"}
              </span>{" "}
              di fila
            </span>
          )}
        </div>
      </section>

      {/* ----------------------------- Stat tiles --------------------------- */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatTile value={String(stats.episodesWatched)} label="Episodi visti" />
        <StatTile value={String(stats.moviesWatched)} label="Film visti" />
        <StatTile
          value={String(stats.showsFinished)}
          label={stats.showsFinished === 1 ? "Serie finita" : "Serie finite"}
        />
      </div>

      {/* ---------------------------- Activity chart ------------------------ */}
      <Card className="p-5 sm:p-6">
        <ActivityChart data={stats.byMonth} />
      </Card>

      {/* ------------------------ Top shows + genres ------------------------ */}
      <div className="grid gap-6 lg:grid-cols-2">
        {stats.topShows.length > 0 && (
          <Card className="p-5 sm:p-6">
            <h2 className="mb-4 text-sm font-semibold text-ink">Serie più guardate</h2>
            <ol className="space-y-1">
              {stats.topShows.map((t, i) => (
                <li key={t.show.tmdbId}>
                  <Link
                    href={`/show/${t.show.tmdbId}`}
                    className="group flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-surface-2"
                  >
                    <span className="w-5 shrink-0 text-center text-sm font-bold tabular-nums text-faint">
                      {i + 1}
                    </span>
                    <div className="w-9 shrink-0">
                      <Poster path={t.show.posterPath} alt={t.show.name} size="w185" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink group-hover:text-accent">
                        {t.show.name}
                      </p>
                      <p className="text-xs text-faint">
                        {formatRuntime(t.minutes) || `${t.minutes} min`} · {t.episodes}{" "}
                        {t.episodes === 1 ? "episodio" : "episodi"}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          </Card>
        )}

        {stats.topGenres.length > 0 && (
          <Card className="p-5 sm:p-6">
            <GenreBars genres={stats.topGenres} />
          </Card>
        )}
      </div>
    </div>
  );
}
