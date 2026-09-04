# Phase 4 — Rough-cut render (Remotion)  ✅ implemented

Files: `remotion/scripts/sync-timeline.mjs`, `remotion/src/RoughCut.tsx`,
`remotion/scripts/render-roughcut.mjs`, `remotion/src/roughcut.json` (generated),
`remotion/src/Root.tsx` (registers `RoughCut`), `remotion/package.json`
(`roughcut` / `roughcut:sync` / `roughcut:render`).

Run: `npm run roughcut` (defaults to the demo timeline) or
`npm run roughcut:sync -- --timeline <path> --events <path>` then
`npm run roughcut:render -- --out <mp4> [--quality low|med|high] [--scale 0.5]`.

Deviations from the spec below, made for a genuinely watchable review cut:
- **`<Sequence from={beat.start}>` per beat, not `<Series>`** — beats have gaps
  (one ends before the next starts) and absolute positions; Series can't express that.
- **Captions ride the top third**, not a lower-third — keeps them clear of the
  card, which sits bottom-left.
- **Audio is on by default.** `sync-timeline.mjs` transcodes the VO to AAC
  (the source is ALAC, which Remotion's ffmpeg can't decode) into
  `public/roughcut/audio.m4a`. `--no-audio` to drop it. The final edit's audio
  still lives in Resolve; this is preview sync only.
- Footer: a thin progress bar + `m:ss / m:ss` timecode for orientation.

---


## `remotion/scripts/sync-timeline.mjs`

- Read `04_make/hud_pipeline/roughcut/timeline.json`.
- Copy every referenced page from `roughcut/build/pages/` → `remotion/public/roughcut/pages/`.
- Reuse `sync-data.mjs`'s `events.yaml` → card-props path so each beat's card matches the standalone card render. Write `remotion/src/roughcut.json` = `timeline.json` + a `cards` map keyed by event id.

## `remotion/src/RoughCut.tsx`

One composition, `durationInFrames` from `roughcut.json`, `fps` 30, 1920×1080.

`<Series>` over `beats`, each segment `durationInFrames = end - start`:

- **manga beat**: for each page, an `<Img>` sub-`<Sequence>` covering its slice of the beat, with a slow Ken-Burns (`interpolate` scale 1.0→1.06 + a few px pan).
- **caption**: current `captions[]` entry as burned-in lower-third text, timed to its `start`/`end`.
- **card**: `<PowerStreakCard>` (imported as-is) fed `roughcut.json.cards[beat.card]`, mounted at a fixed offset inside the beat (e.g. beat start + 12f), for its own default duration.
- **slate header**: small top-left mono text — `dbz_03_frieza · ch. 53 · 0:42–1:08`.
- **slate beat** (`kind: "slate"`): full-frame dark card with the beat's script text + duration, no imagery.

No `<Audio>` — VO stays in Resolve.

## `remotion/src/Root.tsx`

Register `RoughCut`, reading `roughcut.json` for dimensions/duration. Keep existing compositions.

## `remotion/scripts/render-roughcut.mjs`

- `bundle` + `renderMedia`, `codec: "h264"`, CRF ~23, into `04_make/hud_pipeline/roughcut/build/roughcut.mp4`.
- `remotion/package.json`: `"roughcut": "node scripts/sync-timeline.mjs && node scripts/render-roughcut.mjs"`.

## Verification

`npm run roughcut` → `roughcut.mp4` plays. Spot-check 3 beats (one DB, one Cell-era, one Buu-era):
- caption wording matches what the VO says at that timecode (open the `.m4a` alongside);
- the correct power-streak card shows;
- manga pages are from the right arc.
