#!/usr/bin/env python3
"""Triage invent_hunt.json: split trustworthy (unique-qualname) diffs from ambiguous ones."""
import json, os, re, types
from collections import defaultdict, Counter
REC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WS = os.path.dirname(REC); WORK = os.path.join(REC, ".work")
MARKER = re.compile(r"^__pyarmor_"); JUNK = {"__assert_armored__"}
def clean(n): return None if n in JUNK or MARKER.match(n) else n

def walk(code, out):
    out.append(code)
    for k in code.co_consts:
        if isinstance(k, types.CodeType): walk(k, out)

idx = json.load(open(os.path.join(WORK, "das_index.json")))["modules"]
uniq, amb = [], []
for mod in sorted(idx):
    code = compile(open(os.path.join(REC, mod)).read(), mod, "exec", dont_inherit=True)
    S = []; walk(code, S)
    D = json.load(open(os.path.join(WS, idx[mod]["out"])))["objects"]
    sc, dc = Counter(c.co_qualname for c in S), Counter(o["qualified_name"] for o in D)
    sg, dg = defaultdict(list), defaultdict(list)
    for c in S: sg[c.co_qualname].append(c)
    for o in D: dg[o["qualified_name"]].append(o)
    if set(sg) != set(dg):
        uniq.append({"module": mod, "object": "<set>",
                     "missing_objects": sorted(set(dg)-set(sg)), "extra_objects": sorted(set(sg)-set(dg))})
    for q in sorted(set(sg) & set(dg)):
        if len(sg[q]) != len(dg[q]):
            uniq.append({"module": mod, "object": q, "kind": "count", "das": len(dg[q]), "source": len(sg[q])})
            continue
        for c, o in zip(sg[q], dg[q]):
            dn = {n for n in map(clean, o.get("names", [])) if n}; sn = {n for n in map(clean, c.co_names) if n}
            dl = {n for n in map(clean, o["locals"]) if n}; sl = {n for n in map(clean, c.co_varnames) if n}
            d = {}
            if sn-dn: d["names_extra"] = sorted(sn-dn)
            if dn-sn: d["names_missing"] = sorted(dn-sn)
            if sl-dl: d["locals_extra"] = sorted(sl-dl)
            if dl-sl: d["locals_missing"] = sorted(dl-sl)
            if set(o.get("cellvars",[])) != set(c.co_cellvars): d["cellvars"] = {"das": sorted(o.get("cellvars",[])), "source": sorted(c.co_cellvars)}
            if not d: continue
            # underscore-only explanation?
            def uscore_only(extra, missing):
                return all(("_"+e in missing) or (e.startswith("_") and e[1:] in missing) for e in extra)
            expl = uscore_only(d.get("locals_extra", []), set(d.get("locals_missing", [])))
            rec = {"module": mod, "object": q, "unique": dc[q] == 1 and sc[q] == 1,
                   "underscore_only": expl, **d}
            (uniq if rec["unique"] else amb).append(rec)

json.dump({"unique": uniq, "ambiguous": amb}, open(os.path.join(WORK, "invent_triage.json"), "w"), ensure_ascii=False, indent=1)
print(f"# unique-qualname diff objects: {len(uniq)}   ambiguous: {len(amb)}")
print("\n== UNIQUE-QUALNAME DIFFS (trustworthy) ==")
for r in uniq:
    bits = []
    for k in ("names_extra","names_missing","locals_extra","locals_missing","cellvars","missing_objects","extra_objects","kind"):
        if k in r: bits.append(f"{k}={r[k]}")
    print(f"  {r['module']}::{r['object']}  " + "  ".join(bits))
ku = Counter(k for r in uniq for k in ("names_extra","names_missing","locals_extra","locals_missing") if k in r)
amu = Counter()
for r in amb:
    if r["underscore_only"]: amu["underscore-only"] += 1
    elif "names_extra" in r or "names_missing" in r: amu["names-diff"] += 1
    elif "locals_extra" in r or "locals_missing" in r: amu["locals-only"] += 1
print("\n== unique diff keys:", dict(ku))
print("== ambiguous buckets:", dict(amu))
