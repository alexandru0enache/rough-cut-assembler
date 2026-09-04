# Phase 5 — Resolve FCPXML hand-off

Second output. Build after v1 rough cut is trusted.

## `remotion/scripts/edl-export.mjs`

- Read `roughcut/timeline.json` + the rendered card `.mov`s in `remotion/out/cards/`.
- Emit `04_make/hud_pipeline/roughcut/roughcut.fcpxml`:
  - one `format` at 1920×1080 / 30 (or the project timeline rate);
  - a `resources` block referencing each selected manga page `.jpg` and each card `.mov`;
  - a single `sequence` / `spine`:
    - **V2**: manga page stills placed at each beat's `start`, each lasting `end - start` (or split per page);
    - **V3**: card `.mov`s at `beat start + offset`;
  - leave A1 empty — the user drops the VO there.
- FCPXML (not EDL) because EDL can't carry multiple video tracks or still images cleanly; Resolve 21 imports FCPXML 1.9/1.10.

## Verification

Import into a Resolve 21 timeline that already has the VO on A1 — page stills and cards land at the same timecodes as the Remotion rough cut (compare against `roughcut.mp4`).
