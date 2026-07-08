import { EmptyState, PageHeader } from "@/components/ui";
import { CalendarIcon } from "@/components/icons";

export default function UpcomingPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="In uscita"
        subtitle="Le prossime uscite delle serie e dei film che segui."
      />
      <EmptyState
        icon={<CalendarIcon />}
        title="Nessuna uscita in programma"
        description="Quando le serie che segui avranno nuovi episodi in calendario, li troverai qui."
      />
    </div>
  );
}
