#!/usr/bin/env python3
"""Localise semantic-reference differences for one code object.

  .work/py312/python/bin/python3.12 .work/objkeys.py <module_rel> [<qualname> ...]

Prints, per object, every (opcode, canonical-arg) key whose count differs from
the authoritative .das, with the .das byte offsets and the source line numbers
where that key occurs.  Run with no qualname to scan the whole module.
"""
import dis, os, re, sys
from collections import Counter, defaultdict
from faith_objects import parse_das, canon_das, canon_src, REF67, REC, SEMANTIC_OPS


def das_ins_with_off(path):
    objs = []
    lines = open(path, encoding="utf-8", errors="replace").read().splitlines()
    stack = []
    ins_re = re.compile(r"^\s*(\d+)\s+([A-Z][A-Z0-9_]*)\s*(.*)$")
    for line in lines:
        if not line.strip(): continue
        ind = len(line) - len(line.lstrip())
        while stack and stack[-1][1] >= ind: stack.pop()
        m = re.match(r"^(\s*)\[Code\]\s*$", line)
        if m:
            o = {"indent": ind, "qual": None, "ins": [], "sec": None}
            objs.append(o); stack.append((o, ind)); continue
        if not stack: continue
        o, oind = stack[-1]
        sm = re.match(r"^(\s*)\[([A-Za-z][A-Za-z+ ]*)\]\s*$", line)
        if sm and ind == oind + 4: o["sec"] = sm.group(2); continue
        fm = re.match(r"^(\s*)Qualified Name: ?(.*)$", line)
        if fm and ind == oind + 4: o["qual"] = fm.group(2).strip(); continue
        if o["sec"] == "Disassembly" and ind > oind + 4:
            mm = ins_re.match(line)
            if mm: o["ins"].append((int(mm.group(1)), mm.group(2), mm.group(3).strip()))
    return objs


def walk(code, out):
    out.append(code)
    for k in code.co_consts:
        if hasattr(k, "co_qualname"): walk(k, out)


def analyse(mod, quals=None):
    path = os.path.join(REF67, mod + ".1shot.das")
    dos = das_ins_with_off(path)
    dg = defaultdict(list)
    for o in dos:
        if o["qual"]: dg[o["qual"]].append(o)
    code = compile(open(os.path.join(REC, mod), encoding="utf-8").read(), mod, "exec", dont_inherit=True)
    S = []; walk(code, S)
    sg = defaultdict(list)
    for c in S: sg[c.co_qualname].append(c)
    for q in (quals or sorted(set(sg) & set(dg))):
        if q not in sg or q not in dg or len(sg[q]) != len(dg[q]):
            print(f"-- skip {q} (pairs src={len(sg.get(q, []))} das={len(dg.get(q, []))})"); continue
        for c, o in zip(sg[q], dg[q]):
            dc, sc = Counter(), Counter()
            dpos, spos = defaultdict(list), defaultdict(list)
            for off, op, arg in o["ins"]:
                if op in SEMANTIC_OPS:
                    k = (op, canon_das(op, arg)); dc[k] += 1; dpos[k].append(off)
            for i in dis.get_instructions(c, show_caches=False):
                if i.opname in SEMANTIC_OPS:
                    k = (i.opname, canon_src(i)); sc[k] += 1
                    spos[k].append((i.offset, i.positions.lineno if i.positions else None))
            keys = sorted(set(dc) | set(sc), key=lambda k: -(abs(dc[k] - sc[k])))
            bad = [(k, dc[k], sc[k]) for k in keys if dc[k] != sc[k]]
            if not bad: continue
            print(f"\n== {mod}::{q}   ({len(bad)} differing key(s))")
            for k, a, b in bad:
                print(f"   das={a:3d} src={b:3d}  {k[0]:<20} {k[1]!r}")
                if a: print(f"        das offs : {dpos[k]}")
                if b: print(f"        src off/line: {spos[k]}")


if __name__ == "__main__":
    mod = sys.argv[1]; analyse(mod, sys.argv[2:] or None)
