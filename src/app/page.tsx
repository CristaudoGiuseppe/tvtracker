import Link from "next/link";
import { getWatchNextList } from "@/lib/watch-next";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { PlayIcon } from "@/components/icons";
import {
  SyncOnMount,
  WatchNextCard,
  type WatchNextItem,
} from "@/components/watch-next-card";

export const dynamic = "force-dynamic";

export default function WatchNextPage() {
  const list = getWatchNextList();
  const items: WatchNextItem[] = list.map(({ show, next, lastWatchedAt, progress }) => ({
    showId: show.tmdbId,
    showName: show.name,
    backdropPath: show.backdropPath,
    posterPath: show.posterPath,
    next: {
      tmdbId: next.tmdbId,
      seasonNumber: next.seasonNumber,
      episodeNumber: next.episodeNumber,
      name: next.name,
    },
    lastWatchedAt,
    progress,
  }));

  return (
    <div className="space-y-8">
      <SyncOnMount />
      <PageHeader
        title="Guarda ora"
        subtitle={
          items.length
            ? `${items.length} ${items.length === 1 ? "serie ti aspetta" : "serie ti aspettano"} con un nuovo episodio.`
            : "I prossimi episodi da recuperare, in ordine di priorità."
        }
      />

      {items.length === 0 ? (
        <EmptyState
          icon={<PlayIcon />}
          title="Nessun episodio in coda"
          description="Quando segui una serie e resta un episodio da vedere, comparirà qui — pronto con un tocco."
          action={
            <Link href="/explore">
              <Button>Esplora le serie</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <WatchNextCard key={item.showId} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
