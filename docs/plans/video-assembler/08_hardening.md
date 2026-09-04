# Phase 8 — Hardening

Closes the gaps found before committing to a full 16-min run.

## Verification

- **`tests/test_roughcut.py`** — 15 unit tests over `align` (anchor+interpolate:
  exact / missing / reworded paragraphs, monotonicity), `beats` (title vs manga,
  rules-block, ids, yaml round-trip, `undirected`), `pages` (`continuous_span`
  offsets, `find_chapters` dir-vs-cbr, `sample_pages` bounds, `_spec_pages`
  parsing, `build_timeline` schema / titles / card-once / page-cursor /
  overrides). Fake manga tree + real `load_events` fixtures. `pytest` = 42 total.

- **`gfxorch roughcut check <events> --out <dir>`** — static wiring check over
  whatever artifacts exist. **Problems** (exit 1): non-monotonic alignment,
  duplicate beat ids, beat → unknown event, para index out of range, caption
  past `durationInFrames`, missing page file on disk, a `card` set on ≠1 beat.
  **Warnings**: low-confidence alignment runs, undirected beats, `manga`
  beats with 0 pages, slates, beat overlaps.

## Page reuse fixes

- **Per-reign page cursor** (`pages.build_timeline`): each reign builds its page
  pool once; successive beats of that reign `_take` consecutive slices and
  advance a cursor (wrapping), instead of every short beat re-sampling from
  page 1 of the reign's first chapter. A beat with an explicit `chapters:`
  narrow still samples that span fresh.
- **Rules-block titles** (`beats.seed`): the housekeeping run bracketed by an
  OPEN cue ("...important rules out of the way") and the next CLOSE cue
  ("let's get started") is all `kind: title` — not just lines that happen to
  contain a CTA phrase.

## PNG renders

- **`render:` source kind** — a beat `spec.source: "render: <hint>"` resolves
  `<hint>` through the existing `portraits.resolve_portrait` against
  `config.render_roots()`; the beat becomes `kind: "render"`, its PNG copied to
  `out/renders/<beat id>/`, and `RoughCut` composites it centred on a dark
  radial-gradient bg with a slow scale-in.
- **Card portraits** — `sync-timeline.mjs` now resolves each reign's `portrait:`
  hint (shared `scripts/lib/portraits.mjs`, ported from `sync-data.mjs`) and
  copies it to `public/roughcut/portraits/`, so the power-streak card shows its
  character cutout instead of an empty slot.

## Still open

- `spec.crop` (push into one panel of a full-page scan).
- Non-manga/render `source` kinds (anime clip in/out — needs Phase 6).
- The `check` overlap warning fires on adjacent beats when a skipped script line
  gets pinned to a 1-frame sliver; harmless, could be smoothed in `align`.
