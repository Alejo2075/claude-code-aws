import { describe, expect, it } from "vitest";

import { extractInvocations, mentionsAwsTool } from "../src/lib/extract.js";
import { MAX_SOURCE, parseShell } from "../src/lib/shell.js";

const words = (source: string) =>
  parseShell(source).commands.map((c) => c.words.map((w) => w.text));

describe("parseShell", () => {
  it("splits on separators and keeps quoted words whole", () => {
    expect(words("aws s3 ls; echo 'a b' && ls | wc")).toEqual([
      ["aws", "s3", "ls"],
      ["echo", "a b"],
      ["ls"],
      ["wc"],
    ]);
  });

  it("unquotes and handles escapes", () => {
    expect(words(String.raw`aws s3 rm "s3://b/my file" \; x`)).toEqual([
      ["aws", "s3", "rm", "s3://b/my file", ";", "x"],
    ]);
    expect(words("echo 'it'\"'\"'s'")).toEqual([["echo", "it's"]]);
  });

  it("does not split on separators inside quotes", () => {
    expect(words(`echo "a; b" 'c && d'`)).toEqual([["echo", "a; b", "c && d"]]);
  });

  it("finds commands inside substitutions and marks the word dynamic", () => {
    const parsed = parseShell("echo $(aws sts get-caller-identity) `aws s3 ls`");
    const texts = parsed.commands.map((c) => c.words.map((w) => w.text));
    expect(texts).toContainEqual(["aws", "sts", "get-caller-identity"]);
    expect(texts).toContainEqual(["aws", "s3", "ls"]);
    expect(parsed.commands.at(-1)?.words[1]?.dynamic).toBe(true);
  });

  it("marks variable expansions dynamic, but not single-quoted dollars", () => {
    const [command] = parseShell(`aws s3 rm $TARGET '$LITERAL' "x-$Y"`).commands;
    expect(command?.words.map((w) => w.dynamic)).toEqual([false, false, false, true, false, true]);
  });

  it("reads leading assignments and exports into the environment", () => {
    const [first] = parseShell("AWS_PROFILE=prod aws s3 ls").commands;
    expect(first?.env["AWS_PROFILE"]).toBe("prod");
    expect(first?.words[0]?.text).toBe("aws");
    const later = parseShell("export AWS_PROFILE=prod; aws s3 ls").commands.at(-1);
    expect(later?.env["AWS_PROFILE"]).toBe("prod");
  });

  it("drops redirections and file descriptors", () => {
    expect(words("aws s3 ls > out.txt 2>&1")).toEqual([["aws", "s3", "ls"]]);
    expect(words("aws s3 ls &>/dev/null")).toEqual([["aws", "s3", "ls"]]);
    expect(words("aws s3 ls 2>err < in")).toEqual([["aws", "s3", "ls"]]);
  });

  it("captures here-document and here-string bodies", () => {
    const heredoc = parseShell("bash <<'EOF'\naws s3 rb s3://x\nEOF\necho done").commands;
    expect(heredoc[0]?.stdinText).toBe("aws s3 rb s3://x\n");
    expect(heredoc[1]?.words.map((w) => w.text)).toEqual(["echo", "done"]);
    expect(parseShell("sh <<< 'aws s3 rb s3://x'").commands[0]?.stdinText).toBe("aws s3 rb s3://x");
  });

  it("marks the right side of a pipe as piped, but not of ||", () => {
    const [left, right] = parseShell("echo x | sh").commands;
    expect(left?.piped).toBe(false);
    expect(right?.piped).toBe(true);
    expect(parseShell("a || b").commands[1]?.piped).toBe(false);
  });

  it("strips shell keywords", () => {
    expect(words("if true; then aws s3 ls; fi")).toContainEqual(["aws", "s3", "ls"]);
    expect(words("for x in a b; do aws s3 rb s3://$x; done")).toContainEqual([
      "aws",
      "s3",
      "rb",
      "s3://$x",
    ]);
  });

  it("is bounded: huge, deeply nested, and unterminated input", () => {
    expect(parseShell("a ".repeat(MAX_SOURCE)).truncated).toBe(true);
    expect(parseShell("$(".repeat(50) + ")".repeat(50)).truncated).toBe(true);
    expect(() => parseShell("echo '")).not.toThrow();
    expect(() => parseShell('echo "$(')).not.toThrow();
    expect(parseShell("x;".repeat(2000)).truncated).toBe(true);
  });

  it("runs in linear time on hostile input", () => {
    const started = performance.now();
    parseShell(`${"\\".repeat(5000)}${"'".repeat(5000)}${"$(".repeat(300)}`);
    parseShell("a|".repeat(8000));
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe("extractInvocations", () => {
  const tools = (source: string) =>
    extractInvocations(source).invocations.map((i) => [i.tool, ...i.args.slice(0, 2)]);

  it("finds a plain invocation and ignores unrelated commands", () => {
    expect(tools("ls -la && aws s3 ls")).toEqual([["aws", "s3", "ls"]]);
    expect(tools("echo hello")).toEqual([]);
  });

  it("sees through wrappers", () => {
    expect(tools("sudo -u root aws s3 rb s3://x")).toEqual([["aws", "s3", "rb"]]);
    expect(tools("env FOO=1 nohup time aws ec2 describe-instances")).toEqual([
      ["aws", "ec2", "describe-instances"],
    ]);
    expect(tools("timeout 30 aws s3 ls")).toEqual([["aws", "s3", "ls"]]);
    expect(tools("npx cdk deploy")).toEqual([["cdk", "deploy"]]);
    expect(tools("npx -y aws-cdk destroy")).toEqual([["cdk", "destroy"]]);
    expect(tools("pnpm exec cdk deploy")).toEqual([["cdk", "deploy"]]);
    expect(tools("pnpm cdk deploy")).toEqual([["cdk", "deploy"]]);
    expect(tools("/usr/local/bin/aws s3 ls")).toEqual([["aws", "s3", "ls"]]);
    expect(tools("sls deploy")).toEqual([["serverless", "deploy"]]);
  });

  it("sees through shells, eval, here-documents, and carriers", () => {
    expect(tools(`bash -c 'aws s3 rb s3://x'`)).toEqual([["aws", "s3", "rb"]]);
    expect(tools(`sh -lc "aws s3 rb s3://x"`)).toEqual([["aws", "s3", "rb"]]);
    expect(tools(`eval "aws s3 rb s3://x"`)).toEqual([["aws", "s3", "rb"]]);
    expect(tools("bash <<EOF\naws s3 rb s3://x\nEOF")).toEqual([["aws", "s3", "rb"]]);
    expect(tools(`ssh host 'aws s3 rb s3://x'`)).toEqual([["aws", "s3", "rb"]]);
    expect(tools(`docker exec c sh -c "aws s3 rb s3://x"`)).toEqual([["aws", "s3", "rb"]]);
    expect(tools(`docker exec c 'aws s3 rb s3://x'`)).toEqual([["aws", "s3", "rb"]]);
  });

  it("carries profiles and credentials set by wrappers and exports", () => {
    const [vault] = extractInvocations("aws-vault exec prod -- aws s3 ls").invocations;
    expect(vault?.vaultProfile).toBe("prod");
    const [exported] = extractInvocations("export AWS_PROFILE=prod && aws s3 ls").invocations;
    expect(exported?.env["AWS_PROFILE"]).toBe("prod");
    const [inline] = extractInvocations("AWS_ACCESS_KEY_ID=AKIAEXAMPLE aws s3 ls").invocations;
    expect(inline?.env["AWS_ACCESS_KEY_ID"]).toBe("AKIAEXAMPLE");
  });

  it("marks arguments from standard input as dynamic", () => {
    expect(extractInvocations("echo a | xargs aws s3 rb").invocations[0]?.dynamic).toBe(true);
  });

  it("flags what it cannot see through", () => {
    expect(extractInvocations("$CMD s3 rb s3://x").unanalyzable).toBe(true);
    expect(extractInvocations(`echo "aws s3 rb s3://x" | sh`).unanalyzable).toBe(true);
    expect(extractInvocations(`bash -c "$SCRIPT"`).unanalyzable).toBe(true);
    expect(extractInvocations("eval $X").unanalyzable).toBe(true);
    expect(extractInvocations("aws s3 ls").unanalyzable).toBe(false);
  });

  it("stops recursing instead of looping on nested shells", () => {
    let nested = "aws s3 rb s3://x";
    for (let i = 0; i < 10; i += 1) nested = `bash -c '${nested.replace(/'/g, "'\\''")}'`;
    const result = extractInvocations(nested);
    expect(result.unanalyzable || result.invocations.length > 0).toBe(true);
  });
});

describe("mentionsAwsTool", () => {
  it.each(["aws s3 ls", "run cdk deploy", "x; terraform apply", "sam  deploy", "echo | sh # aws"])(
    "matches %s",
    (text) => {
      expect(mentionsAwsTool(text)).toBe(true);
    },
  );
  it.each(["awslocal s3 ls", "same thing", "ls ./aws/config", "echo hello", "samples"])(
    "does not match %s",
    (text) => {
      expect(mentionsAwsTool(text)).toBe(false);
    },
  );
});
