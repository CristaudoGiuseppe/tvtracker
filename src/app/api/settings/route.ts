import { getLanguage, setSetting, deleteSetting } from '../../../lib/settings';

const MAX_VIEW_BYTES = 4096;

/** Per-key validators for the settings whitelist. Return null when valid, else a message. */
const WHITELIST: Record<string, (value: string) => string | null> = {
  'tmdb.language': (v) =>
    v === 'it-IT' || v === 'en-US' ? null : "value must be 'it-IT' or 'en-US'",
  'watch.region': (v) => (/^[A-Z]{2}$/.test(v) ? null : 'value must be a 2-letter region code'),
  // Write-side bounds only (valid JSON, size cap); the read side (restoreView in
  // src/app/shows/page.tsx) independently re-validates the stored shape field by field.
  'view.myshows': (v) => {
    if (v.length > MAX_VIEW_BYTES) return 'view.myshows exceeds the size limit';
    try {
      JSON.parse(v);
      return null;
    } catch {
      return 'view.myshows must be valid JSON';
    }
  },
};

export async function GET(): Promise<Response> {
  return Response.json({ language: getLanguage() }, { status: 200 });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({}));

    // Legacy shape: { language } — kept for the settings UI + existing callers.
    if ('language' in body && !('key' in body)) {
      const language = body.language;
      if (language !== 'it-IT' && language !== 'en-US') {
        return Response.json({ error: "language must be 'it-IT' or 'en-US'" }, { status: 400 });
      }
      setSetting('tmdb.language', language);
      return Response.json({ language }, { status: 200 });
    }

    // Whitelisted key/value shape. value === null clears the key (Reimposta).
    const key = body?.key;
    const value = body?.value;
    const validate = typeof key === 'string' ? WHITELIST[key] : undefined;
    if (!validate) {
      return Response.json({ error: 'unknown settings key' }, { status: 400 });
    }
    if (value === null) {
      deleteSetting(key);
      return Response.json({ key, value: null }, { status: 200 });
    }
    if (typeof value !== 'string') {
      return Response.json({ error: 'value must be a string or null' }, { status: 400 });
    }
    const invalid = validate(value);
    if (invalid) {
      return Response.json({ error: invalid }, { status: 400 });
    }
    setSetting(key, value);
    return Response.json({ key, value }, { status: 200 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
