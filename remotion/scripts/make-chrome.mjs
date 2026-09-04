// Generates public/chrome.svg - a placeholder card chrome (body + gold border
// + chevron) at a fixed spot on the 1920x1080 frame. Replace public/chrome.png
// with your AE export and point theme.chrome at it; this is just so the
// pipeline runs before that exists.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// --- card geometry, in 1920x1080 canvas px ---
const CARD = { x: 150, top: 812, w: 980, h: 188, slant: 40, chevron: 66, stroke: 10, radius: 16 };

// rounded parallelogram-with-chevron path (chevron tip stays sharp)
function cardPath(w, h, slant, chevron, r) {
  const pts = [
    [slant, 0],
    [w - chevron, 0],
    [w, h / 2],
    [w - chevron, h],
    [0, h],
  ];
  const round = [true, true, false, true, true];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const mul = (a, s) => [a[0] * s, a[1] * s];
  const len = (a) => Math.hypot(a[0], a[1]);
  const norm = (a) => mul(a, 1 / (len(a) || 1));
  let d = "";
  for (let i = 0; i < pts.length; i++) {
    const v = pts[i];
    const p = pts[(i - 1 + pts.length) % pts.length];
    const n = pts[(i + 1) % pts.length];
    if (!round[i]) {
      d += `${i === 0 ? "M" : "L"} ${v[0]},${v[1]} `;
      continue;
    }
    const rr = Math.min(r, len(sub(p, v)) / 2, len(sub(n, v)) / 2);
    const a = add(v, mul(norm(sub(p, v)), rr));
    const b = add(v, mul(norm(sub(n, v)), rr));
    d += `${i === 0 ? "M" : "L"} ${a[0]},${a[1]} Q ${v[0]},${v[1]} ${b[0]},${b[1]} `;
  }
  return d + "Z";
}

const local = cardPath(CARD.w, CARD.h, CARD.slant, CARD.chevron, CARD.radius);
// same path translated into 1920x1080 canvas coords (for the component's clip)
const canvasPath = cardPath(CARD.w, CARD.h, CARD.slant, CARD.chevron, CARD.radius)
  .replace(/(-?\d+(\.\d+)?),(-?\d+(\.\d+)?)/g, (_, x, _2, y) =>
    `${(+x + CARD.x).toFixed(1)},${(+y + CARD.top).toFixed(1)}`,
  );

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <g transform="translate(${CARD.x},${CARD.top})">
    <path d="${local}" fill="#0c1728"/>
    <path d="${local}" fill="none" stroke="#ffce2b" stroke-width="${CARD.stroke}" stroke-linejoin="round"/>
  </g>
</svg>
`;

mkdirSync(resolve(ROOT, "public"), { recursive: true });
writeFileSync(resolve(ROOT, "public", "chrome.svg"), svg);
writeFileSync(
  resolve(ROOT, "src", "chrome.meta.json"),
  JSON.stringify(
    { x: CARD.x, y: CARD.top, w: CARD.w, h: CARD.h, slant: CARD.slant, path: canvasPath },
    null,
    2,
  ),
);
console.log(`wrote public/chrome.svg + src/chrome.meta.json  (card x ${CARD.x}..${CARD.x + CARD.w}, y ${CARD.top}..${CARD.top + CARD.h})`);
