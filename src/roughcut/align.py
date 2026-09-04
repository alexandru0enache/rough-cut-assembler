"""Align script paragraphs to the transcript timeline.

The VO was read from this script, so the text is near-verbatim. A monotonic
pointer walks the transcript word stream; for each paragraph we find the
matching run with difflib and read its start/end times off the transcript.

    from gfxorch.roughcut.align import parse_script, align
    paras = parse_script("script.md")
    rows  = align(paras, transcript["words"])   # [{idx,text,start,end,conf,section}]
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path


_MD_ESCAPE = re.compile(r"\\([!.\-*_#()\[\]])")
_HEADER = re.compile(r"^\s*(#{1,6}\s+|\*\*[^*]+\*\*\s*$)")
_TOKEN = re.compile(r"[a-z0-9']+")
_STOP = {
    "the", "a", "an", "of", "and", "to", "in", "is", "was", "for", "on", "at", "by",
    "we", "he", "his", "her", "it", "its", "that", "this", "as", "be", "our", "you",
    "with", "would", "had", "have", "has", "so", "but", "not", "up", "out", "him",
    "they", "them", "there", "then", "when", "who", "from", "were", "are", "i",
}


@dataclass
class Paragraph:
    idx: int
    text: str
    section: str  # "intro" | "DB" | "DBZ"


def _clean(line: str) -> str:
    return _MD_ESCAPE.sub(r"\1", line).replace("\u2019", "'").strip()


def parse_script(md_path: str | Path) -> list[Paragraph]:
    raw = Path(md_path).read_text(encoding="utf-8")
    section = "intro"
    out: list[Paragraph] = []
    for line in raw.splitlines():
        s = line.strip()
        if not s:
            continue
        low = s.lower()
        if _HEADER.match(s):
            if "dragon ball z" in low or low.strip("#* ") == "dragon ball z":
                section = "DBZ"
            elif "dragon ball" in low:
                section = "DB"
            continue
        out.append(Paragraph(idx=len(out), text=_clean(s), section=section))
    return out


def _tok(text: str) -> list[str]:
    return _TOKEN.findall(text.lower())


def _content(toks: list[str]) -> list[str]:
    return [t for t in toks if t not in _STOP and len(t) > 1]


def _best_match(want: set[str], wtok: list[str], winlen: int, lo: int, reach: int) -> tuple[int, int, float]:
    """Best (first_word, last_word, conf) for a paragraph's content-word set,
    searching windows that start in wtok[lo : lo+reach]. Earliest window wins
    ties. conf = distinct content words found in the window / total."""
    n = len(wtok)
    ncont = len(want)
    best = (lo, lo, 0.0)
    for s in range(lo, min(n, lo + reach)):
        seg = wtok[s : min(n, s + winlen)]
        present = want.intersection(seg)
        if not present:
            continue
        conf = len(present) / ncont
        if conf > best[2]:
            idxs = [s + k for k, t in enumerate(seg) if t in present]
            best = (idxs[0], idxs[-1], conf)
            if conf >= 0.999:
                break
    return best


def align(paras: list[Paragraph], words: list[dict], *, slack: float = 1.4, anchor_conf: float = 0.5) -> list[dict]:
    """Anchor + interpolate alignment, robust to reworded / skipped lines.

    Walk paragraphs in order; each searches the transcript *after* the previous
    anchor. Confident matches become anchors (and advance the cursor); the rest
    are interpolated by cumulative word count between surrounding anchors.
    """
    wtok = [w["w"].lower().strip(".,!?;:\"'()’“”") for w in words]
    n = len(wtok)
    tcount = [max(1, len(_tok(p.text))) for p in paras]

    raw: list[tuple[int, int, float]] = []
    anchors: dict[int, tuple[int, int]] = {}
    cursor = 0
    for p in paras:
        content = set(_content(_tok(p.text)))
        if not content:
            raw.append((-1, -1, 0.0))
            continue
        winlen = max(6, int(tcount[p.idx] * slack))
        fw, lw, conf = _best_match(content, wtok, winlen, cursor, reach=winlen + 400)
        raw.append((fw, lw, conf))
        if conf >= anchor_conf and lw >= fw >= cursor:
            anchors[p.idx] = (fw, lw)
            cursor = lw + 1

    if not anchors:  # nothing to hang on to - spread evenly
        anchors = {0: (0, 0), len(paras) - 1: (n - 1, n - 1)}

    # 3. fill: interpolate word index by cumulative token count between anchors
    idxs = sorted(anchors)
    rows: list[dict] = []
    cum = [0]
    for c in tcount:
        cum.append(cum[-1] + c)

    def word_time(w: int, end: bool = False) -> float:
        w = max(0, min(n - 1, w))
        return words[w]["end" if end else "start"]

    for i, p in enumerate(paras):
        if i in anchors:
            fw, lw = anchors[i]
            conf = raw[i][2]
            start, end = word_time(fw), word_time(lw, end=True)
        else:
            lo = max([a for a in idxs if a < i], default=None)
            hi = min([a for a in idxs if a > i], default=None)
            if lo is not None and hi is not None:
                w_lo, w_hi = anchors[lo][1], anchors[hi][0]
                span = max(1, cum[hi] - cum[lo])
                f0 = (cum[i] - cum[lo]) / span
                f1 = (cum[i + 1] - cum[lo]) / span
                start = word_time(round(w_lo + f0 * (w_hi - w_lo)))
                end = word_time(round(w_lo + f1 * (w_hi - w_lo)), end=True)
            elif lo is not None:
                start = end = word_time(anchors[lo][1], end=True)
            elif hi is not None:
                start = end = word_time(anchors[hi][0])
            else:
                start = end = 0.0
            conf = 0.0
        rows.append({"idx": p.idx, "text": p.text, "start": round(start, 3), "end": round(max(end, start), 3),
                     "conf": round(conf, 3), "section": p.section})

    # monotonic guard
    last = 0.0
    for r in rows:
        r["start"] = round(max(r["start"], last), 3)
        r["end"] = round(max(r["end"], r["start"]), 3)
        last = r["start"]
    return rows


def run(script_md: str | Path, transcript_json: str | Path, out_path: str | Path) -> list[dict]:
    words = json.loads(Path(transcript_json).read_text(encoding="utf-8"))["words"]
    rows = align(parse_script(script_md), words)
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    return rows
