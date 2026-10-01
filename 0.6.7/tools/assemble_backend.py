#!/usr/bin/env python3
"""Assemble recovered/ backend sources.

Inputs:
  WS/recovered/.work/seqmirror/recovered/.work/scaffold/**   cleaned pycdc output
  WS/<path> for every plaintext backend file (no *.1shot.* artifact)
Outputs:
  WS/recovered/<same relative path>
  WS/recovered/.work/assemble_map.json
"""
import hashlib, json, os, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
WS = os.path.dirname(os.path.dirname(HERE))
SCAF = os.path.join(WS, "recovered", ".work", "seqmirror", "recovered", ".work", "scaffold")
OUT = os.path.join(WS, "recovered")

TOP_DIRS = ("backend", "migrations", "alembic_runtime")
TOP_FILES = ("container_entrypoint.py",)


def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    entries = {}
    n_scaffold = n_plain = 0

    if not os.path.isdir(SCAF):
        sys.exit("scaffold dir missing: %s" % SCAF)

    for base, dirs, files in os.walk(SCAF):
        dirs[:] = [d for d in dirs if d != "__pycache__"]
        for f in sorted(files):
            if not f.endswith(".py"):
                continue
            src = os.path.join(base, f)
            rel = os.path.relpath(src, SCAF)
            dest = os.path.join(OUT, rel)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            shutil.copyfile(src, dest)
            entries[rel] = {"kind": "deobfuscated", "source": "recovered/.work/seqmirror/recovered/.work/scaffold/" + rel,
                            "sha256": sha256(dest), "bytes": os.path.getsize(dest)}
            n_scaffold += 1

    for top in TOP_DIRS:
        root = os.path.join(WS, top)
        if not os.path.isdir(root):
            continue
        for base, dirs, files in os.walk(root):
            dirs[:] = [d for d in dirs if d not in ("__pycache__", ".git", "node_modules")]
            for f in sorted(files):
                if ".1shot." in f:
                    continue
                src = os.path.join(base, f)
                rel = os.path.relpath(src, WS)
                if rel in entries:
                    continue
                dest = os.path.join(OUT, rel)
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                shutil.copyfile(src, dest)
                entries[rel] = {"kind": "verbatim", "source": rel,
                                "sha256": sha256(dest), "bytes": os.path.getsize(dest)}
                n_plain += 1

    for f in TOP_FILES:
        src = os.path.join(WS, f)
        if not os.path.exists(src):
            continue
        dest = os.path.join(OUT, f)
        shutil.copyfile(src, dest)
        entries[f] = {"kind": "verbatim", "source": f, "sha256": sha256(dest), "bytes": os.path.getsize(dest)}
        n_plain += 1

    with open(os.path.join(WS, "recovered", ".work", "assemble_map.json"), "w", encoding="utf-8") as fh:
        json.dump(entries, fh, indent=1, sort_keys=True)
    print("deobfuscated modules: %d" % n_scaffold)
    print("verbatim files:       %d" % n_plain)
    print("total entries:        %d" % len(entries))


if __name__ == "__main__":
    main()
