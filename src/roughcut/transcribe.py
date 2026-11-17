"""Word-level VO transcription via faster-whisper.

    from dragonball_db.roughcut.transcribe import transcribe
    transcribe("vo.m4a", "out/transcript.json")

Output JSON:
    {
      "audio": "<abs path>", "model": "small.en", "duration": 955.9,
      "words":    [{"w": "goku", "start": 0.12, "end": 0.34}, ...],
      "segments": [{"text": "...", "start": 0.0, "end": 4.1}, ...]
    }

The result is cached: a second call is a no-op unless the audio file is newer
than the transcript, or ``force=True``.
"""

from __future__ import annotations

import json
from pathlib import Path

from .. import config

# static-ffmpeg ships ffmpeg/ffprobe binaries inside the venv; add them to PATH
# so anything shelling out to ffmpeg works even though the system install is broken.
try:  # pragma: no cover - environment dependent
    import static_ffmpeg

    static_ffmpeg.add_paths()
except Exception:
    pass


def _newer(a: Path, b: Path) -> bool:
    return a.exists() and (not b.exists() or a.stat().st_mtime > b.stat().st_mtime)


def transcribe(
    audio: str | Path,
    out_path: str | Path,
    *,
    model: str = "small.en",
    force: bool = False,
    compute_type: str | None = None,
    beam_size: int = 5,
) -> dict:
    audio = Path(audio).resolve()
    out_path = Path(out_path)
    if not audio.exists():
        raise FileNotFoundError(audio)

    if out_path.exists() and not force and not _newer(audio, out_path):
        return json.loads(out_path.read_text(encoding="utf-8"))

    from faster_whisper import WhisperModel

    # int8 on CPU is the safe default; float16 needs a working CUDA build.
    device = "cuda" if config.env("WHISPER_CUDA") else "cpu"
    ctype = compute_type or ("float16" if device == "cuda" else "int8")

    wm = WhisperModel(model, device=device, compute_type=ctype)
    segments, info = wm.transcribe(
        str(audio),
        language="en",
        beam_size=beam_size,
        word_timestamps=True,
        vad_filter=True,
    )

    words: list[dict] = []
    segs: list[dict] = []
    for seg in segments:  # generator - consuming it runs the model
        segs.append({"text": seg.text.strip(), "start": round(seg.start, 3), "end": round(seg.end, 3)})
        for w in seg.words or []:
            token = w.word.strip()
            if token:
                words.append({"w": token, "start": round(w.start, 3), "end": round(w.end, 3)})

    result = {
        "audio": str(audio),
        "model": model,
        "device": device,
        "compute_type": ctype,
        "duration": round(float(info.duration), 3),
        "words": words,
        "segments": segs,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result
