
import json, os, pathlib, shutil
WS = pathlib.Path("/Users/sfairy/项目/HA-Bridge/源代码/0.6.7")
rec = WS / "recovered"
mirror = rec / ".work" / "gatemirror"
if mirror.exists(): shutil.rmtree(mirror)
idx = json.load(open(rec / ".work" / "das_index.json"))
mods = [m["module"] if isinstance(m, dict) and "module" in m else m for m in idx["modules"]]
print("modules:", len(mods), "sample:", mods[:3])
n = 0
for mid in mods:
    mp = mirror / mid
    mp.parent.mkdir(parents=True, exist_ok=True)
    src = rec / mid
    if src.exists():
        os.symlink(src, mp)
    das = rec / ".work" / "ref067" / (mid + ".1shot.das")
    if das.exists():
        os.symlink(das, pathlib.Path(str(mp) + ".1shot.das"))
    n += 1
print("linked", n)
