#!/usr/bin/env python3
"""Semantic reference diff: restored source vs the authoritative 0.6.7 .das.

PyArmor wraps every code object in a fixed prologue/epilogue skeleton that adds
only *structural* instructions (PUSH_NULL / CALL / POP_TOP / JUMP_FORWARD /
RETURN_VALUE / LOAD_CONST of markers).  Attribute, global and import references
are untouched by that skeleton, so counting (opcode, symbolic-argument) pairs
over the "semantic" opcode set gives a clean per-object divergence metric that
is immune to the obfuscator noise.

Run with the bundled 3.12:  .work/py312/python/bin/python3.12 .work/faith2.py
"""
import dis, json, os, pathlib, re, sys, itertools
from collections import Counter, defaultdict

REC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WS = os.path.dirname(REC); WORK = os.path.join(REC, ".work")
REF67 = os.path.join(WORK, "ref067")

CODE_RE = re.compile(r"^(\s*)\[Code\]\s*$")
SEC_RE = re.compile(r"^(\s*)\[([A-Za-z][A-Za-z+ ]*)\]\s*$")
FIELD_RE = re.compile(r"^(\s*)([A-Za-z][A-Za-z ]*): ?(.*)$")
INS_RE = re.compile(r"^\s*(\d+)\s+([A-Z][A-Z0-9_]*)\s*(.*)$")
PYA = re.compile(r"__pyarmor_")

SEMANTIC_OPS = {
    "LOAD_ATTR", "LOAD_METHOD", "STORE_ATTR", "LOAD_GLOBAL", "STORE_GLOBAL",
    "IMPORT_NAME", "IMPORT_FROM", "IMPORT_STAR", "COMPARE_OP", "IS_OP",
    "CONTAINS_OP", "BINARY_OP", "BINARY_SUBSCR", "STORE_SUBSCR", "DELETE_SUBSCR",
    "CALL_INTRINSIC_1", "GET_ITER", "FORMAT_VALUE", "UNPACK_SEQUENCE", "UNPACK_EX",
    "BUILD_SLICE", "LOAD_SUPER_ATTR",
}


def parse_das(path):
    objs, stack = [], []
    for line in pathlib.Path(path).read_text(encoding="utf-8", errors="replace").splitlines():
        ind = len(line) - len(line.lstrip())
        if line.strip():
            while stack and stack[-1]["indent"] >= ind:
                stack.pop()
        m = CODE_RE.match(line)
        if m:
            o = {"qualname": None, "indent": ind, "ins": [], "section": None}
            objs.append(o); stack.append(o); continue
        if not stack: continue
        o = stack[-1]
        s = SEC_RE.match(line)
        if s and ind == o["indent"] + 4: o["section"] = s.group(2); continue
        f = FIELD_RE.match(line)
        if f and ind == o["indent"] + 4 and o["section"] is None:
            if f.group(2) == "Qualified Name": o["qualname"] = f.group(3).strip()
            continue
        if o["section"] == "Disassembly" and ind > o["indent"] + 4:
            mm = INS_RE.match(line)
            if mm: o["ins"].append((mm.group(2), mm.group(3).strip()))
    return objs


BOOLOPS = {"IS_OP": {"is": "0", "is not": "1"},
           "CONTAINS_OP": {"in": "0", "not in": "1"}}
NORMALISED_OPS = {"FORMAT_VALUE", "BINARY_SUBSCR", "STORE_SUBSCR", "DELETE_SUBSCR", "PRECALL"}


def canon_das(op, arg):
    s = (arg or "").strip()
    if op in NORMALISED_OPS: return ""
    s = re.sub(r"^\d+:\s*", "", s)
    m = re.match(r"^\d+\s*\((.+)\)$", s)
    if m: s = m.group(1).strip()
    if op in BOOLOPS: return BOOLOPS[op].get(s, s)
    s = re.sub(r"^(?:NULL\|self|NULL|self)\s*\+\s*", "", s)
    s = re.sub(r"\s*\(to \d+\)$", "", s)
    return s.strip()


def canon_src(ins):
    if ins.opname in NORMALISED_OPS: return ""
    if ins.opname in ("UNPACK_SEQUENCE", "UNPACK_EX"):
        return str(ins.argval)
    if ins.opname in BOOLOPS:
        t = (ins.argrepr or "").strip()
        m = re.match(r"^\d+\s*\((.+)\)$", t)
        if m: t = m.group(1).strip()
        if t in BOOLOPS[ins.opname]: return BOOLOPS[ins.opname][t]
        if t: return t
        return str(ins.argval) if ins.argval is not None else ""
    if ins.opname in ("COMPARE_OP", "BINARY_OP"):
        return (ins.argrepr or "").strip()
    s = (ins.argrepr or "").strip()
    s = re.sub(r"^(?:NULL\|self|NULL|self)\s*\+\s*", "", s)
    s = re.sub(r"\s*\(to \d+\)$", "", s)
    if s.startswith("<") and s.endswith(">"): return ""
    return s


def sem_counter_das(ins):
    c = Counter()
    for op, arg in ins:
        if op in SEMANTIC_OPS:
            c[(op, canon_das(op, arg))] += 1
    return c


def sem_counter_src(code):
    c = Counter()
    for i in dis.get_instructions(code, show_caches=False):
        if i.opname in SEMANTIC_OPS:
            if PYA.search(i.argrepr or "") or PYA.search(str(i.argval or "")): continue
            c[(i.opname, canon_src(i))] += 1
    return c


def walk(code, out):
    out.append(code)
    for k in code.co_consts:
        if hasattr(k, "co_qualname"): walk(k, out)


def group(objs):
    g = defaultdict(list)
    for o in objs:
        if o["qualname"]: g[o["qualname"]].append(o)
    return g


def delta_of(a, b):
    d = a - b; e = b - a
    return sum(d.values()) + sum(e.values()), d, e


def align(das_list, src_list, src_counters, naive=False):
    """Pair das objects with compiled code objects, minimising total delta.

    Qualnames such as <genexpr> repeat inside a module; das order and compile
    order need not agree, so positional zipping can report mirrored phantom
    differences.  Groups of <= 8 are matched by exhaustive permutation.
    """
    n = len(das_list)
    if naive: return list(zip(das_list, src_list))
    das_counters = [sem_counter_das(o["ins"]) for o in das_list]
    M = [[delta_of(das_counters[i], src_counters[j])[0] for j in range(n)] for i in range(n)]
    if n <= 8:
        best, best_perm = None, None
        for perm in itertools.permutations(range(n)):
            cost = sum(M[i][perm[i]] for i in range(n))
            if best is None or cost < best:
                best, best_perm = cost, perm
        return [(das_list[i], src_list[best_perm[i]]) for i in range(n)]
    # greedy seed then 2-opt swaps, so big groups (e.g. the 79 <genexpr>s of
    # config.py::validate_config) are aligned near-optimally too.
    used_i, used_j, pairs = set(), set(), {}
    for i, j in sorted(((i, j) for i in range(n) for j in range(n)), key=lambda ij: M[ij[0]][ij[1]]):
        if i in used_i or j in used_j: continue
        used_i.add(i); used_j.add(j); pairs[i] = j
    keys = sorted(pairs)
    improved = True
    while improved:
        improved = False
        for x in range(len(keys)):
            for y in range(x + 1, len(keys)):
                i, k = keys[x], keys[y]
                a, b = pairs[i], pairs[k]
                if M[i][a] + M[k][b] > M[i][b] + M[k][a]:
                    pairs[i], pairs[k] = b, a
                    improved = True
    return [(das_list[i], src_list[pairs[i]]) for i in keys]


def main():
    top = int(sys.argv[1]) if len(sys.argv) > 1 else 50
    naive = "--naive" in sys.argv
    rows, mod_rows, unmatched = [], [], []
    for p in sorted(pathlib.Path(REF67).glob("**/*.1shot.das")):
        rel = str(p.relative_to(REF67))[:-len(".1shot.das")]
        src = os.path.join(REC, rel)
        if not os.path.exists(src): continue
        try:
            code = compile(open(src, encoding="utf-8").read(), src, "exec", dont_inherit=True)
        except Exception as e:
            print("COMPILE FAIL", rel, e); continue
        S = []; walk(code, S)
        sg, dg = defaultdict(list), group(parse_das(p))
        for c in S: sg[c.co_qualname].append(c)
        agg_das, agg_src = Counter(), Counter()
        for q in sorted(set(sg) | set(dg)):
            if q not in sg or q not in dg:
                unmatched.append({"module": rel, "object": q, "in": "das" if q not in sg else "src",
                                  "n": len(dg.get(q, [])) if q not in sg else len(sg.get(q, []))})
                continue
            if len(sg[q]) != len(dg[q]):
                unmatched.append({"module": rel, "object": q, "in": "count",
                                  "n": f"das={len(dg[q])} src={len(sg[q])}"}); continue
            sc = [sem_counter_src(c) for c in sg[q]]
            for c in sc: agg_src.update(c)
            for o in dg[q]: agg_das.update(sem_counter_das(o["ins"]))
            for o, c in align(dg[q], sg[q], sc, naive):
                a, b = sem_counter_das(o["ins"]), sem_counter_src(c)
                delta, d, e = delta_of(a, b)
                rows.append({"module": rel, "object": q, "delta": delta, "group": len(dg[q]),
                             "das_only": {f"{k[0]} {k[1]}": v for k, v in d.most_common()},
                             "src_only": {f"{k[0]} {k[1]}": v for k, v in e.most_common()}})
        md, de, ee = delta_of(agg_das, agg_src)
        mod_rows.append({"module": rel, "delta": md,
                         "das_only": {f"{k[0]} {k[1]}": v for k, v in de.most_common()},
                         "src_only": {f"{k[0]} {k[1]}": v for k, v in ee.most_common()}})
    rows.sort(key=lambda r: -r["delta"])
    mod_rows.sort(key=lambda r: -r["delta"])
    json.dump({"objects": rows, "modules": mod_rows, "unmatched": unmatched},
              open(os.path.join(WORK, "faith2.json"), "w"), ensure_ascii=False, indent=1)
    dist = Counter()
    for r in rows:
        d = r["delta"]
        dist["0" if d == 0 else "1" if d == 1 else "2" if d == 2 else "3-5" if d <= 5 else "6-10" if d <= 10 else "11-20" if d <= 20 else ">20"] += 1
    print(f"# pairing={'naive zip' if naive else 'delta-minimising'}  objects={len(rows)}  modules={len(mod_rows)}  unmatched={len(unmatched)}")
    print(f"# object delta distribution: {dict(dist)}")
    print(f"# per-object exact match: {dist['0']} ({dist['0']*100.0/len(rows):.1f}%)")
    md0 = sum(1 for r in mod_rows if r["delta"] == 0)
    print(f"# per-module aggregate exact: {md0}/{len(mod_rows)}")
    print("")
    print(f"== top {top} objects by semantic-reference delta")
    for r in rows[:top]:
        if r["delta"] == 0: break
        print(f"  delta={r['delta']:3d}  {r['module']}::{r['object']}" + (f"  [group={r['group']}]" if r["group"] > 1 else ""))
        if r["das_only"]: print(f"        das-only: {r['das_only']}")
        if r["src_only"]: print(f"        src-only: {r['src_only']}")
    print("")
    print("== modules with non-zero aggregate delta")
    for r in mod_rows:
        if r["delta"] == 0: continue
        print(f"  delta={r['delta']:3d}  {r['module']}")
        if r["das_only"]: print(f"        das-only: {r['das_only']}")
        if r["src_only"]: print(f"        src-only: {r['src_only']}")
    print("")
    print("== unmatched qualnames")
    for u in unmatched:
        print(" ", u["module"], u["object"], u["in"], u["n"])


if __name__ == "__main__":
    main()
