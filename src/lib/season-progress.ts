// Pure per-season watch progress. "Aired" = airDate on/before today (UTC date
// string, lexical compare — same convention as lib/watch-next). Watched counts
// only among aired episodes: an unaired episode can't have been watched.
// Season 0 (specials) is NOT excluded here — the picker shows a specials chip
// with its own progress; whole-show progress exclusion lives in watch-next.

export type SeasonEpisodeProgress = {
  airDate: string | null;
  watched: boolean;
};

export type SeasonCounts = {
  airedCount: number;
  watchedCount: number;
};

export function seasonProgress(
  episodes: readonly SeasonEpisodeProgress[],
  today: string,
): SeasonCounts {
  let airedCount = 0;
  let watchedCount = 0;
  for (const e of episodes) {
    if (e.airDate === null || e.airDate > today) continue;
    airedCount += 1;
    if (e.watched) watchedCount += 1;
  }
  return { airedCount, watchedCount };
}
