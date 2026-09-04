// Parse events.yaml -> src/events.json (CardData[]) and copy resolved portrait
// PNGs into public/portraits/. Run before `remotion studio` / render.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

const EVENTS_YAML =
  process.env.EVENTS_YAML ||
  "E:/studio_root/projects/clients/dbype/production/discussions/every_time_someone_surpassed_goku/04_make/hud_pipeline/events.yaml";

const RENDER_ROOTS = (
  process.env.GFXORCH_RENDER_ROOTS ||
  "F:/assets/Assets/images/renders/db renders and others;F:/assets/Assets/images/renders/anime chars renders"
)
  .split(";")
  .filter(Boolean);

const PUB_PORTRAITS = join(ROOT, "public", "portraits");
const SRC_JSON = join(ROOT, "src", "events.json");
const PROPS_DIR = join(ROOT, "out", "props");
const EXTS = new Set([".png", ".webp", ".jpg", ".jpeg"]);

// event id -> exact filename, fills gaps the fuzzy matcher gets wrong
let OVERRIDES = {};
try {
  OVERRIDES = JSON.parse(readFileSync(join(ROOT, "portrait-overrides.json"), "utf8"));
} catch {
  /* optional */
}

// --- fuzzy portrait resolver (port of portraits.py) ------------------
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
const tok = (s) => (String(s).toLowerCase().match(/[a-z0-9]+/g) || []);
const hintTokens = (h) => {
  const out = new Set();
  for (const x of tok(h)) {
    out.add(x);
    (ALIAS[x] || []).forEach((a) => out.add(a));
  }
  return new Set([...out].filter((x) => !STOP.has(x)));
};
const fileTokens = (n) => new Set(tok(n).filter((x) => !STOP.has(x)));

let INDEX = null;
const index = () => {
  if (INDEX) return INDEX;
  INDEX = [];
  for (const root of RENDER_ROOTS) {
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
    for (const root of RENDER_ROOTS) {
      const p = join(root, hint);
      if (existsSync(p)) return p;
    }
    return null;
  }
  const want = hintTokens(hint); // alias-expanded
  const literal = new Set(tok(hint).filter((x) => !STOP.has(x))); // pre-expansion
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
    if (!lit) continue; // must match at least one literal (unexpanded) token
    const score = (lit * 2 + ali) / (literal.size * 2 + aliasCount);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
};

// --- string derivation (mirrors data.ts / old fusion_builder) --------
const DIS = "  *";
const toCard = (e, portraitSrc) => {
  let np = e.holder;
  if (e.co_holder) np = `${e.holder}  /  ${e.co_holder}`;
  if (e.form) np = `${np} ${e.form}`;
  if (e.disputed) np = `${np}${DIS}`;
  const counter = e.reign_chapters ? `${e.reign_chapters} CHAPTERS` : "";
  const metric =
    e.metric_right ??
    e.power_level ??
    (e.chapter_start != null ? `ch. ${e.chapter_start}-${e.chapter_end ?? "?"}` : "");
  return {
    id: e.id,
    series: e.series,
    nameplate: np,
    counter,
    metric,
    barFill: Number(e.bar_fill ?? 0),
    chapters: Number(e.reign_chapters ?? 0),
    disputed: Boolean(e.disputed),
    portraitSrc,
  };
};

// --- run ------------------------------------------------------------
const doc = yaml.load(readFileSync(EVENTS_YAML, "utf8"));
const defaults = doc.defaults || {};
mkdirSync(PUB_PORTRAITS, { recursive: true });
mkdirSync(PROPS_DIR, { recursive: true });

let matched = 0;
let missing = 0;
const cards = (doc.events || []).map((raw) => {
  const e = { ...defaults, ...raw };
  let portraitSrc = null;
  const hint = OVERRIDES[e.id] || e.portrait;
  const src = resolvePortrait(hint);
  if (src) {
    const ext = extname(src).toLowerCase();
    copyFileSync(src, join(PUB_PORTRAITS, `${e.id}${ext}`));
    portraitSrc = `portraits/${e.id}${ext}`;
    matched++;
  } else if (e.portrait) {
    console.warn(`  [portrait] no match: ${e.id} <- "${e.portrait}"`);
    missing++;
  }
  const card = toCard(e, portraitSrc);
  writeFileSync(join(PROPS_DIR, `${e.id}.json`), JSON.stringify({ card }, null, 2));
  return card;
});

writeFileSync(SRC_JSON, JSON.stringify({ meta: doc.meta || {}, cards }, null, 2));
console.log(
  `sync: ${cards.length} cards -> src/events.json | portraits ${matched} matched, ${missing} missing`,
);
