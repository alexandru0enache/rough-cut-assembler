"""End-to-end rough-cut demo: VO clip + script excerpt -> timeline.json.

    .venv\\Scripts\\python.exe roughcut_demo\\run_demo.py

Runs the four pipeline steps against a ~130s clip of the real VO and a
24-line script excerpt, writing everything under roughcut_demo/out/.
First run downloads the faster-whisper 'small.en' model (~460 MB) and
transcribes (~15-40s of CPU). Re-runs are instant (cached).

Equivalent CLI:
    assembler roughcut transcribe --out roughcut_demo/out --audio <clip>
    assembler roughcut align      --out roughcut_demo/out --script roughcut_demo/inputs/script.md
    assembler roughcut beats      --out roughcut_demo/out  roughcut_demo/inputs/events.demo.yaml
    assembler roughcut pages      --out roughcut_demo/out  roughcut_demo/inputs/events.demo.yaml --audio <clip>
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
sys.path.insert(0, str(REPO / "src"))

from assembler.model import load_events  # noqa: E402
from assembler.roughcut import align as rc_align  # noqa: E402
from assembler.roughcut import beats as rc_beats  # noqa: E402
from assembler.roughcut import pages as rc_pages  # noqa: E402
from assembler.roughcut import transcribe as rc_transcribe  # noqa: E402

REAL_VO = Path(
    r"E:\studio_root\projects\clients\dbhype\production\discussions"
    r"\every_time_someone_surpassed_goku\01_ingest\audio"
    r"\EverytimeSomeoneSurpassesGoku.AaronMaywald.m4a"
)
MANGA_ROOT = Path(r"F:\manga\dragon_ball\Dragon Ball + Super [Complete Manga]")
CLIP_SECONDS = 130
FPS = 30

OUT = HERE / "out"
SCRIPT = HERE / "inputs" / "script.md"
EVENTS = HERE / "inputs" / "events.demo.yaml"
CLIP = HERE / "inputs" / "vo_clip.m4a"


def ffmpeg_exe() -> str:
    try:
        import static_ffmpeg

        static_ffmpeg.add_paths()
    except Exception:
        pass
    import shutil

    return shutil.which("ffmpeg") or "ffmpeg"


def make_clip() -> Path:
    if CLIP.exists():
        return CLIP
    if not REAL_VO.exists():
        sys.exit(f"real VO not found: {REAL_VO}\n(edit REAL_VO in this script, or drop a vo_clip.m4a into inputs/)")
    print(f"[clip] trimming first {CLIP_SECONDS}s of the VO -> {CLIP.name}")
    r = subprocess.run(
        [ffmpeg_exe(), "-y", "-loglevel", "error", "-t", str(CLIP_SECONDS), "-i", str(REAL_VO), "-c", "copy", str(CLIP)],
        capture_output=True, text=True,
    )
    if r.returncode != 0 or not CLIP.exists():
        # -c copy can fail on odd cut points; re-encode
        subprocess.run(
            [ffmpeg_exe(), "-y", "-loglevel", "error", "-t", str(CLIP_SECONDS), "-i", str(REAL_VO), "-c:a", "aac", str(CLIP)],
            check=True,
        )
    return CLIP


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    clip = make_clip()

    print("[1/4] transcribe")
    tr = rc_transcribe.transcribe(clip, OUT / "transcript.json", model="small.en")
    print(f"      {len(tr['words'])} words over {tr['duration']:.1f}s ({tr['device']}/{tr['compute_type']})")

    print("[2/4] align")
    rows = rc_align.run(SCRIPT, OUT / "transcript.json", OUT / "script_timed.json")
    low = [r for r in rows if r["conf"] < 0.6]
    print(f"      {len(rows)} paragraphs, {len(low)} low-confidence")
    for r in rows:
        flag = "  <-- low" if r["conf"] < 0.6 else ""
        print(f"        [{r['start']:6.1f}-{r['end']:6.1f}]  c{r['conf']:.2f}  {r['text'][:58]}{flag}")

    print("[3/4] beats (auto-seed) - keeps a hand-edited beats.yaml if present")
    doc = load_events(EVENTS)
    beats_yaml = OUT / "beats.yaml"
    if beats_yaml.exists():
        seeded = rc_beats.load(beats_yaml)
        print(f"      loaded {len(seeded)} beats from {beats_yaml.name}")
    else:
        seeded = rc_beats.seed(doc.ordered(), rows)
        rc_beats.write(seeded, beats_yaml)
        print(f"      seeded {len(seeded)} beats -> {beats_yaml.name}")
    undone = rc_beats.undirected(seeded)
    print(f"      {len(seeded) - len(undone)}/{len(seeded)} directed (have a shot spec)")

    print("[4/4] pages -> timeline.json")
    ov_path = HERE / "inputs" / "overrides.yaml"
    overrides = {}
    if ov_path.exists():
        import yaml as _yaml

        overrides = _yaml.safe_load(ov_path.read_text(encoding="utf-8")) or {}
        print(f"      overrides: {len(overrides)} beat(s) pinned from {ov_path.name}")
    tl = rc_pages.build_timeline(
        beats=seeded, script_rows=rows, doc=doc, manga_root=MANGA_ROOT,
        out_dir=OUT, fps=FPS, duration_seconds=tr["duration"], audio_path=clip,
        overrides=overrides,
    )
    for b in tl["beats"]:
        secs = f"{b['start'] / FPS:.1f}-{b['end'] / FPS:.1f}s"
        tag = "spec" if b.get("spec") else "----"
        print(f"        {b['id']:<24} {b['kind']:<6} {tag}  {secs:<14} {len(b['pages'])}pg  {b['chapterLabel']}")

    print(f"\ndone. {OUT / 'timeline.json'}  "
          f"({len(tl['beats'])} beats, {tl['durationInFrames']}f @ {FPS}fps)")
    print("outputs:", ", ".join(sorted(p.name for p in OUT.iterdir())))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
