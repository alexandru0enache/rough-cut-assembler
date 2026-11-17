"""Resolve a portrait hint (e.g. ``frieza_final``) to a real render file.

The render libraries are messy human-named dumps
(``Frieza final form render 39 -Dokkan Battle.png``), so matching is fuzzy:
tokenise the hint, expand a few aliases, tokenise every filename (minus noise
words), and score by token overlap. Good enough for a coverage report; a
per-project override map handles the ones it gets wrong.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Iterable, Optional

from dragonball_db import config

# Filename tokens that carry no identity - drop before scoring.
_STOPWORDS = {
    "render", "renders", "art", "character", "official", "transparent", "full",
    "hd", "4k", "prev", "pre", "realesrgan", "x4plus", "upscale", "clean",
    "dokkan", "battle", "xkeeperz", "sdbh", "world", "mission", "legends",
    "kakarot", "fighterz", "budokai", "tenkaichi", "awakening", "extreme",
    "butoden", "bucchigiri", "match", "db", "dbz", "dbs", "the", "of", "and",
    "by", "vs", "png", "webp", "jpg", "jpeg", "no", "bg", "nobg", "cutout",
}

# hint token -> extra tokens it should also match in filenames
_ALIASES = {
    "ssj": {"super", "saiyan"},
    "ssj1": {"super", "saiyan"},
    "ssj2": {"super", "saiyan", "2"},
    "ssj3": {"super", "saiyan", "3"},
    "ult": {"ultimate", "mystic"},
    "ultimate": {"mystic"},
    "kid": {"child", "young"},
    "fat": {"majin"},
    "final": {"100"},
    "scouter": {"saga", "saiyan"},
    "teen": {"adult"},
    "gohan": {"son"},
    "goku": {"son", "kakarot"},
    "trunks": {"future"},
    "17": {"seventeen", "lapis"},
    "18": {"eighteen", "lazuli"},
}


def _tok(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def hint_tokens(hint: str) -> set[str]:
    out: set[str] = set()
    for t in _tok(hint):
        out.add(t)
        out |= _ALIASES.get(t, set())
    return {t for t in out if t not in _STOPWORDS}


def file_tokens(name: str) -> set[str]:
    return {t for t in _tok(name) if t not in _STOPWORDS}


@dataclass
class PortraitMatch:
    hint: str
    path: Optional[Path]
    score: float          # fraction of hint tokens found in the filename (0..1)
    candidates: list[Path]  # runners-up, best first
    status: str           # "resolved" | "partial" | "missing"


@lru_cache(maxsize=1)
def _index(roots: tuple[Path, ...]) -> list[tuple[Path, frozenset[str]]]:
    idx: list[tuple[Path, frozenset[str]]] = []
    for root in roots:
        if not root.is_dir():
            continue
        for p in root.rglob("*"):
            if p.suffix.lower() in config.PORTRAIT_EXTS and p.is_file():
                idx.append((p, frozenset(file_tokens(p.stem))))
    return idx


def resolve_portrait(
    hint: str,
    roots: Optional[Iterable[Path]] = None,
    overrides: Optional[dict[str, str]] = None,
) -> PortraitMatch:
    roots = tuple(roots) if roots is not None else tuple(config.render_roots())

    # 1. project.yaml override map wins
    if overrides and hint in overrides:
        hint = overrides[hint]  # fall through: the override may itself be a path or a hint

    # 2. direct file reference (absolute, or a name/relative path with an image ext)
    looks_like_path = (
        "/" in hint or "\\" in hint
        or Path(hint).suffix.lower() in config.PORTRAIT_EXTS
    )
    if looks_like_path:
        cand = Path(hint)
        if cand.is_file():
            return PortraitMatch(hint, cand, 1.0, [cand], "resolved")
        for root in roots:
            if (root / hint).is_file():
                return PortraitMatch(hint, root / hint, 1.0, [root / hint], "resolved")
        return PortraitMatch(hint, None, 0.0, [], "missing")

    wanted = hint_tokens(hint)
    if not wanted:
        return PortraitMatch(hint, None, 0.0, [], "missing")

    scored: list[tuple[float, int, Path]] = []
    for path, ftoks in _index(roots):
        hit = wanted & ftoks
        if not hit:
            continue
        frac = len(hit) / len(wanted)
        noise = len(ftoks - wanted)          # fewer unrelated tokens = tighter match
        scored.append((frac, -noise, path))
    scored.sort(reverse=True)

    if not scored:
        return PortraitMatch(hint, None, 0.0, [], "missing")

    best_frac = scored[0][0]
    best_path = scored[0][2]
    cands = [p for _, _, p in scored[:6]]
    status = "resolved" if best_frac >= 0.999 else "partial"
    return PortraitMatch(hint, best_path, best_frac, cands, status)
