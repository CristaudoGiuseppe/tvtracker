import { getLibraryMovies } from "@/lib/movies";
import { EmptyState, PageHeader } from "@/components/ui";
import { FilmIcon } from "@/components/icons";
import { MoviesLibrary, type MovieCardVM } from "@/components/movies-library";

export const dynamic = "force-dynamic";

function toVM(m: {
  movie: { tmdbId: number; title: string; posterPath: string | null; runtime: number | null; releaseDate: string | null };
  watchedAt: string | null;
}): MovieCardVM {
  return {
    movieId: m.movie.tmdbId,
    title: m.movie.title,
    posterPath: m.movie.posterPath,
    runtime: m.movie.runtime,
    year: m.movie.releaseDate ? m.movie.releaseDate.slice(0, 4) : null,
    watchedAt: m.watchedAt,
  };
}

export default function MoviesPage() {
  const library = getLibraryMovies();

  const watchlist = library
    .filter((m) => m.state === "watchlist")
    .map(toVM)
    .sort((a, b) => a.title.localeCompare(b.title, "it"));

  const watched = library
    .filter((m) => m.state === "watched")
    .map(toVM)
    // most recently watched first; untimed fall to the end
    .sort((a, b) => (b.watchedAt ?? "").localeCompare(a.watchedAt ?? ""));

  const total = watchlist.length + watched.length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Film"
        subtitle={
          total
            ? `${total} ${total === 1 ? "film" : "film"} nella tua libreria.`
            : "I film che vuoi vedere e quelli che hai già visto."
        }
      />

      {total === 0 ? (
        <EmptyState
          icon={<FilmIcon />}
          title="Nessun film nella libreria"
          description="Cerca un film da Esplora per aggiungerlo alla tua watchlist o segnarlo come già visto."
        />
      ) : (
        <MoviesLibrary watchlist={watchlist} watched={watched} />
      )}
    </div>
  );
}
