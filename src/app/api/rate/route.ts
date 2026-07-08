import { rate } from '../../../lib/library';

const KINDS = new Set(['show', 'episode', 'movie']);

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({}));
    const kind = body?.kind;
    const targetId = body?.targetId;
    const rating = body?.rating;
    const validKind = typeof kind === 'string' && KINDS.has(kind);
    const validTarget = typeof targetId === 'number';
    const validRating = Number.isInteger(rating) && rating >= 1 && rating <= 10;
    if (!validKind || !validTarget || !validRating) {
      return Response.json({ error: 'kind must be show|episode|movie, targetId a number, rating an integer 1-10' }, { status: 400 });
    }
    rate(kind as 'show' | 'episode' | 'movie', targetId, rating);
    return Response.json({ ok: true }, { status: 200 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
