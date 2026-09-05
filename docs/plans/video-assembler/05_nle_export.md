# Phase 5 — get the actual cut into the NLE (was "Resolve FCPXML hand-off")

**Retargeted 2026-09-05: the edit is in Adobe Premiere now, not Resolve.**
Compositing/graphics interchange (getting the power-streak/scouter HUD into a
DCC natively) is explicitly **out of scope** here — see the chat that produced
this plan and `docs/plans/gfx-per-project-split/`. This phase is only about
one thing: **the cuts `timeline.json` already describes — which manga page or
render shows for how long, in what order — landing in Premiere as a real,
editable sequence.** Not a rendered video the editor conforms against; actual
still-image clips at the right timecodes on a track they can trim.

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
- `title` beats and any future HUD-card beat → **markers**, not clips (a
  marker at the beat's start carrying its id + spoken text + `spec` if any).
  No placeholder graphic is generated - that's the compositing question,
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
     manga/render beat's pages, laid out back-to-back via the track's own
     accumulating duration - OTIO tracks are sequential, so this matches
     `timeline.json`'s beat ordering directly;
   - one `Track` (kind `Audio`) with a single `Clip` referencing the VO file;
   - a `Marker` on the video track at each `title`/card beat's start frame.
2. Try `otio.adapters.write_to_file(timeline, path, adapter_name="fcp_xml")`
   first (Premiere has long-standing "Final Cut Pro XML" import support in
   File > Import - confirm which schema this adapter actually emits by
   inspecting its output, not by the package name alone).
3. **Real verification, on this box** (Premiere Pro 2025 is installed): File >
   Import the generated XML into a fresh Premiere project. Check: every clip
   present, correct file, correct duration, correct order, markers visible
   with the right beat id/text. If it doesn't import cleanly, fall back to
   `adapter_name="cmx_3600"` (plain EDL - accept its limits: no markers, and
   confirm Premiere resolves the file paths rather than asking for offline
   media/reels).
4. Only after a real successful import: wire this into the CLI (`assembler
   roughcut export --out <dir>` or similar) and document the working format
   choice - don't leave both adapters "available," commit to the one that was
   actually verified.

## `src/assembler/roughcut/nle_export.py` (new)

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

A real Premiere project, imported from this export, shows every manga/render
page as its own trimmable clip in the right place with the right duration,
the VO aligned at frame 0, and markers where title/HUD beats will eventually
go. That screenshot/confirmation from you is the actual completion signal -
I can generate the file, but only you can confirm Premiere accepted it the
way the plan intends.
