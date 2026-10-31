// EventBridge Scheduler expressions: at(), rate(), cron(). Next run times are computed locally in an
// IANA time zone. Daylight saving handling is stated in the result, because the exact service
// behavior for a local time that does not exist (spring forward) or occurs twice (fall back) should
// be confirmed in the documentation before relying on it.
export type Parsed =
  | { kind: "at"; local: string }
  | { kind: "rate"; value: number; unit: "minute" | "hour" | "day" }
  | {
      kind: "cron";
      minutes: Set<number>;
      hours: Set<number>;
      dom: Set<number> | "?" | "L";
      months: Set<number>;
      dow: Set<number> | "?";
      years: Set<number> | null;
    };

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function field(
  text: string,
  min: number,
  max: number,
  names?: string[],
  offset = 0,
): Set<number> | string {
  const out = new Set<number>();
  for (const part of text.split(",")) {
    const [rangeText, stepText] = part.split("/");
    const step = stepText === undefined ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step < 1) return `bad step in "${part}"`;
    const num = (t: string): number => {
      const idx = names?.indexOf(t.toUpperCase()) ?? -1;
      return idx >= 0 ? idx + offset : Number(t);
    };
    let lo: number;
    let hi: number;
    if (rangeText === "*") [lo, hi] = [min, max];
    else if (rangeText?.includes("-")) {
      const [a, b] = rangeText.split("-");
      [lo, hi] = [num(a ?? ""), num(b ?? "")];
    } else {
      lo = num(rangeText ?? "");
      hi = stepText === undefined ? lo : max;
    }
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max || lo > hi)
      return `value out of range in "${part}" (allowed ${min}-${max})`;
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

export function parseSchedule(
  expression: string,
): { ok: true; value: Parsed } | { ok: false; error: string } {
  const text = expression.trim();
  if (text.length > 200) return { ok: false, error: "the expression is too long" };
  const at = /^at\((\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\)$/.exec(text);
  if (at !== null)
    return Number.isNaN(Date.parse(`${at[1]}Z`))
      ? { ok: false, error: "at() is not a valid date and time" }
      : { ok: true, value: { kind: "at", local: at[1] ?? "" } };
  const rate = /^rate\((\d+) (minute|minutes|hour|hours|day|days)\)$/.exec(text);
  if (rate !== null) {
    const value = Number(rate[1]);
    const unit = (rate[2] ?? "").replace(/s$/, "") as "minute" | "hour" | "day";
    if (value < 1) return { ok: false, error: "rate value must be at least 1" };
    if (value === 1 && (rate[2] ?? "").endsWith("s"))
      return { ok: false, error: `use the singular unit when the value is 1: rate(1 ${unit})` };
    if (value > 1 && !(rate[2] ?? "").endsWith("s"))
      return {
        ok: false,
        error: `use the plural unit when the value is more than 1: rate(${value} ${unit}s)`,
      };
    return { ok: true, value: { kind: "rate", value, unit } };
  }
  const cron = /^cron\(([^)]*)\)$/.exec(text);
  if (cron === null)
    return {
      ok: false,
      error:
        "expected at(yyyy-mm-ddThh:mm:ss), rate(value unit), or cron(minutes hours day-of-month month day-of-week year)",
    };
  const f = (cron[1] ?? "").trim().split(/\s+/);
  if (f.length !== 6)
    return {
      ok: false,
      error: `cron needs 6 fields (minutes hours day-of-month month day-of-week year); got ${f.length}`,
    };
  const [mi, ho, dm, mo, dw, yr] = f as [string, string, string, string, string, string];
  for (const unsupported of [dm, dw])
    if (/[W#]|\dL|L\d/.test(unsupported))
      return {
        ok: false,
        error: `"${unsupported}" uses W, #, or an offset L, which this checker does not evaluate`,
      };
  if ((dm === "?") === (dw === "?"))
    return { ok: false, error: "exactly one of day-of-month and day-of-week must be ?" };
  const minutes = field(mi, 0, 59);
  const hours = field(ho, 0, 23);
  const months = field(mo, 1, 12, MONTHS, 1);
  const years = yr === "*" ? null : field(yr, 1970, 2199);
  const dom = dm === "?" ? "?" : dm === "L" ? "L" : field(dm, 1, 31);
  const dow = dw === "?" ? "?" : field(dw, 1, 7, DOW, 1);
  for (const x of [minutes, hours, months, years, dom, dow])
    if (typeof x === "string" && x !== "?" && x !== "L") return { ok: false, error: x };
  return {
    ok: true,
    value: {
      kind: "cron",
      minutes: minutes as Set<number>,
      hours: hours as Set<number>,
      dom: dom as Set<number> | "?" | "L",
      months: months as Set<number>,
      dow: dow as Set<number> | "?",
      years: years as Set<number> | null,
    },
  };
}

/** The offset of a zone from UTC, in minutes, at an instant. */
function offsetMinutes(zone: string, at: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at));
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value);
  return (
    (Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour"),
      get("minute"),
      get("second"),
    ) -
      Math.floor(at / 1000) * 1000) /
    60_000
  );
}

export function validZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export interface Run {
  utc: string;
  local: string;
  note?: string;
}

/** A local wall-clock time to UTC milliseconds, or null when that wall time does not exist (spring forward). */
function localToUtc(
  zone: string,
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
): { utc: number; ambiguous: boolean } | null {
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  const candidates = new Set<number>();
  for (const probe of [naive - 86_400_000, naive, naive + 86_400_000]) {
    const guess = naive - offsetMinutes(zone, probe) * 60_000;
    if (naive === guess + offsetMinutes(zone, guess) * 60_000) candidates.add(guess);
  }
  const list = [...candidates].sort((a, b) => a - b);
  const first = list[0];
  return first === undefined ? null : { utc: first, ambiguous: list.length > 1 };
}

const fmt = (ms: number): string => new Date(ms).toISOString().replace(".000Z", "Z");
const pad = (n: number): string => String(n).padStart(2, "0");

export function nextRuns(parsed: Parsed, zone: string, from: Date, count: number): Run[] {
  const runs: Run[] = [];
  if (parsed.kind === "at") {
    const [d, t] = parsed.local.split("T");
    const [y, mo, da] = (d ?? "").split("-").map(Number);
    const [h, mi] = (t ?? "").split(":").map(Number);
    const r = localToUtc(zone, y ?? 0, mo ?? 0, da ?? 0, h ?? 0, mi ?? 0);
    if (r === null) return [];
    return r.utc >= from.getTime() ? [{ utc: fmt(r.utc), local: parsed.local }] : [];
  }
  if (parsed.kind === "rate") {
    const step = parsed.value * { minute: 60_000, hour: 3_600_000, day: 86_400_000 }[parsed.unit];
    for (let i = 1; i <= count; i += 1) {
      const t = from.getTime() + i * step;
      runs.push({
        utc: fmt(t),
        local: new Date(t + offsetMinutes(zone, t) * 60_000).toISOString().slice(0, 19),
      });
    }
    return runs;
  }
  const startLocal = new Date(from.getTime() + offsetMinutes(zone, from.getTime()) * 60_000);
  let day = Date.UTC(
    startLocal.getUTCFullYear(),
    startLocal.getUTCMonth(),
    startLocal.getUTCDate(),
  );
  for (let guard = 0; guard < 366 * 5 && runs.length < count; guard += 1, day += 86_400_000) {
    const d = new Date(day);
    const y = d.getUTCFullYear();
    const mo = d.getUTCMonth() + 1;
    const dom = d.getUTCDate();
    const dow = d.getUTCDay() + 1;
    const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    if (!parsed.months.has(mo) || (parsed.years !== null && !parsed.years.has(y))) continue;
    if (parsed.dom === "L" ? dom !== last : parsed.dom !== "?" && !parsed.dom.has(dom)) continue;
    if (parsed.dow !== "?" && !parsed.dow.has(dow)) continue;
    for (const h of [...parsed.hours].sort((a, b) => a - b))
      for (const mi of [...parsed.minutes].sort((a, b) => a - b)) {
        const r = localToUtc(zone, y, mo, dom, h, mi);
        const local = `${y}-${pad(mo)}-${pad(dom)}T${pad(h)}:${pad(mi)}`;
        if (r === null) {
          if (runs.length < count)
            runs.push({
              utc: "(none)",
              local,
              note: "this local time does not exist on that day (clocks move forward); check how Scheduler treats it",
            });
          continue;
        }
        if (r.utc < from.getTime()) continue;
        if (runs.length < count)
          runs.push({
            utc: fmt(r.utc),
            local,
            ...(r.ambiguous
              ? {
                  note: "this local time occurs twice (clocks move back); the earlier one is shown",
                }
              : {}),
          });
      }
  }
  return runs.slice(0, count);
}
