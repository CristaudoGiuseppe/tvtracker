import { checkInEpisode, checkInMovie, uncheckEpisode } from '../../../lib/library';

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
    if (hasEpisode) checkInEpisode(episodeId, watchedAt);
    else checkInMovie(movieId, watchedAt);
    return Response.json({ ok: true }, { status: 201 });
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
