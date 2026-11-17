"""Resolve each beat to its footage + carry the director's spec, then emit
``timeline.json`` - the edit blueprint the Remotion rough cut and the Resolve
export both read.

    timeline.json
    -------------
    {
      "fps": 30, "durationInFrames": 28680, "audio": "<abs path to vo>",
      "beats": [
        {
          "id": "db_02_roshi__018", "event": "db_02_roshi",
          "kind": "manga" | "slate" | "title",
          "start": 120, "end": 900,                 # frames, comp time
          "chapterLabel": "ch. 4-8", "chapterSpan": [198, 202],
          "pages": ["pages/db_02_roshi__018/000.jpg", ...],
          "card": "db_02_roshi" | null,             # set once, on the reign's first beat
          "spec": {"visual": "...", "motion": "...", "fx": "...", ...} | null,
          "captions": [{"text": "...", "start": 120, "end": 300}, ...]
        }, ...
      ]
    }

Page source order of preference, per beat:
  1. ``overrides.yaml[beat.id]``      - exact page files (the vision/pin pass)
  2. ``beat.spec.source`` chapter refs  - e.g. "ch. 4 p.3-6"
  3. ``beat.chapters`` span            - narrowed by the director
  4. the owning reign's chapter span   - the coarse default
"""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

from .cbr import pages_for, find_chapters

_SPEC_CHAP = re.compile(r"ch\.?\s*0*(\d+)", re.I)
_SPEC_PAGE = re.compile(r"p(?:age|g|p)?\.?\s*0*(\d+)\s*(?:[-–]\s*0*(\d+))?", re.I)
_SPEC_RENDER = re.compile(r"render:\s*([A-Za-z0-9_\- ]+?)\s*$", re.I)
_IMG_EXT = {".jpg", ".jpeg", ".png", ".webp"}


def spec_render(spec: dict | None) -> list[Path]:
    """A spec source of 'render: <hint>' -> a resolved character render PNG."""
    if not spec:
        return []
    m = _SPEC_RENDER.search(str(spec.get("source") or ""))
    if not m:
        return []
    try:
        from .. import config
        from ..portraits import resolve_portrait
    except Exception:
        return []
    match = resolve_portrait(m.group(1).strip(), config.render_roots())
    return [match.path] if getattr(match, "path", None) else []


def continuous_span(event, doc) -> tuple[int, int] | None:
    """Map an event's chapter range into the manga library's continuous numbering."""
    cs, ce = event.chapter_start, event.chapter_end or event.chapter_start
    if cs is None:
        return None
    off = 0
    num = doc.meta.numbering.get(event.series)
    if num is not None:
        off = getattr(num, "continuous_offset", 0)
    return (cs + off, (ce or cs) + off)


def _pages_in(chapters: list[Path], cache_dir: str | Path) -> list[Path]:
    out: list[Path] = []
    for ch in chapters:
        out.extend(pages_for(ch, cache_dir))
    return out


def page_count(beat_seconds: float, *, per_second: float = 0.35, lo: int = 1, hi: int = 6) -> int:
    return max(lo, min(hi, round(beat_seconds * per_second)))


def sample_pages(pages: list[Path], beat_seconds: float, **kw) -> list[Path]:
    """Evenly spaced pages across `pages` - used when a beat names its own span."""
    if not pages:
        return []
    want = page_count(beat_seconds, **kw)
    if want >= len(pages):
        return pages
    step = len(pages) / want
    return [pages[int(i * step)] for i in range(want)]


def _take(pool: list[Path], start: int, n: int) -> tuple[list[Path], int]:
    """n consecutive pages from `pool` beginning at `start`, wrapping around."""
    if not pool:
        return [], start
    out = [pool[(start + i) % len(pool)] for i in range(min(n, len(pool)))]
    return out, (start + len(out)) % len(pool)


def _spec_pages(spec: dict | None, manga_root, doc_off_default: int, cbr_cache) -> list[Path]:
    """Parse a spec 'source' like 'ch. 4 p.3-6' into concrete page files. The
    chapter number is taken as already-continuous unless clearly a low DB number
    with the reign living in DBZ (left to the director to disambiguate)."""
    if not spec:
        return []
    src = str(spec.get("source") or "")
    cm = _SPEC_CHAP.search(src)
    if not cm:
        return []
    chap = int(cm.group(1))
    chapters = find_chapters(manga_root, (chap, chap))
    if not chapters:
        return []
    pool = _pages_in(chapters, cbr_cache)
    pm = _SPEC_PAGE.search(src)
    if pm and pool:
        a = int(pm.group(1))
        b = int(pm.group(2) or pm.group(1))
        return [p for i, p in enumerate(pool, start=1) if a <= i <= b] or pool[: max(1, b - a + 1)]
    return pool


def build_timeline(
    *,
    beats,
    script_rows: list[dict],
    doc,
    manga_root: str | Path,
    out_dir: str | Path,
    fps: int = 30,
    duration_seconds: float | None = None,
    audio_path: str | Path | None = None,
    overrides: dict | None = None,
) -> dict:
    out_dir = Path(out_dir)
    pages_dir = out_dir / "pages"
    cbr_cache = out_dir / "cbr_cache"
    pages_dir.mkdir(parents=True, exist_ok=True)
    overrides = overrides or {}
    by_id = {e.id: e for e in doc.events}
    seen_events: set[str] = set()
    # per-reign page pool + a cursor that marches forward as the reign's beats consume it,
    # so short beats don't all restart on page 1 of the reign's first chapter
    event_pool: dict[str, list[Path]] = {}
    event_cursor: dict[str, int] = {}

    def f(sec: float) -> int:
        return int(round(sec * fps))

    entries: list[dict] = []
    for b in beats:
        rows = [script_rows[i] for i in b.paras if 0 <= i < len(script_rows)]
        if not rows:
            continue
        start_s = min(r["start"] for r in rows)
        end_s = max(r["end"] for r in rows)
        spec = getattr(b, "spec", None)
        captions = [{"text": r["text"], "start": f(r["start"]), "end": f(r["end"])} for r in rows]

        if getattr(b, "kind", "manga") == "title":
            entries.append(
                {"id": b.id, "event": None, "kind": "title", "start": f(start_s), "end": f(end_s),
                 "chapterLabel": "", "chapterSpan": None, "pages": [], "card": None,
                 "spec": spec or None, "captions": captions}
            )
            continue

        ev = by_id.get(b.event)
        narrowed = tuple(b.chapters) if b.chapters else None
        event_span = continuous_span(ev, doc) if ev else None
        span = narrowed or event_span

        kind = "manga"
        picked: list[Path] = []

        render_srcs = spec_render(spec)
        if render_srcs:
            kind = "render"
            picked = render_srcs
        elif b.id in overrides:
            for entry in overrides[b.id]:
                p = Path(entry)
                if p.is_absolute() and p.exists():
                    picked.append(p)
                    continue
                rel = Path(manga_root) / entry
                if rel.exists() and rel.is_file():
                    picked.append(rel)
                    continue
                # chapter/page shorthand: "ch. 4 p. 3-5"
                picked.extend(_spec_pages({"source": str(entry)}, manga_root, 0, cbr_cache))
        if not picked:
            picked = _spec_pages(spec, manga_root, 0, cbr_cache)
        if not picked and narrowed:
            # deliberate narrow span -> evenly sampled, fresh each time
            picked = sample_pages(_pages_in(find_chapters(manga_root, narrowed), cbr_cache), end_s - start_s)
        if not picked and b.event and event_span:
            # reign default -> walk forward through the reign's page pool
            pool = event_pool.get(b.event)
            if pool is None:
                pool = _pages_in(find_chapters(manga_root, event_span), cbr_cache)
                event_pool[b.event] = pool
            picked, event_cursor[b.event] = _take(pool, event_cursor.get(b.event, 0), page_count(end_s - start_s))
        if not picked and span:
            picked = sample_pages(_pages_in(find_chapters(manga_root, span), cbr_cache), end_s - start_s)

        subdir = "renders" if kind == "render" else "pages"
        rel_pages: list[str] = []
        for k, srcp in enumerate(picked):
            dst = out_dir / subdir / b.id / f"{k:03d}{srcp.suffix.lower()}"
            dst.parent.mkdir(parents=True, exist_ok=True)
            if not dst.exists():
                shutil.copy2(srcp, dst)
            rel_pages.append(f"{subdir}/{b.id}/{dst.name}")

        chap_label = ""
        if kind == "render":
            chap_label = "render"
        elif ev and ev.chapter_start is not None:
            chap_label = f"ch. {ev.chapter_start}" + (f"-{ev.chapter_end}" if ev.chapter_end else "")

        card = None
        if b.event and b.event not in seen_events:
            card = b.event
            seen_events.add(b.event)

        entries.append(
            {"id": b.id, "event": b.event, "kind": kind if rel_pages else "slate",
             "start": f(start_s), "end": f(end_s), "chapterLabel": chap_label,
             "chapterSpan": list(span) if span and kind != "render" else None, "pages": rel_pages,
             "card": card, "spec": spec or None, "captions": captions}
        )

    total = duration_seconds if duration_seconds is not None else (max((e["end"] for e in entries), default=0) / fps)
    timeline = {
        "fps": fps,
        "durationInFrames": f(total),
        "audio": str(Path(audio_path).resolve()) if audio_path else None,
        "beats": entries,
    }
    (out_dir / "timeline.json").write_text(json.dumps(timeline, ensure_ascii=False, indent=2), encoding="utf-8")
    return timeline
