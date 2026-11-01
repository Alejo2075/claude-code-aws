import data from "../data/decisions.json" with { type: "json" };

interface Option {
  name: string;
  useWhen: string[];
  watchOut: string[];
}
interface Topic {
  title: string;
  source: string;
  options: Option[];
  askFirst: string[];
}

const topics = data.topics as Record<string, Topic>;

export const TOPIC_NAMES = Object.keys(topics);
export const DECISIONS_SNAPSHOT = data.snapshot;
export const DECISIONS_NOTE = data.note;

export function getTopic(name: string): Topic | null {
  return Object.hasOwn(topics, name) ? (topics[name] ?? null) : null;
}

export function renderTopic(name: string, topic: Topic): string {
  const lines = [`${topic.title} (${name})`, `Source: ${topic.source}`, ""];
  for (const option of topic.options) {
    lines.push(option.name);
    for (const line of option.useWhen) lines.push(`  use when: ${line}`);
    for (const line of option.watchOut) lines.push(`  watch out: ${line}`);
  }
  lines.push("", "Ask first:");
  for (const question of topic.askFirst) lines.push(`  - ${question}`);
  lines.push("", `Summary dated ${DECISIONS_SNAPSHOT}; ${DECISIONS_NOTE}`);
  return lines.join("\n");
}

export function renderTopicList(): string {
  return [
    "Decision topics:",
    ...TOPIC_NAMES.map((name) => `  ${name.padEnd(12)} ${topics[name]?.title ?? ""}`),
  ].join("\n");
}
