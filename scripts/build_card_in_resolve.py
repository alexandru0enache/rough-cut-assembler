"""Run the gfx-orchestrator card builder INSIDE DaVinci Resolve.

Why: importing fusionscript.dll into an external Python 3.12/3.14 segfaults on
this Resolve 21 build, so the external ``gfxorch build`` path is blocked until a
compatible Python (try 3.10 / 3.11) is installed. Running here avoids the bridge
entirely - Resolve injects ``comp``.

USE
  1. Copy this file to the Fusion comp-scripts folder:
       %APPDATA%\\Blackmagic Design\\DaVinci Resolve\\Support\\Fusion\\Scripts\\Comp\\
  2. Open a clip on the Fusion page (node editor shows MediaIn1 -> MediaOut1).
  3. Workspace > Scripts > build_card_in_resolve
  Change EVENT_ID below to build a different card (ids: `gfxorch events <proj>`).
"""

import sys
import traceback

print("=" * 60)
print("build_card_in_resolve: starting")

# --- edit these ------------------------------------------------------------
REPO = r"E:\studio_root\projects\clients\dbype\_pipeline\rough_cut_assembler"
EVENTS = (
    r"E:\studio_root\projects\clients\dbype\production\discussions"
    r"\every_time_someone_surpassed_goku\04_make\hud_pipeline\events.yaml"
)
EVENT_ID = "db_02_roshi"
RESET = False   # False = update HUD_ nodes in place, keep Fusion tweaks.
#               # True  = delete all HUD_ nodes and rebuild from theme.py.
# ------------------------------------------------------------------------

for _p in (REPO + r"\src", REPO + r"\.venv\Lib\site-packages"):
    if _p not in sys.path:
        sys.path.insert(0, _p)

# Resolve keeps one Python session alive - drop cached gfxorch modules so each
# run picks up the latest source from disk.
for _m in [m for m in list(sys.modules) if m == "gfxorch" or m.startswith("gfxorch.")]:
    del sys.modules[_m]


def _run():
    from gfxorch import config
    from gfxorch.fusion_builder import build_card
    from gfxorch.model import load_events
    from gfxorch.portraits import resolve_portrait
    from gfxorch.themes import get_theme

    try:
        _comp = comp  # noqa: F821  - injected by Resolve in a Fusion Comp script
    except NameError:
        print("!! No `comp` in scope.")
        print("   Run this on the FUSION PAGE via Workspace > Scripts (or the")
        print("   Fusion Console set to Py3), with a clip open in the node editor.")
        return

    print(f"loading {EVENTS}")
    doc = load_events(EVENTS)
    ev = doc.by_id(EVENT_ID)
    if ev is None:
        print(f"!! no event id {EVENT_ID!r}; first ids: {[e.id for e in doc.events][:6]}")
        return

    theme = get_theme(doc.meta.theme)

    portrait = None
    if ev.portrait:
        m = resolve_portrait(ev.portrait, config.render_roots())
        portrait = m.path
        print(f"portrait: {ev.portrait} -> "
              f"{portrait.name if portrait else '(none - placeholder)'} "
              f"[{getattr(m, 'status', '?')}]")

    print(f"building {ev.id} ... (reset={RESET})")
    card = build_card(_comp, ev, theme, portrait_path=portrait, reset=RESET)
    if card.generated_chrome:
        print(f"OK - {ev.id}: HUD_CONTROL + starter card ({card.tool_count} nodes). "
              f"New: {', '.join(sorted(card.created))}")
    else:
        print(f"OK - {ev.id}: touched only [{', '.join(card.touched)}]. "
              f"All other nodes left alone.")


try:
    _run()
except Exception:
    print("!! build_card_in_resolve FAILED:")
    traceback.print_exc()
print("=" * 60)
