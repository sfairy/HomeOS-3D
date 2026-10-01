#!/usr/bin/env python3
"""Write every reconcile packet and a machine-readable residual index."""
from __future__ import annotations
import json, re, subprocess, sys
from pathlib import Path

ROOT = Path("/Users/sfairy/项目/HomeOS/HA-Bridge").resolve()
sys.path.insert(0, str(ROOT / "tools"))
import verify_restore as V  # noqa: E402
import verify_imports as I  # noqa: E402

targets = sorted(
    [p for p in (ROOT / "backend").rglob("*.py")] + [p for p in (ROOT / "migrations").rglob("*.py")],
    key=lambda p: str(p),
)
targets = [t for t in targets if ".1shot." not in t.name and "pyarmor_runtime" not in str(t)]

rows = []
for t in targets:
    das = Path(str(t) + ".1shot.das")
    if not das.is_file():
        continue
    r = V.verify(t)
    ir = I.verify(t)
    rows.append({
        "target": t.relative_to(ROOT).as_posix(),
        "missS": len(r.missing_strings),
        "missN": len(r.missing_names),
        "importsMissing": [f"{m.level}:{m.module}" for m in (ir.missing or [])],
        "importsUnexpected": [f"{lv}:{mod}" for lv, mod in (ir.unexpected or [])],
        "importsClean": not (ir.missing or ir.unexpected or ir.error),
        "restoreClean": not (r.missing_strings or r.missing_names or r.error),
    })

(ROOT / ".restore/logs/residual.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1))

# generate packets for everything that is not clean in either gate
dirty = [x["target"] for x in rows if not (x["restoreClean"] and x["importsClean"])]
subprocess.run([sys.executable, str(ROOT / "tools/reconcile_report.py"), *dirty], check=True,
               cwd=str(ROOT), stdout=subprocess.DEVNULL)

print(f"targets={len(rows)} restore_clean={sum(1 for x in rows if x['restoreClean'])} "
      f"imports_clean={sum(1 for x in rows if x['importsClean'])} dirty={len(dirty)}")
for x in sorted(rows, key=lambda x: -(x["missS"] + x["missN"])):
    if x["missS"] or x["missN"] or not x["importsClean"]:
        print(f"  {x['missS']:3d}+{x['missN']:3d}  imports={'ok' if x['importsClean'] else 'DIFF'}  {x['target']}")
