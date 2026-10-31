// Valid Fargate task CPU and memory combinations, from the ECS documentation "Amazon ECS task
// definition differences for Fargate" (Task CPU and memory), read on 2026-10-31.
const GiB = 1024;
const range = (fromGb: number, toGb: number, stepGb = 1): number[] => {
  const out: number[] = [];
  for (let g = fromGb; g <= toGb; g += stepGb) out.push(g * GiB);
  return out;
};

export const FARGATE: ReadonlyMap<number, readonly number[]> = new Map([
  [256, [512, 1 * GiB, 2 * GiB]],
  [512, range(1, 4)],
  [1024, range(2, 8)],
  [2048, range(4, 16)],
  [4096, range(8, 30)],
  [8192, range(16, 60, 4)],
  [16384, range(32, 120, 8)],
  [32768, [60 * GiB, 120 * GiB, 244 * GiB]],
]);

export function checkFargateSize(cpu: number, memoryMiB: number): string | null {
  const allowed = FARGATE.get(cpu);
  if (allowed === undefined)
    return `CPU ${cpu} is not a Fargate size. Valid values: ${[...FARGATE.keys()].join(", ")}.`;
  if (!allowed.includes(memoryMiB)) {
    const lo = allowed[0] ?? 0;
    const hi = allowed[allowed.length - 1] ?? 0;
    return `Memory ${memoryMiB} MiB is not valid with ${cpu} CPU units (allowed: ${lo} to ${hi} MiB${allowed.length > 3 ? " in the documented steps" : ""}).`;
  }
  return null;
}
