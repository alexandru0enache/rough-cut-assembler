"""Unit tests for the rough-cut assembler (dragonball_db.roughcut.*)."""

from __future__ import annotations

import textwrap

import pytest

from dragonball_db.model import load_events
from dragonball_db.roughcut import align as rc_align
from dragonball_db.roughcut import beats as rc_beats
from dragonball_db.roughcut import pages as rc_pages

# --------------------------------------------------------------------------
#  fixtures
# --------------------------------------------------------------------------
EVENTS_YAML = """
meta:
  video_id: rc_test
  theme: dbz_power_streak
  numbering:
    DB:  { scheme: viz_continuous, total: 194 }
    DBZ: { scheme: viz_z_restart, total: 325, continuous_offset: 194 }
defaults: { disputed: false }
events:
  - id: goku_open
    series: DB
    order: 10
    holder: GOKU
    kind: solo
    chapter_start: 1
    chapter_end: 3
    bar_fill: 0.02
  - id: roshi
    series: DB
    order: 20
    holder: MASTER ROSHI
    kind: solo
    chapter_start: 4
    chapter_end: 8
    bar_fill: 0.6
  - id: frieza
    series: DBZ
    order: 30
    holder: FRIEZA
    kind: villain_form
    chapter_start: 53
    chapter_end: 96
    bar_fill: 0.4
"""


@pytest.fixture
def doc(tmp_path):
    p = tmp_path / "events.yaml"
    p.write_text(EVENTS_YAML, encoding="utf-8")
    return load_events(p)


def _words(sentence_times):
    """[(text, t0, t1), ...] -> transcript word dicts, evenly spread per sentence."""
    out = []
    for text, t0, t1 in sentence_times:
        toks = text.split()
        step = (t1 - t0) / max(1, len(toks))
        for i, w in enumerate(toks):
            out.append({"w": w.strip(".,!?"), "start": round(t0 + i * step, 3), "end": round(t0 + (i + 1) * step, 3)})
    return out


@pytest.fixture
def manga_root(tmp_path):
    """A fake library: arc dir -> 'Chapter NNN - T' dirs of NNN.jpg pages."""
    root = tmp_path / "manga"
    arc = root / "01 Arc"
    arc.mkdir(parents=True)
    for ch in (1, 2, 3, 4, 5, 6, 7, 8):
        d = arc / f"Chapter {ch:03d} - Title {ch}"
        d.mkdir()
        for pg in range(1, 7):
            (d / f"{pg:03d}.jpg").write_bytes(f"ch{ch:03d}p{pg:03d}".encode())  # distinct content
    return root


# --------------------------------------------------------------------------
#  align
# --------------------------------------------------------------------------
def test_parse_script_sections_and_unescape(tmp_path):
    md = tmp_path / "s.md"
    md.write_text(
        textwrap.dedent(
            """\
            Goku is strong\\!

            **Dragon Ball**

            Roshi wins.

            ### **Dragon Ball Z**

            Raditz arrives.
            """
        ),
        encoding="utf-8",
    )
    paras = rc_align.parse_script(md)
    assert [p.text for p in paras] == ["Goku is strong!", "Roshi wins.", "Raditz arrives."]
    assert [p.section for p in paras] == ["intro", "DB", "DBZ"]


def test_align_exact_is_monotonic_high_conf():
    paras = [rc_align.Paragraph(0, "goku crushes the boulder", "DB"),
             rc_align.Paragraph(1, "roshi enters the tournament", "DB")]
    words = _words([("goku crushes the boulder", 0.0, 2.0), ("roshi enters the tournament", 2.0, 4.0)])
    rows = rc_align.align(paras, words)
    assert rows[0]["conf"] >= 0.9 and rows[1]["conf"] >= 0.9
    assert rows[0]["start"] == 0.0
    assert rows[1]["start"] >= rows[0]["end"] - 1e-6
    assert rows[1]["end"] <= 4.0 + 1e-6


def test_align_missing_paragraph_pins_between_and_stays_monotonic():
    # middle paragraph is never spoken
    paras = [
        rc_align.Paragraph(0, "goku crushes the boulder", "DB"),
        rc_align.Paragraph(1, "this line was cut from the recording entirely", "DB"),
        rc_align.Paragraph(2, "roshi enters the tournament", "DB"),
    ]
    words = _words([("goku crushes the boulder", 0.0, 2.0), ("roshi enters the tournament", 2.0, 4.0)])
    rows = rc_align.align(paras, words)
    assert rows[1]["conf"] == 0.0
    assert rows[0]["start"] <= rows[1]["start"] <= rows[2]["start"]
    assert all(rows[i]["start"] <= rows[i + 1]["start"] for i in range(len(rows) - 1))


def test_align_reworded_paragraph_still_anchors():
    paras = [rc_align.Paragraph(0, "the kid with a monkey tail crushed massive boulders", "DB")]
    # transcript drops a couple words / reorders lightly
    words = _words([("the kid with a tail crushed boulders bare handed", 5.0, 9.0)])
    rows = rc_align.align(paras, words)
    assert rows[0]["conf"] >= 0.5
    assert 4.5 <= rows[0]["start"] <= 9.0


# --------------------------------------------------------------------------
#  beats
# --------------------------------------------------------------------------
def _rows_from(texts):
    return [{"idx": i, "text": t, "start": float(i), "end": i + 0.9, "conf": 1.0, "section": "DB"} for i, t in enumerate(texts)]


def test_seed_title_vs_manga_and_ids(doc):
    rows = _rows_from([
        "Today we cover every time someone surpasses Goku",   # 0 goku -> goku_open
        "Goku crushes boulders at the start",                 # 1 goku_open
        "drop a like if you haven't already",                 # 2 CTA -> title
        "The one to dethrone him was Master Roshi",           # 3 roshi
        "Roshi trained for decades",                          # 4 roshi
        "Frieza claimed the top spot on Namek",               # 5 frieza
    ])
    bs = rc_beats.seed(doc.ordered(), rows)
    kinds = {b.id: b.kind for b in bs}
    assert kinds["t002"] == "title"
    assert bs[0].kind == "manga" and bs[0].event == "goku_open"
    assert bs[3].event == "roshi"
    assert bs[5].event == "frieza"
    assert bs[1].id == "goku_open__001"


def test_seed_rules_block_is_title(doc):
    rows = _rows_from([
        "Goku is the strongest at the start",
        "let's get our important rules out of the way",   # rules-block open
        "Characters only count once introduced",
        "So for example Vegeta is irrelevant until DBZ",
        "this will be super in depth so let's get started",  # rules-block close
        "Goku crushes boulders",
    ])
    bs = rc_beats.seed(doc.ordered(), rows)
    assert all(bs[i].kind == "title" for i in (1, 2, 3, 4)), [b.kind for b in bs]
    assert bs[0].kind == "manga" and bs[5].kind == "manga"


def test_undirected_and_blank_spec():
    bs = [rc_beats.Beat(id="a", paras=[0]), rc_beats.Beat(id="b", paras=[1], spec={"visual": "x"})]
    assert [b.id for b in rc_beats.undirected(bs)] == ["a"]
    assert set(rc_beats.blank_spec()) == set(rc_beats.SPEC_FIELDS)


def test_beats_yaml_roundtrip(tmp_path):
    src = [
        rc_beats.Beat(id="t000", paras=[0], kind="title"),
        rc_beats.Beat(id="roshi__003", paras=[3], kind="manga", event="roshi", chapters=[4, 8],
                      spec={"visual": "hero shot", "source": "ch. 4 p. 3"}),
    ]
    p = tmp_path / "beats.yaml"
    rc_beats.write(src, p)
    back = rc_beats.load(p)
    assert back[0].kind == "title" and back[0].event is None
    assert back[1].event == "roshi" and back[1].chapters == [4, 8]
    assert back[1].spec["source"] == "ch. 4 p. 3"


# --------------------------------------------------------------------------
#  pages
# --------------------------------------------------------------------------
def test_continuous_span_offsets(doc):
    goku = doc.by_id("goku_open")
    frieza = doc.by_id("frieza")
    assert rc_pages.continuous_span(goku, doc) == (1, 3)
    assert rc_pages.continuous_span(frieza, doc) == (247, 290)  # 53..96 + 194


def test_find_chapters_span(manga_root):
    hits = rc_pages.find_chapters(manga_root, (4, 6))
    assert [h.name for h in hits] == ["Chapter 004 - Title 4", "Chapter 005 - Title 5", "Chapter 006 - Title 6"]


def test_find_chapters_prefers_dir_over_cbr(tmp_path):
    arc = tmp_path / "m" / "01 Arc"
    (arc / "Chapter 010 - X").mkdir(parents=True)
    (arc / "Chapter 010 - X" / "001.jpg").write_bytes(b"x")
    (arc / "Chapter 010 - X.cbr").write_bytes(b"rar")
    hits = rc_pages.find_chapters(tmp_path / "m", (10, 10))
    assert len(hits) == 1 and hits[0].is_dir()


def test_sample_pages_count_and_bounds():
    pool = [f"p{i}" for i in range(20)]
    assert rc_pages.sample_pages(pool, 0.5) == pool[:1]           # tiny beat -> 1
    got = rc_pages.sample_pages(pool, 20.0)                       # long beat -> capped
    assert 1 <= len(got) <= 6
    assert rc_pages.sample_pages([], 5.0) == []


def test_spec_pages_chapter_and_page_range(manga_root):
    got = rc_pages._spec_pages({"source": "ch. 4 p. 2-3"}, manga_root, 0, manga_root / "_cache")
    assert [p.name for p in got] == ["002.jpg", "003.jpg"]
    whole = rc_pages._spec_pages({"source": "ch. 5"}, manga_root, 0, manga_root / "_cache")
    assert len(whole) == 6


def test_build_timeline_shape_titles_cards_and_page_cursor(doc, manga_root, tmp_path):
    rows = _rows_from([
        "Goku is strong at the start of the series",   # 0 goku_open
        "Goku crushes a boulder",                       # 1 goku_open
        "drop a like and subscribe",                    # 2 title
        "Goku takes a bullet point blank",             # 3 goku_open
        "Master Roshi dethrones him",                   # 4 roshi
    ])
    bs = rc_beats.seed(doc.ordered(), rows)
    out = tmp_path / "out"
    tl = rc_pages.build_timeline(
        beats=bs, script_rows=rows, doc=doc, manga_root=manga_root,
        out_dir=out, fps=30, duration_seconds=6.0,
    )
    assert tl["fps"] == 30 and tl["durationInFrames"] == 180
    by_id = {b["id"]: b for b in tl["beats"]}
    assert by_id["t002"]["kind"] == "title" and by_id["t002"]["pages"] == []
    # card set exactly once per event
    cards = [b["card"] for b in tl["beats"] if b["card"]]
    assert cards.count("goku_open") == 1 and cards.count("roshi") == 1
    # page cursor: successive goku_open beats must advance, not restart at page 0
    goku_beats = [b for b in tl["beats"] if b["event"] == "goku_open" and b["pages"]]
    first_bytes = [(out / b["pages"][0]).read_bytes() for b in goku_beats]
    assert len(set(first_bytes)) == len(first_bytes), first_bytes
    # every referenced page file exists on disk
    for b in tl["beats"]:
        for rel in b["pages"]:
            assert (out / rel).exists()


def test_build_timeline_override_pins_exact_pages(doc, manga_root, tmp_path):
    rows = _rows_from(["Master Roshi dethrones Goku", "Roshi trained for decades"])
    bs = rc_beats.seed(doc.ordered(), rows)
    roshi_id = next(b.id for b in bs if b.event == "roshi")
    tl = rc_pages.build_timeline(
        beats=bs, script_rows=rows, doc=doc, manga_root=manga_root,
        out_dir=tmp_path / "o", fps=30, duration_seconds=3.0,
        overrides={roshi_id: ["ch. 4 p. 5"]},
    )
    beat = next(b for b in tl["beats"] if b["id"] == roshi_id)
    assert len(beat["pages"]) == 1
