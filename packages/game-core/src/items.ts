import type { ItemId } from "@raceball/shared";

/**
 * Chance of each item from an item box, in percent, by race position: the leader, the last two,
 * and everyone between. Tune after playtests.
 */
export const ITEM_ODDS: Record<
  "first" | "middle" | "last",
  Partial<Record<ItemId, number>>
> = {
  first: { boost: 20, roar: 40, spill: 40 },
  middle: { boost: 45, roar: 35, spill: 20 },
  last: { boost: 50, roar: 20, snowday: 30 },
};

/** Which row of ITEM_ODDS a place uses. With two players, second counts as last */
export function oddsRow(
  place: number,
  players: number,
): keyof typeof ITEM_ODDS {
  if (place <= 1) return "first";
  if (place >= players - 1) return "last";
  return "middle";
}

/** One item, drawn by the odds for this place. random returns 0 … 1, like Math.random */
export function rollItem(
  place: number,
  players: number,
  random: () => number,
): ItemId {
  const odds = Object.entries(ITEM_ODDS[oddsRow(place, players)]) as [
    ItemId,
    number,
  ][];
  const total = odds.reduce((sum, [, w]) => sum + w, 0);
  let r = random() * total;
  for (const [item, weight] of odds) {
    if (r < weight) return item;
    r -= weight;
  }
  return odds[odds.length - 1][0];
}
