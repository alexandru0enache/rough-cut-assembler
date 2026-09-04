# roughcut_demo

Self-contained end-to-end run of the rough-cut assembler (`src/gfxorch/roughcut/`).

```
.venv\Scripts\python.exe roughcut_demo\run_demo.py
```

## What it does

| step | in | out |
|---|---|---|
| transcribe | `inputs/vo_clip.m4a` (first 130 s of the real VO, auto-trimmed) | `out/transcript.json` — word-level timings, faster-whisper `small.en` |
| align | `inputs/script.md` (24-line excerpt) + transcript | `out/script_timed.json` — each paragraph → `[start,end]`, with a match `conf` |
| beats | `inputs/events.demo.yaml` (2 reigns) + timed script | `out/beats.yaml` — one beat per paragraph, `kind: manga\|title`, optional `spec` (kept if you hand-edit it) |
| pages | beats + `inputs/overrides.yaml` + `F:\manga\...` | `out/timeline.json` + `out/pages/<beat id>/*.jpg` |

`out/beats.yaml` already carries two hand-written `spec` blocks and
`inputs/overrides.yaml` pins two beats to exact ch. 4 pages — delete `out/beats.yaml`
to re-seed from scratch. `.cbr` chapters are extracted once into `out/cbr_cache/` via 7-Zip.

Direction-pass helpers (on `gfxorch`, not `run_demo.py`):

```
gfxorch roughcut direct inputs/events.demo.yaml --out out --report   # list undirected beats
gfxorch roughcut direct inputs/events.demo.yaml --out out            # add blank spec skeletons
```

First run downloads the `small.en` model (~460 MB) and transcribes on CPU
(~15–40 s). Re-runs are instant — every step caches.

## Render it (Phase 4)

```
cd ../remotion
npm run roughcut                       # sync this demo timeline + render out/roughcut.mp4
npm run roughcut:render -- --out ../roughcut_demo/out/roughcut.mp4 --quality med
```

`RoughCut.tsx` turns `timeline.json` into a watchable MP4: manga Ken-Burns +
script captions (top) + the power-streak card per beat + a slate header and
timecode. The VO is transcoded to AAC and played for review sync.

## Notes

- `inputs/script.md` deliberately keeps one line the narrator never actually
  says ("when in reality, he's rarely even..."). The aligner flags it
  `conf 0.00` and pins it between its neighbours instead of derailing —
  that's the drift-tolerance test.
- `inputs/vo_clip.m4a` is generated on first run; delete it to re-trim.
- Point the same code at the real project by swapping `REAL_VO`, `SCRIPT`,
  `EVENTS`, `MANGA_ROOT` in `run_demo.py`, or use the CLI directly:
  `gfxorch roughcut transcribe|align|beats|pages --out <dir> ...`
- `out/` is disposable — delete it to start clean.
