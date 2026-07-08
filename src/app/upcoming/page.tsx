import { getUpcoming } from "@/lib/watch-next";
import { EmptyState, PageHeader, Poster } from "@/components/ui";
import { CalendarIcon } from "@/components/icons";
import { formatDayHeaderIt } from "@/lib/format";

export const dynamic = "force-dynamic";

type Item = ReturnType<typeof getUpcoming>[number];

function groupByDate(items: Item[]): { date: string; items: Item[] }[] {
  const groups: { date: string; items: Item[] }[] = [];
  for (const item of items) {
    const date = item.episode.airDate!;
    const last = groups[groups.length - 1];
    if (last && last.date === date) last.items.push(item);
    else groups.push({ date, items: [item] });
  }
  return groups;
}

function EpisodeRow({ item }: { item: Item }) {
  const { show, episode, isSeasonPremiere } = item;
  return (
    <div className="flex items-center gap-4 py-3">
      <div className="w-12 shrink-0">
        <Poster path={show.posterPath} alt={show.name} size="w185" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-muted">
            S{episode.seasonNumber} · E{episode.episodeNumber}
          </span>
          <span className="truncate text-sm font-semibold text-ink">{show.name}</span>
          {isSeasonPremiere && (
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[0.7rem] font-medium text-accent">
              Premiere stagione
            </span>
          )}
        </div>
        {episode.name && (
          <p className="mt-1 truncate text-sm text-muted">{episode.name}</p>
        )}
      </div>
    </div>
  );
}

export default function UpcomingPage() {
  const upcoming = getUpcoming(90);
  const groups = groupByDate(upcoming);

  return (
    <div className="space-y-8">
      <PageHeader
        title="In uscita"
        subtitle={
          upcoming.length
            ? "I prossimi episodi delle serie che segui, giorno per giorno."
            : "Le prossime uscite delle serie che segui."
        }
      />

      {groups.length === 0 ? (
        <EmptyState
          icon={<CalendarIcon />}
          title="Nessuna uscita in programma"
          description="Man mano che le serie che segui annunciano nuove date, gli episodi in arrivo compariranno qui, raggruppati per giorno."
        />
      ) : (
        <div className="space-y-10">
          {groups.map((group) => (
            <section key={group.date}>
              <div className="mb-1 flex items-baseline gap-3 border-b border-line pb-2">
                <h2 className="text-sm font-bold uppercase tracking-wide text-accent">
                  {formatDayHeaderIt(group.date)}
                </h2>
                <span className="text-xs tabular-nums text-faint">
                  {group.items.length} {group.items.length === 1 ? "episodio" : "episodi"}
                </span>
              </div>
              <div className="divide-y divide-line/60">
                {group.items.map((item) => (
                  <EpisodeRow key={item.episode.tmdbId} item={item} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
