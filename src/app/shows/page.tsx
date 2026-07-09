import { getLibraryGrouped } from "@/lib/watch-next";
import { EmptyState, PageHeader } from "@/components/ui";
import { TvIcon } from "@/components/icons";
import { ShowGrid, type ShowCardVM } from "@/components/show-grid";
import type { StoredStatus } from "@/components/status-menu";

export const dynamic = "force-dynamic";

const GROUPS: { key: keyof ReturnType<typeof getLibraryGrouped>; label: string }[] = [
  { key: "watching", label: "In visione" },
  { key: "to_start", label: "Da iniziare" },
  { key: "up_to_date", label: "In pari" },
  { key: "for_later", label: "Da vedere più tardi" },
  { key: "finished", label: "Finite" },
  { key: "stopped", label: "Abbandonate" },
];

export default function ShowsPage() {
  const grouped = getLibraryGrouped();
  const total = Object.values(grouped).reduce((n, g) => n + g.length, 0);

  const sections = GROUPS.map(({ key, label }) => {
    const items: ShowCardVM[] = grouped[key]
      .map(({ show, lib, progress }) => ({
        showId: show.tmdbId,
        name: show.name,
        posterPath: show.posterPath,
        storedStatus: lib.status as StoredStatus,
        favorite: lib.isFavorite === 1,
        watchedCount: progress.watchedCount,
        airedCount: progress.airedCount,
      }))
      // favorites pinned first, then alphabetical
      .sort((a, b) =>
        a.favorite === b.favorite
          ? a.name.localeCompare(b.name, "it")
          : a.favorite
            ? -1
            : 1,
      );
    return { key, label, items };
  }).filter((s) => s.items.length > 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Le mie serie"
        subtitle={
          total
            ? `${total} ${total === 1 ? "serie" : "serie"} nella tua libreria.`
            : "Tutta la tua libreria di serie TV, per stato."
        }
      />

      {total === 0 ? (
        <EmptyState
          icon={<TvIcon />}
          title="La tua libreria è vuota"
          description="Importa i tuoi dati da TV Time o cerca una serie da Esplora per iniziare a costruire la tua collezione."
        />
      ) : (
        <div className="space-y-12">
          {sections.map((section) => (
            <section key={section.key} className="space-y-5">
              <div className="flex items-baseline gap-3">
                <h2 className="text-lg font-bold tracking-tight text-ink">
                  {section.label}
                </h2>
                <span className="text-sm tabular-nums text-faint">
                  {section.items.length}
                </span>
              </div>
              <ShowGrid items={section.items} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
