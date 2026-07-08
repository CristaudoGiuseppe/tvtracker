import { EmptyState, PageHeader } from "@/components/ui";
import { ChartIcon } from "@/components/icons";

export default function StatsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Statistiche"
        subtitle="Ore guardate, episodi completati e le tue abitudini."
      />
      <EmptyState
        icon={<ChartIcon />}
        title="Ancora nessuna statistica"
        description="Guarda qualche episodio e qui compariranno i tuoi dati: tempo totale, serie completate e altro."
      />
    </div>
  );
}
