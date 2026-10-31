import { describe, expect, it } from "vitest";

import { clientDefaults, collectPages, type Page } from "../src/index.js";

function pager(pages: Array<Page<number>>) {
  const calls: Array<string | undefined> = [];
  return {
    calls,
    fetch: (token: string | undefined): Promise<Page<number>> => {
      calls.push(token);
      const index = token === undefined ? 0 : Number(token);
      return Promise.resolve(pages[index] ?? { items: [] });
    },
  };
}

describe("collectPages", () => {
  it("reads every page and reports nothing was cut", async () => {
    const source = pager([
      { items: [1, 2], next: "1" },
      { items: [3], next: "2" },
      { items: [4, 5] },
    ]);
    expect(await collectPages(source.fetch, { maxItems: 100, deadlineMs: 1000 })).toEqual({
      items: [1, 2, 3, 4, 5],
      truncated: "none",
      pages: 3,
    });
    expect(source.calls).toEqual([undefined, "1", "2"]);
  });

  it("stops at the item limit and says so, without asking for more pages", async () => {
    const source = pager([
      { items: [1, 2, 3], next: "1" },
      { items: [4, 5, 6], next: "2" },
    ]);
    const result = await collectPages(source.fetch, { maxItems: 3, deadlineMs: 1000 });
    expect(result).toEqual({ items: [1, 2, 3], truncated: "items", pages: 1 });
    expect(source.calls).toHaveLength(1);
  });

  it("cuts a page that overshoots the limit", async () => {
    const source = pager([{ items: [1, 2, 3, 4, 5] }]);
    const result = await collectPages(source.fetch, { maxItems: 2, deadlineMs: 1000 });
    expect(result).toEqual({ items: [1, 2], truncated: "items", pages: 1 });
  });

  it("is not truncated when the last page ends exactly at the limit", async () => {
    const source = pager([{ items: [1, 2] }]);
    expect((await collectPages(source.fetch, { maxItems: 2, deadlineMs: 1000 })).truncated).toBe(
      "none",
    );
  });

  it("stops at the deadline between pages and says so", async () => {
    let time = 0;
    const source = pager([{ items: [1], next: "1" }, { items: [2], next: "2" }, { items: [3] }]);
    const fetch = async (token: string | undefined) => {
      time += 600;
      return source.fetch(token);
    };
    const result = await collectPages(fetch, { maxItems: 100, deadlineMs: 1000, now: () => time });
    expect(result.truncated).toBe("time");
    expect(result.items).toEqual([1, 2]);
  });

  it("treats an empty token as the last page and propagates fetch errors", async () => {
    const empty = pager([{ items: [1], next: "" }]);
    expect((await collectPages(empty.fetch, { maxItems: 5, deadlineMs: 100 })).truncated).toBe(
      "none",
    );
    await expect(
      collectPages(() => Promise.reject(new Error("boom")), { maxItems: 5, deadlineMs: 100 }),
    ).rejects.toThrow("boom");
  });
});

describe("clientDefaults", () => {
  it("retries a bounded number of times with adaptive backoff", () => {
    expect(clientDefaults("eu-west-1")).toEqual({
      region: "eu-west-1",
      maxAttempts: 3,
      retryMode: "adaptive",
    });
  });
});
