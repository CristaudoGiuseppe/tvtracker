"use client";

import Link from "next/link";
import { Poster, ProgressBar } from "./ui";
import { StarIcon } from "./icons";
import { StatusMenu, type StoredStatus } from "./status-menu";

export type ShowCardVM = {
  showId: number;
  name: string;
  posterPath: string | null;
  storedStatus: StoredStatus;
  favorite: boolean;
  watchedCount: number;
  airedCount: number;
};

function ShowCard({ item }: { item: ShowCardVM }) {
  return (
    <div className="group flex flex-col gap-2.5">
      <Link
        href={`/show/${item.showId}`}
        className="relative block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        aria-label={item.name}
      >
        <Poster path={item.posterPath} alt={item.name} size="w342" />
        {item.favorite && (
          <span
            className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-canvas/70 text-accent backdrop-blur-sm"
            title="Preferita"
          >
            <StarIcon className="h-4 w-4" fill="currentColor" />
          </span>
        )}
      </Link>

      <div className="min-w-0">
        <Link
          href={`/show/${item.showId}`}
          className="block truncate text-sm font-semibold text-ink transition-colors hover:text-accent"
        >
          {item.name}
        </Link>
        {item.airedCount > 0 && (
          <div className="mt-2">
            <ProgressBar value={item.watchedCount} max={item.airedCount} />
          </div>
        )}
        <div className="mt-2.5">
          <StatusMenu
            showId={item.showId}
            current={item.storedStatus}
            size="sm"
            className="w-full [&>button]:w-full [&>button]:justify-start"
          />
        </div>
      </div>
    </div>
  );
}

export function ShowGrid({ items }: { items: ShowCardVM[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
      {items.map((item) => (
        <ShowCard key={item.showId} item={item} />
      ))}
    </div>
  );
}
