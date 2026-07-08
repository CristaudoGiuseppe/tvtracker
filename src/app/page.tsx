import { EmptyState, PageHeader } from "@/components/ui";
import { InboxIcon } from "@/components/icons";

export default function WatchNextPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Guarda ora"
        subtitle="I prossimi episodi da recuperare, in ordine di priorità."
      />
      <EmptyState
        icon={<InboxIcon />}
        title="Non c'è ancora niente da guardare"
        description="Importa la tua libreria da TV Time o aggiungi una serie per far comparire qui i prossimi episodi."
      />
    </div>
  );
}
