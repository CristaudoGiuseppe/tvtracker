import Link from "next/link";
import { notFound } from "next/navigation";
import { getMovieDetail } from "@/lib/movies";
import { getMovie, TmdbError } from "@/lib/tmdb";
import { Poster } from "@/components/ui";
import { ArrowLeftIcon } from "@/components/icons";
import { MovieDetailControls } from "@/components/movie-detail-controls";
import { formatRuntime } from "@/lib/format";

export const dynamic = "force-dynamic";

const TMDB_IMG = "https://image.tmdb.org/t/p";

function parseGenres(json: string | null): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

type ViewModel = {
  movieId: number;
  inLibrary: boolean;
  title: string;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  genres: string[];
  runtime: number | null;
  year: string | null;
  // in-library only
  state: "watchlist" | "watched" | null;
  rating: number | null;
  watchedAt: string | null;
  watchCount: number;
};

async function loadViewModel(movieId: number): Promise<ViewModel | null> {
  const detail = getMovieDetail(movieId);
  if (detail) {
    const m = detail.movie;
    return {
      movieId,
      inLibrary: true,
      title: m.title,
      overview: m.overview,
      posterPath: m.posterPath,
      backdropPath: m.backdropPath,
      genres: parseGenres(m.genres),
      runtime: m.runtime,
      year: m.releaseDate ? m.releaseDate.slice(0, 4) : null,
      state: detail.state,
      rating: detail.rating,
      watchedAt: detail.watchedAt,
      watchCount: detail.watchCount,
    };
  }

  // Not in library: render straight from TMDB without persisting.
  let movie;
  try {
    movie = await getMovie(movieId);
  } catch (err) {
    if (err instanceof TmdbError) return null;
    throw err;
  }
  return {
    movieId,
    inLibrary: false,
    title: movie.title,
    overview: movie.overview,
    posterPath: movie.poster_path,
    backdropPath: movie.backdrop_path,
    genres: movie.genres.map((g) => g.name),
    runtime: movie.runtime,
    year: movie.release_date ? movie.release_date.slice(0, 4) : null,
    state: null,
    rating: null,
    watchedAt: null,
    watchCount: 0,
  };
}

export default async function MovieDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const movieId = Number(id);
  if (!Number.isInteger(movieId)) notFound();

  const vm = await loadViewModel(movieId);
  if (!vm) notFound();

  const meta = [
    vm.year,
    formatRuntime(vm.runtime),
    ...vm.genres.slice(0, 3),
  ].filter(Boolean);

  return (
    <div className="-mx-5 -mt-6 sm:-mx-8 md:-mx-10 md:-mt-10">
      {/* ------------------------------- Hero ------------------------------- */}
      <div className="relative">
        {vm.backdropPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${TMDB_IMG}/w1280${vm.backdropPath}`}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover object-top opacity-40"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-canvas/40 via-canvas/80 to-canvas" />
        <div className="absolute inset-0 bg-gradient-to-r from-canvas via-canvas/20 to-transparent" />

        <div className="relative px-5 pb-8 pt-10 sm:px-8 md:px-10 md:pb-12 md:pt-14">
          <Link
            href="/movies"
            className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Film
          </Link>

          <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
            <div className="w-32 shrink-0 sm:w-44 md:w-52">
              <Poster
                path={vm.posterPath}
                alt={vm.title}
                size="w342"
                priority
                className="shadow-pop"
              />
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-ink sm:text-3xl md:text-4xl">
                {vm.title}
              </h1>

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-faint">
                {meta.map((m, i) => (
                  <span key={`${m}-${i}`}>{m}</span>
                ))}
              </div>

              {vm.overview && (
                <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted">
                  {vm.overview}
                </p>
              )}

              <div className="mt-6">
                <MovieDetailControls
                  movieId={vm.movieId}
                  inLibrary={vm.inLibrary}
                  state={vm.state}
                  rating={vm.rating}
                  watchedAt={vm.watchedAt}
                  watchCount={vm.watchCount}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
