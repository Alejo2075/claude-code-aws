/**
 * Lambda runtime support dates, from the Lambda runtimes page (supported and deprecated tables).
 * A dated snapshot: the real dates move, so a result always says it is judged against this table.
 */
export const RUNTIME_TABLE_SOURCE =
  "https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html";
export const RUNTIME_TABLE_DATE = "2026-10-31";

/** Runtime identifier -> deprecation date (YYYY-MM-DD). */
const DEPRECATION: Readonly<Record<string, string>> = {
  "nodejs24.x": "2028-04-30",
  "nodejs22.x": "2027-04-30",
  "nodejs20.x": "2026-04-30",
  "nodejs18.x": "2025-09-01",
  "nodejs16.x": "2024-06-12",
  "nodejs14.x": "2023-12-04",
  "nodejs12.x": "2023-03-31",
  "nodejs10.x": "2021-07-30",
  "nodejs8.10": "2020-03-06",
  "nodejs6.10": "2019-08-12",
  "nodejs4.3": "2020-03-05",
  "nodejs4.3-edge": "2020-03-05",
  nodejs: "2016-08-30",
  "python3.14": "2029-06-30",
  "python3.13": "2029-06-30",
  "python3.12": "2028-10-31",
  "python3.11": "2027-06-30",
  "python3.10": "2026-10-31",
  "python3.9": "2025-12-15",
  "python3.8": "2024-10-14",
  "python3.7": "2023-12-04",
  "python3.6": "2022-07-18",
  "python2.7": "2021-07-15",
  java25: "2029-06-30",
  java21: "2029-06-30",
  "java17.al2023": "2029-06-30",
  "java11.al2023": "2029-06-30",
  "java8.al2023": "2029-06-30",
  java17: "2027-06-30",
  java11: "2027-06-30",
  "java8.al2": "2027-06-30",
  java8: "2024-01-08",
  dotnet10: "2028-11-14",
  dotnet9: "2026-11-10",
  dotnet8: "2026-11-10",
  dotnet7: "2024-05-14",
  dotnet6: "2024-12-20",
  "dotnet5.0": "2022-05-10",
  "dotnetcore3.1": "2023-04-03",
  "dotnetcore2.1": "2022-01-05",
  "dotnetcore2.0": "2019-05-30",
  "dotnetcore1.0": "2019-06-27",
  "ruby4.0": "2029-03-31",
  "ruby3.4": "2028-03-31",
  "ruby3.3": "2027-03-31",
  "ruby3.2": "2026-03-31",
  "ruby2.7": "2023-12-07",
  "ruby2.5": "2021-07-30",
  "provided.al2023": "2029-06-30",
  "provided.al2": "2026-07-31",
  provided: "2024-01-08",
  "go1.x": "2024-01-08",
};

/** Previews: not covered by the Lambda SLA or support, and not for production. */
const PREVIEW = new Set(["nodejs26.x", "python3.15"]);

export type RuntimeState = "supported" | "approaching" | "deprecated" | "preview" | "unknown";

export interface RuntimeStatus {
  state: RuntimeState;
  /** When support ends (or ended), if the table has it. */
  deprecationDate: string | null;
}

const APPROACHING_DAYS = 180;

export function runtimeStatus(identifier: string, now: Date): RuntimeStatus {
  if (PREVIEW.has(identifier)) return { state: "preview", deprecationDate: null };
  const date = DEPRECATION[identifier];
  if (date === undefined) return { state: "unknown", deprecationDate: null };
  const ends = Date.parse(`${date}T00:00:00Z`);
  if (ends <= now.getTime()) return { state: "deprecated", deprecationDate: date };
  const days = (ends - now.getTime()) / 86_400_000;
  return { state: days <= APPROACHING_DAYS ? "approaching" : "supported", deprecationDate: date };
}
