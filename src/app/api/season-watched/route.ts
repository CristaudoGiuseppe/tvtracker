import { markSeasonWatched, markShowWatched } from '../../../lib/library';

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({}));
    const showId = body?.showId;
    if (typeof showId !== 'number') {
      return Response.json({ error: 'showId is required and must be a number' }, { status: 400 });
    }
    if (body?.seasonNumber !== undefined) {
      if (typeof body.seasonNumber !== 'number') {
        return Response.json({ error: 'seasonNumber must be a number' }, { status: 400 });
      }
      markSeasonWatched(showId, body.seasonNumber);
    } else {
      markShowWatched(showId);
    }
    return Response.json({ ok: true }, { status: 200 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
