import data from "../data/prices.us-east-1.json" with { type: "json" };

export interface Tier {
  /** Cumulative upper bound of this tier in the price's unit; null for the last tier. */
  upTo: number | null;
  price: number;
}

export interface PriceItem {
  unit: string;
  description: string;
  tiers: Tier[];
  offer: string;
  usagetype: string;
  publicationDate: string;
}

interface Snapshot {
  source: string;
  region: string;
  retrieved: string;
  note: string;
  prices: Record<string, PriceItem>;
}

const snapshot = data as Snapshot;

export const PRICE_SOURCE = snapshot.source;
export const PRICE_REGION = snapshot.region;
export const PRICE_RETRIEVED = snapshot.retrieved;
export const PRICE_NOTE = snapshot.note;

export function priceOf(key: string): PriceItem {
  const item = snapshot.prices[key];
  if (item === undefined) throw new Error(`No price for ${key}`);
  return item;
}

/** The latest publication date among the prices used, as YYYY-MM-DD. */
export function rateDate(keys: readonly string[]): string {
  return (
    keys
      .map((key) => priceOf(key).publicationDate.slice(0, 10))
      .sort()
      .at(-1) ?? PRICE_RETRIEVED
  );
}

/** Cost of `quantity` units walked through the tiers, as the price list defines them. */
export function tieredCost(
  item: PriceItem,
  quantity: number,
): { total: number; averagePrice: number } {
  let remaining = quantity;
  let previous = 0;
  let total = 0;
  for (const tier of item.tiers) {
    const size = tier.upTo === null ? remaining : Math.min(remaining, tier.upTo - previous);
    if (size > 0) total += size * tier.price;
    remaining -= Math.max(size, 0);
    previous = tier.upTo ?? previous;
    if (remaining <= 0) break;
  }
  return { total, averagePrice: quantity > 0 ? total / quantity : (item.tiers[0]?.price ?? 0) };
}
