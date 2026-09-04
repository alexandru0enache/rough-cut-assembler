/** One HUD card's data - produced by scripts/sync-data.mjs from events.yaml. */
export interface CardData {
  id: string;
  series: "DB" | "DBZ";
  nameplate: string;
  counter: string; // "121 CHAPTERS" or ""
  metric: string; // "62% of DB" / power level / range
  barFill: number; // 0..1
  chapters: number; // for the count-up
  disputed: boolean;
  portraitSrc: string | null;
}

/** Replace the leading integer of `text` with `Math.round(t * n)` for a count-up. */
export function countUp(text: string, n: number, t: number): string {
  if (!text) return text;
  return text.replace(/^\d+/, () => String(Math.round(t * n)));
}
