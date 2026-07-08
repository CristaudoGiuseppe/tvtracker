import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { PageHeader } from "@/components/ui";
import { ImportWizard, LanguageControl } from "@/components/import-wizard";
import { getLanguage } from "@/lib/settings";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function dbInfo(): Promise<{ path: string; size: string | null }> {
  const path = resolve(join(process.env.DATA_DIR ?? "./data", "tvtracker.db"));
  try {
    const s = await stat(path);
    return { path, size: formatBytes(s.size) };
  } catch {
    return { path, size: null };
  }
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 border-t border-line py-7 md:grid-cols-[16rem_1fr] md:gap-10">
      <div>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
      </div>
      <div className="min-w-0 md:pt-0.5">{children}</div>
    </section>
  );
}

export default async function SettingsPage() {
  const db = await dbInfo();
  const language = getLanguage();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Impostazioni"
        subtitle="Importa la tua cronologia e gestisci i tuoi dati."
      />

      <ImportWizard />

      <div>
        <Section
          title="Lingua dei metadati"
          description="Titoli e trame vengono richiesti a TMDB in questa lingua."
        >
          <LanguageControl initial={language} />
        </Section>

        <Section
          title="Database"
          description="Tutto vive in un unico file SQLite sul tuo disco."
        >
          <dl className="space-y-1.5 text-sm">
            <div className="flex flex-wrap gap-x-3">
              <dt className="text-muted">Percorso</dt>
              <dd className="break-all font-medium text-ink">{db.path}</dd>
            </div>
            <div className="flex gap-x-3">
              <dt className="text-muted">Dimensione</dt>
              <dd className="tabular-nums font-medium text-ink">
                {db.size ?? "non ancora creato"}
              </dd>
            </div>
          </dl>
        </Section>

        <Section
          title="Esporta i tuoi dati"
          description="Un file JSON con libreria, visioni, valutazioni e impostazioni. I tuoi dati restano tuoi."
        >
          <a
            href="/api/export"
            download="tvtracker-export.json"
            className="inline-flex h-10 select-none items-center justify-center gap-2 rounded-lg border border-line bg-surface-2 px-4 text-sm font-medium text-ink transition-[border-color] duration-150 ease-quint hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            Scarica tvtracker-export.json
          </a>
        </Section>
      </div>
    </div>
  );
}
