import textwrap

import pytest

from assembler.model import EventsError, load_events

MINIMAL = """
meta:
  video_id: unit_test
  theme: dbz_power_streak
  numbering:
    DB: { scheme: viz_continuous, total: 194 }
defaults:
  disputed: false
events:
  - id: a_goku
    series: DB
    order: 10
    holder: GOKU
    kind: solo
    chapter_start: 1
    chapter_end: 3
    reign_chapters: 3
    reign_confidence: firm
    bar_fill: 0.02
    portrait: goku_kid
  - id: b_tie
    series: DB
    order: 20
    holder: VEGETA
    co_holder: FUTURE TRUNKS
    kind: tie
    reign_confidence: null
    bar_fill: 0.1
    portrait: vegeta_trunks
summary_grids:
  - id: grid_db
    after_event: a_goku
    series: DB
    title: TALLY
    rows:
      - { rank: 1, holder: GOKU, chapters: 43, percent: 22 }
"""


def _write(tmp_path, text):
    p = tmp_path / "events.yaml"
    p.write_text(textwrap.dedent(text), encoding="utf-8")
    return p


def test_loads_minimal(tmp_path):
    doc = load_events(_write(tmp_path, MINIMAL))
    assert doc.meta.video_id == "unit_test"
    assert [e.id for e in doc.ordered()] == ["a_goku", "b_tie"]
    assert doc.by_id("a_goku").nameplate == "GOKU"
    assert doc.grids[0].after_event == "a_goku"


def test_nameplate_includes_form(tmp_path):
    doc = load_events(_write(tmp_path, MINIMAL.replace("holder: GOKU\n    kind: solo", "holder: GOKU\n    form: SUPER SAIYAN 3\n    kind: solo")))
    assert doc.by_id("a_goku").nameplate == "GOKU SUPER SAIYAN 3"


def test_tie_without_co_holder_fails(tmp_path):
    bad = MINIMAL.replace("    co_holder: FUTURE TRUNKS\n", "")
    with pytest.raises(EventsError) as exc:
        load_events(_write(tmp_path, bad))
    assert any("requires co_holder" in p for p in exc.value.problems)


def test_bar_fill_out_of_range_fails(tmp_path):
    bad = MINIMAL.replace("bar_fill: 0.02", "bar_fill: 1.7")
    with pytest.raises(EventsError) as exc:
        load_events(_write(tmp_path, bad))
    assert any("bar_fill" in p for p in exc.value.problems)


def test_unknown_field_fails(tmp_path):
    bad = MINIMAL.replace("    portrait: goku_kid", "    portrait: goku_kid\n    colour: gold")
    with pytest.raises(EventsError) as exc:
        load_events(_write(tmp_path, bad))
    assert any("unknown field" in p for p in exc.value.problems)


def test_bad_after_event_fails(tmp_path):
    bad = MINIMAL.replace("after_event: a_goku", "after_event: nope")
    with pytest.raises(EventsError) as exc:
        load_events(_write(tmp_path, bad))
    assert any("after_event" in p for p in exc.value.problems)


def test_missing_portrait_is_warning_not_error(tmp_path):
    ok = MINIMAL.replace("    portrait: vegeta_trunks", "")
    doc = load_events(_write(tmp_path, ok))
    assert any("no portrait hint" in w for w in doc.warnings)
