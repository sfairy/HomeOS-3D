#!/usr/bin/env python3
"""AC-G1: prove that nothing outside recovered/ was modified.

Compares the live workspace (excluding recovered/) against
recovered/.work/manifest.before.json and writes
recovered/.work/manifest_after.json + recovered/.work/manifest_diff.json.

Third-party tool scratch space (.graphflow/, graphflow-out/) is excluded from
the "project files untouched" verdict and reported separately, because the
GraphFlow MCP server writes it on its own.

Usage: /usr/bin/python3 recovered/tools/manifest_check.py
"""
import hashlib, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
WS = os.path.dirname(os.path.dirname(HERE))
WORK = os.path.join(WS, "recovered", ".work")
SKIP_TOP = {"recovered"}
TOOL_STATE_PREFIXES = (".graphflow/", "graphflow-out/")


def sha256(path, bufsize=1 << 20):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        while True:
            b = fh.read(bufsize)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def scan():
    out = []
    for root, dirs, files in os.walk(WS):
        rel_root = os.path.relpath(root, WS)
        rel_root = "" if rel_root == "." else rel_root
        top = rel_root.split(os.sep)[0]
        if top in SKIP_TOP:
            dirs[:] = []
            continue
        dirs[:] = [d for d in dirs if d != ".git"]
        for name in files:
            p = os.path.join(root, name)
            rel = os.path.normpath(os.path.join(rel_root, name))
            try:
                st = os.stat(p)
            except OSError:
                continue
            out.append({"path": rel, "size": st.st_size, "sha256": sha256(p)})
    out.sort(key=lambda e: e["path"])
    return out


def split(items, bmap, amap):
    tool, project = [], []
    for p in items:
        (tool if p.startswith(TOOL_STATE_PREFIXES) else project).append(p)
    return project, tool


def main():
    before = json.load(open(os.path.join(WORK, "manifest.before.json"), "r", encoding="utf-8"))
    bmap = {e["path"]: e for e in before}
    after = scan()
    amap = {e["path"]: e for e in after}

    added = sorted(set(amap) - set(bmap))
    removed = sorted(set(bmap) - set(amap))
    changed = sorted(p for p in (set(bmap) & set(amap))
                     if bmap[p]["sha256"] != amap[p]["sha256"] or bmap[p]["size"] != amap[p]["size"])

    a_proj, a_tool = split(added, bmap, amap)
    r_proj, r_tool = split(removed, bmap, amap)
    c_proj, c_tool = split(changed, bmap, amap)

    diff = {
        "before_count": len(before),
        "after_count": len(after),
        "project": {"added": a_proj, "removed": r_proj, "changed": c_proj,
                    "clean": not (a_proj or r_proj or c_proj)},
        "tool_state": {"added": a_tool, "removed": r_tool, "changed": c_tool,
                       "note": "written by the GraphFlow MCP server, not by this recovery job"},
        "clean": not (a_proj or r_proj or c_proj),
    }
    json.dump(after, open(os.path.join(WORK, "manifest_after.json"), "w", encoding="utf-8"), indent=1)
    json.dump(diff, open(os.path.join(WORK, "manifest_diff.json"), "w", encoding="utf-8"), indent=1)

    print("before=%d after=%d" % (len(before), len(after)))
    print("PROJECT   added=%d removed=%d changed=%d clean=%s"
          % (len(a_proj), len(r_proj), len(c_proj), diff["project"]["clean"]))
    print("TOOLSTATE added=%d removed=%d changed=%d" % (len(a_tool), len(r_tool), len(c_tool)))
    for label, items in (("added", a_proj), ("removed", r_proj), ("changed", c_proj)):
        for p in items[:30]:
            print("  project %s: %s" % (label, p))
    return 0


if __name__ == "__main__":
    sys.exit(main())
