// Italian display formatting for dates, relative time and runtimes.
// Pure functions (an optional `now` makes them deterministic to test).

/** Parse a stored UTC timestamp ('YYYY-MM-DD HH:MM:SS') or date ('YYYY-MM-DD') into a Date. */
function parseUtc(value: string): Date {
  const iso = value.includes(" ") ? value.replace(" ", "T") : `${value}T00:00:00`;
  return new Date(`${iso}Z`);
}

/** UTC calendar-day difference (target − from), in whole days. Positive = future. */
function dayDiffUtc(from: Date, target: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  return Math.round((b - a) / 86_400_000);
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "ora", "5 minuti fa", "2 giorni fa", "3 mesi fa"… for a past UTC timestamp. */
export function relativeTimeIt(dateStr: string, now: Date = new Date()): string {
  const then = parseUtc(dateStr);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (seconds < 45) return "ora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return plural(Math.max(minutes, 1), "minuto fa", "minuti fa");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return plural(hours, "ora fa", "ore fa");

  const days = dayDiffUtc(then, now);
  if (days <= 1) return "ieri";
  if (days < 7) return plural(days, "giorno fa", "giorni fa");
  if (days < 30) return plural(Math.floor(days / 7), "settimana fa", "settimane fa");
  if (days < 365) return plural(Math.floor(days / 30), "mese fa", "mesi fa");
  return plural(Math.floor(days / 365), "anno fa", "anni fa");
}

const DATE_FMT = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "10 mag 2013" for a 'YYYY-MM-DD' string; empty string when null. */
export function formatDateIt(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  return DATE_FMT.format(parseUtc(dateStr));
}

/** Whole UTC days until a future 'YYYY-MM-DD' air date (0 = today, negative = past). */
export function daysUntil(dateStr: string, now: Date = new Date()): number {
  return dayDiffUtc(now, parseUtc(dateStr));
}

/** "oggi" / "domani" / "fra 3 giorni" for an upcoming air date. */
export function countdownIt(dateStr: string, now: Date = new Date()): string {
  const days = daysUntil(dateStr, now);
  if (days <= 0) return "oggi";
  if (days === 1) return "domani";
  return `fra ${days} giorni`;
}

/** "45 min" / "1 h 5 min"; empty string when unknown. */
export function formatRuntime(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
