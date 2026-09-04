# Phase 0 — Per-sentence fact-check

Gates editing. Research pass, no code. Done with `mcp__claude-in-chrome__*` against the user's logged-in Chrome.

## Inputs

- `01_ingest/script/Copy of Every time someone surpassed Goku (preview).md`
- `notes/fact_check_report.html` — existing 49-claim report, reuse findings where the sentence is unchanged.

## Process

1. Split `script.md` into numbered sentences (~90). Keep section headers as dividers.
2. Classify each: **factual claim** (chapter number, power level, plot event, verbatim quote) vs **framing/opinion** ("family ruining a perfectly good afternoon" → `opinion — no source needed`).
3. For each factual claim, browse **dragonball.fandom.com** and **kanzenshuu.com**; record source title + URL + the exact supporting line.
4. Rewrite `notes/fact_check_report.html`:
   - Keep the existing visual style — Source Serif 4 / Inter / JetBrains Mono, paper/ink palette, light + dark, `.wrap` max-width 920.
   - One row per sentence: `#`, sentence text, verdict badge (`confirmed` / `incorrect` / `partial` / `opinion — no source needed` / `unverifiable`), the claim checked, source name + link, note.
   - Keep the summary counts block and a "Priority fixes" section listing every `incorrect` / `partial`.
   - Carry over the known issues from the current report (e.g. L49 "chapter 3" vs the script's own math; boulder-feat timing; guidebook-only Triclops origin).
5. Hand back to the user for script corrections before Phase 4 rendering.

## Verification

Open the HTML:
- every sentence has its own row;
- every non-opinion row has a resolvable source link;
- Priority-fixes section lists the `incorrect` / `partial` rows.

## Notes

- Power-level claims (Raditz 1,500; Goku base 8,000; Frieza base 530,000 / final 100% 120,000,000; SSJ Goku 150,000,000; Kami 220; Roshi 139/180; Goku & Tien 180) are guidebook (Daizenshuu) figures — cite the guidebook tier explicitly, same as the existing report does for the Triclops origin.
- Anime subtitle lines (Phase 6) can serve as quote corroboration but are not a primary source; prefer wiki/Kanzenshuu.
