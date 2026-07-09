import { checkInEpisode, checkInMovie, uncheckEpisode, setMovieState } from '../../../lib/library';
import { getShowProgressByEpisode } from '../../../lib/watch-next';

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({}));
    const episodeId = body?.episodeId;
    const movieId = body?.movieId;
    const watchedAt: string | undefined = body?.watchedAt;
    const hasEpisode = typeof episodeId === 'number';
    const hasMovie = typeof movieId === 'number';
    if (hasEpisode === hasMovie) {
      return Response.json({ error: 'exactly one of episodeId or movieId is required' }, { status: 400 });
    }
    if (hasMovie) {
      checkInMovie(movieId, watchedAt);
      // A movie check-in means it's been watched: move it out of the watchlist.
      // No-op when the movie isn't in the library.
      setMovieState(movieId, 'watched');
      return Response.json({ ok: true }, { status: 201 });
    }
    checkInEpisode(episodeId, watchedAt);
    // Return the refreshed next episode + progress so a Watch Next card can advance in place.
    const progress = getShowProgressByEpisode(episodeId);
    const next = progress?.nextEpisode
      ? {
          tmdbId: progress.nextEpisode.tmdbId,
          seasonNumber: progress.nextEpisode.seasonNumber,
          episodeNumber: progress.nextEpisode.episodeNumber,
          name: progress.nextEpisode.name,
          stillPath: progress.nextEpisode.stillPath,
        }
      : null;
    const progressOut = progress
      ? { airedCount: progress.airedCount, watchedCount: progress.watchedCount }
      : null;
    return Response.json({ ok: true, next, progress: progressOut }, { status: 201 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({}));
    const episodeId = body?.episodeId;
    if (typeof episodeId !== 'number') {
      return Response.json({ error: 'episodeId is required' }, { status: 400 });
    }
    uncheckEpisode(episodeId);
    return Response.json({ ok: true }, { status: 200 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
