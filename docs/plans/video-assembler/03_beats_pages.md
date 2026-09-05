# Phases 2 & 3 — Beat map + manga page selection

## Phase 2 — `beats.py` → `roughcut/beats.yaml`

Auto-seed a mapping of script-paragraph ranges → `events.yaml` ids.

- Walk events in `order` (skip the two `grid_*` entries).
- For each event, keyword-match `holder` / `form` / arc terms against upcoming paragraphs in `script_timed.json`, advancing monotonically (an event's paragraphs must start at or after the previous event's).
- Emit `beats.yaml` for the user to correct by hand — **this is the file that most needs a human eye**:

```yaml
- event: dbz_03_frieza
  paras: [44, 45, 46, 47, 48]   # indices into script_timed.json
  chapters: [247, 250]          # continuous manga chapter span (optional; overrides events.yaml)
```

- Derived per event: `start` = min paragraph `start`, `end` = max paragraph `end`, converted to frames at the comp fps.

### Verification
All 33 non-grid events present; spans ordered and non-overlapping; union roughly covers the VO minus intro/outro.

## Phase 3 — `pages.py` (+ `cbr.py`) → `roughcut/timeline.json`

- For each event, resolve chapter span: `chapters` from `beats.yaml` if set, else `events.yaml` `chapter_start..chapter_end` mapped to continuous numbers (`series == "DBZ"` → `+ 194`).
- `find_chapters(root, span)` matches both pre-extracted `Chapter <N> - Title/` dirs **and** `Chapter <N> - Title.cbr` archives (dir wins when both exist). **Only arcs 09–12 (Saiyan/Freeza/Cell/Majin Boo) are pre-extracted; arcs 01–08 and 13–20 are `.cbr` only** — so `.cbr` support is mandatory, not optional.
- `cbr.py`: `pages_for(chapter, cache)` returns image paths, extracting a `.cbr` once into `out/cbr_cache/<stem>/` via 7-Zip (`C:\Program Files\7-Zip\7z.exe`, or `ASSEMBLER_7Z`). RAR, so 7-Zip not `zipfile`.
- Selection v1: `sample_pages(pages, beat_seconds)` — evenly across the collected pages at ~0.22 page/s, `min 2`, `cap 8`.
- `roughcut/overrides.yaml` — user pins exact pages, repo-relative to the manga root:

```yaml
dbz_03_frieza:
  - "10 Freeza Arc/Chapter 271 - .../014.jpg"
```

- Copy selected pages → `roughcut/build/pages/<event>/NNN.jpg`.
- Emit `roughcut/timeline.json`:

```json
{
  "fps": 30,
  "durationInFrames": 23400,
  "beats": [
    {
      "event": "dbz_03_frieza",
      "start": 1260, "end": 2040,
      "kind": "manga",
      "pages": ["pages/dbz_03_frieza/001.jpg", "pages/dbz_03_frieza/002.jpg"],
      "card": "dbz_03_frieza",
      "chapterLabel": "ch. 53",
      "captions": [ { "text": "In his base form alone...", "start": 1260, "end": 1410 } ]
    }
  ]
}
```

Unmapped beats → `"kind": "slate"`, no `pages`.

### Verification
`timeline.json` has a non-empty `pages[]` for every `manga` beat and every referenced file exists on disk; `durationInFrames` matches the VO length from `transcript.json`.
