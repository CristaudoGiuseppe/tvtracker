import { setShowStatus, toggleFavorite, removeShow, type LibStatus } from '../../../../../lib/library';

function parseId(idParam: string): number | null {
  const id = Number(idParam);
  return Number.isInteger(id) ? id : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const tmdbId = parseId(id);
    if (tmdbId === null) {
      return Response.json({ error: 'id must be a numeric tmdb id' }, { status: 400 });
    }
    const body = await request.json().catch(() => ({}));
    if (body?.status !== undefined) setShowStatus(tmdbId, body.status as LibStatus);
    if (body?.favorite === true) toggleFavorite(tmdbId);
    return Response.json({ ok: true }, { status: 200 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const tmdbId = parseId(id);
    if (tmdbId === null) {
      return Response.json({ error: 'id must be a numeric tmdb id' }, { status: 400 });
    }
    removeShow(tmdbId);
    return Response.json({ ok: true }, { status: 200 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
