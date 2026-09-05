# Rough-cut assembler — overview

## Context

The video "Every time someone surpassed Goku" has all raw materials but nothing assembled.

| Material | Location |
|---|---|
| VO (read from script, ~13 min) | `01_ingest/audio/EverytimeSomeoneSurpassesGoku.AaronMaywald.m4a` |
| Script (~90 blank-line sentences, DB / DBZ headers) | `01_ingest/script/Copy of Every time someone surpassed Goku (preview).md` |
| Reign data — 33 events + 2 tally grids | `04_make/hud_pipeline/events.yaml` |
| Power-streak HUD card (ProRes+alpha) | `remotion/src/PowerStreakCard.tsx` |
| Parametric scouter HUD | `remotion/src/scouter/Scouter.tsx` |
| Manga pages per chapter (`NNN.jpg`, continuous numbering) | `F:\manga\dragon_ball\Dragon Ball + Super [Complete Manga]\<NN Arc>\Chapter <N> - <Title>\` |
| Anime episodes, `[Eng Sub]` MKV/MP4 | `F:\anime\dragon_ball\<release>\` |
| Existing fact-check (49 claims, sourced, 23–24 Aug 2026) | `notes/fact_check_report.html` |

`02_edit/` is empty — no cut started.

Chapter numbering: DB = VIZ continuous; DBZ = "Z restarts at 1" with `continuous_offset: 194` (so DBZ ch.53 = manga ch.247).

## Goal

Automate the mechanical ~50% of the edit: transcribe the VO, find where each of the 33 reigns lands on the timeline, block out graphic-card timing, drop representative manga pages per beat. The editor starts from a timed rough cut instead of a blank timeline. Taste 50% (exact trims, which shot, feel, sound) stays manual.

## Decisions locked

- Transcription: **automated (faster-whisper)**.
- Tool home: `dbype/_pipeline/rough_cut_assembler/` (`src/assembler/roughcut/`); package/command renamed `gfxorch` → `assembler` 2026-09-05, see `docs/plans/rename-to-assembler/`.
- Fact-check: research pass over the local Fandom corpus (`assembler wiki`, Phase 9), Kanzenshuu for targeted lookups.
- v1 video track: manga pages keyed by chapter + slates. Screen recordings / anime clips are **not** auto-placed.

## Phase order

| # | Phase | File | Status |
|---|---|---|---|
| 0 | Per-sentence fact-check | [01_factcheck.md](01_factcheck.md) | **done** — `notes/fact_check_report.html`, 186 rows |
| 1 | VO transcription + script alignment | [02_transcribe_align.md](02_transcribe_align.md) | **done** — `roughcut/{transcribe,align}.py`, verified in demo |
| 2 | Beat map (`beats.yaml`) | [03_beats_pages.md](03_beats_pages.md) | **done** — `roughcut/beats.py` (auto-seed + load) |
| 3 | Manga page selection (`timeline.json`) | [03_beats_pages.md](03_beats_pages.md) | **done** — `roughcut/{pages,cbr}.py`, `.cbr` via 7-Zip |
| 4 | Rough-cut render (Remotion) | [04_roughcut_render.md](04_roughcut_render.md) | **done** — `RoughCut.tsx` + `sync-timeline.mjs` + `render-roughcut.mjs` |
| 5 | Timeline hand-off to the edit app (was "Resolve FCPXML", target is now Premiere) | [05_resolve_export.md](05_resolve_export.md) | after v1 trusted |
| 6 | Anime subtitle index (Layer 2) | [06_anime_subs.md](06_anime_subs.md) | **done** — `roughcut/subs.py` + `roughcut subs` build/query; all 619 TV episodes + movies OCR'd/indexed 2026-09-05 |
| 7 | Direction pass (shot specs) | [07_direction_pass.md](07_direction_pass.md) | **done** — `spec` blocks in beats.yaml, `roughcut direct`, `overrides.yaml`, spec chips in the cut |
| 8 | Hardening | [08_hardening.md](08_hardening.md) | **done** — `roughcut check`, `tests/test_roughcut.py` (15), page cursor, rules-block titles, `render:` source, card portraits |
| 9 | Local research corpus | [09_research_corpus.md](09_research_corpus.md) | **done** — `assembler wiki build/query/get`, 9,541-article SQLite FTS5 from the Fandom dump |

Demo: `roughcut_demo/` runs Phases 1–3 end-to-end against a 130 s VO clip +
24-line script excerpt → `roughcut_demo/out/timeline.json`. `python roughcut_demo/run_demo.py`,
then `assembler roughcut check <events> --out roughcut_demo/out`.

## CLI surface

Extend `src/assembler/cli.py` with a `roughcut` group:

```
assembler roughcut transcribe     # Phase 1
assembler roughcut align          # Phase 1
assembler roughcut beats          # Phase 2  (seed beats.yaml)
assembler roughcut pages          # Phase 3  (-> timeline.json)
assembler roughcut subs           # Phase 6  (build the anime subtitle index)
assembler roughcut subs --query "..."   # Phase 6  (search it)
```

`remotion/package.json`: `npm run roughcut` = `sync-timeline.mjs` + `render-roughcut.mjs`.

## Files touched

| Path | Change |
|---|---|
| `notes/fact_check_report.html` | rewrite — per-sentence, sourced (Phase 0) |
| `src/assembler/roughcut/{__init__,transcribe,align,beats,pages,subs}.py` | new subpackage |
| `src/assembler/cli.py` | add `roughcut` command group |
| `pyproject.toml` | `[roughcut]` optional dep = `faster-whisper` |
| `04_make/hud_pipeline/roughcut/` | new build dir — see phase files |
| `remotion/scripts/{sync-timeline,render-roughcut,edl-export}.mjs` | new |
| `remotion/src/RoughCut.tsx`, `remotion/src/Root.tsx` | new composition + registration |
| `remotion/package.json` | `roughcut` script |

## Reused, not rebuilt

- `remotion/scripts/sync-data.mjs` — `events.yaml` parse + card-prop derivation + portrait resolver. `sync-timeline.mjs` calls the same path so cards stay consistent.
- `remotion/src/PowerStreakCard.tsx` — dropped into `RoughCut.tsx` as-is.
- `src/assembler/model.py` / `config.py` — event loading, render-root config.

## Boundaries

- Ken-Burns manga pages are a legible stand-in for a real edit, not a finished look.
- Phase 6 only *suggests* anime timecodes; it never places clips.
- No audio track in the Remotion rough cut — the VO stays in the edit app (Premiere).
