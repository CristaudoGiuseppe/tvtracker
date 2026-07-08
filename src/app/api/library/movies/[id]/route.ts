import { removeMovie } from '../../../../../lib/library';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const tmdbId = Number(id);
  if (!Number.isInteger(tmdbId)) {
    return Response.json({ error: 'id must be a number' }, { status: 400 });
  }
  try {
    removeMovie(tmdbId);
    return Response.json({ ok: true }, { status: 200 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
