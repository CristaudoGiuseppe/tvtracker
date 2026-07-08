// Line-icon set for TVTracker. Server-safe (no hooks) so both the client
// nav and server pages can render them. 24x24 grid, inherits currentColor.
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

// Watch Next — a play mark, the app's core gesture
export const PlayIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 5.5v13a1 1 0 0 0 1.52.86l10.5-6.5a1 1 0 0 0 0-1.72L8.52 4.64A1 1 0 0 0 7 5.5Z" />
  </Svg>
);

// Upcoming — calendar
export const CalendarIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" />
  </Svg>
);

// My Shows — a TV set
export const TvIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="6.5" width="18" height="12" rx="2.5" />
    <path d="M8 3.5 12 6.5 16 3.5" />
  </Svg>
);

// Movies — film strip
export const FilmIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <path d="M8 4.5v15M16 4.5v15M3.5 9.5h4.5M16 9.5h4.5M3.5 14.5h4.5M16 14.5h4.5" />
  </Svg>
);

// Explore — compass
export const CompassIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
  </Svg>
);

// Stats — bar chart
export const ChartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20h16" />
    <path d="M7 20v-6M12 20V6M17 20v-9" />
  </Svg>
);

// Settings — sliders
export const SlidersIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 7h9M18 7h1M5 17h1M10 17h9" />
    <circle cx="16" cy="7" r="2.2" />
    <circle cx="8" cy="17" r="2.2" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Svg>
);

export const InboxIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 13.5 6 6a2 2 0 0 1 1.9-1.4h8.2A2 2 0 0 1 18 6l2.5 7.5" />
    <path d="M3.5 13.5V18a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-4.5h-5a3 3 0 0 1-6 0h-5Z" />
  </Svg>
);

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
);
