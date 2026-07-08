import { refreshStaleShows } from '../../../lib/sync';

export async function POST(): Promise<Response> {
  try {
    const refreshed = await refreshStaleShows();
    return Response.json({ refreshed }, { status: 200 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
