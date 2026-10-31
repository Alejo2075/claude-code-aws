export interface PageLimits {
  /** Most items to collect. Collecting stops at this many and the result says it was cut. */
  maxItems: number;
  /** Most time to spend, in milliseconds. */
  deadlineMs: number;
  /** Clock, replaceable in tests. */
  now?: () => number;
}

export type Truncation = "none" | "items" | "time";

export interface Collected<T> {
  items: T[];
  /** Why collection stopped early. `none` means every page was read. */
  truncated: Truncation;
  pages: number;
}

export interface Page<T> {
  items: readonly T[];
  /** Token for the next page; absent or empty on the last page. */
  next?: string | undefined;
}

/**
 * Reads pages until the service runs out, or a limit is reached. A cut is always reported,
 * because a partial list must never be presented as the complete one.
 */
export async function collectPages<T>(
  fetchPage: (token: string | undefined) => Promise<Page<T>>,
  limits: PageLimits,
): Promise<Collected<T>> {
  const now = limits.now ?? Date.now;
  const started = now();
  const items: T[] = [];
  let token: string | undefined;
  let pages = 0;
  for (;;) {
    if (pages > 0 && now() - started >= limits.deadlineMs) {
      return { items, truncated: "time", pages };
    }
    const page = await fetchPage(token);
    pages += 1;
    const room = limits.maxItems - items.length;
    items.push(...page.items.slice(0, Math.max(0, room)));
    const more = page.next !== undefined && page.next !== "";
    if (page.items.length > room || (items.length >= limits.maxItems && more)) {
      return { items, truncated: "items", pages };
    }
    if (!more) return { items, truncated: "none", pages };
    token = page.next;
  }
}
