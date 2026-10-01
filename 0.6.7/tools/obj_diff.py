#!/usr/bin/env python3
"""Print the disassembly of one .das code object next to the restored source's,
filtering the pyarmor skeleton so the two can be compared by eye.

  .work/py312/python/bin/python3.12 .work/objdiff.py <module_rel> <qualname> [--ordinal N] [--keep-skeleton]
"""
import dis, os, re, sys
from faith_objects import parse_das, REF67, REC

SKIP = {"NOP", "CACHE", "RESUME", "PRECALL"}
PYA = re.compile(r"__pyarmor_")
INS_RE = re.compile(r"^\s*(\d+)\s+([A-Z][A-Z0-9_]*)\s*(.*)$")


def das_ins(path, q, ordinal):
    lines = open(path, encoding="utf-8", errors="replace").read().splitlines()
    hits, cur, stack, section, want = [], None, [], None, None
    objs = []
    for line in lines:
        ind = len(line) - len(line.lstrip())
        code_hdr = re.match(r"^(\s*)\[Code\]\s*$", line)
        if line.strip():
            while stack and stack[-1][1] >= ind: stack.pop()
        if code_hdr:
            o = {"indent": ind, "qual": None, "ins": [], "sec": None}
            objs.append(o); stack.append((o, ind)); continue
        if not stack: continue
        o, oind = stack[-1]
        sm = re.match(r"^(\s*)\[([A-Za-z][A-Za-z+ ]*)\]\s*$", line)
        if sm and ind == oind + 4: o["sec"] = sm.group(2); continue
        fm = re.match(r"^(\s*)Qualified Name: ?(.*)$", line)
        if fm and ind == oind + 4: o["qual"] = fm.group(2).strip(); continue
        if o["sec"] == "Disassembly" and ind > oind + 4:
            m = INS_RE.match(line)
            if m: o["ins"].append((int(m.group(1)), m.group(2), m.group(3).strip()))
    hs = [o for o in objs if o["qual"] == q]
    if not hs: return None, sorted({o["qual"] for o in objs if o["qual"]})
    return hs[ordinal if ordinal is not None else 0], None


def find(code, q, ordinal=None):
    hits = []
    def w(c):
        if c.co_qualname == q: hits.append(c)
        for k in c.co_consts:
            if hasattr(k, "co_qualname"): w(k)
    w(code)
    if not hits: return None
    return hits[ordinal if ordinal is not None else 0]


def main():
    mod, q = sys.argv[1], sys.argv[2]
    keep = "--keep-skeleton" in sys.argv
    ordn = int(sys.argv[sys.argv.index("--ordinal") + 1]) if "--ordinal" in sys.argv else None
    das, cands = das_ins(os.path.join(REF67, mod + ".1shot.das"), q, ordn)
    if das is None:
        print("no das object for", q, "\n candidates:", cands); return
    code = compile(open(os.path.join(REC, mod), encoding="utf-8").read(), mod, "exec", dont_inherit=True)
    sc = find(code, q, ordn)
    if sc is None: print("no source object", q); return
    print(f"### DAS  {mod}::{q}")
    for off, op, arg in das["ins"]:
        if not keep and (op in SKIP or PYA.search(arg or "") or re.search(r"<COAddr", arg or "")): continue
        print(f"{off:>6} {op:<24} {arg}")
    print(f"\n### SRC  {mod}::{q}")
    for i in dis.get_instructions(sc, show_caches=False):
        if not keep and i.opname in SKIP: continue
        if not keep and (PYA.search(i.argrepr or "") or PYA.search(str(i.argval or ""))): continue
        print(f"{i.offset:>6} {i.opname:<24} {i.argrepr}")


if __name__ == "__main__":
    main()
