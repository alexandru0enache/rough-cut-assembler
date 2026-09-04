# rough-cut-assembler

Automated rough-cut assembler for the DBYPE Dragon Ball videos. Turns a recorded
VO + the script + the manga / render / anime libraries into a **timed edit
blueprint** (`timeline.json`), a watchable **Remotion rough cut**, and the
episode's **motion graphics** (power-streak card, scouter HUD).

The package and CLI are named **`gfxorch`** (kept from the original
`gfx-orchestrator`; renaming would ripple through every module, test and script).

Lives at `dbype/_pipeline/rough_cut_assembler/`, the local-build counterpart to
`_pipeline/cloud_pipeline/` (project orchestration). Per-video data stays in the
project at `04_make/hud_pipeline/events.yaml`.

## Pipeline

See **`docs/plans/video-assembler/00_overview.md`** for the full phase map.

```
gfxorch roughcut transcribe --out <dir> --audio vo.m4a        # faster-whisper -> transcript.json
gfxorch roughcut align      --out <dir> --script script.md    # -> script_timed.json
gfxorch roughcut beats      <events.yaml> --out <dir>         # -> beats.yaml (one beat / paragraph)
gfxorch roughcut direct     <events.yaml> --out <dir> --report  # shot-spec worklist
gfxorch roughcut pages      <events.yaml> --out <dir>         # -> timeline.json (+ manga/render pages)
gfxorch roughcut check      <events.yaml> --out <dir>         # validate the blueprint

gfxorch wiki build --wiki dragonball                          # local Fandom corpus -> SQLite FTS5
gfxorch wiki query "Ultra Divine Water King Piccolo"

# then in remotion/:
npm run roughcut            # sync timeline.json + render out/roughcut.mp4
```

`roughcut_demo/` runs the whole chain end-to-end against a 130 s VO clip:
`.venv\Scripts\python.exe roughcut_demo\run_demo.py`.

## Setup (Python 3.12 — Resolve's bridge ceiling; 3.14 unsupported)

```
cd E:\studio_root\projects\clients\dbype\_pipeline\rough_cut_assembler
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -U pip
.venv\Scripts\python -m pip install -e ".[dev,roughcut,research]"
```

Node 24 for `remotion/` (`npm ci` there). 7-Zip must be installed (`.cbr` /
`.7z` unpacking); `static-ffmpeg` ships ffmpeg in the venv.

## Libraries (see `src/gfxorch/config.py`, override via env)

| what | default | env |
|---|---|---|
| character renders | `F:\assets\Assets\images\renders\...` | `GFXORCH_RENDER_ROOTS` (`;`-sep) |
| manga pages | `F:\manga\dragon_ball\Dragon Ball + Super [Complete Manga]` | `GFXORCH_MANGA_ROOT` |
| anime episodes | `F:\anime\dragon_ball` | `GFXORCH_ANIME_ROOT` |
| wiki corpus | `~/.gfxorch/wiki/` | `GFXORCH_WIKI_DIR` |

## Legacy: Fusion HUD builder

The original purpose — `model.py` + `fusion_builder.py` + `themes/` +
`resolve_api.py` building HUD cards straight into DaVinci Resolve Fusion via the
scripting bridge (`gfxorch build --dry-run` / `--only <id>`, `gfxorch doctor`).
Superseded by the Remotion renderer; still present and tested against the
in-memory `RecordingComp`, never validated live in Resolve.
