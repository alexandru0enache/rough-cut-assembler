"""roughcut — the rough-cut assembler pipeline (transcribe -> align -> beats ->
direct -> pages -> check) plus the Remotion rough cut and motion graphics.

Package/command: `roughcut` (through 2026-09-05 it was `assembler`, kept from
the original `gfx-orchestrator` tool). The pipeline reads the Dragon Ball
database over the `dragonball_db` package (config, portraits, and the cbr
chapter helpers) and the subtitle / vision indexes.
"""

from __future__ import annotations

__version__ = "0.1.0"

__all__ = ["__version__"]
