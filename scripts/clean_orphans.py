"""Delete fully-disconnected non-HUD_ nodes (leaked test/dump tools).

Run on the Fusion page:
  exec(open(r"C:\\Users\\enach\\AppData\\Roaming\\Blackmagic Design\\DaVinci Resolve\\Support\\Fusion\\Scripts\\Comp\\clean_orphans.py").read())
"""

try:
    comp  # noqa: F821
except NameError:
    raise SystemExit("run on the Fusion page (Console / Workspace > Scripts)")

removed = []
for t in list(comp.GetToolList(False).values()):
    a = t.GetAttrs()
    name = a.get("TOOLS_Name", "")
    regid = a.get("TOOLS_RegID", "")
    if name.startswith("HUD_") or regid in ("MediaOut", "MediaIn"):
        continue

    connected = False
    try:
        for inp in t.GetInputList().values():
            if inp.GetConnectedOutput():
                connected = True
                break
    except Exception:
        pass
    if not connected:
        try:
            for out in t.GetOutputList().values():
                if out.GetConnectedInputs():
                    connected = True
                    break
        except Exception:
            pass

    if not connected:
        removed.append(name or regid)
        t.Delete()

print("removed orphans:", ", ".join(removed) if removed else "none")
