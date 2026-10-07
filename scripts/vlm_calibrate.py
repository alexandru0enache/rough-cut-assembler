"""VLM prompt calibration: score prompt variants against the eyeballed
ground truth in docs/plans/vlm-rerank/cases.json.

Usage (llama server must be up - see vision_rerank module docstring):
    .venv/Scripts/python scripts/vlm_calibrate.py v2
    .venv/Scripts/python scripts/vlm_calibrate.py v1 v2   (compare)

Prompts live here, versioned (P1, P2, ...). A new variant only lands after
it outscores the incumbent on this set - score recorded in 00_overview.md.
Frames re-extract on demand from the case coordinates (no media in repo).
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "src"))

PROMPTS = {
    "v1": (
        "KEEP or DROP? This frame was retrieved for the query '{q}'. "
        "Reply exactly: KEEP or DROP, then one short reason."
    ),
    "v2": (
        "KEEP or DROP? This frame was retrieved for the query '{q}'. "
        "Judge leniently: KEEP if the subject appears in ANY form, even "
        "partial, abstract, or mid-action. "
        "Reply exactly: KEEP or DROP, then one short reason."
    ),
    "v3": (
        "KEEP or DROP? This frame was retrieved for the query '{q}'. "
        "Reply exactly: KEEP or DROP, then one short reason. "
        "Energy blasts, auras, glowing effects, and abstract action "
        "frames count as the subject when the query asks about energy, "
        "beams, or transformations."
    ),
    "v4": (
        "KEEP or DROP? This frame was retrieved for the query '{q}'. "
        "Reply exactly: KEEP or DROP, then one short reason. "
        "A frame dominated by energy, aura, or glowing effects counts "
        "as KEEP when the query asks about beams or energy; ordinary "
        "objects, signs, people, and landscapes do not."
    ),
}


def main(versions: list[str]) -> int:
    from assembler.roughcut import subs_discover, vision_rerank as vr, vision_shots

    cases = json.loads((REPO / "docs/plans/vlm-rerank/cases.json").read_text())
    eps = {(e.series, e.number): e.path for e in subs_discover.discover()}
    results: dict[str, dict] = {}
    for v in versions:
        if v == "ens":
            got = run_all(cases, eps, ensemble=True)
            results[v] = score(got, cases)
            continue
        if v not in PROMPTS:
            print(f"unknown prompt version {v!r} (have: {sorted(PROMPTS)} + ens)")
            return 2
        # Temporarily swap the prompt template (module reads it per call).
        import assembler.roughcut.vision_rerank as _vr

        orig = _vr._prompt
        _vr._prompt = lambda q, _t=PROMPTS[v]: _t.format(q=q)
        try:
            got = run_all(cases, eps)
        finally:
            _vr._prompt = orig
        results[v] = score(got, cases)
    for v, s in results.items():
        print(f"{v}: {s['correct']}/{s['total']}  misses={s['misses']}")
    return 0


def run_all(cases, eps, ensemble=False) -> list[tuple[str, str]]:
    from assembler.roughcut import vision_rerank as vr

    out = []
    for c in cases:
        path = eps.get((c["series"], c["episode"]))
        tmp = Path(tempfile.mkdtemp()) / "calib.jpg"
        try:
            from assembler.roughcut import vision_shots

            vision_shots.extract_frame(path, c["ms"], tmp)
            verdict = vr.judge(tmp, c["query"], ensemble=ensemble)["keep"]
        except Exception as exc:
            verdict = f"ERROR: {exc}"
        got = "KEEP" if verdict is True else ("DROP" if verdict is False else verdict)
        print(f"  {c['id']:<10} want={c['expected']:<5} got={got}")
        out.append((c["id"], got))
    return out


def score(got, cases) -> dict:
    misses = [i for (i, g), c in zip(got, cases) if g != c["expected"]]
    return {"correct": len(cases) - len(misses), "total": len(cases), "misses": misses}


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:] or ["v2"]))
