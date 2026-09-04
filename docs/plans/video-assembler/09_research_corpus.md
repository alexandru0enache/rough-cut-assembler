# Phase 9 — Local research corpus

Offline, queryable Dragon Ball Wiki for the fact-check pass and shot research —
no live scraping, no rate limits.

## Build

```
gfxorch wiki build --wiki dragonball
```

1. Downloads Fandom's static current-revisions dump
   `https://s3.amazonaws.com/wikia_xml_dumps/d/dr/dragonball_pages_current.xml.7z`
   (~72 MB; `--force` to refresh).
2. Extracts with 7-Zip (reuses `roughcut/cbr.py::find_7z`) → ~530 MB XML.
3. Streams with `mwxml`, keeps `namespace == 0` only, strips wikitext with
   `mwparserfromhell` (`_plain` splits a `lead` = text before the first `==`
   heading from the full `body`), loads into SQLite.
4. Deletes the XML unless `--keep-xml`.

Result: `~/.gfxorch/wiki/dragonball.sqlite` (override dir with `GFXORCH_WIKI_DIR`).
Measured: **9,541 articles**, 13,114 redirects, 82 MB, ~3 min end to end.

Schema: `pages(id, title, lead, body, redirect, length)` + an external-content
FTS5 index `fts(title, lead, body)` (`porter unicode61`).

## Query

```
gfxorch wiki query "Ultra Divine Water King Piccolo Goku"     # OR + bm25, natural language
gfxorch wiki query "Tenshinhan NEAR/5 forfeit" --all          # raw FTS5 syntax passes through
gfxorch wiki get   "Ultra Divine Water"                       # full article text (follows redirects)
gfxorch wiki stats
```

Bare terms are stop-word filtered, OR-ed, and ranked by bm25 (title weighted
8×, lead 4×) so the best-overlap article floats up. `--all` requires every term.
Quotes / `OR` / `NEAR` / `*` in the query are passed to FTS5 untouched.

`wiki.query()` / `wiki.get()` are also importable for the fact-check pipeline to
cite article titles + snippets per sentence.

## Kanzenshuu

Not mirrored: no bulk export, and much of its value is translated/copyrighted
material. Use it for targeted lookups only — pull individual pages when a
project needs production-credit or translation-grounded accuracy.

## Tests

`tests/test_wiki.py` (6) — `build_db` namespace filtering + counts, `_plain`
lead/body split, OR-default vs `--all`, redirect following, missing-corpus
error. Uses an inline MediaWiki XML fixture; no network.
