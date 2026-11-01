// Every query is bounded by a time range, a result count, a page count, and a deadline, and the cost
// of the calls is stated. Nothing here polls: each command makes a fixed number of calls and stops.
export const MAX_RANGE_HOURS = 24;
export const DEFAULT_RANGE_MINUTES = 60;
export const MAX_LOG_EVENTS = 200;
export const DEFAULT_LOG_EVENTS = 100;
export const MAX_LOG_PAGES = 5;
export const MAX_ALARMS = 100;
export const DEADLINE_MS = 30_000;

/** `15m`, `2h`, `1d` (at most 24 hours) to minutes. Null when the text is not a valid range. */
export function parseSince(text: string | undefined): number | null {
  if (text === undefined) return DEFAULT_RANGE_MINUTES;
  const match = /^(\d{1,3})([mhd])$/.exec(text);
  if (match === null) return null;
  const value = Number(match[1]);
  const minutes = match[2] === "m" ? value : match[2] === "h" ? value * 60 : value * 1440;
  return minutes >= 1 && minutes <= MAX_RANGE_HOURS * 60 ? minutes : null;
}

/** CloudWatch metric periods must be a multiple of 60 s; pick one that keeps the series short. */
export function periodFor(minutes: number): number {
  if (minutes <= 60) return 60;
  if (minutes <= 360) return 300;
  return 900;
}

export const NAME = /^[A-Za-z0-9_.:-]{1,140}$/;
export const QUEUE_NAME = /^[A-Za-z0-9_-]{1,80}(\.fifo)?$/;
