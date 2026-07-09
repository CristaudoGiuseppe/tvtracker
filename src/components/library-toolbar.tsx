"use client";

// My Shows toolbar: combinable filters (Piattaforma / Genere / Stato / Solo preferite)
// and a sort choice. Fully controlled — the parent owns the view state and its
// persistence. Italian UI copy, English code.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "./ui";
import { ChevronDownIcon, CheckIcon, StarIcon, SlidersIcon } from "./icons";

const TMDB_LOGO = "https://image.tmdb.org/t/p/w92";

export type MyShowsSort = "name" | "activity" | "progress";

export type MyShowsView = {
  platform: number | null; // provider id
  genre: string | null;
  status: string | null; // LibraryGroup key
  favOnly: boolean;
  sort: MyShowsSort;
};

export const DEFAULT_VIEW: MyShowsView = {
  platform: null,
  genre: null,
  status: null,
  favOnly: false,
  sort: "name",
};

export type PlatformOption = { id: number; name: string; logoPath: string };
export type StatusOption = { key: string; label: string };

const SORT_OPTIONS: { value: MyShowsSort; label: string }[] = [
  { value: "name", label: "Nome A→Z" },
  { value: "activity", label: "Attività recente" },
  { value: "progress", label: "Progresso" },
];

export function isDefaultView(v: MyShowsView): boolean {
  return (
    v.platform === DEFAULT_VIEW.platform &&
    v.genre === DEFAULT_VIEW.genre &&
    v.status === DEFAULT_VIEW.status &&
    v.favOnly === DEFAULT_VIEW.favOnly &&
    v.sort === DEFAULT_VIEW.sort
  );
}

/* ------------------------------- FilterMenu ------------------------------ */

type MenuOption = { value: string | number | null; label: string; logoPath?: string };

function FilterMenu({
  label,
  active,
  selected,
  options,
  onSelect,
}: {
  label: string;
  active: boolean;
  selected: string | number | null;
  options: MenuOption[];
  onSelect: (value: string | number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium",
          "transition-colors duration-150 ease-quint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
          active
            ? "border-accent/45 bg-[color-mix(in_oklab,var(--color-accent)_12%,transparent)] text-ink"
            : "border-line bg-surface-2 text-muted hover:border-line-strong hover:text-ink",
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronDownIcon
          className={cn("h-4 w-4 shrink-0 text-faint transition-transform duration-200", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 z-40 mt-2 max-h-80 w-60 origin-top-left animate-fade-up overflow-y-auto rounded-xl border border-line bg-surface-2 p-1 shadow-pop"
        >
          {options.map((o) => {
            const on = o.value === selected;
            return (
              <button
                key={String(o.value)}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                onClick={() => {
                  onSelect(o.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-150",
                  on ? "text-ink" : "text-muted hover:bg-surface hover:text-ink",
                )}
              >
                {o.logoPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`${TMDB_LOGO}${o.logoPath}`}
                    alt=""
                    aria-hidden
                    loading="lazy"
                    className="h-6 w-6 shrink-0 rounded-md object-cover ring-1 ring-line/70"
                  />
                ) : null}
                <span className="flex-1 truncate">{o.label}</span>
                {on && <CheckIcon className="h-4 w-4 shrink-0 text-accent" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Toolbar UI ------------------------------ */

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { value: MyShowsSort; label: string }[];
  value: MyShowsSort;
  onChange: (v: MyShowsSort) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5" role="radiogroup" aria-label="Ordina">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-[0.4rem] px-2.5 py-1.5 text-xs font-medium transition-colors duration-150 ease-quint",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
              on ? "bg-accent text-accent-ink" : "text-muted hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-faint">{label}</span>
      {children}
    </div>
  );
}

export function LibraryToolbar({
  view,
  onChange,
  onReset,
  platformOptions,
  genreOptions,
  statusOptions,
}: {
  view: MyShowsView;
  onChange: (v: MyShowsView) => void;
  onReset: () => void;
  platformOptions: PlatformOption[];
  genreOptions: string[];
  statusOptions: StatusOption[];
}) {
  const set = (patch: Partial<MyShowsView>) => onChange({ ...view, ...patch });

  const platformLabel =
    view.platform === null
      ? "Piattaforma"
      : platformOptions.find((p) => p.id === view.platform)?.name ?? "Piattaforma";
  const genreLabel = view.genre ?? "Genere";
  const statusLabel = view.status ? statusOptions.find((s) => s.key === view.status)?.label ?? "Stato" : "Stato";

  const isDefault = isDefaultView(view);

  return (
    <div className="rounded-2xl border border-line bg-surface/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-4">
        <div className="mr-1 hidden items-center gap-2 self-center text-faint sm:flex">
          <SlidersIcon className="h-4 w-4" />
        </div>

        {platformOptions.length > 0 && (
          <Field label="Piattaforma">
            <FilterMenu
              label={platformLabel}
              active={view.platform !== null}
              selected={view.platform}
              options={[
                { value: null, label: "Tutte le piattaforme" },
                ...platformOptions.map((p) => ({ value: p.id, label: p.name, logoPath: p.logoPath })),
              ]}
              onSelect={(v) => set({ platform: v === null ? null : Number(v) })}
            />
          </Field>
        )}

        {genreOptions.length > 0 && (
          <Field label="Genere">
            <FilterMenu
              label={genreLabel}
              active={view.genre !== null}
              selected={view.genre}
              options={[
                { value: null, label: "Tutti i generi" },
                ...genreOptions.map((g) => ({ value: g, label: g })),
              ]}
              onSelect={(v) => set({ genre: v === null ? null : String(v) })}
            />
          </Field>
        )}

        <Field label="Stato">
          <FilterMenu
            label={statusLabel}
            active={view.status !== null}
            selected={view.status}
            options={[
              { value: null, label: "Tutti gli stati" },
              ...statusOptions.map((s) => ({ value: s.key, label: s.label })),
            ]}
            onSelect={(v) => set({ status: v === null ? null : String(v) })}
          />
        </Field>

        <Field label="Preferite">
          <button
            type="button"
            aria-pressed={view.favOnly}
            onClick={() => set({ favOnly: !view.favOnly })}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium",
              "transition-colors duration-150 ease-quint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
              view.favOnly
                ? "border-accent/45 bg-[color-mix(in_oklab,var(--color-accent)_12%,transparent)] text-accent"
                : "border-line bg-surface-2 text-muted hover:border-line-strong hover:text-ink",
            )}
          >
            <StarIcon className="h-4 w-4" fill={view.favOnly ? "currentColor" : "none"} />
            Solo preferite
          </button>
        </Field>

        <div className="ml-auto flex items-end gap-4">
          <Field label="Ordina">
            <Segmented options={SORT_OPTIONS} value={view.sort} onChange={(sort) => set({ sort })} />
          </Field>

          <button
            type="button"
            onClick={onReset}
            disabled={isDefault}
            className={cn(
              "h-9 rounded-lg px-3 text-sm font-medium transition-colors duration-150 ease-quint",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
              isDefault
                ? "cursor-default text-faint/50"
                : "text-muted hover:bg-surface hover:text-ink",
            )}
          >
            Reimposta
          </button>
        </div>
      </div>
    </div>
  );
}
