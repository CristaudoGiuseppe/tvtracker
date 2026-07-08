import { getLanguage, setLanguage } from '../../../lib/settings';

export async function GET(): Promise<Response> {
  return Response.json({ language: getLanguage() }, { status: 200 });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({}));
    const language = body?.language;
    if (language !== 'it-IT' && language !== 'en-US') {
      return Response.json({ error: "language must be 'it-IT' or 'en-US'" }, { status: 400 });
    }
    setLanguage(language);
    return Response.json({ language }, { status: 200 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
