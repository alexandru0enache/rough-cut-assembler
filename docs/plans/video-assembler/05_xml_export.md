# Phase 5 — XML export of the cut (NLE + AE-likes) (was "Resolve FCPXML hand-off")

**Retargeted 2026-09-05: the edit is in Adobe Premiere now, not Resolve.**
Building the actual HUD/scouter graphics natively in a compositor is still
deferred (see `docs/plans/gfx-per-project-split/`) - but **the export target
is not Premiere-only**. Premiere and After Effects are the same product
family and both natively import the same editorial interchange XML; the same
file this phase produces for Premiere is also an AE import, and AE turns each
clip into a positioned, correctly-timed **layer inside a composition** - the
exact starting point compositing work would need later. So: this phase is
about **the cuts `timeline.json` already describes — which manga page or
render shows for how long, in what order — landing in Premiere (and,
verified the same way, After Effects) as a real, editable timeline.** Not a
rendered video either app conforms against; actual still-image clips/layers
at the right timecodes.

## Why not the Remotion `.mp4`

`npm run roughcut` already produces a watchable rough cut - but it's one
flattened video file. Dropping it into Premiere gives the editor something to
watch, not something to *edit*: they can't trim an individual manga page's
duration or swap which page a beat shows without going back to
`timeline.json` and re-rendering. This phase is what makes the assembler's
decisions (which page, how long) live as real Premiere clips instead.

## Scope

**In:**
- Every `manga` and `render` beat → one still-image clip per page on a video
  track, in/out matching `timeline.json`'s frame numbers (today's even
  per-page split within the beat - the same math `RoughCut.tsx` already
  does; if [beat-timing-control](../beat-timing-control/00_overview.md) lands
  first, use its explicit per-page ranges instead).
- The VO (`timeline.json`'s `audio` field) → one audio clip on an audio track,
  starting at frame 0.
- `title` beats, `slate` beats (a manga/render beat that resolved to zero
  pages), and any future HUD-card beat → **markers**, not clips (a marker at
  the beat's start carrying its id + spoken text + `spec` if any). No
  placeholder graphic is generated - that's the compositing question,
  deliberately deferred.

**Out (for now):**
- Any rendered graphic (power-streak card, scouter, a title card image) as a
  clip. Markers only, per above.
- Captions as an editable text track - nice to have later, not needed to get
  "the cuts" in front of the editor.

## Format: build via OTIO, emit through whichever adapter Premiere actually
## accepts cleanly - **must be verified against real Premiere, not assumed**

`opentimelineio` is already a dependency, with two adapters already pinned:
`otio-fcpx-xml-adapter` and `otio-cmx3600-adapter`. Neither has been tried
against Premiere on this box yet, and "FCP XML" is genuinely ambiguous -
Apple's modern FCPXML (from Final Cut Pro X) and the older, distinct "Final
Cut Pro 7 XML" interchange schema are both colloquially called "FCP XML" and
Premiere's import support differs between them. **Do not assume either
adapter's output imports cleanly - the plan's own verification step is a real
test-import, not a file existing.**

1. Build an in-memory `otio.schema.Timeline` from `timeline.json`:
   - one `Track` (kind `Video`) of `Clip`s (`media_reference =
     ExternalReference(target_url=<abs page path>)`, `source_range =
     TimeRange(start_time=0, duration=<clip's own length>)`) for every
     manga/render beat's pages - **not simply appended**: insert an explicit
     `Gap` for any span between one beat's `end` and the next `start`, and
     truncate on an overlap, so absolute frame position matches
     `timeline.json` exactly (see Gaps §1 below - this was wrong in the
     first draft of this plan);
   - `title` **and** `slate` beats produce a `Gap` carrying a `Marker` (see
     Gaps §2), not a clip;
   - one `Track` (kind `Audio`) with a single `Clip` referencing the VO file
     (see Gaps §5 for which file, exactly).
2. Try `otio.adapters.write_to_file(timeline, path, adapter_name="fcp_xml")`
   first (Premiere has long-standing "Final Cut Pro XML" import support in
   File > Import - confirm which schema this adapter actually emits by
   inspecting its output, not by the package name alone).
3. **Real verification, on this box** (Premiere Pro 2025 and After Effects
   2025 are both installed): File > Import the generated XML into a fresh
   Premiere project **and separately into After Effects**. Premiere check:
   every clip present, correct file, correct duration, correct order, markers
   visible with the right beat id/text. AE check: the same, as layers in the
   composition it creates from the import - since that comp is the future
   entry point for compositing work, its layer order/timing matters just as
   much as Premiere's. If either import is wrong, try
   `adapter_name="cmx_3600"` next (plain EDL - accept its limits: no markers,
   and confirm both apps resolve the file paths rather than asking for
   offline media/reels).
4. Only after both real imports succeed: wire this into the CLI (`assembler
   roughcut export --out <dir>` or similar) and document the working format
   choice - don't leave both adapters "available," commit to the one that was
   actually verified in both apps.

## `src/assembler/roughcut/xml_export.py` (new)

- `build_otio_timeline(timeline_json: dict) -> otio.schema.Timeline`
- `export(timeline_json_path, out_path, *, adapter="fcp_xml")` - thin wrapper
  around `write_to_file`, raising a clear error if `opentimelineio` (the
  `[roughcut]` extra) isn't installed.

## Tests

- `build_otio_timeline` on a small fixture `timeline.json` (reuse the shape
  `pages.py`'s tests already build) - assert clip count, order, durations,
  and marker placement, all without touching a real adapter/file (pure
  in-memory OTIO object assertions).
- The actual `write_to_file` call and Premiere import are the untested seam,
  same treatment as ffmpeg/pgsrip/Tesseract elsewhere - a real DCC round-trip
  isn't something to fake in a unit test.

## Done =

A real Premiere project **and** a real After Effects project, both imported
from this export, each show every manga/render page as its own
trimmable clip/layer in the right place with the right duration, the VO
aligned at frame 0, and markers where title/HUD beats will eventually go.
That confirmation from you (both apps) is the actual completion signal - I
can generate the file, but only you can confirm each app accepted it the way
the plan intends.

## Gaps found on review (2026-09-05)

The first pass of this plan glossed over a few things. Resolved ones get a
decision below; the rest are open and need an answer before/while building.

1. **Beats aren't actually contiguous - "back-to-back" is wrong as stated.**
   `timeline.json` gives every beat explicit `start`/`end` frame numbers, and
   `roughcut check` already has a warning for adjacent beats *overlapping*
   (a skipped script line pinned to a 1-frame sliver) - meaning gaps and
   overlaps both really happen. Just appending clips one after another on an
   OTIO track (as originally written) silently discards that timing and
   packs everything airtight, which will NOT match the Remotion preview.
   **Resolved:** insert an explicit `Gap` item for any span between one
   beat's `end` and the next beat's `start`; on an overlap, truncate the
   earlier clip to the next beat's `start` (matching what `check`'s warning
   already flags as the imprecise case) rather than silently double-covering
   the frame range.
2. **`slate` beats aren't handled at all.** `pages.py` emits `kind: "slate"`
   for a manga/render beat that resolved to zero pages (see
   `build_timeline`'s `kind if rel_pages else "slate"`) - a real, expected
   case, not an edge case. **Resolved:** treat exactly like a `title` beat -
   a marker on a `Gap`, not a clip.
3. **Per-page timing doesn't exist in `timeline.json` yet.** A beat's `pages`
   is a flat list with no individual frame ranges - only the *beat's* overall
   `start`/`end`. "Same math `RoughCut.tsx` already does" means this
   exporter would have to **duplicate** `RoughCut.tsx`'s even-split
   calculation in Python, a second copy of the same logic that can drift out
   of sync with the TypeScript original. **Open:** either accept the
   duplication (small, well-tested function, low risk) or make this phase
   depend on [beat-timing-control](../beat-timing-control/00_overview.md)
   landing first so `timeline.json` itself carries per-page ranges and both
   RoughCut.tsx and this exporter read the same precomputed numbers. Leaning
   toward the dependency - duplicated timing math is exactly the kind of
   thing that quietly drifts.
4. **No Ken-Burns motion in the export - set this expectation explicitly.**
   The Remotion preview pans/zooms each manga page; a plain still-image
   clip/layer in Premiere/AE has none of that. The editor should not open
   this expecting parity with `roughcut.mp4`'s motion - it's the same
   *timing*, not the same *look*. Worth a line in whatever hand-off note
   goes with the export, not a code change.
5. **Which audio file gets referenced is unspecified.** `timeline.json`'s
   `audio` field records whatever path was passed to `pages` - but
   `sync-timeline.mjs` transcodes ALAC to AAC into
   `public/roughcut/audio.m4a` for Remotion because its ffmpeg can't decode
   ALAC. **Open:** decide whether the exporter references the original VO
   (simplest, correct provided Premiere/AE can decode it - both generally
   handle ALAC fine, unlike Remotion's bundled ffmpeg) or that transcoded
   copy. Leaning toward the original VO; confirm during implementation.
6. **File path format per adapter/app is unverified.** OTIO's
   `ExternalReference.target_url` - a raw Windows path, a `file://` URI, or
   something adapter-specific - isn't nailed down. Part of the real
   verification pass (§3), not something to assume up front.
