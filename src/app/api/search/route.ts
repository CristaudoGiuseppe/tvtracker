import { searchShows, searchMovies, TmdbError } from '../../../lib/tmdb';

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');
    if (!q || q.trim() === '') {
      return Response.json({ error: 'q is required' }, { status: 400 });
    }
    const [shows, movies] = await Promise.all([searchShows(q), searchMovies(q)]);
    return Response.json({ results: [...shows, ...movies] }, { status: 200 });
  } catch (err) {
    if (err instanceof TmdbError) return Response.json({ error: err.message }, { status: 502 });
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
