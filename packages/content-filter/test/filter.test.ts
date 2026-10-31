import { describe, expect, it } from "vitest";

import { checkPattern, explainMiss, type Json, matches } from "../src/index.js";

const m = (pattern: Record<string, Json>, event: Json): boolean => matches(pattern, event);
const event: Json = {
  source: "app.orders",
  "detail-type": "OrderPlaced",
  detail: {
    state: "pending",
    total: 42,
    file: "report.PNG",
    ip: "10.0.0.7",
    tags: ["a", "b"],
    path: "/srv/lib/x",
  },
};

describe("literal and nested matching", () => {
  it("matches exact values, ANDs fields, ORs a list", () => {
    expect(m({ source: ["app.orders"] }, event)).toBe(true);
    expect(m({ source: ["app.other", "app.orders"] }, event)).toBe(true);
    expect(m({ source: ["app.orders"], "detail-type": ["Nope"] }, event)).toBe(false);
    expect(m({ detail: { state: ["pending"] } }, event)).toBe(true);
    expect(m({ detail: { missing: ["x"] } }, event)).toBe(false);
  });
  it("matches any element of an array field", () => {
    expect(m({ detail: { tags: ["b"] } }, event)).toBe(true);
    expect(m({ detail: { tags: ["z"] } }, event)).toBe(false);
  });
  it("supports $or", () => {
    expect(m({ $or: [{ source: ["x"] }, { "detail-type": ["OrderPlaced"] }] }, event)).toBe(true);
    expect(m({ $or: [{ source: ["x"] }, { "detail-type": ["y"] }] }, event)).toBe(false);
  });
});

describe("operators", () => {
  it("prefix, suffix, and their ignore-case forms", () => {
    expect(m({ source: [{ prefix: "app." }] }, event)).toBe(true);
    expect(m({ detail: { file: [{ suffix: ".png" }] } }, event)).toBe(false);
    expect(m({ detail: { file: [{ suffix: { "equals-ignore-case": ".png" } }] } }, event)).toBe(
      true,
    );
    expect(m({ detail: { state: [{ prefix: { "equals-ignore-case": "PEN" } }] } }, event)).toBe(
      true,
    );
  });
  it("anything-but in its string, list, prefix and wildcard forms", () => {
    expect(m({ detail: { state: [{ "anything-but": "done" }] } }, event)).toBe(true);
    expect(m({ detail: { state: [{ "anything-but": ["pending", "x"] }] } }, event)).toBe(false);
    expect(m({ detail: { state: [{ "anything-but": { prefix: "pen" } }] } }, event)).toBe(false);
    expect(m({ detail: { path: [{ "anything-but": { wildcard: "*/lib/*" } }] } }, event)).toBe(
      false,
    );
    expect(m({ detail: { tags: [{ "anything-but": "a" }] } }, event)).toBe(false);
  });
  it("numeric ranges", () => {
    expect(m({ detail: { total: [{ numeric: [">", 0, "<=", 50] }] } }, event)).toBe(true);
    expect(m({ detail: { total: [{ numeric: [">", 42] }] } }, event)).toBe(false);
    expect(m({ detail: { total: [{ numeric: ["=", 42] }] } }, event)).toBe(true);
    expect(m({ detail: { state: [{ numeric: ["=", 1] }] } }, event)).toBe(false);
  });
  it("exists, cidr, wildcard", () => {
    expect(m({ detail: { state: [{ exists: true }] } }, event)).toBe(true);
    expect(m({ detail: { nope: [{ exists: false }] } }, event)).toBe(true);
    expect(m({ detail: { state: [{ exists: false }] } }, event)).toBe(false);
    expect(m({ detail: { ip: [{ cidr: "10.0.0.0/24" }] } }, event)).toBe(true);
    expect(m({ detail: { ip: [{ cidr: "10.0.1.0/24" }] } }, event)).toBe(false);
    expect(m({ detail: { path: [{ wildcard: "/srv/*/x" }] } }, event)).toBe(true);
    expect(m({ detail: { path: [{ wildcard: "/srv/*/y" }] } }, event)).toBe(false);
  });
  it("a missing field does not match anything-but or prefix", () => {
    expect(m({ detail: { nope: [{ "anything-but": "x" }] } }, event)).toBe(false);
    expect(m({ detail: { nope: [{ prefix: "x" }] } }, event)).toBe(false);
  });
});

describe("pattern checking and explanations", () => {
  it("accepts good patterns and explains bad ones", () => {
    expect(checkPattern({ source: ["a"], detail: { n: [{ numeric: [">", 1] }] } })).toEqual([]);
    expect(checkPattern({ source: [] }).length).toBe(1);
    expect(checkPattern({ source: "a" }).length).toBe(1);
    expect(checkPattern({ source: [{ nope: 1 }] }).length).toBe(1);
    expect(checkPattern({ n: [{ numeric: ["~", 1] }] }).length).toBe(1);
    expect(checkPattern({ $or: [] }).length).toBe(1);
    expect(checkPattern([])).toHaveLength(1);
  });
  it("says why an event did not match", () => {
    const why = explainMiss({ source: ["x"], detail: { state: ["done"], nope: ["z"] } }, event);
    expect(why.join("\n")).toMatch(/\$\.source = "app.orders" matches none/);
    expect(why.join("\n")).toMatch(/\$\.detail\.nope is missing/);
  });
});
