#!/usr/bin/env python3
"""copy_assets.py -- byte-identical copy of every non-JS file under frontend/.

Reads   WS/frontend/**
Writes  WS/recovered/frontend/**   (same relative path, byte-for-byte)
Also    WS/recovered/.work/frontend_copy_map.json  (src -> dst + sha256)
"""
import hashlib
import json
import os
import shutil
import sys

ROOT = "/Users/sfairy/项目/HA-Bridge/源代码/0.6.7"
SRC = os.path.join(ROOT, "frontend")
DST = os.path.join(ROOT, "recovered", "frontend")
WORK = os.path.join(ROOT, "recovered", ".work")


def sha256_file(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    os.makedirs(WORK, exist_ok=True)
    entries = []
    copied = 0
    skipped = 0
    mismatches = []
    for dirpath, dirnames, filenames in os.walk(SRC):
        dirnames.sort()
        for name in sorted(filenames):
            abs_src = os.path.join(dirpath, name)
            rel = os.path.relpath(abs_src, SRC).replace(os.sep, "/")
            if rel.endswith(".js"):
                skipped += 1
                continue
            abs_dst = os.path.join(DST, rel.replace("/", os.sep))
            os.makedirs(os.path.dirname(abs_dst), exist_ok=True)
            shutil.copyfile(abs_src, abs_dst)
            s_src = sha256_file(abs_src)
            s_dst = sha256_file(abs_dst)
            ok = s_src == s_dst
            if not ok:
                mismatches.append(rel)
            entries.append({
                "source": "frontend/" + rel,
                "dest": "recovered/frontend/" + rel,
                "bytes": os.path.getsize(abs_src),
                "sha256": s_src,
                "destSha256": s_dst,
                "identical": ok,
            })
            copied += 1

    entries.sort(key=lambda e: e["source"])
    with open(os.path.join(WORK, "frontend_copy_map.json"), "w") as f:
        json.dump({
            "root": ROOT,
            "srcDir": "frontend",
            "dstDir": "recovered/frontend",
            "count": copied,
            "jsSkipped": skipped,
            "mismatchCount": len(mismatches),
            "mismatches": mismatches,
            "entries": entries,
        }, f, indent=1)

    print(json.dumps({
        "assetsCopied": copied,
        "jsSkipped": skipped,
        "mismatches": len(mismatches),
        "mismatchList": mismatches[:20],
    }, indent=1))
    return 0 if not mismatches else 1


if __name__ == "__main__":
    sys.exit(main())
