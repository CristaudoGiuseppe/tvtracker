import { EmptyState, PageHeader } from "@/components/ui";
import { TvIcon } from "@/components/icons";

export default function ShowsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Le mie serie"
        subtitle="Tutta la tua libreria di serie TV, per stato."
      />
      <EmptyState
        icon={<TvIcon />}
        title="La tua libreria è vuota"
        description="Importa i tuoi dati da TV Time o cerca una serie da Esplora per iniziare a costruire la tua collezione."
      />
    </div>
  );
}
