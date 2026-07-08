import { getDb } from "@/db";
import { libraryShows, libraryMovies } from "@/db/schema";
import { trendingShows, trendingMovies } from "@/lib/tmdb";
import { PageHeader } from "@/components/ui";
import { CompassIcon } from "@/components/icons";
import { SearchBox, ExploreCard, type ExploreResult } from "@/components/search-box";

export const dynamic = "force-dynamic";

async function safeTrending(fn: () => Promise<ExploreResult[]>): Promise<ExploreResult[] | null> {
  try {
    return await fn();
  } catch {
    return null; // TMDB unreachable — degrade to a quiet notice, never crash.
  }
}

function Rail({
  title,
  items,
  librarySet,
}: {
  title: string;
  items: ExploreResult[];
  librarySet: Set<number>;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold tracking-tight text-ink">{title}</h2>
      <div className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 sm:-mx-8 sm:px-8 md:-mx-10 md:px-10 [scrollbar-width:thin]">
        {items.map((r) => (
          <ExploreCard
            key={`${r.kind}-${r.id}`}
            result={r}
            inLibrary={librarySet.has(r.id)}
            className="w-[9.5rem] shrink-0 snap-start sm:w-40"
          />
        ))}
      </div>
    </section>
  );
}

export default async function ExplorePage() {
  const db = getDb();
  const showIds = db.select({ id: libraryShows.showId }).from(libraryShows).all().map((r) => r.id);
  const movieIds = db.select({ id: libraryMovies.movieId }).from(libraryMovies).all().map((r) => r.id);
  const showSet = new Set(showIds);
  const movieSet = new Set(movieIds);

  const [shows, movies] = await Promise.all([
    safeTrending(trendingShows),
    safeTrending(trendingMovies),
  ]);

  const tmdbDown = shows === null && movies === null;

  const rails = (
    <div className="space-y-10">
      {tmdbDown ? (
        <p className="rounded-xl border border-line bg-surface px-4 py-6 text-center text-sm text-muted">
          Le tendenze di TMDB non sono raggiungibili in questo momento. La ricerca
          funziona comunque.
        </p>
      ) : (
        <>
          <Rail title="Di tendenza — Serie" items={shows ?? []} librarySet={showSet} />
          <Rail title="Di tendenza — Film" items={movies ?? []} librarySet={movieSet} />
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Esplora"
        subtitle="Cerca serie e film e aggiungili alla tua libreria."
        action={<CompassIcon className="hidden h-7 w-7 text-faint sm:block" />}
      />
      <SearchBox libraryShowIds={showIds} libraryMovieIds={movieIds}>
        {rails}
      </SearchBox>
    </div>
  );
}
