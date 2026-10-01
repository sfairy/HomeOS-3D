#!/usr/bin/env python3
"""Object-level .das-to-.das comparison (0.6.6 reference vs 0.6.7).

Both .das texts are the authoritative disassembly of the same project at two
versions, so a difference here is a real version delta - independent of the
restored source.  Parses the nested [Code] tree of the pycdas text output:
  * [Names]         -> identifier references
  * [Locals+Names]  -> argument/local names
  * [Constants]     -> string constants (recursively)
and compares, per (Qualified Name, ordinal in pre-order):
  names set, locals set, string-constant set, (arg, pos_only, kw_only), stack size, flags.

Usage: python3 tools/cmp_das_objs.py [--json OUT] [--ref66 DIR] [--ref67 DIR] [--verbose]
"""
import argparse, json, os, pathlib, re, sys

TOOLS = os.path.dirname(os.path.abspath(__file__))
REC = os.path.dirname(TOOLS)
WS = os.path.dirname(REC)
WORK = os.path.join(REC, ".work")

CODE_RE = re.compile(r"^(\s*)\[Code\]\s*$")
SEC_RE = re.compile(r"^(\s*)\[([A-Za-z][A-Za-z+ ]*)\]\s*$")
FIELD_RE = re.compile(r"^(\s*)([A-Za-z][A-Za-z ]*): ?(.*)$")
STR_RE = re.compile(r"^b?(['\"])(.*)\1\s*(?:#.*)?$")


def unquote(s):
    m = STR_RE.match(s.strip())
    if not m:
        return None
    body = m.group(2)
    try:
        return body.encode("utf-8").decode("unicode_escape")
    except Exception:
        return body


def parse(path):
    """Return list of objects in pre-order: dict(qualname, indent, names, locals, consts, fields)."""
    text = pathlib.Path(path).read_text(encoding="utf-8", errors="replace").splitlines()
    objs, stack = [], []
    for line in text:
        m = CODE_RE.match(line)
        if m:
            ind = len(m.group(1))
            while stack and stack[-1]["indent"] >= ind:
                stack.pop()
            o = {"qualname": None, "indent": ind, "names": [], "locals": [],
                 "consts": [], "fields": {}, "section": None, "parent": stack[-1]["qualname"] if stack else None}
            objs.append(o)
            stack.append(o)
            continue
        if not stack:
            continue
        o = stack[-1]
        ind = len(line) - len(line.lstrip())
        s = SEC_RE.match(line)
        if s and ind == o["indent"] + 4:
            o["section"] = s.group(2)
            continue
        f = FIELD_RE.match(line)
        if f and ind == o["indent"] + 4 and o["section"] is None:
            o["fields"][f.group(2)] = f.group(3).strip()
            if f.group(2) == "Qualified Name":
                o["qualname"] = f.group(3).strip()
            continue
        if o["section"] in ("Names", "Locals+Names") and ind > o["indent"] + 4:
            v = unquote(line.strip())
            if v:
                o["names" if o["section"] == "Names" else "locals"].append(v)
            continue
        if o["section"] == "Constants" and ind > o["indent"] + 4:
            v = unquote(line.strip())
            if v is not None:
                o["consts"].append(v)
            continue
    return objs


def clean(n):
    return None if n.startswith("__pyarmor_") or n in ("__assert_armored__", "__pyarmor_armor_wrapper__") else n


def group(objs):
    g = {}
    for o in objs:
        if o["qualname"] is None:
            continue
        g.setdefault(o["qualname"], []).append(o)
    return g


def sig(o):
    f = o["fields"]
    return (f.get("Arg Count"), f.get("Pos Only Arg Count"), f.get("KW Only Arg Count"))


def const_strings(o):
    return {v for v in o["consts"] if not (v.startswith("__pyarmor_") or v.startswith("<COAddr>") or v.startswith("<frozen "))}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", default=os.path.join(WORK, "das_objs_066_vs_067.json"))
    ap.add_argument("--ref66", default=os.path.join(os.path.dirname(WS), "0.6.6", "tools", "reference", ".extracted"))
    ap.add_argument("--ref67", default=os.path.join(WORK, "ref067"))
    ap.add_argument("--verbose", action="store_true")
    a = ap.parse_args()

    ref67 = pathlib.Path(a.ref67)
    mods = sorted(str(p.relative_to(ref67))[:-len(".1shot.das")] for p in ref67.glob("**/*.1shot.das"))
    rows, totals = [], {"modules": 0, "objects": 0, "differing": 0}
    for rel in mods:
        p67 = ref67 / (rel + ".1shot.das")
        p66 = pathlib.Path(a.ref66) / (rel + ".1shot.das")
        if not p66.exists():
            rows.append({"module": rel, "status": "no-0.6.6-reference"})
            continue
        totals["modules"] += 1
        g67, g66 = group(parse(p67)), group(parse(p66))
        diffs = []
        for q in sorted(set(g67) | set(g66)):
            A, B = g67.get(q, []), g66.get(q, [])
            if len(A) != len(B):
                diffs.append({"object": q, "kind": "count", "v067": len(A), "v066": len(B)})
                continue
            for i, (x, y) in enumerate(zip(A, B)):
                totals["objects"] += 1
                d = {}
                if sig(x) != sig(y):
                    d["signature"] = {"v067": sig(x), "v066": sig(y)}
                if x["fields"].get("Stack Size") != y["fields"].get("Stack Size"):
                    d["stack_size"] = {"v067": x["fields"].get("Stack Size"), "v066": y["fields"].get("Stack Size")}
                nx = {n for n in map(clean, x["names"]) if n}
                ny = {n for n in map(clean, y["names"]) if n}
                if nx != ny:
                    if nx - ny: d["names_067_only"] = sorted(nx - ny)
                    if ny - nx: d["names_066_only"] = sorted(ny - nx)
                lx = {n for n in map(clean, x["locals"]) if n}
                ly = {n for n in map(clean, y["locals"]) if n}
                if lx != ly:
                    if lx - ly: d["locals_067_only"] = sorted(lx - ly)
                    if ly - lx: d["locals_066_only"] = sorted(ly - lx)
                cx, cy = const_strings(x), const_strings(y)
                if cx != cy:
                    if cx - cy: d["consts_067_only"] = sorted(cx - cy)[:12]
                    if cy - cx: d["consts_066_only"] = sorted(cy - cx)[:12]
                if d:
                    diffs.append({"object": q, "ordinal": i, **d})
        if diffs:
            totals["differing"] += len(diffs)
        rows.append({"module": rel, "n": len(diffs), "diffs": diffs})

    json.dump({"totals": totals, "rows": rows}, open(a.json, "w"), ensure_ascii=False, indent=1)
    dirty = [r for r in rows if r.get("n")]
    print(f"# modules={totals['modules']} objects_compared={totals['objects']} "
          f"modules_with_diffs={len(dirty)} differing_objects={totals['differing']}")
    for r in dirty:
        print(f"\n== {r['module']}  ({r['n']})")
        for d in r["diffs"]:
            bits = "  ".join(f"{k}={v}" for k, v in d.items() if k != "ordinal")
            print(f"   {bits}")
    print(f"\nwrote {a.json}")


if __name__ == "__main__":
    main()
