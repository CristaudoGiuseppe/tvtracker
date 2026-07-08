import { EmptyState, PageHeader } from "@/components/ui";
import { SearchIcon } from "@/components/icons";

export default function ExplorePage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Esplora"
        subtitle="Cerca serie e film e aggiungili alla tua libreria."
      />
      <EmptyState
        icon={<SearchIcon />}
        title="Cerca qualcosa da guardare"
        description="Trova serie TV e film tramite TMDB e aggiungili con un tocco alla tua libreria."
      />
    </div>
  );
}
