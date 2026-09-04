# Phase 6 — Anime subtitle index (Layer 2 of anime shot selection)

Secondary, off the critical path. Turns every anime episode into a **searchable
line index** so a beat's caption / keywords can be matched to
`{series, episode, timecode}`. It only *suggests* windows — it never places a clip.

This is Layer 2 of the four-layer anime shot-selection plan (see
[00_overview.md](00_overview.md) and HANDOFF §5.2). Layer 1 (chapter → episode
map) and Layer 3 (shot boundaries + vision pick) are separate.

## The subtitle-format split (verified 2026-09-04)

The local `F:\anime\dragon_ball\` "Anime Time" releases do **not** all carry text
subtitles:

| Series | Embedded subtitle track | How to get text |
|---|---|---|
| **Dragon Ball** (original, DVD 480p) | `subrip` **text** track ("Basic Subtitles … SRT") + 3× ASS | `ffmpeg -map 0:<idx> -c:s srt` — direct, no OCR |
| **Dragon Ball Z** (BD 1080p) | `hdmv_pgs_subtitle` **bitmap** only ("English (PGS)") | extract `.sup` → **OCR** (Tesseract) |
| **Dragon Ball Super** (BD 1080p) | `hdmv_pgs_subtitle` ×2 (Dialogue / Signs+Songs), bitmap | extract `.sup` → **OCR** |
| **Daima** (BD 1080p) | assume PGS bitmap (best-effort) | extract `.sup` → **OCR** |
| **GT** | not needed for this video | — |

PGS ("Presentation Graphic Stream") stores one pre-rendered transparent image per
line plus show/hide timings — there is no text in the file, so `ffmpeg -c:s srt`
has nothing to convert. DBZ + Super are ~2/3 of the video, so an OCR path is
mandatory.

**Decision (2026-09-04):** OCR our own PGS locally with Tesseract via `pgsrip`.
No external SRT downloads (sync risk + defeats the "local corpus" principle).

## Toolchain (all local)

| Piece | Where | Notes |
|---|---|---|
| ffprobe / ffmpeg | venv (`static-ffmpeg`) | probe streams; extract text SRT or copy PGS to `.sup` |
| Tesseract OCR | `C:\Program Files\Tesseract-OCR\tesseract.exe` (on PATH) | `eng.traineddata` present; override dir with `GFXORCH_TESSERACT` |
| `pgsrip` | new `[subs]` extra | `.sup` → `.srt` via Tesseract; consumes `.sup` directly so **MKVToolNix is not required** |

No `mkvextract` / MKVToolNix: ffmpeg copies the PGS bitstream to `.sup`, and
`pgsrip` OCRs the `.sup`.

## `src/gfxorch/roughcut/subs.py`

### 1. Walk + classify

Walk `config.anime_root()` for `*.mkv` / `*.mp4`. From each path derive:

- **series** — keyword match on the release folder name:
  `Dragon Ball Z` → `DBZ`, `Dragon Ball Super` → `SUPER`, `Daima` → `DAIMA`,
  `GT` → `GT`, otherwise `Dragon Ball` → `DB`.
- **episode** — integer from the filename: Anime Time `… - 095.mkv` → `95`;
  BestBob Daima `… - E04 - …` → `4`.
- **skip** non-episodes: a skip word (`NCED`, `Special`, `Movie`, `OVA`,
  `Preview`, `PV`, `Recap`, …) in the **file name**, or a `OP 01` / `ED 01`
  credit name, or a parent dir named `NC` / `Extras` / `Specials` / `Creditless`.
  Skip words in an *ancestor release folder* don't count — GT ships as
  `…(S01+S02+S03+S04+Special) [DVD]…` and its episodes are real.

Verified counts: DB 153, DBZ 291, SUPER 131, DAIMA 20, GT 64 — no gaps, no
duplicate numbers.

Limit with `--series DB,DBZ` and `--episodes 1-50` so the (multi-hour) OCR batch
can be done in chunks.

### 2. Per episode → one `.srt` (cached)

Cache at `subs_dir()/srt/<series>/<episode:03d>.srt`. Skip if it exists unless
`--force`. This is the resumable checkpoint — OCR is the expensive step and runs
exactly once per episode.

1. `ffprobe -select_streams s -print_format json` → subtitle stream list
   (`index`, `codec_name`, `disposition`, `tags.language`, `tags.title`).
2. Pick the **dialogue** track:
   - text codecs (`subrip`, `ass`, `mov_text`) preferred over bitmap;
   - among candidates, drop "Signs" / "Songs" / "NEP" / "Dubtitle" titles;
   - English (`tags.language == eng`, or title says so) first.
3. Extract:
   - **text** → `ffmpeg -i <ep> -map 0:<abs idx> -c:s srt <cache>.srt`
   - **PGS** → `ffmpeg -i <ep> -map 0:<abs idx> -c:s copy <cache>.sup`
     then `pgsrip` (`Sup(...)`, `Options(languages={eng}, overwrite=True)`) →
     `<cache>.srt`; delete the `.sup`.

### 3. Clean

- strip `<i>…</i>` / other HTML-ish tags and ASS `{\…}` override blocks
  (the DB release's `{\an8}` romaji karaoke overlay lands as its own cue).
- when 2+ cues share identical start+end, keep the most-ASCII one
  (drops the romaji twin).
- collapse whitespace; drop empty cues.

### 4. Parse + index (SQLite FTS5)

Parse each cache SRT into `{series, episode, n, start_ms, end_ms, text}`.
Load all rows into `subs_dir()/anime.sqlite` — same FTS5 pattern as
`gfxorch/wiki.py`:

```sql
CREATE TABLE lines(
  id INTEGER PRIMARY KEY, series TEXT, episode INTEGER,
  n INTEGER, start_ms INTEGER, end_ms INTEGER, text TEXT);
CREATE VIRTUAL TABLE fts USING fts5(
  text, content='lines', content_rowid='id', tokenize='porter unicode61');
```

`build` is idempotent: it rebuilds `lines` + `fts` from whatever `.srt` files are
in the cache, so re-running after OCR'ing more episodes just widens the index.

### 5. Query

`query(q, *, series=None, limit=20)` — bare terms OR-ed, `bm25` ranked (same as
`wiki.query`). Returns `[{series, episode, tc, start_ms, end_ms, text, score}]`
where `tc` is `MM:SS.s`. Optional: for each undirected beat, keyword-search
(holder / form / distinctive caption phrases) and append the top hits to
`overrides.yaml` as commented `# anime:` suggestions for the editor.

## CLI

Fold into the existing `roughcut` group ( `direct`-style flags, not a
sub-subparser):

```
gfxorch roughcut subs  --out <dir> [--anime-root P] [--series DB,DBZ]
                       [--episodes 1-50] [--force]      # build / widen the index
gfxorch roughcut subs  --query "goku super saiyan namek" [--series DBZ] [--limit 20]
```

`--out` is unused by `subs` except for symmetry; the index lives under
`GFXORCH_SUBS_DIR` (default `~/.gfxorch/subs/`), like the wiki corpus.

## config.py

- `subs_dir()` → `GFXORCH_SUBS_DIR` or `~/.gfxorch/subs/`.
- `series_for(path)` → the folder-name keyword classifier (also reused by Layer 1).

## pyproject.toml

New extra:

```toml
subs = [
  "pgsrip>=0.1.11",       # PGS bitmap subs -> SRT via Tesseract
  "static-ffmpeg>=2.5",   # ffprobe / ffmpeg (shared with [roughcut])
]
```

Tesseract itself is a system install (not pip); `subs build` fails with a clear
message naming the download if `tesseract` is not found.

## Verification

- `gfxorch roughcut subs --series DB --episodes 1-3` produces
  `~/.gfxorch/subs/srt/DB/00{1,2,3}.srt` (direct text extract, no OCR) and an
  `anime.sqlite` with those lines.
- one PGS episode (`--series DBZ --episodes 1`) OCRs to a plausible SRT; a
  spot-checked line's timecode matches the spoken line when the MKV is opened
  there.
- `subs --query` returns ranked `{series, episode, tc, text}` rows.
- `tests/test_subs.py`: path→(series, episode), stream selection from a canned
  ffprobe JSON, SRT clean + romaji-twin drop, FTS build + query over fixture
  SRTs. (ffmpeg / pgsrip / Tesseract are **not** exercised in tests — the
  extract/OCR calls are the untested seam, same as faster-whisper in Phase 1.)

## Not in this phase

- Layer 1 chapter→episode map (own file / task).
- Layer 3 shot boundaries + WD-tagger vision pick.
- Any `timeline.json` `kind: "clip"` wiring — that's Layer 4, after a holder
  decides the tool is trustworthy.
