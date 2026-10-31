import { describe, expect, it } from "vitest";

import { boundText, redactText, safeText } from "../src/index.js";

describe("redactText", () => {
  it("replaces credential shapes and secret-named pairs", () => {
    const { text, redacted } = redactText(
      'user=bob password=hunter22 token: abc123xyz AKIAIOSFODNN7EXAMPLE {"api_key":"zz-top-9"} Authorization: Bearer abcdefgh12345678',
    );
    for (const secret of [
      "hunter22",
      "abc123xyz",
      "AKIAIOSFODNN7EXAMPLE",
      "zz-top-9",
      "abcdefgh12345678",
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(text).toContain("user=bob");
    expect(redacted).toBeGreaterThanOrEqual(5);
  });

  it("replaces private key blocks, even unterminated ones", () => {
    expect(
      redactText("-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----").text,
    ).toBe("[redacted]");
    expect(redactText("x -----BEGIN PRIVATE KEY-----\nMIIabc").text).toBe("x [redacted]");
  });

  it("replaces emails and valid card numbers, but not arbitrary digits", () => {
    const { text } = redactText(
      "mail carol@example.com card 4111 1111 1111 1111 order 1234567890123",
    );
    expect(text).not.toContain("carol@example.com");
    expect(text).not.toContain("4111");
    expect(text).toContain("1234567890123");
  });

  it("can leave personal data alone", () => {
    expect(redactText("carol@example.com", { personalData: false }).text).toBe("carol@example.com");
  });

  it("keeps line breaks and tabs in multi-line text, but removes other controls", () => {
    expect(redactText("a\n\tb\r\nc\u0007d").text).toBe("a\n\tb\r\ncd");
  });

  it("removes terminal escapes", () => {
    expect(redactText("\u001b[31mred\u001b[0m").text).toBe("red");
  });

  it("is fast on hostile input", () => {
    const started = performance.now();
    redactText(`${"password=".repeat(5000)}${"a".repeat(50_000)}${"1 ".repeat(20_000)}`);
    expect(performance.now() - started).toBeLessThan(1500);
  });
});

describe("boundText", () => {
  it("bounds lines, line length, and total size, and says it cut", () => {
    const bounded = boundText(["a", "b".repeat(1000), "c", "d"].join("\n"), {
      maxLines: 3,
      maxLineLength: 10,
    });
    expect(bounded.cut).toBe(true);
    expect(bounded.omittedLines).toBe(1);
    expect(bounded.text.split("\n")).toHaveLength(3);
    expect(bounded.text).toContain("…[+990]");
  });

  it("does not cut text that fits", () => {
    expect(boundText("a\nb", { maxLines: 5 })).toEqual({
      text: "a\nb",
      cut: false,
      omittedLines: 0,
    });
  });

  it("redacts before cutting, so a secret is never left half visible", () => {
    const result = safeText(`${"x".repeat(8)} password=supersecretvalue`, {
      maxLines: 1,
      maxLineLength: 20,
    });
    expect(result.text).not.toContain("supersecret");
    expect(result.redacted).toBe(1);
  });
});
