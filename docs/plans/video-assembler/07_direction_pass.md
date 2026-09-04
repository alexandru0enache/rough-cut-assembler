# Phase 7 — The direction pass (shot specs)

## The gap this closes

On a real production, *what a shot shows* is decided by a **director / storyboard
artist**, on paper, before an editor touches a timeline. That role turns
ambiguity into a spec ("wide, Goku centre, slow push-in, aura on beat 2, cut on
the punch"). The editor then *executes* the spec — a much easier task than
*inventing* it.

Doing both roles back-to-back on the same shot, mid-edit, is where the work
stalls: execution has a clear next action, directing doesn't, so on any
undecided shot the edit session turns into a staring contest with the clock
running. The fix is not a productivity trick — it's **separating the two passes**
so directing gets its own session where producing rough specs is the only job.

## How it maps to the pipeline

`beats.yaml` **is** the shot list. Each beat is one script paragraph plus an
optional `spec` block — the director's artifact:

```yaml
- id: db_02_roshi__018
  kind: manga            # manga | title
  event: db_02_roshi     # owning reign -> power-streak card + default chapters
  paras: [18]
  chapters: [122, 125]   # narrow the chapter span for this specific line
  spec:
    visual: "Roshi (Jackie Chun) forfeits the semfinal to Tien, hand raised"
    motion: "slow push-in, settle"
    fx: "none"
    source: "ch. 124 p. 6-8"     # ch/page shorthand the pages step can resolve
    cut_on: "on 'younger generation'"
    notes: "guidebook-only that Roshi held back - see fact-check L57-63"
```

`kind: title` beats are connective lines (intro, rules, CTA, recaps) — they
render as a clean card, no manga, no card.

## The two sessions

**Direction pass** — no NLE, no Remotion open. Go beat by beat:

```
gfxorch roughcut direct <events.yaml> --out <dir> --report   # list undirected beats
gfxorch roughcut direct <events.yaml> --out <dir>            # seed blank spec skeletons
```

Fill `visual / motion / fx / source / cut_on / notes` on each beat — however
rough. `source` can be a chapter/page shorthand; for exact panels, pin them in
`overrides.yaml` (Phase 3). Claude can do a vision-assisted pass here: the
pipeline narrows a beat to its chapter span, Claude reads the candidate pages
and writes the picks into `overrides.yaml`.

**Editor pass** — `roughcut pages` → `sync-timeline` → `render-roughcut`.
Execute specs. The rough cut shows each beat's spec as a chip and flags
`UNDIRECTED` beats in red, so it doubles as a direction-progress dashboard.

## Not yet

- `spec.crop` (x/y/w/h %) so the rough cut can push into a single panel of a
  full-page scan. Today the whole page shows; the spec tells the editor what to
  crop to in the real edit.
- Non-manga `source` kinds (anime clip in/out, AI render, existing AE comp).
