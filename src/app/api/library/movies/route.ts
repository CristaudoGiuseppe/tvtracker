import { addMovie } from '../../../../lib/library';
import { TmdbError } from '../../../../lib/tmdb';

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => null);
    const tmdbId = body?.tmdbId;
    const state = body?.state;
    if (typeof tmdbId !== 'number') {
      return Response.json({ error: 'tmdbId is required and must be a number' }, { status: 400 });
    }
    if (state !== 'watchlist' && state !== 'watched') {
      return Response.json({ error: "state must be 'watchlist' or 'watched'" }, { status: 400 });
    }
    await addMovie(tmdbId, state);
    return Response.json({ ok: true }, { status: 201 });
  } catch (err) {
    if (err instanceof TmdbError) return Response.json({ error: err.message }, { status: 502 });
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
