import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { parseExport, type ParsedExport } from '../../../lib/importer/parse';
import { matchExport, type MatchedExport } from '../../../lib/importer/match';
import { dryRun, runImport } from '../../../lib/importer/run';
import { TmdbError } from '../../../lib/tmdb';

const SESSION_ID = 'import-session';

function dataDir(): string {
  return process.env.DATA_DIR ?? './data';
}

type StoredSession = { parsed: ParsedExport; matched: MatchedExport };

export async function POST(request: Request): Promise<Response> {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof Blob)) {
      return Response.json({ error: 'file is required (multipart field "file")' }, { status: 400 });
    }

    const dir = dataDir();
    await mkdir(dir, { recursive: true });
    const zipPath = join(dir, `${SESSION_ID}.zip`);
    await writeFile(zipPath, Buffer.from(await file.arrayBuffer()));

    const parsed = parseExport(zipPath);
    const matched = await matchExport(parsed);
    const preview = dryRun(parsed, matched);

    const session: StoredSession = { parsed, matched };
    await writeFile(join(dir, `${SESSION_ID}.json`), JSON.stringify(session));

    return Response.json({ sessionId: SESSION_ID, preview, warnings: parsed.warnings }, { status: 201 });
  } catch (err) {
    if (err instanceof TmdbError) return Response.json({ error: err.message }, { status: 502 });
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({}));
    const sessionId = body?.sessionId;
    const confirm = body?.confirm;
    if (sessionId !== SESSION_ID || confirm !== true) {
      return Response.json({ error: 'sessionId must match a pending session and confirm must be true' }, { status: 400 });
    }

    const jsonPath = join(dataDir(), `${SESSION_ID}.json`);
    let raw: string;
    try {
      raw = await readFile(jsonPath, 'utf8');
    } catch {
      return Response.json({ error: 'no import session found; upload a file first' }, { status: 400 });
    }
    const { parsed, matched }: StoredSession = JSON.parse(raw);

    const report = await runImport(parsed, matched);

    // Clean up session files after successful import
    const dir = dataDir();
    await rm(join(dir, `${SESSION_ID}.json`), { force: true });
    await rm(join(dir, `${SESSION_ID}.zip`), { force: true });

    return Response.json(report, { status: 200 });
  } catch (err) {
    if (err instanceof TmdbError) return Response.json({ error: err.message }, { status: 502 });
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
