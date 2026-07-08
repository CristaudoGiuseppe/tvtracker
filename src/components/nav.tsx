"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./ui";
import {
  CalendarIcon,
  ChartIcon,
  CompassIcon,
  FilmIcon,
  PlayIcon,
  SlidersIcon,
  TvIcon,
} from "./icons";
import type { SVGProps } from "react";

type NavItem = {
  href: string;
  label: string;
  icon: (p: SVGProps<SVGSVGElement>) => React.ReactNode;
};

const ITEMS: NavItem[] = [
  { href: "/", label: "Guarda ora", icon: PlayIcon },
  { href: "/upcoming", label: "In uscita", icon: CalendarIcon },
  { href: "/shows", label: "Le mie serie", icon: TvIcon },
  { href: "/movies", label: "Film", icon: FilmIcon },
  { href: "/explore", label: "Esplora", icon: CompassIcon },
  { href: "/stats", label: "Statistiche", icon: ChartIcon },
  { href: "/settings", label: "Impostazioni", icon: SlidersIcon },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function Wordmark() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2.5 px-2 py-1"
      aria-label="TVTracker, vai alla home"
    >
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-accent-ink shadow-[0_6px_16px_-8px_color-mix(in_oklab,var(--color-accent)_70%,transparent)]">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
          <path d="M8 5.5v13a1 1 0 0 0 1.52.86l10.5-6.5a1 1 0 0 0 0-1.72L9.52 4.64A1 1 0 0 0 8 5.5Z" />
        </svg>
      </span>
      <span className="text-[1.05rem] font-extrabold tracking-tight text-ink">
        TV<span className="text-accent">Tracker</span>
      </span>
    </Link>
  );
}

export function Nav() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-canvas/95 px-4 py-6 backdrop-blur-xl md:flex">
        <Wordmark />
        <nav className="mt-8 flex flex-col gap-1">
          {ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                  active
                    ? "bg-[color-mix(in_oklab,var(--color-accent)_14%,transparent)] text-accent"
                    : "text-muted hover:bg-surface hover:text-ink",
                )}
              >
                <Icon
                  className={cn(
                    "h-[1.35rem] w-[1.35rem] shrink-0 transition-colors",
                    active ? "text-accent" : "text-faint group-hover:text-ink",
                  )}
                />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex items-stretch gap-0.5 overflow-x-auto border-t border-line bg-canvas/90 px-1.5 pt-1.5 backdrop-blur-xl md:hidden"
        style={{ paddingBottom: "max(0.375rem, env(safe-area-inset-bottom))" }}
      >
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-w-[3.75rem] flex-1 flex-col items-center gap-1 rounded-lg px-1 py-1.5 transition-colors duration-150",
                active ? "text-accent" : "text-faint active:bg-surface",
              )}
            >
              <span
                className={cn(
                  "grid h-8 w-11 place-items-center rounded-full transition-colors duration-150",
                  active &&
                    "bg-[color-mix(in_oklab,var(--color-accent)_16%,transparent)]",
                )}
              >
                <Icon className="h-[1.3rem] w-[1.3rem]" />
              </span>
              <span className="text-[0.625rem] font-medium leading-none">
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
