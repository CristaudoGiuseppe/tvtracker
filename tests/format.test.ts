import { describe, it, expect } from 'vitest';
import {
  relativeTimeIt,
  formatDateIt,
  daysUntil,
  countdownIt,
  formatRuntime,
  formatDayHeaderIt,
} from '../src/lib/format';

const NOW = new Date('2026-07-08T12:00:00Z');

describe('relativeTimeIt', () => {
  it('returns "ora" for very recent', () => {
    expect(relativeTimeIt('2026-07-08 11:59:40', NOW)).toBe('ora');
  });
  it('singular vs plural minutes/hours', () => {
    expect(relativeTimeIt('2026-07-08 11:58:00', NOW)).toBe('2 minuti fa');
    expect(relativeTimeIt('2026-07-08 10:00:00', NOW)).toBe('2 ore fa');
    expect(relativeTimeIt('2026-07-08 11:00:00', NOW)).toBe('1 ora fa');
  });
  it('yesterday and days', () => {
    expect(relativeTimeIt('2026-07-07 12:00:00', NOW)).toBe('ieri');
    expect(relativeTimeIt('2026-07-05 12:00:00', NOW)).toBe('3 giorni fa');
  });
  it('weeks, months, years', () => {
    expect(relativeTimeIt('2026-06-24 12:00:00', NOW)).toBe('2 settimane fa');
    expect(relativeTimeIt('2026-04-08 12:00:00', NOW)).toBe('3 mesi fa');
    expect(relativeTimeIt('2024-07-08 12:00:00', NOW)).toBe('2 anni fa');
  });
});

describe('formatDateIt', () => {
  it('formats an it-IT date', () => {
    expect(formatDateIt('2013-05-10')).toMatch(/2013/);
    expect(formatDateIt('2013-05-10')).toContain('10');
  });
  it('empty for null', () => {
    expect(formatDateIt(null)).toBe('');
  });
});

describe('daysUntil / countdownIt', () => {
  it('counts calendar days', () => {
    expect(daysUntil('2026-07-11', NOW)).toBe(3);
    expect(daysUntil('2026-07-08', NOW)).toBe(0);
  });
  it('renders italian countdown', () => {
    expect(countdownIt('2026-07-08', NOW)).toBe('oggi');
    expect(countdownIt('2026-07-09', NOW)).toBe('domani');
    expect(countdownIt('2026-07-11', NOW)).toBe('fra 3 giorni');
  });
});

describe('formatDayHeaderIt', () => {
  it('labels today and tomorrow', () => {
    expect(formatDayHeaderIt('2026-07-08', NOW)).toBe('Oggi');
    expect(formatDayHeaderIt('2026-07-09', NOW)).toBe('Domani');
  });
  it('formats a capitalized italian weekday + date otherwise', () => {
    expect(formatDayHeaderIt('2026-07-11', NOW)).toBe('Sabato 11 luglio');
  });
});

describe('formatRuntime', () => {
  it('formats minutes and hours', () => {
    expect(formatRuntime(45)).toBe('45 min');
    expect(formatRuntime(60)).toBe('1 h');
    expect(formatRuntime(65)).toBe('1 h 5 min');
    expect(formatRuntime(null)).toBe('');
  });
});
