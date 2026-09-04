# Phase 1 — VO transcription + script alignment

New subpackage `src/gfxorch/roughcut/`. Build artifacts under `04_make/hud_pipeline/roughcut/` (next to `events.yaml`).

## `transcribe.py`

- `faster-whisper` on `01_ingest/audio/EverytimeSomeoneSurpassesGoku.AaronMaywald.m4a`.
- Model `small.en`; `compute_type="int8"` on CPU, `"float16"` + CUDA if `torch`/GPU present.
- `word_timestamps=True`.
- Output `roughcut/transcript.json`: `{ "duration": <sec>, "words": [{ "word", "start", "end" }] }`.
- Cache: skip if `transcript.json` is newer than the audio file unless `--force`.

## `align.py`  (implemented)

- `parse_script(md)`: split on blank lines → paragraphs; drop `**Dragon Ball**` /
  `### **Dragon Ball Z**` headers but flip a `section` flag (`intro`/`DB`/`DBZ`);
  unescape markdown (`\!` → `!`).
- `align(paras, words)` — **anchor + interpolate**, robust to reworded/skipped lines:
  1. walk paragraphs in order; each searches the transcript *after the previous
     anchor* for the window with the most distinctive-word overlap (stopwords
     dropped so common tokens can't smear the match);
  2. a match with `conf ≥ 0.5` becomes an anchor and advances the cursor;
  3. non-anchored paragraphs are interpolated by cumulative word count between
     the surrounding anchors, and flagged `conf 0.0` for review.
- Output `script_timed.json`: `[{ idx, text, start, end, conf, section }]`.
- A plain "cursor that never goes backward" was tried first and fails on this
  script — the VO drops/rewords a few lines, which derails a strict pointer.

## Dependencies  (installed)

`pyproject.toml` `[project.optional-dependencies]`:

```toml
roughcut = [
    "faster-whisper>=1.0",
    "static-ffmpeg>=2.5",   # ships ffmpeg/ffprobe in-venv; system choco install is broken
]
```

`pip install -e ".[roughcut]"` into `.venv` (Python 3.12.10). Done. First
`transcribe` run downloads `small.en` (~460 MB) to the HF cache. CPU int8 by
default; set `GFXORCH_WHISPER_CUDA=1` for GPU float16.

## Verification

```
gfxorch roughcut transcribe
gfxorch roughcut align
```

- `transcript.json` `duration` ≈ VO length; first word `start` near 0, last word `end` near `duration`.
- every `script_timed.json` row has `start < end`; `start` values non-decreasing across `idx`.
- low-conf list is short (a handful at most).
