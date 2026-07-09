// "Dove guardarla" — streaming availability (JustWatch data via TMDB).
// Server component: parses the stored ProvidersJson, renders the flatrate row
// prominently and rent/buy under a native <details> subsection. Renders nothing
// when there is no availability data, so callers can drop it in unconditionally.
import type { ProvidersJson, ProviderEntry } from "@/lib/tmdb";

const TMDB_LOGO = "https://image.tmdb.org/t/p/w92";

function parse(json: string | null | undefined): ProvidersJson | null {
  if (!json) return null;
  try {
    const p = JSON.parse(json) as ProvidersJson;
    const total = (p.flatrate?.length ?? 0) + (p.rent?.length ?? 0) + (p.buy?.length ?? 0);
    return total > 0 ? p : null;
  } catch {
    return null;
  }
}

function Logo({ provider, size }: { provider: ProviderEntry; size: "lg" | "sm" }) {
  const dim = size === "lg" ? "h-12 w-12" : "h-9 w-9";
  return (
    <div
      title={provider.name}
      className={`${dim} shrink-0 overflow-hidden rounded-xl bg-surface-2 ring-1 ring-line/70 transition-transform duration-150 ease-quint hover:-translate-y-0.5 hover:ring-line-strong`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${TMDB_LOGO}${provider.logoPath}`}
        alt={provider.name}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover"
      />
    </div>
  );
}

export function ProvidersRow({ json }: { json: string | null | undefined }) {
  const providers = parse(json);
  if (!providers) return null;

  // Defensive defaults: a stored shape missing an array key must never crash a detail page.
  const flatrate = providers.flatrate ?? [];
  const rent = providers.rent ?? [];
  const buy = providers.buy ?? [];
  const secondary = [...rent, ...buy];
  // Rent and buy frequently overlap; de-dupe by provider id for the subsection.
  const secondaryUnique = secondary.filter(
    (p, i) => secondary.findIndex((q) => q.id === p.id) === i,
  );

  return (
    <section aria-labelledby="providers-heading" className="border-t border-line pt-8">
      <h2
        id="providers-heading"
        className="text-xs font-semibold uppercase tracking-[0.14em] text-faint"
      >
        Dove guardarla
      </h2>

      {flatrate.length > 0 ? (
        <div className="mt-4">
          <p className="text-sm text-muted">In abbonamento</p>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {flatrate.map((p) => (
              <Logo key={p.id} provider={p} size="lg" />
            ))}
          </div>
        </div>
      ) : null}

      {secondaryUnique.length > 0 ? (
        <details className="group mt-5">
          <summary className="inline-flex cursor-pointer select-none list-none items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
            <span className="text-faint transition-transform duration-150 ease-quint group-open:rotate-90">
              ›
            </span>
            Noleggio e acquisto
          </summary>
          <div className="mt-3 flex flex-wrap gap-2">
            {secondaryUnique.map((p) => (
              <Logo key={p.id} provider={p} size="sm" />
            ))}
          </div>
        </details>
      ) : null}

      <p className="mt-6 text-xs text-faint">
        Dati di disponibilità forniti da JustWatch
      </p>
    </section>
  );
}
