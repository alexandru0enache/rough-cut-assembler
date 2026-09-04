"""Typed model for a project's ``events.yaml`` plus a validating loader.

This is the contract every downstream step (portraits, comp_builder, timeline)
builds on. ``load_events()`` returns a fully-populated :class:`EventsDoc` or
raises :class:`EventsError` with a human-readable list of problems. Softer
issues (missing portrait hint, non-sequential grid ranks) come back as
``doc.warnings`` so a build can proceed while still flagging them.
"""

from __future__ import annotations

from dataclasses import dataclass, field, fields
from pathlib import Path
from typing import Any, Optional

import yaml

VALID_SERIES = {"DB", "DBZ"}
VALID_KINDS = {"solo", "tie", "fusion", "villain_form"}
VALID_CONFIDENCE = {"firm", "approx", None}


class EventsError(ValueError):
    """Raised when events.yaml fails validation. ``problems`` is the full list."""

    def __init__(self, problems: list[str], source: Path | None = None):
        self.problems = problems
        self.source = source
        head = f"{source}: " if source else ""
        super().__init__(head + f"{len(problems)} problem(s):\n  - " + "\n  - ".join(problems))


# --------------------------------------------------------------------------
#  dataclasses
# --------------------------------------------------------------------------
@dataclass
class SeriesNumbering:
    scheme: str
    total: int
    continuous_offset: int = 0


@dataclass
class Meta:
    video_id: str
    theme: str
    numbering: dict[str, SeriesNumbering]


@dataclass
class ReignEvent:
    id: str
    series: str
    order: int
    holder: str
    kind: str
    form: Optional[str] = None
    co_holder: Optional[str] = None
    chapter_start: Optional[int] = None
    chapter_end: Optional[int] = None
    reign_chapters: Optional[int] = None
    reign_confidence: Optional[str] = None
    bar_fill: float = 0.0
    power_level: Optional[str] = None
    metric_right: Optional[str] = None
    disputed: bool = False
    dispute_note: Optional[str] = None
    portrait: Optional[str] = None
    marker: Optional[str] = None
    notes: Optional[str] = None

    @property
    def nameplate(self) -> str:
        """Red-tab text: holder, plus form when present."""
        return f"{self.holder} {self.form}".strip() if self.form else self.holder


@dataclass
class GridRow:
    rank: int
    holder: str
    portrait: Optional[str] = None
    chapters: Optional[int] = None
    percent: Optional[int] = None
    note: Optional[str] = None


@dataclass
class SummaryGrid:
    id: str
    series: str
    title: str
    rows: list[GridRow]
    after_event: Optional[str] = None
    total_chapters: Optional[int] = None
    ranked_by: str = "chapters"
    variant: Optional[dict[str, Any]] = None
    notes: Optional[str] = None


@dataclass
class EventsDoc:
    meta: Meta
    events: list[ReignEvent]
    grids: list[SummaryGrid]
    source_path: Optional[Path] = None
    warnings: list[str] = field(default_factory=list)

    def ordered(self) -> list[ReignEvent]:
        return sorted(self.events, key=lambda e: e.order)

    def by_id(self, event_id: str) -> Optional[ReignEvent]:
        return next((e for e in self.events if e.id == event_id), None)

    def portrait_hints(self) -> list[str]:
        hints = [e.portrait for e in self.events if e.portrait]
        hints += [r.portrait for g in self.grids for r in g.rows if r.portrait]
        return sorted(set(hints))


# --------------------------------------------------------------------------
#  loader
# --------------------------------------------------------------------------
def _known(cls) -> set[str]:
    return {f.name for f in fields(cls)}


def _split_unknown(cls, data: dict, ctx: str, problems: list[str]) -> dict:
    known = _known(cls)
    extra = set(data) - known
    if extra:
        problems.append(f"{ctx}: unknown field(s): {', '.join(sorted(extra))}")
    return {k: v for k, v in data.items() if k in known}


def load_events(path: str | Path) -> EventsDoc:
    path = Path(path)
    if not path.is_file():
        raise EventsError([f"file not found: {path}"], source=path)

    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    problems: list[str] = []
    warnings: list[str] = []

    # ---- meta ----
    meta_raw = raw.get("meta") or {}
    numbering: dict[str, SeriesNumbering] = {}
    for series, nb in (meta_raw.get("numbering") or {}).items():
        nb = _split_unknown(SeriesNumbering, nb or {}, f"meta.numbering.{series}", problems)
        try:
            numbering[series] = SeriesNumbering(**nb)
        except TypeError as exc:
            problems.append(f"meta.numbering.{series}: {exc}")
    meta = Meta(
        video_id=meta_raw.get("video_id", ""),
        theme=meta_raw.get("theme", ""),
        numbering=numbering,
    )
    if not meta.video_id:
        problems.append("meta.video_id is required")
    if not meta.theme:
        problems.append("meta.theme is required")

    defaults = raw.get("defaults") or {}

    # ---- events ----
    events: list[ReignEvent] = []
    seen_ids: set[str] = set()
    for i, ev_raw in enumerate(raw.get("events") or []):
        ctx = f"events[{i}]"
        if not isinstance(ev_raw, dict):
            problems.append(f"{ctx}: expected a mapping")
            continue
        merged = {**defaults, **ev_raw}
        eid = merged.get("id", f"<{ctx}>")
        ctx = f"event '{eid}'"
        clean = _split_unknown(ReignEvent, merged, ctx, problems)
        try:
            ev = ReignEvent(**clean)
        except TypeError as exc:
            problems.append(f"{ctx}: {exc}")
            continue
        events.append(ev)

        if ev.id in seen_ids:
            problems.append(f"{ctx}: duplicate id")
        seen_ids.add(ev.id)
        if ev.series not in VALID_SERIES:
            problems.append(f"{ctx}: series '{ev.series}' not in {sorted(VALID_SERIES)}")
        elif ev.series not in numbering:
            problems.append(f"{ctx}: series '{ev.series}' has no meta.numbering entry")
        if ev.kind not in VALID_KINDS:
            problems.append(f"{ctx}: kind '{ev.kind}' not in {sorted(VALID_KINDS)}")
        if ev.reign_confidence not in VALID_CONFIDENCE:
            problems.append(f"{ctx}: reign_confidence '{ev.reign_confidence}' not in firm/approx/null")
        if not isinstance(ev.bar_fill, (int, float)) or not (0.0 <= ev.bar_fill <= 1.0):
            problems.append(f"{ctx}: bar_fill must be a number in 0..1 (got {ev.bar_fill!r})")
        if ev.kind == "tie" and not ev.co_holder:
            problems.append(f"{ctx}: kind 'tie' requires co_holder")
        if ev.disputed and not ev.dispute_note:
            warnings.append(f"{ctx}: disputed is true but dispute_note is empty")
        if not ev.portrait:
            warnings.append(f"{ctx}: no portrait hint")
        if (
            ev.chapter_start is not None
            and ev.chapter_end is not None
            and ev.chapter_end < ev.chapter_start
        ):
            problems.append(f"{ctx}: chapter_end < chapter_start")

    if not events:
        problems.append("no events defined")
    orders = [e.order for e in events]
    if len(orders) != len(set(orders)):
        warnings.append("duplicate 'order' values - card sequence is ambiguous")

    # ---- summary grids ----
    grids: list[SummaryGrid] = []
    for i, g_raw in enumerate(raw.get("summary_grids") or []):
        ctx = f"summary_grids[{i}]"
        if not isinstance(g_raw, dict):
            problems.append(f"{ctx}: expected a mapping")
            continue
        gid = g_raw.get("id", f"<{ctx}>")
        ctx = f"grid '{gid}'"
        rows_raw = g_raw.get("rows") or []
        rows: list[GridRow] = []
        for j, r_raw in enumerate(rows_raw):
            rclean = _split_unknown(GridRow, r_raw or {}, f"{ctx}.rows[{j}]", problems)
            try:
                rows.append(GridRow(**rclean))
            except TypeError as exc:
                problems.append(f"{ctx}.rows[{j}]: {exc}")
        gclean = _split_unknown(SummaryGrid, {**g_raw, "rows": rows}, ctx, problems)
        try:
            grid = SummaryGrid(**gclean)
        except TypeError as exc:
            problems.append(f"{ctx}: {exc}")
            continue
        grids.append(grid)

        if grid.after_event and grid.after_event not in seen_ids:
            problems.append(f"{ctx}: after_event '{grid.after_event}' is not a known event id")
        ranks = [r.rank for r in grid.rows]
        if ranks and ranks != list(range(1, len(ranks) + 1)):
            warnings.append(f"{ctx}: ranks {ranks} are not 1..N in order")

    if problems:
        raise EventsError(problems, source=path)

    return EventsDoc(
        meta=meta,
        events=events,
        grids=grids,
        source_path=path,
        warnings=warnings,
    )
