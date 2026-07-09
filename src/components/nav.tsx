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

// One floating liquid-glass capsule on every breakpoint. Icon-only below md,
// icon + label from md up. Sits above the safe-area inset, centred.
export function Nav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigazione principale"
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 0.85rem)" }}
    >
      <ul className="glass-nav pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-0.5 rounded-full p-1.5 md:gap-1">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex h-11 min-w-11 items-center justify-center gap-2 rounded-full px-0 text-sm font-semibold transition-[background-color,color,box-shadow] duration-300 ease-quint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 md:px-4",
                  active
                    ? "bg-accent text-accent-ink shadow-[0_4px_16px_-4px_color-mix(in_oklab,var(--color-accent)_65%,transparent)]"
                    : "text-muted hover:bg-[color-mix(in_oklab,var(--color-ink)_8%,transparent)] hover:text-ink",
                )}
              >
                <Icon className="h-[1.3rem] w-[1.3rem] shrink-0" />
                <span className="hidden md:inline">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
