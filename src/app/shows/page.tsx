import { getLibraryGrouped, type LibraryGroup } from "@/lib/watch-next";
import { getSetting } from "@/lib/settings";
import { EmptyState, PageHeader } from "@/components/ui";
import { TvIcon } from "@/components/icons";
import { MyShowsLibrary, type ShowCardVM, type LibrarySection } from "@/components/show-grid";
import {
  DEFAULT_VIEW,
  type MyShowsView,
  type MyShowsSort,
  type PlatformOption,
  type StatusOption,
} from "@/components/library-toolbar";
import type { StoredStatus } from "@/components/status-menu";

export const dynamic = "force-dynamic";

const GROUPS: { key: LibraryGroup; label: string }[] = [
  { key: "watching", label: "In visione" },
  { key: "to_start", label: "Da iniziare" },
  { key: "up_to_date", label: "In pari" },
  { key: "for_later", label: "Da vedere più tardi" },
  { key: "finished", label: "Finite" },
  { key: "stopped", label: "Abbandonate" },
];

const SORTS: MyShowsSort[] = ["name", "activity", "progress"];

/** Restore the saved toolbar view, tolerating any stored shape (client owns the schema). */
function restoreView(): MyShowsView {
  const raw = getSetting("view.myshows");
  if (!raw) return DEFAULT_VIEW;
  try {
    const p = JSON.parse(raw) as Partial<MyShowsView>;
    return {
      platform: typeof p.platform === "number" ? p.platform : null,
      genre: typeof p.genre === "string" ? p.genre : null,
      status: typeof p.status === "string" && GROUPS.some((g) => g.key === p.status) ? p.status : null,
      favOnly: p.favOnly === true,
      sort: SORTS.includes(p.sort as MyShowsSort) ? (p.sort as MyShowsSort) : "name",
    };
  } catch {
    return DEFAULT_VIEW;
  }
}

export default function ShowsPage() {
  const grouped = getLibraryGrouped();
  const total = Object.values(grouped).reduce((n, g) => n + g.length, 0);

  const sections: LibrarySection[] = GROUPS.map(({ key, label }) => ({
    key,
    label,
    items: grouped[key].map(({ show, lib, progress, genres, providers, lastWatchedAt }): ShowCardVM => ({
      showId: show.tmdbId,
      name: show.name,
      posterPath: show.posterPath,
      storedStatus: lib.status as StoredStatus,
      favorite: lib.isFavorite === 1,
      watchedCount: progress.watchedCount,
      airedCount: progress.airedCount,
      genres,
      providerIds: providers.map((p) => p.id),
      lastWatchedAt,
    })),
  }));

  // Filter facets built from the whole library (union across groups).
  const platformMap = new Map<number, PlatformOption>();
  const genreSet = new Set<string>();
  for (const g of Object.values(grouped)) {
    for (const item of g) {
      for (const p of item.providers) if (!platformMap.has(p.id)) platformMap.set(p.id, p);
      for (const gen of item.genres) genreSet.add(gen);
    }
  }
  const platformOptions = [...platformMap.values()].sort((a, b) => a.name.localeCompare(b.name, "it"));
  const genreOptions = [...genreSet].sort((a, b) => a.localeCompare(b, "it"));
  const statusOptions: StatusOption[] = GROUPS.filter((g) => grouped[g.key].length > 0).map((g) => ({
    key: g.key,
    label: g.label,
  }));

  const initialView = restoreView();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Le mie serie"
        subtitle={
          total
            ? `${total} serie nella tua libreria.`
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
        <MyShowsLibrary
          sections={sections}
          platformOptions={platformOptions}
          genreOptions={genreOptions}
          statusOptions={statusOptions}
          initialView={initialView}
        />
      )}
    </div>
  );
}
