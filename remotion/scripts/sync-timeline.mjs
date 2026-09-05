// Rough-cut sync: pull a roughcut/timeline.json + its events.yaml into the
// Remotion project. Copies the manga pages into public/roughcut/, copies the
// VO next to them, derives PowerStreakCard props from the events file, and
// writes src/roughcut.json for <RoughCut> to read.
//
//   node scripts/sync-timeline.mjs
//     [--timeline <path>]   default: ../roughcut_demo/out/timeline.json
//     [--events   <path>]   default: ../roughcut_demo/inputs/events.demo.yaml
//     [--pages-root <dir>]  where the timeline's relative page paths resolve
//                           (default: dirname of --timeline)
//     [--no-audio]          skip copying the VO
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { DEFAULT_RENDER_ROOTS, makeResolver } from "./lib/portraits.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const flag = (name) => argv.includes(name);

const TIMELINE = resolve(opt("--timeline", resolve(ROOT, "../roughcut_demo/out/timeline.json")));
const EVENTS = resolve(opt("--events", resolve(ROOT, "../roughcut_demo/inputs/events.demo.yaml")));
const PAGES_ROOT = resolve(opt("--pages-root", dirname(TIMELINE)));
const PUB = join(ROOT, "public", "roughcut");

if (!existsSync(TIMELINE)) {
  console.error(`no timeline.json at ${TIMELINE} - run the roughcut pipeline first`);
  process.exit(1);
}
const tl = JSON.parse(readFileSync(TIMELINE, "utf8"));

// --- card props from events.yaml (mirror of sync-data.mjs toCard) --------
const { resolvePortrait } = makeResolver(DEFAULT_RENDER_ROOTS);
const DIS = "  *";
const toCard = (e) => {
  let np = e.holder;
  if (e.co_holder) np = `${e.holder}  /  ${e.co_holder}`;
  if (e.form) np = `${np} ${e.form}`;
  if (e.disputed) np = `${np}${DIS}`;
  const metric =
    e.metric_right ??
    e.power_level ??
    (e.chapter_start != null ? `ch. ${e.chapter_start}-${e.chapter_end ?? "?"}` : "");

  let portraitSrc = null;
  const src = resolvePortrait(e.portrait);
  if (src) {
    const ext = extname(src).toLowerCase();
    const dst = join(PUB, "portraits", `${e.id}${ext}`);
    mkdirSync(dirname(dst), { recursive: true });
    if (!existsSync(dst) || statSync(dst).size !== statSync(src).size) copyFileSync(src, dst);
    portraitSrc = `roughcut/portraits/${e.id}${ext}`;
  }
  return {
    id: e.id,
    series: e.series,
    nameplate: np,
    counter: e.reign_chapters ? `${e.reign_chapters} CHAPTERS` : "",
    metric,
    barFill: Number(e.bar_fill ?? 0),
    chapters: Number(e.reign_chapters ?? 0),
    disputed: Boolean(e.disputed),
    portraitSrc,
  };
};

const evDoc = yaml.load(readFileSync(EVENTS, "utf8"));
const defaults = evDoc.defaults || {};
mkdirSync(PUB, { recursive: true });
const cards = {};
let withPortrait = 0;
for (const raw of evDoc.events || []) {
  const e = { ...defaults, ...raw };
  cards[e.id] = toCard(e);
  if (cards[e.id].portraitSrc) withPortrait++;
}

// --- copy pages -------------------------------------------------------
mkdirSync(PUB, { recursive: true });
let copied = 0;
let missing = 0;
for (const beat of tl.beats) {
  for (const rel of beat.pages || []) {
    const src = join(PAGES_ROOT, rel);
    const dst = join(PUB, rel);
    if (!existsSync(src)) {
      missing++;
      continue;
    }
    mkdirSync(dirname(dst), { recursive: true });
    if (!existsSync(dst) || statSync(dst).size !== statSync(src).size) {
      copyFileSync(src, dst);
      copied++;
    }
  }
}

// --- transcode the VO to AAC for preview playback -------------------
// The source VO is often ALAC (Apple Lossless), which Remotion's bundled
// ffmpeg can't decode - re-encode to plain AAC once.
function findFfmpeg() {
  const env = process.env.ASSEMBLER_FFMPEG || process.env.GFXORCH_FFMPEG;
  if (env && existsSync(env)) return env;
  const staticFf = resolve(ROOT, "../.venv/Lib/site-packages/static_ffmpeg/bin/win32/ffmpeg.EXE");
  if (existsSync(staticFf)) return staticFf;
  return "ffmpeg";
}

let audioPublic = null;
if (!flag("--no-audio") && tl.audio && existsSync(tl.audio)) {
  const dst = join(PUB, "audio.m4a");
  const srcMtime = statSync(tl.audio).mtimeMs;
  if (!existsSync(dst) || statSync(dst).mtimeMs < srcMtime) {
    try {
      execFileSync(findFfmpeg(), ["-y", "-loglevel", "error", "-i", tl.audio, "-c:a", "aac", "-b:a", "160k", dst], {
        stdio: "inherit",
      });
    } catch (err) {
      console.warn(`  ! audio transcode failed (${err.message}) - continuing without audio`);
    }
  }
  if (existsSync(dst)) audioPublic = "roughcut/audio.m4a";
}

// --- emit src/roughcut.json ----------------------------------------
const out = {
  fps: tl.fps,
  durationInFrames: tl.durationInFrames,
  audioPublic,
  beats: tl.beats,
  cards,
};
writeFileSync(join(ROOT, "src", "roughcut.json"), JSON.stringify(out, null, 2));

const cardless = tl.beats.filter((b) => b.card && !cards[b.card]).map((b) => b.card);
console.log(
  `roughcut sync: ${tl.beats.length} beats, ${copied} page(s) copied` +
    (missing ? `, ${missing} missing` : "") +
    `, audio ${audioPublic ? "on" : "off"}` +
    `, ${withPortrait}/${Object.keys(cards).length} cards w/ portrait` +
    (cardless.length ? `\n  ! no card props for: ${[...new Set(cardless)].join(", ")}` : ""),
);
