// Render the <RoughCut> composition to an H.264 MP4 for review.
//   node scripts/render-roughcut.mjs [--out <path>] [--quality low|med|high]
// Assumes scripts/sync-timeline.mjs has already written src/roughcut.json.
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const OUT = resolve(opt("--out", join(ROOT, "out", "roughcut.mp4")));
const CRF = { low: 32, med: 24, high: 20 }[opt("--quality", "med")] ?? 24;
const SCALE = Number(opt("--scale", "1")) || 1;

mkdirSync(dirname(OUT), { recursive: true });
console.log("bundling ...");
const serveUrl = await bundle({ entryPoint: join(ROOT, "src", "index.ts") });

const composition = await selectComposition({ serveUrl, id: "RoughCut" });
console.log(`rendering RoughCut  ${composition.width}x${composition.height}  ${composition.durationInFrames}f @ ${composition.fps}fps  -> ${OUT}`);

await renderMedia({
  composition,
  serveUrl,
  codec: "h264",
  crf: CRF,
  scale: SCALE,
  outputLocation: OUT,
  onProgress: ({ progress }) => {
    process.stdout.write(`\r  ${(progress * 100).toFixed(0)}%   `);
  },
});
console.log(`\ndone -> ${OUT}`);
