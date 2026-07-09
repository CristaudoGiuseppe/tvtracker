import { resolveManualMatch, resolveManualMovieMatch } from '../../../../lib/importer/match';

// Persists a manual TMDB override for an unmatched show or movie. The next
// re-analysis (re-POST of the same ZIP to /api/import) honors these overrides.
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({}));
    const { kind, tmdbId } = body ?? {};

    if (!Number.isFinite(tmdbId)) {
      return Response.json({ error: 'tmdbId must be a finite number' }, { status: 400 });
    }

    if (kind === 'show') {
      if (!Number.isFinite(body?.tvdbSeriesId)) {
        return Response.json({ error: 'tvdbSeriesId must be a finite number' }, { status: 400 });
      }
      resolveManualMatch(body.tvdbSeriesId, tmdbId);
      return Response.json({ ok: true }, { status: 200 });
    }

    if (kind === 'movie') {
      const releaseYear = body?.releaseYear ?? null;
      if (typeof body?.movieName !== 'string' || body.movieName.trim() === '') {
        return Response.json({ error: 'movieName is required' }, { status: 400 });
      }
      if (releaseYear !== null && typeof releaseYear !== 'number') {
        return Response.json({ error: 'releaseYear must be a number or null' }, { status: 400 });
      }
      resolveManualMovieMatch(body.movieName, releaseYear, tmdbId);
      return Response.json({ ok: true }, { status: 200 });
    }

    return Response.json({ error: "kind must be 'show' or 'movie'" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
