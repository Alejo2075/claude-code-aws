/**
 * Removes trailing characters from `separators` in linear time. A regular expression such as
 * /\/+$/ is polynomial on hostile input, and workspace paths come from outside.
 */
export function trimTrailingSeparators(path: string, separators = "/"): string {
  let end = path.length;
  while (end > 0 && separators.includes(path.charAt(end - 1))) end -= 1;
  return path.slice(0, end);
}

// Ranges that a terminal draws two cells wide (CJK, fullwidth forms, emoji).
const WIDE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3041, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f],
  [0x1f900, 0x1f9ff],
  [0x20000, 0x3fffd],
];

function cellsOf(codePoint: number): number {
  // Controls, combining marks, joiners, and variation selectors take no cell of their own.
  if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint < 0xa0)) return 0;
  if (codePoint >= 0x300 && codePoint <= 0x36f) return 0;
  if (codePoint >= 0x200b && codePoint <= 0x200f) return 0;
  if (codePoint >= 0xfe00 && codePoint <= 0xfe0f) return 0;
  return WIDE_RANGES.some(([from, to]) => codePoint >= from && codePoint <= to) ? 2 : 1;
}

/**
 * Columns a string takes in a terminal. `.length` counts UTF-16 units, which undercounts wide
 * characters (CJK, emoji) and overcounts combining marks; layout decisions need columns.
 */
export function cellWidth(text: string): number {
  let width = 0;
  for (const char of text) width += cellsOf(char.codePointAt(0) ?? 0);
  return width;
}

/** The first `count` characters, never splitting a surrogate pair. */
export function clipCodePoints(text: string, count: number): string {
  return Array.from(text).slice(0, Math.max(0, count)).join("");
}
