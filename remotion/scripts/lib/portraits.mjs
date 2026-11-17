// Fuzzy character-render resolver, shared by sync-data.mjs and sync-timeline.mjs.
// Port of roughcut/portraits.py: match an events.yaml `portrait:` hint to a file
// in the render libraries by token overlap, with a small alias table.
import { existsSync, readdirSync } from "node:fs";
import { basename, extname, join } from "node:path";

const EXTS = new Set([".png", ".webp", ".jpg", ".jpeg"]);

const STOP = new Set(
  "render renders art official full hd 4k prev pre realesrgan x4plus upscale clean dokkan battle xkeeperz sdbh world mission legends kakarot fighterz budokai tenkaichi awakening extreme butoden bucchigiri match db dbz dbs the of and by vs png webp jpg jpeg no bg nobg cutout".split(
    " ",
  ),
);
const ALIAS = {
  ssj: ["super", "saiyan"],
  ssj1: ["super", "saiyan"],
  ssj2: ["super", "saiyan", "2"],
  ssj3: ["super", "saiyan", "3"],
  ult: ["ultimate", "mystic"],
  ultimate: ["mystic"],
  kid: ["child", "young"],
  fat: ["majin"],
  final: ["100"],
  scouter: ["saiyan", "saga"],
  teen: ["adult"],
  gohan: ["son"],
  goku: ["son", "kakarot"],
  trunks: ["future"],
};

const tok = (s) => String(s).toLowerCase().match(/[a-z0-9]+/g) || [];
const hintTokens = (h) => {
  const out = new Set();
  for (const x of tok(h)) {
    out.add(x);
    (ALIAS[x] || []).forEach((a) => out.add(a));
  }
  return new Set([...out].filter((x) => !STOP.has(x)));
};
const fileTokens = (n) => new Set(tok(n).filter((x) => !STOP.has(x)));

export function makeResolver(renderRoots) {
  let INDEX = null;
  const index = () => {
    if (INDEX) return INDEX;
    INDEX = [];
    for (const root of renderRoots) {
      if (!existsSync(root)) continue;
      for (const f of readdirSync(root)) {
        if (EXTS.has(extname(f).toLowerCase()))
          INDEX.push([join(root, f), fileTokens(basename(f, extname(f)))]);
      }
    }
    return INDEX;
  };

  const resolvePortrait = (hint) => {
    if (!hint) return null;
    if (hint.includes("/") || hint.includes("\\") || EXTS.has(extname(hint).toLowerCase())) {
      if (existsSync(hint)) return hint;
      for (const root of renderRoots) {
        const p = join(root, hint);
        if (existsSync(p)) return p;
      }
      return null;
    }
    const want = hintTokens(hint);
    const literal = new Set(tok(hint).filter((x) => !STOP.has(x)));
    if (!want.size) return null;
    const aliasCount = want.size - literal.size;
    let best = null;
    let bestScore = 0;
    for (const [p, ft] of index()) {
      let lit = 0;
      let ali = 0;
      for (const wt of want) {
        if (!ft.has(wt)) continue;
        if (literal.has(wt)) lit++;
        else ali++;
      }
      if (!lit) continue;
      const score = (lit * 2 + ali) / (literal.size * 2 + aliasCount);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  };

  return { resolvePortrait };
}

export const DEFAULT_RENDER_ROOTS = (
  process.env.ASSEMBLER_RENDER_ROOTS ||
  process.env.GFXORCH_RENDER_ROOTS ||
  "F:/assets/Assets/images/renders/db renders and others;F:/assets/Assets/images/renders/anime chars renders"
)
  .split(";")
  .filter(Boolean);
