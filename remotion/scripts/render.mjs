// Render one ProRes 4444 (alpha) .mov per card into out/cards/.
// Usage: node scripts/render.mjs [eventId]
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const { cards } = JSON.parse(readFileSync(join(ROOT, "src", "events.json"), "utf8"));
if (!cards.length) {
  console.error("no cards in src/events.json - run `npm run sync` first");
  process.exit(1);
}

const only = process.argv[2];
const list = only ? cards.filter((c) => c.id === only) : cards;
if (only && !list.length) {
  console.error(`no card with id "${only}"`);
  process.exit(1);
}

const OUT = join(ROOT, "out", "cards");
mkdirSync(OUT, { recursive: true });

console.log("bundling ...");
const serveUrl = await bundle({ entryPoint: join(ROOT, "src", "index.ts") });

for (const card of list) {
  const composition = await selectComposition({
    serveUrl,
    id: "PowerStreakCard",
    inputProps: { card },
  });
  const outputLocation = join(OUT, `${card.id}.mov`);
  await renderMedia({
    composition,
    serveUrl,
    codec: "prores",
    proResProfile: "4444",
    pixelFormat: "yuva444p10le",
    imageFormat: "png",
    inputProps: { card },
    outputLocation,
  });
  console.log("  rendered", outputLocation);
}
console.log(`done: ${list.length} card(s) -> ${OUT}`);
