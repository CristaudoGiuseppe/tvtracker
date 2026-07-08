import { EmptyState, PageHeader } from "@/components/ui";
import { FilmIcon } from "@/components/icons";

export default function MoviesPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Film"
        subtitle="I film che vuoi vedere e quelli che hai già visto."
      />
      <EmptyState
        icon={<FilmIcon />}
        title="Nessun film nella libreria"
        description="Cerca un film da Esplora per aggiungerlo alla tua watchlist."
      />
    </div>
  );
}
