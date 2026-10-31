// Requirements intake: which questions a design cannot be sound without, and which are still open.
// It only checks that an answer was given, never whether it is right.
export interface IntakeQuestion {
  key: string;
  question: string;
  why: string;
}

export const INTAKE: readonly IntakeQuestion[] = [
  {
    key: "workload",
    question: "What does the system do, and who or what calls it?",
    why: "Sets the entry points and the trust boundaries.",
  },
  {
    key: "peakTraffic",
    question: "What are the expected average and peak requests or events per second?",
    why: "Drives concurrency, quotas, buffering, and cost.",
  },
  {
    key: "latency",
    question: "How long may a caller wait for a response?",
    why: "Decides between synchronous and asynchronous designs.",
  },
  {
    key: "availability",
    question: "What availability and recovery targets (RTO and RPO) apply?",
    why: "Decides single-region or multi-region and the backup strategy.",
  },
  {
    key: "dataClassification",
    question: "What data is stored or passed, and how sensitive is it?",
    why: "Decides encryption, access control, retention, and logging rules.",
  },
  {
    key: "accessPatterns",
    question: "Which queries and updates must the data store support?",
    why: "The key design of DynamoDB follows the queries; a relational store needs the joins.",
  },
  {
    key: "consistency",
    question: "Where must reads see the latest write, and where is stale data acceptable?",
    why: "Decides consistency settings and the need for transactions.",
  },
  {
    key: "failureHandling",
    question: "What should happen to a message or request that keeps failing?",
    why: "Decides retries, dead-letter queues, and who is told.",
  },
  {
    key: "compliance",
    question: "Which compliance or data-residency rules apply?",
    why: "Constrains regions, services, and logging.",
  },
  {
    key: "budget",
    question: "Is there a monthly budget or a cost ceiling?",
    why: "Constrains always-on components and the data-store billing mode.",
  },
  {
    key: "team",
    question: "Which languages and operational skills does the team have?",
    why: "A design the team cannot operate is not a good design.",
  },
];

export interface IntakeResult {
  answered: Array<{ key: string; answer: string }>;
  missing: IntakeQuestion[];
  unknownKeys: string[];
}

const MAX_ANSWER = 600;

/** Compares stated requirements with the intake questions. An empty or placeholder answer counts as missing. */
export function checkIntake(requirements: Record<string, string>): IntakeResult {
  const known = new Set(INTAKE.map((question) => question.key));
  const answered: IntakeResult["answered"] = [];
  const missing: IntakeQuestion[] = [];
  for (const question of INTAKE) {
    const raw = requirements[question.key];
    const answer = typeof raw === "string" ? raw.trim().slice(0, MAX_ANSWER) : "";
    if (answer === "" || /^(tbd|unknown|\?|n\/a|todo)$/i.test(answer)) missing.push(question);
    else answered.push({ key: question.key, answer });
  }
  return {
    answered,
    missing,
    unknownKeys: Object.keys(requirements)
      .filter((key) => !known.has(key))
      .sort(),
  };
}

export function renderIntake(result: IntakeResult): string {
  const lines = [`Requirements: ${result.answered.length} of ${INTAKE.length} answered.`];
  if (result.missing.length > 0) {
    lines.push("", "Still open (a design built without these rests on assumptions):");
    for (const q of result.missing)
      lines.push(`  ${q.key}: ${q.question}\n      Why it matters: ${q.why}`);
  }
  if (result.unknownKeys.length > 0)
    lines.push("", `Not part of the intake (kept as stated): ${result.unknownKeys.join(", ")}`);
  return lines.join("\n");
}
