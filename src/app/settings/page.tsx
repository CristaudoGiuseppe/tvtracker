import { EmptyState, PageHeader } from "@/components/ui";
import { SlidersIcon } from "@/components/icons";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Impostazioni"
        subtitle="Importa i tuoi dati e gestisci la tua libreria."
      />
      <EmptyState
        icon={<SlidersIcon />}
        title="Impostazioni in arrivo"
        description="Da qui potrai importare l'export di TV Time e sincronizzare i dati con TMDB."
      />
    </div>
  );
}
