// Presentational, server-rendered SVG charts for the Stats screen. No
// interactivity (per brief): pure marks with a legend + direct labels so
// identity is never color-alone. Two series (Episodi / Film) share one unit
// (watches per month) → an honest stacked bar.

const MONTHS_IT = [
  "gen", "feb", "mar", "apr", "mag", "giu",
  "lug", "ago", "set", "ott", "nov", "dic",
];

const EPISODE_COLOR = "var(--color-accent)"; // amber — the bulk
const MOVIE_COLOR = "var(--color-caughtup)"; // teal

/** Top-rounded rect path (data-end anchored to its own top edge). */
function barPath(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0) return "";
  const rad = Math.min(r, h, w / 2);
  return [
    `M${x},${y + h}`,
    `L${x},${y + rad}`,
    `Q${x},${y} ${x + rad},${y}`,
    `L${x + w - rad},${y}`,
    `Q${x + w},${y} ${x + w},${y + rad}`,
    `L${x + w},${y + h}`,
    "Z",
  ].join(" ");
}

/* ----------------------------- Activity chart ---------------------------- */

export type MonthDatum = { month: string; episodes: number; movies: number };

export function ActivityChart({ data }: { data: MonthDatum[] }) {
  const W = 960;
  const H = 280;
  const padTop = 28;
  const padBottom = 30;
  const padX = 6;
  const plotW = W - padX * 2;
  const plotH = H - padTop - padBottom;
  const slot = plotW / data.length;
  const barW = Math.min(slot * 0.6, 26);
  const gap = 2; // surface gap between stacked segments

  const max = Math.max(1, ...data.map((d) => d.episodes + d.movies));
  const baseline = padTop + plotH;

  return (
    <figure className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <figcaption className="text-sm font-semibold text-ink">
          Attività negli ultimi 24 mesi
        </figcaption>
        <div className="flex items-center gap-4 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: EPISODE_COLOR }} />
            Episodi
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: MOVIE_COLOR }} />
            Film
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Grafico a barre dell'attività mensile: episodi e film visti negli ultimi 24 mesi."
      >
        {/* max reference line */}
        <line x1={padX} y1={padTop} x2={W - padX} y2={padTop} stroke="var(--color-line)" strokeWidth={1} />
        <text x={W - padX} y={padTop - 8} textAnchor="end" className="fill-faint" fontSize={12}>
          max {max}
        </text>

        {data.map((d, i) => {
          const total = d.episodes + d.movies;
          const x = padX + i * slot + (slot - barW) / 2;
          const epiH = (d.episodes / max) * plotH;
          const movH = (d.movies / max) * plotH;

          // Movies stack on top of episodes; a 2px gap separates non-empty fills.
          const hasBoth = d.episodes > 0 && d.movies > 0;
          const epiTop = baseline - epiH;
          const movH2 = hasBoth ? Math.max(0, movH - gap) : movH;
          const movTop = epiTop - (hasBoth ? gap : 0) - movH2;

          const [monthIdx] = [Number(d.month.slice(5, 7)) - 1];
          const showLabel = i % 3 === 0;

          return (
            <g key={d.month}>
              {d.episodes > 0 && (
                <path d={barPath(x, epiTop, barW, epiH, 3)} fill={EPISODE_COLOR} />
              )}
              {d.movies > 0 && (
                <path d={barPath(x, movTop, barW, movH2, 3)} fill={MOVIE_COLOR} />
              )}
              {total === 0 && (
                <line
                  x1={x}
                  y1={baseline}
                  x2={x + barW}
                  y2={baseline}
                  stroke="var(--color-line)"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              )}
              {showLabel && (
                <text
                  x={x + barW / 2}
                  y={H - 12}
                  textAnchor="middle"
                  className="fill-faint"
                  fontSize={12}
                >
                  {MONTHS_IT[monthIdx]}
                  {monthIdx === 0 ? ` ’${d.month.slice(2, 4)}` : ""}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/* ------------------------------- Genre bars ------------------------------ */

export type GenreDatum = { genre: string; count: number };

export function GenreBars({ genres }: { genres: GenreDatum[] }) {
  if (genres.length === 0) return null;
  const max = Math.max(...genres.map((g) => g.count));

  return (
    <figure className="space-y-4">
      <figcaption className="text-sm font-semibold text-ink">Generi preferiti</figcaption>
      <div className="space-y-2.5">
        {genres.map((g) => (
          <div key={g.genre} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-right text-xs text-muted sm:w-32">
              {g.genre}
            </span>
            <div className="h-3 flex-1">
              <div
                className="h-full rounded-r-[4px] bg-accent"
                style={{ width: `${Math.max(4, (g.count / max) * 100)}%` }}
              />
            </div>
            <span className="w-6 shrink-0 text-xs tabular-nums text-faint">{g.count}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}
