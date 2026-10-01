#!/usr/bin/env python3
"""Assemble the 0.6.7 recovered tree from the 0.6.6 seeded sources.

Provenance: recovered/.work/seed67/ holds the previously restored, gate-verified
0.6.6 source for every 0.6.7 protected module except backend/app/ha/numeric_sources.py
(new in 0.6.7). This tool copies those 87 files over the mechanical pycdc scaffolds
that recovered/ currently contains, and records a manifest of what came from where.

Usage: /usr/bin/python3 recovered/tools/assemble_seed.py [--dry-run]
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import sys

WS = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # .../0.6.7
SEED = os.path.join(WS, "recovered/.work/seed67")
PREV = os.path.abspath(os.path.join(WS, "..", "0.6.6"))
INDEX = os.path.join(WS, "recovered/.work/das_index.json")


def sha256(path: str) -> str:
    with open(path, "rb") as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def main() -> int:
    dry = "--dry-run" in sys.argv
    modules = sorted(json.load(open(INDEX, encoding="utf-8"))["modules"])
    entries = []
    copied = pending = 0
    for module in modules:
        source = os.path.join(SEED, module)
        dest = os.path.join(WS, "recovered", module)
        if not os.path.isfile(source):
            entries.append({"module": module, "kind": "pending-rebuild", "source": None})
            pending += 1
            continue
        record = {
            "module": module,
            "kind": "seeded-from-0.6.6",
            "source": os.path.relpath(source, WS),
            "prev_path": os.path.join(PREV, module),
            "prev_sha256": sha256(source),
        }
        if not dry:
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            shutil.copy2(source, dest)
            record["dest_sha256"] = sha256(dest)
        entries.append(record)
        copied += 1
    if not dry:
        with open(os.path.join(WS, "recovered/.work/seed_assembly.json"), "w", encoding="utf-8") as handle:
            json.dump({"count": len(entries), "entries": entries}, handle, indent=1)
    print(f"seeded={copied} pending-rebuild={pending} total={len(entries)}")
    for entry in entries:
        if entry["kind"] != "seeded-from-0.6.6":
            print("  PENDING", entry["module"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
