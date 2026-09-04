# Phase 6 — Anime subtitle extraction

Secondary, off the critical path. Suggests anime timecodes; never places clips.

## `src/gfxorch/roughcut/subs.py`

- Walk `F:\anime\dragon_ball\<release>\` for `.mkv` / `.mp4`.
- Per file: `ffmpeg -i <ep> -map 0:s:0 -c:s srt roughcut/subs/<series>/<ep>.srt` (first subtitle stream; `[Eng Sub]` releases have English there).
- Parse the SRTs into a line index: `[{series, ep, start, end, text}]` → `roughcut/subs/index.json`.
- Optional: for each beat, keyword-search the index (holder / form / distinctive script phrases) and write the top few hits into `roughcut/overrides.yaml` as commented `clip:` suggestions for the editor to pull manually.

## ffmpeg

The Chocolatey ffmpeg is currently broken (`ffprobe.exe` missing). Use one of:
- `npx remotion ffmpeg` / `npx remotion ffprobe` (bundled with `@remotion/renderer`);
- `winget install Gyan.FFmpeg`.

Detect at runtime; fail with a clear message naming these options.

## Verification

`gfxorch roughcut subs` produces one `.srt` per episode and `index.json`; a spot-checked line's timecode matches the spoken line when the episode is opened at that time.
