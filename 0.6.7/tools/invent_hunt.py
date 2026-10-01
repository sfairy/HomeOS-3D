#!/usr/bin/env python3
"""Collision-safe per-object invention hunt: pair das objects with source code
objects by (qualified_name, ordinal in pre-order) instead of collapsing by name."""
import json, os, re, sys, types
from collections import defaultdict, Counter

REC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # .../recovered
WS  = os.path.dirname(REC)
WORK = os.path.join(REC, ".work")
MARKER = re.compile(r"^__pyarmor_")
JUNK = {"__assert_armored__", "__pyarmor_armor_wrapper__"}
def clean(n):
    if n in JUNK or MARKER.match(n): return None
    return n

def walk(code, out):
    out.append(code)
    for k in code.co_consts:
        if isinstance(k, types.CodeType):
            walk(k, out)

def strings(code):
    out, stack = set(), [code]
    while stack:
        c = stack.pop()
        for v in c.co_consts:
            if isinstance(v, str): out.add(v)
            elif isinstance(v, tuple):
                for x in v:
                    if isinstance(x, str): out.add(x)
                    elif isinstance(x, frozenset): out |= {y for y in x if isinstance(y, str)}
            elif isinstance(v, frozenset): out |= {y for y in v if isinstance(y, str)}
            elif isinstance(v, types.CodeType): stack.append(v)
    return {v for v in out if not (v.startswith("__pyarmor_") or v.startswith("<COAddr>") or v.startswith("<frozen "))}

idx = json.load(open(os.path.join(WORK, "das_index.json")))["modules"]
rows, agg = [], {"count_mismatch": 0, "pairs": 0}
extra_all = Counter(); miss_all = Counter(); det = []
for mod in sorted(idx):
    src = os.path.join(REC, mod)
    code = compile(open(src, encoding="utf-8").read(), src, "exec", dont_inherit=True)
    src_objs = []
    walk(code, src_objs)
    das_objs = json.load(open(os.path.join(WS, idx[mod]["out"]), encoding="utf-8"))["objects"]
    sg, dg = defaultdict(list), defaultdict(list)
    for c in src_objs: sg[c.co_qualname].append(c)
    for o in das_objs: dg[o["qualified_name"]].append(o)
    mod_diffs = []
    if set(sg) != set(dg):
        mod_diffs.append({"object": "<set>", "kind": "qualname-set",
                          "missing": sorted(set(dg) - set(sg)), "extra": sorted(set(sg) - set(dg))})
    for q in sorted(set(sg) & set(dg)):
        S, D = sg[q], dg[q]
        if len(S) != len(D):
            mod_diffs.append({"object": q, "kind": "count", "das": len(D), "source": len(S)})
            agg["count_mismatch"] += 1
            continue
        for c, o in zip(S, D):
            agg["pairs"] += 1
            d = {}
            ds, ss = {n for n in map(clean, o["locals"]) if n}, {n for n in map(clean, c.co_varnames) if n}
            if ds != ss:
                if ss - ds: d["locals_extra_in_source"] = sorted(ss - ds)
                if ds - ss: d["locals_missing_in_source"] = sorted(ds - ss)
            dn = {n for n in map(clean, o.get("names", [])) if n}
            sn = {n for n in map(clean, c.co_names) if n}
            if dn != sn:
                if sn - dn: d["names_extra_in_source"] = sorted(sn - dn)
                if dn - sn: d["names_missing_in_source"] = sorted(dn - sn)
            dcs, scs = set(o.get("cellvars", [])), set(c.co_cellvars)
            if dcs != scs: d["cellvars"] = {"das": sorted(dcs), "source": sorted(scs)}
            dfr, sfr = set(map(clean, o.get("freevars", []))), {n for n in map(clean, c.co_freevars) if n}
            if dfr != sfr: d["freevars"] = {"das": sorted(dfr), "source": sorted(sfr)}
            if (o["arg_count"], o["pos_only"], o["kw_only"]) != (str(c.co_argcount), str(c.co_posonlyargcount), str(c.co_kwonlyargcount)):
                d["shape"] = {"das": (o["arg_count"], o["pos_only"], o["kw_only"]),
                              "source": (c.co_argcount, c.co_posonlyargcount, c.co_kwonlyargcount)}
            if d:
                for k in ("locals_extra_in_source", "locals_missing_in_source"):
                    for n in d.get(k, []): (extra_all if k == "locals_extra_in_source" else miss_all)[n] += 1
                mod_diffs.append({"object": q, **d})
                det.append({"module": mod, "object": q, **d})
    rows.append({"module": mod, "n_diffs": len(mod_diffs), "diffs": mod_diffs})

json.dump({"rows": rows, "detail": det}, open(os.path.join(WORK, "invent_hunt.json"), "w"), ensure_ascii=False, indent=1)
dirty = [r for r in rows if r["n_diffs"]]
print(f"# modules={len(rows)} clean={len(rows)-len(dirty)} dirty={len(dirty)} pairs={agg['pairs']} count_mismatch={agg['count_mismatch']} diff_objects={len(det)}")
print("\n== locals EXTRA in source (top 30, name : count  [sample object]) ==")
samp = defaultdict(list)
for d in det:
    for n in d.get("locals_extra_in_source", []): samp[n].append(f"{d['module']}::{d['object']}")
for n, c in extra_all.most_common(30):
    print(f"  {c:4d}  {n:22s} {samp[n][0]}")
print("\n== locals MISSING in source (top 20) ==")
print("  " + ", ".join(f"{n}({c})" for n, c in miss_all.most_common(20)))
print("\n== modules with the most diff objects ==")
for r in sorted(dirty, key=lambda r: -r["n_diffs"])[:10]:
    print(f"  {r['n_diffs']:4d}  {r['module']}")
