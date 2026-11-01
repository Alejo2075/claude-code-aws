// DynamoDB key design from access patterns. A pattern is served by a Query only when the table or an
// index has the partition key it filters by equality, and the sort key it ranges over. Everything else
// is a scan or a filter after reading, and the output says so.
export interface KeyDef {
  name: string;
  pk: string;
  sk?: string;
}

export interface Pattern {
  id: string;
  description?: string;
  /** Attributes the pattern selects by equality. */
  equals: string[];
  /** The attribute it ranges, sorts, or prefix-matches over. */
  range?: string;
  /** "low" if few distinct values of the partition key exist (a hot partition risk). */
  cardinality?: "low" | "high";
  write?: boolean;
}

export interface ModelInput {
  table: { pk: string; sk?: string };
  indexes: Array<{ name: string; pk: string; sk?: string }>;
  patterns: Pattern[];
}

export interface Served {
  id: string;
  via: string;
  note: string;
}

export interface ModelResult {
  served: Served[];
  scans: Array<{ id: string; why: string }>;
  suggestions: Array<{ forPattern: string; index: KeyDef }>;
  warnings: string[];
}

export function parseModel(
  value: unknown,
): { ok: true; model: ModelInput } | { ok: false; error: string } {
  const v = value as Partial<ModelInput> | null;
  if (v === null || typeof v !== "object")
    return { ok: false, error: "the model must be an object" };
  if (v.table === undefined || typeof v.table.pk !== "string")
    return { ok: false, error: "table.pk is required" };
  if (!Array.isArray(v.patterns) || v.patterns.length === 0 || v.patterns.length > 200)
    return { ok: false, error: "patterns must be a non-empty list (up to 200)" };
  for (const p of v.patterns)
    if (
      typeof p.id !== "string" ||
      !Array.isArray(p.equals) ||
      p.equals.some((e) => typeof e !== "string")
    )
      return { ok: false, error: "each pattern needs an id and an equals list of attribute names" };
  const indexes = Array.isArray(v.indexes) ? v.indexes : [];
  if (indexes.some((i) => typeof i.name !== "string" || typeof i.pk !== "string"))
    return { ok: false, error: "each index needs a name and pk" };
  return { ok: true, model: { table: v.table, indexes, patterns: v.patterns } };
}

export function analyze(m: ModelInput): ModelResult {
  const keys: KeyDef[] = [
    { name: "table", pk: m.table.pk, ...(m.table.sk === undefined ? {} : { sk: m.table.sk }) },
    ...m.indexes.map((i) => ({
      name: i.name,
      pk: i.pk,
      ...(i.sk === undefined ? {} : { sk: i.sk }),
    })),
  ];
  const served: Served[] = [];
  const scans: ModelResult["scans"] = [];
  const suggestions: ModelResult["suggestions"] = [];
  const warnings: string[] = [];
  let newIndexes = 0;
  for (const p of m.patterns) {
    const candidates = keys.filter(
      (k) => p.equals.includes(k.pk) && (p.range === undefined || k.sk === p.range),
    );
    const best =
      candidates.find(
        (k) => p.equals.length === 1 || k.sk === undefined || p.equals.includes(k.sk),
      ) ?? candidates[0];
    if (best !== undefined) {
      const extra = p.equals.filter((e) => e !== best.pk && e !== best.sk);
      served.push({
        id: p.id,
        via: best.name,
        note:
          extra.length === 0
            ? "Query on the key"
            : `Query, then a filter on ${extra.join(", ")}: the filter runs after the read, so you pay to read every item the key selects`,
      });
      if (p.cardinality === "low")
        warnings.push(
          `${p.id}: the partition key ${best.pk} has few distinct values; all its traffic lands on few partitions (hot partition risk). Add a suffix or a more selective key.`,
        );
      continue;
    }
    // Could a query on a key partly serve it? Only a Scan can answer when no key attribute is constrained.
    const first = p.equals[0];
    if (first === undefined) {
      scans.push({
        id: p.id,
        why: "it selects by no attribute, so only a Scan (a read of the whole table) can answer it",
      });
      continue;
    }
    const idx: KeyDef = {
      name: `GSI${m.indexes.length + newIndexes + 1}`,
      pk: first,
      ...(p.range !== undefined
        ? { sk: p.range }
        : p.equals[1] !== undefined
          ? { sk: p.equals[1] }
          : {}),
    };
    newIndexes += 1;
    suggestions.push({ forPattern: p.id, index: idx });
    scans.push({
      id: p.id,
      why: `no key has ${first}${p.range === undefined ? "" : ` with ${p.range}`} as its keys; without a new index it needs a Scan`,
    });
  }
  const total = m.indexes.length + newIndexes;
  if (total > 20)
    warnings.push(
      `This design needs ${total} global secondary indexes; the default quota is 20 per table. Merge patterns into shared overloaded keys.`,
    );
  if (m.patterns.filter((p) => p.write === true).length > 0 && m.indexes.length > 0)
    warnings.push(
      "Every write to the table is also written to each index that includes the item: indexes multiply write cost.",
    );
  return { served, scans, suggestions, warnings };
}

const KB = 1024;

export interface QueryCost {
  rcu: number;
  pages: number;
  note: string[];
}

/** Read capacity for the data a query reads. One RCU is one strongly consistent read of up to 4 KB; eventually consistent is half; each Query call returns at most 1 MB. */
export function queryCost(
  items: number,
  itemKb: number,
  consistent: boolean,
  onIndex: boolean,
): QueryCost {
  const note: string[] = [];
  if (consistent && onIndex)
    note.push(
      "Strongly consistent reads are not available on a global secondary index; the eventually consistent figure applies.",
    );
  const strong = consistent && !onIndex;
  const bytes = items * itemKb * KB;
  // Reads are rounded per item up to 4 KB when each item is read by Query? Query rounds the total: sum of sizes, rounded up to 4 KB.
  const units = Math.ceil(bytes / (4 * KB)) * (strong ? 1 : 0.5);
  const pages = Math.max(1, Math.ceil(bytes / (1024 * KB)));
  if (pages > 1)
    note.push(
      `The result is larger than 1 MB, so it takes ${pages} paginated calls; read LastEvaluatedKey until it is empty.`,
    );
  note.push(
    "A filter expression does not reduce the read cost: the capacity is for the items read, before filtering.",
  );
  return { rcu: units, pages, note };
}

export interface MigrationStep {
  step: string;
  risk?: string;
}

/** What a change of key schema needs. Key schemas of a table cannot be changed in place; this lists the steps, it does not run them. */
export function migrationPlan(
  before: ModelInput,
  after: ModelInput,
): { changes: string[]; steps: MigrationStep[] } {
  const changes: string[] = [];
  const steps: MigrationStep[] = [];
  const tableChanged = before.table.pk !== after.table.pk || before.table.sk !== after.table.sk;
  if (tableChanged) {
    changes.push(
      `Table key changes from ${before.table.pk}${before.table.sk === undefined ? "" : `/${before.table.sk}`} to ${after.table.pk}${after.table.sk === undefined ? "" : `/${after.table.sk}`}. The key schema of an existing table cannot be altered.`,
    );
    steps.push(
      {
        step: "Create a new table with the new key schema (and its indexes) alongside the old one.",
      },
      {
        step: "Change the application to write to both tables (dual write), reading from the old one.",
        risk: "Dual writes can diverge if one fails; log failures and make writes idempotent.",
      },
      {
        step: "Backfill existing items into the new table with a bounded, rate-limited job (or a table export and import). Count items in both tables.",
      },
      {
        step: "Compare the tables on a sample and on counts; switch reads to the new table behind a flag.",
      },
      {
        step: "Keep the old table (with point-in-time recovery on) for an agreed period, then retire it by an explicit decision.",
        risk: "Deleting the old table deletes the only copy of any data that was not backfilled.",
      },
    );
  }
  const old = new Map(before.indexes.map((i) => [i.name, i]));
  for (const i of after.indexes) {
    const o = old.get(i.name);
    if (o === undefined) {
      changes.push(
        `Index ${i.name} is new. It can be added to an existing table; it backfills automatically and uses write capacity while it does.`,
      );
      steps.push({
        step: `Add index ${i.name} (one index change at a time), wait until it is ACTIVE before querying it.`,
      });
    } else if (o.pk !== i.pk || o.sk !== i.sk) {
      changes.push(
        `Index ${i.name} changes its key. An index's key schema cannot be altered: create a new index under a new name, move queries, then delete the old one.`,
      );
      steps.push({
        step: `Create ${i.name}-v2 with the new keys, switch queries to it, then remove ${i.name}.`,
        risk: "Between creating and removing, writes are copied to both indexes.",
      });
    }
  }
  for (const o of before.indexes)
    if (!after.indexes.some((i) => i.name === o.name)) {
      changes.push(`Index ${o.name} is removed.`);
      steps.push({
        step: `Confirm no query uses ${o.name} (check the code and CloudWatch), then remove it.`,
        risk: "A query on a removed index fails.",
      });
    }
  if (changes.length === 0) changes.push("No key or index change.");
  return { changes, steps };
}
