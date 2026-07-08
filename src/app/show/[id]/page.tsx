import Link from "next/link";
import { notFound } from "next/navigation";
import { getShowDetail, type DetailSeason } from "@/lib/watch-next";
import { getShowFull, TmdbError } from "@/lib/tmdb";
import { ProgressBar, StatusBadge, Poster, type LibraryStatus } from "@/components/ui";
import { ArrowLeftIcon } from "@/components/icons";
import { ShowDetailControls } from "@/components/show-detail-header";
import { SeasonTabs, type SeasonVM } from "@/components/season-tabs";
import type { StoredStatus } from "@/components/status-menu";

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

function badgeKey(stored: StoredStatus, upToDate: boolean): LibraryStatus {
  if (stored === "watching") return upToDate ? "caught_up" : "watching";
  if (stored === "for_later") return "to_watch";
  if (stored === "stopped") return "dropped";
  return "finished";
}

function seasonSort(a: number, b: number): number {
  if (a === 0) return 1;
  if (b === 0) return -1;
  return a - b;
}

type ViewModel = {
  showId: number;
  inLibrary: boolean;
  name: string;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  genres: string[];
  tmdbStatus: string | null;
  seasons: SeasonVM[];
  // in-library only
  storedStatus: StoredStatus | null;
  favorite: boolean;
  rating: number | null;
  airedCount: number;
  watchedCount: number;
  upToDate: boolean;
};

async function loadViewModel(showId: number): Promise<ViewModel | null> {
  const detail = getShowDetail(showId);
  if (detail) {
    return {
      showId,
      inLibrary: true,
      name: detail.show.name,
      overview: detail.show.overview,
      posterPath: detail.show.posterPath,
      backdropPath: detail.show.backdropPath,
      genres: parseGenres(detail.show.genres),
      tmdbStatus: detail.show.status,
      seasons: detail.seasons as SeasonVM[],
      storedStatus: detail.lib.status as StoredStatus,
      favorite: detail.lib.isFavorite === 1,
      rating: detail.rating,
      airedCount: detail.progress.airedCount,
      watchedCount: detail.progress.watchedCount,
      upToDate: detail.progress.upToDate,
    };
  }

  // Not in library: render straight from TMDB without persisting.
  let full;
  try {
    full = await getShowFull(showId);
  } catch (err) {
    if (err instanceof TmdbError) return null;
    throw err;
  }
  const seasons: SeasonVM[] = [...full.seasons]
    .sort((a, b) => seasonSort(a.season_number, b.season_number))
    .map((s) => ({
      seasonNumber: s.season_number,
      name: s.name,
      episodes: s.episodes.map((e) => ({
        tmdbId: e.id,
        seasonNumber: e.season_number,
        episodeNumber: e.episode_number,
        name: e.name,
        stillPath: e.still_path,
        airDate: e.air_date,
        runtime: e.runtime,
        watched: false,
        watchCount: 0,
      })),
    }));

  return {
    showId,
    inLibrary: false,
    name: full.name,
    overview: full.overview,
    posterPath: full.poster_path,
    backdropPath: full.backdrop_path,
    genres: full.genres.map((g) => g.name),
    tmdbStatus: full.status,
    seasons,
    storedStatus: null,
    favorite: false,
    rating: null,
    airedCount: 0,
    watchedCount: 0,
    upToDate: false,
  };
}

export default async function ShowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const showId = Number(id);
  if (!Number.isInteger(showId)) notFound();

  const vm = await loadViewModel(showId);
  if (!vm) notFound();

  const totalEpisodes = vm.seasons.reduce(
    (n, s) => n + s.episodes.filter((e) => e.seasonNumber !== 0).length,
    0,
  );

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
        {/* scrim to canvas */}
        <div className="absolute inset-0 bg-gradient-to-b from-canvas/40 via-canvas/80 to-canvas" />
        <div className="absolute inset-0 bg-gradient-to-r from-canvas via-canvas/20 to-transparent" />

        <div className="relative px-5 pb-8 pt-10 sm:px-8 md:px-10 md:pb-10 md:pt-14">
          <Link
            href="/shows"
            className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Le mie serie
          </Link>

          <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
            <div className="w-32 shrink-0 sm:w-44 md:w-52">
              <Poster
                path={vm.posterPath}
                alt={vm.name}
                size="w342"
                priority
                className="shadow-pop"
              />
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-ink sm:text-3xl md:text-4xl">
                {vm.name}
              </h1>

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
                {vm.inLibrary && (
                  <StatusBadge status={badgeKey(vm.storedStatus!, vm.upToDate)} />
                )}
                {vm.genres.slice(0, 3).map((g) => (
                  <span key={g} className="text-faint">
                    {g}
                  </span>
                ))}
                {totalEpisodes > 0 && (
                  <span className="tabular-nums text-faint">
                    {totalEpisodes} episodi
                  </span>
                )}
              </div>

              {vm.inLibrary && vm.airedCount > 0 && (
                <div className="mt-5 max-w-md">
                  <ProgressBar
                    value={vm.watchedCount}
                    max={vm.airedCount}
                    label={`${vm.watchedCount}/${vm.airedCount} episodi visti`}
                  />
                </div>
              )}

              {vm.overview && (
                <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted">
                  {vm.overview}
                </p>
              )}

              <div className="mt-6">
                <ShowDetailControls
                  showId={vm.showId}
                  inLibrary={vm.inLibrary}
                  storedStatus={vm.storedStatus}
                  favorite={vm.favorite}
                  rating={vm.rating}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ----------------------------- Episodes ----------------------------- */}
      <div className="px-5 py-8 sm:px-8 md:px-10">
        <SeasonTabs showId={vm.showId} seasons={vm.seasons} inLibrary={vm.inLibrary} />
      </div>
    </div>
  );
}
