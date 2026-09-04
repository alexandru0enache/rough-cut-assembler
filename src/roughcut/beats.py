"""Seed and load ``beats.yaml`` - the ordered beat list.

A **beat** is one script paragraph plus how to show it:

    beats.yaml
    ----------
    - id: t000                 # connective line -> a title card, no manga
      kind: title
      paras: [0]
    - id: db_02_roshi__018     # narrative line -> manga pages for a reign
      kind: manga
      event: db_02_roshi       # which reign (drives the power-streak card + default chapters)
      paras: [18]
      chapters: [4, 8]         # optional: narrow the chapter span for this line
    - ...

Auto-seeding is a starting point. Two things want a human/vision pass:
`chapters` per narrative beat (tighten it to the panels being described) and,
better still, `overrides.yaml` pinning exact page files (see pages.py).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import yaml

_TOKEN = re.compile(r"[a-z0-9']+")
_STOP = {"the", "a", "of", "and", "to", "in", "is", "was", "for", "his", "her", "he", "we"}
# phrases (not bare words - "like" shows up in normal prose) that mark a line as
# audience-address / recap plumbing rather than story -> render as a title card
_CONNECTIVE_PHRASES = (
    "drop a like", "hit the like", "smash that", "if you enjoyed", "don't forget to",
    "click here", "link in the", "click this", "subscribe", "let's get started",
    "let's look at the numbers", "look at the numbers", "in case you're curious",
    "look here", "our important rules",
)
# a contiguous run of "housekeeping" paragraphs, bracketed by these cues, all -> title
_RULES_OPEN = ("rules out of the way", "important rules", "ground rules", "get our rules", "the rules")
_RULES_CLOSE = ("let's get started", "let's begin", "with that said", "with that out of the way", "let's dive in")


def _kw(*parts: str | None) -> set[str]:
    out: set[str] = set()
    for p in parts:
        if not p:
            continue
        for t in _TOKEN.findall(p.lower()):
            if t not in _STOP and len(t) > 1:
                out.add(t)
    return out


@dataclass
class Beat:
    id: str
    paras: list[int]
    kind: str = "manga"  # "manga" | "title"
    event: str | None = None
    chapters: list[int] | None = None
    # the director's shot spec - filled in the "direction pass", not by the seeder.
    # keys: visual / motion / fx / source / cut_on / notes. Absent = undirected.
    spec: dict | None = None


SPEC_FIELDS = ("visual", "motion", "fx", "source", "cut_on", "notes")


def blank_spec() -> dict:
    return {k: "" for k in SPEC_FIELDS}


def _reign_ranges(events, texts: list[list[str]]) -> dict[str, tuple[int, int]]:
    """{event_id: [start_para, end_para)} by a monotonic holder-keyword walk."""
    n = len(texts)
    cursor = 0
    ordered = list(events)
    ranges: dict[str, tuple[int, int]] = {}
    for ei, ev in enumerate(ordered):
        want = _kw(getattr(ev, "holder", None), getattr(ev, "form", None), getattr(ev, "co_holder", None))
        start = next((i for i in range(cursor, n) if want & set(texts[i])), None)
        if start is None:
            continue
        nxt = ordered[ei + 1] if ei + 1 < len(ordered) else None
        nxt_kw = _kw(getattr(nxt, "holder", None), getattr(nxt, "form", None)) if nxt else set()
        end = n
        for i in range(start + 1, n):
            if nxt_kw and (nxt_kw & set(texts[i])):
                end = i
                break
        ranges[ev.id] = (start, end)
        cursor = end
    return ranges


def seed(events, script_rows: list[dict]) -> list[Beat]:
    """One beat per script paragraph. Connective lines -> title; the rest -> the
    reign that owns them (by holder keyword)."""
    texts = [_TOKEN.findall(r["text"].lower()) for r in script_rows]
    ranges = _reign_ranges(events, texts)
    owner: dict[int, str] = {}
    for eid, (s, e) in ranges.items():
        for i in range(s, e):
            owner.setdefault(i, eid)

    lows = [r["text"].lower() for r in script_rows]

    # find the housekeeping / rules block: first OPEN cue .. next CLOSE cue after it
    rules: set[int] = set()
    opens = [i for i, t in enumerate(lows) if any(c in t for c in _RULES_OPEN)]
    if opens:
        o = opens[0]
        c = next((j for j in range(o, len(lows)) if any(k in lows[j] for k in _RULES_CLOSE)), None)
        if c is not None:
            rules = set(range(o, c + 1))

    beats: list[Beat] = []
    for i, low in enumerate(lows):
        eid = owner.get(i)
        connective = i in rules or any(p in low for p in _CONNECTIVE_PHRASES)
        if eid is None or connective:
            beats.append(Beat(id=f"t{i:03d}", paras=[i], kind="title"))
        else:
            beats.append(Beat(id=f"{eid}__{i:03d}", paras=[i], kind="manga", event=eid))
    return beats


def to_yaml(beats: list[Beat]) -> str:
    payload = []
    for b in beats:
        row: dict = {"id": b.id, "kind": b.kind, "paras": b.paras}
        if b.event:
            row["event"] = b.event
        if b.chapters:
            row["chapters"] = list(b.chapters)
        if b.spec:
            row["spec"] = b.spec
        payload.append(row)
    return yaml.safe_dump(payload, sort_keys=False, default_flow_style=False, allow_unicode=True)


def write(beats: list[Beat], path: str | Path) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(to_yaml(beats), encoding="utf-8")


def load(path: str | Path) -> list[Beat]:
    rows = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or []
    out: list[Beat] = []
    for r in rows:
        out.append(
            Beat(
                id=str(r.get("id") or r.get("event") or f"b{len(out):03d}"),
                paras=list(r.get("paras", [])),
                kind=r.get("kind", "manga"),
                event=r.get("event"),
                chapters=r.get("chapters"),
                spec=r.get("spec"),
            )
        )
    return out


def undirected(beats: list[Beat]) -> list[Beat]:
    """Beats with no usable spec - the 'landmine' list for the direction pass."""
    return [b for b in beats if not (b.spec and any(str(v).strip() for v in b.spec.values()))]
