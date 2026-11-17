"""Print the real scripting input IDs for the nodes the builder uses.

Run from the Fusion page Console (Py3):
  exec(open(r"C:\\Users\\enach\\AppData\\Roaming\\Blackmagic Design\\DaVinci Resolve\\Support\\Fusion\\Scripts\\Comp\\dump_inputs.py").read())

Creates one of each node, lists its inputs, deletes it. Copy the output back.

Output location is NOT hardcoded: set DRAGONBALL_NODE_INPUTS_OUT to write
anywhere you like, otherwise it lands at the repo root's node_inputs.txt
(scripts/ -> repo root).
"""

import os
from pathlib import Path

# Loader omitted on purpose: adding one pops a file browser, and its IDs are
# already captured in node_inputs.txt.
OUT = os.environ.get("DRAGONBALL_NODE_INPUTS_OUT") or str(
    Path(__file__).resolve().parents[1] / "node_inputs.txt"
)

NODES = [
    "sRectangle", "sEllipse", "sNGon", "sBSpline", "sStar", "sPolygon",
    "sOutline", "sRender", "sMerge", "sTransform", "sDuplicate",
    "CornerPositioner", "Background", "TextPlus", "Transform",
    "Merge", "MultiMerge", "MediaOut",
    "EllipseMask", "RectangleMask", "PolygonMask", "BSplineMask",
    "Ellipse", "Rectangle", "Polygon", "BSpline",
    "ColorCorrector", "ColorGain", "BrightnessContrast", "Pixelate", "Defocus",
]

try:
    comp  # noqa: F821
except NameError:
    raise SystemExit("run this on the Fusion page (Console / Workspace > Scripts)")

lines, temp = [], []
for name in NODES:
    try:
        t = comp.AddTool(name, -32768, -32768)
        if t is None:
            lines.append(f"{name}: AddTool returned None")
            continue
        temp.append(t)
        ids = [str(v.GetAttrs().get("INPS_ID")) for v in t.GetInputList().values()]
        lines.append(f"{name}:\n   " + ", ".join(ids))
    except Exception as exc:  # noqa: BLE001
        lines.append(f"{name}: ERR {exc!r}")

for t in temp:                       # delete AFTER, with the comp unlocked
    try:
        t.Delete()
    except Exception:
        pass

text = "\n".join(lines) + "\n"
with open(OUT, "w", encoding="utf-8") as fh:
    fh.write(text)
print(text)
print(f"[written to {OUT}]")
