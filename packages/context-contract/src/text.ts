/**
 * Removes trailing characters from `separators` in linear time. A regular expression such as
 * /\/+$/ is polynomial on hostile input, and workspace paths come from outside.
 */
export function trimTrailingSeparators(path: string, separators = "/"): string {
  let end = path.length;
  while (end > 0 && separators.includes(path.charAt(end - 1))) end -= 1;
  return path.slice(0, end);
}
