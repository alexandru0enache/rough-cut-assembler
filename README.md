# rough-cut-assembler

Automated rough-cut assembler for the Dragon Ball videos. Turns a recorded
VO + the script + the manga / render / anime libraries into a **timed edit
blueprint** (`timeline.json`), a watchable **Remotion rough cut**, and the
episode's **motion graphics** (power-streak card, scouter HUD).

The package and CLI are named **`assembler`** (through 2026-09-05 it was
`gfxorch`, kept from the original `gfx-orchestrator` tool that built these
graphics straight into DaVinci Resolve's Fusion compositor - see "History"
below). The repo itself has always been `rough-cut-assembler`.

Lives at `_pipeline/rough_cut_assembler/`, the local-build counterpart to
`_pipeline/cloud_pipeline/` (project orchestration). Per-video data stays in the
project at `04_make/hud_pipeline/events.yaml`.

## Pipeline

See **`docs/plans/video-assembler/00_overview.md`** for the full phase map.

```
assembler roughcut transcribe --out <dir> --audio vo.m4a        # faster-whisper -> transcript.json
assembler roughcut align      --out <dir> --script script.md    # -> script_timed.json
assembler roughcut beats      <events.yaml> --out <dir>         # -> beats.yaml (one beat / paragraph)
assembler roughcut direct     <events.yaml> --out <dir> --report  # shot-spec worklist
assembler roughcut pages      <events.yaml> --out <dir>         # -> timeline.json (+ manga/render pages)
assembler roughcut check      <events.yaml> --out <dir>         # validate the blueprint
assembler roughcut subs       --series DB,DBZ                   # build the anime subtitle index
assembler roughcut subs       --query "goku super saiyan"        # search it

assembler wiki build --wiki dragonball                          # local Fandom corpus -> SQLite FTS5
assembler wiki query "Ultra Divine Water King Piccolo"

# then in remotion/:
npm run roughcut            # sync timeline.json + render out/roughcut.mp4
```

`roughcut_demo/` runs the whole chain end-to-end against a 130 s VO clip:
`.venv\Scripts\python.exe roughcut_demo\run_demo.py`.

## Setup (Python 3.12 pinned - not yet verified on newer)

```
cd path/to/rough_cut_assembler     # the repo root (where pyproject.toml lives)
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -U pip
.venv\Scripts\python -m pip install -e ".[dev,roughcut,research]"
```

Node 24 for `remotion/` (`npm ci` there). 7-Zip must be installed (`.cbr` /
`.7z` unpacking); `static-ffmpeg` ships ffmpeg in the venv. Tesseract OCR +
the `[subs]` extra (`pgsrip`) for the anime subtitle index.

## Libraries (see `dragonball_db/config.py`; machine paths live in gitignored `paths.json`, override per-key via env)

`paths.json` lives in the `dragon_ball_database` repo (the DB owns the shared
config); the assembler reads it through `dragonball_db.config`. Override any
single key with a `DRAGONBALL_<NAME>` env var (falls back to the old
`ASSEMBLER_*` / `GFXORCH_*` names):

| what | `paths.json` key | env (falls back to old `ASSEMBLER_*` / `GFXORCH_*`) |
|---|---|---|
| character renders | `render_roots` (list) | `DRAGONBALL_RENDER_ROOTS` (`;`-sep) |
| manga pages | `manga_root` | `DRAGONBALL_MANGA_ROOT` |
| anime episodes | `anime_root` | `DRAGONBALL_ANIME_ROOT` |
| guidebook/art-book scans | `guidebook_root` | `DRAGONBALL_GUIDEBOOK_ROOT` |
| anime subtitle index | `~/.gfxorch/subs/` (fixed home) | `DRAGONBALL_SUBS_DIR` |
| wiki corpus | `~/.gfxorch/wiki/` (fixed home) | `DRAGONBALL_WIKI_DIR` |
| vision index | `~/.gfxorch/vision/` (fixed home) | `DRAGONBALL_VISION_DIR` |

On this machine the vision index's home is overridden to
`roughcut_out/vision/` via `DRAGONBALL_VISION_DIR` (the DB plus its `shots/`,
`frames/`, `cbr_cache/` working caches). That directory is gitignored, so the
DB is **not** in git — an earlier commit that tracked it was stripped
2026-10-18 to keep the repo pushable. Off-machine backup: the GitHub Release
asset `vision-db-2026-10-07`; a further copy sits under `F:\studio_cold`.
See `roughcut_out/README.md`.

### Demo / script paths (also not hardcoded)

`roughcut_demo/run_demo.py` takes `--vo <clip>` (or `DRAGONBALL_DEMO_VO`) for the
real voiceover and `--manga-root <dir>` (or `config.manga_root()`).
`scripts/dump_inputs.py` writes to `DRAGONBALL_NODE_INPUTS_OUT`, defaulting to
the repo root's `node_inputs.txt`.

## History

The tool started as `gfxorch` ("gfx-orchestrator"): build the power-streak /
scouter HUD cards directly into DaVinci Resolve's Fusion compositor via its
Python scripting bridge. That path (`fusion_builder.py`, `resolve_api.py`,
`theme.py`, `themes/`) was superseded by the Remotion renderer, which produces
the same graphics as ordinary rendered video files - and was deleted outright
2026-09-05 when the edit moved to Adobe Premiere + After Effects, which have no
Fusion/Resolve bridge to target. It's recoverable from git history if a
live-Fusion-node workflow is ever wanted again. See
`docs/plans/rename-to-assembler/` for the full rationale.
