#!/usr/bin/env python3
"""Deep per-code-object fingerprint diff (independent gate).

For every code object the .das declares, compare the recovered source's compiled
CPython 3.12 code object against the .das record on:
  * co_names       (global/attribute identifier usage)
  * string constants
  * co_varnames / co_cellvars / co_freevars

PyArmor-injected artifacts (__pyarmor_*__ markers, __assert_armored__, <COAddr>
blobs, the frozen file name) are filtered from both sides before comparing, so a
difference is a genuine source/bytecode divergence.

Run with the 3.12 interpreter:
  recovered/.work/py312/python/bin/python3.12 tools/das_codecheck.py [--json OUT] [module ...]
"""
from __future__ import annotations
import argparse, json, os, re, sys, types
from collections import Counter

TOOLS = os.path.dirname(os.path.abspath(__file__))
RECOVERED = os.path.dirname(TOOLS)
WS = os.path.dirname(RECOVERED)
WORK = os.path.join(RECOVERED, ".work")

MARKER_RE = re.compile(r"^__pyarmor_[a-zA-Z0-9_]*_?\d*__$")
JUNK_NAMES = {"__assert_armored__", "__pyarmor_armor_wrapper__"}
JUNK_CONST_RE = re.compile(r"^(__pyarmor_|<COAddr>|<frozen )")


def clean_name(n):
    if n in JUNK_NAMES or MARKER_RE.match(n) or n.startswith("__pyarmor_"):
        return None
    return n


def clean_const(v):
    if isinstance(v, str):
        if JUNK_CONST_RE.match(v):
            return None
        return ("s", v)
    if isinstance(v, (bool,)):
        return ("b", v)
    if isinstance(v, (int,)):
        return ("i", v)
    if isinstance(v, float):
        return ("f", v)
    if v is None:
        return ("n",)
    if isinstance(v, tuple):
        parts = []
        for x in v:
            c = clean_const(x)
            if c is None:
                return None
            parts.append(c)
        return ("t", tuple(parts))
    if isinstance(v, frozenset):
        parts = []
        for x in v:
            c = clean_const(x)
            if c is None:
                return None
            parts.append(c)
        return ("fs", tuple(sorted(map(repr, parts))))
    return None  # code objects / unknown


SECTION_END_RE = re.compile(r"^\s{4,}\[[A-Za-z]")
STR_RE = re.compile(r"'(?:[^'\\]|\\.)*'|\"(?:[^\"\\]|\\.)*\"")


def das_raw_strings(o):
    """String constants straight out of the object's [Constants] section.

    daslib's flattened 'consts' field loses part of the section, so parse the raw
    text ourselves: everything between [Constants] and the next section header,
    then every quoted literal, decoded."""
    raw = o.get("raw") or ""
    i = raw.find("[Constants]")
    if i < 0:
        return set()
    tail = raw[i + len("[Constants]"):]
    cut = len(tail)
    for m in SECTION_END_RE.finditer(tail):
        cut = m.start()
        break
    body = tail[:cut]
    out = set()
    for m in STR_RE.finditer(body):
        lit = m.group(0)
        try:
            import ast as _ast
            v = _ast.literal_eval(lit)
        except Exception:
            v = lit[1:-1]
        if isinstance(v, str):
            out.add(v)
    return out


def collect_docstrings(code, out):
    """Docstring values per qualified name (the .das drops docstrings)."""
    import ast as _ast
    if code.co_consts and isinstance(code.co_consts[0], str):
        out.setdefault(code.co_qualname, set()).add(code.co_consts[0])
    for c in code.co_consts:
        if isinstance(c, types.CodeType):
            collect_docstrings(c, out)
    return out


def source_strings(code, docset=None):
    """Every string the object's constant table holds, including those nested in
    tuple/frozenset constants (3.12 stores KW_NAMES kwarg names in a tuple const)."""
    out = set()

    def walk(v):
        if isinstance(v, str):
            out.add(v)
        elif isinstance(v, (tuple, frozenset, list)):
            for x in v:
                walk(x)

    for x in code.co_consts:
        if not isinstance(x, types.CodeType):
            walk(x)
    return out

def clean_const_side(v, is_code=False):
    """das consts come from parsed text: keep the string/int forms we can compare."""
    if isinstance(v, str):
        if JUNK_CONST_RE.match(v):
            return None
        return ("s", v)
    return None


def walk_codes(code, out):
    out[code.co_qualname] = code
    for c in code.co_consts:
        if isinstance(c, types.CodeType):
            walk_codes(c, out)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=RECOVERED)
    ap.add_argument("--index", default=os.path.join(WORK, "das_index.json"))
    ap.add_argument("--json", default=os.path.join(WORK, "backend_codecheck.json"))
    ap.add_argument("--top", type=int, default=40)
    ap.add_argument("modules", nargs="*")
    a = ap.parse_args()

    idx = json.load(open(a.index, encoding="utf-8"))["modules"]
    names = a.modules or sorted(idx)
    rows, bad = [], 0
    for mod in names:
        rec = idx[mod]
        src_path = os.path.join(a.root, mod)
        try:
            code = compile(open(src_path, encoding="utf-8").read(), src_path, "exec", dont_inherit=True)
        except SyntaxError as e:
            rows.append({"module": mod, "status": "SYNTAX-ERROR", "detail": f"{e.msg} line {e.lineno}"})
            bad += 1
            continue
        got = walk_codes(code, {})
        das_objects = json.load(open(os.path.join(WS, rec["out"]), encoding="utf-8"))["objects"]
        diffs = []
        for o in das_objects:
            q = o["qualified_name"]
            c = got.get(q)
            if c is None:
                diffs.append({"object": q, "kind": "missing-code-object"})
                continue
            # --- names
            das_names = Counter(n for n in map(clean_name, o.get("names", [])) if n)
            src_names = Counter(n for n in map(clean_name, c.co_names) if n)
            # --- string consts, both sides, from the raw [Constants] section.
            all_src_s = {v for v in source_strings(c) if not JUNK_CONST_RE.match(v)}
            doc = c.co_consts[0] if c.co_consts and isinstance(c.co_consts[0], str) else None
            # PyArmor strips docstrings from the protected code objects, so a source
            # docstring is an expected extra: classify it, do not count it as a defect.
            doc_only = {doc} if isinstance(doc, str) and doc in all_src_s else set()
            src_s = all_src_s - doc_only
            das_s0 = das_raw_strings(o)
            das_s = {v for v in das_s0 if not JUNK_CONST_RE.match(v)
                     and v != o["file_name"] and not v.startswith("<COAddr>")}
            # --- vars
            das_locals = [n for n in map(clean_name, o.get("locals", [])) if n]
            src_locals = [n for n in map(clean_name, c.co_varnames) if n]
            das_cell = sorted(n for n in map(clean_name, o.get("cellvars", [])) if n)
            src_cell = sorted(n for n in map(clean_name, c.co_cellvars) if n)
            das_free = sorted(n for n in map(clean_name, o.get("freevars", [])) if n)
            src_free = sorted(n for n in map(clean_name, c.co_freevars) if n)
            d = {}
            if das_names != src_names:
                d["names_extra_in_source"] = sorted((src_names - das_names).elements())
                d["names_missing_in_source"] = sorted((das_names - src_names).elements())
            if src_s - das_s:
                d["str_const_extra_in_source"] = sorted(src_s - das_s)[:20]
            if doc_only - das_s:
                d.setdefault("docstring_in_source", 0)
                d["docstring_in_source"] = len(doc_only)
            mod_names = set(got["<module>"].co_names) if "<module>" in got else set()
            das_only = {v for v in (das_s - src_s)
                        if not (v.isidentifier() and v in mod_names)}
            if das_only:
                d["str_const_missing_in_source"] = sorted(das_only)[:20]
            if sorted(set(das_locals)) != sorted(set(src_locals)):
                d["varnames_extra_in_source"] = sorted(set(src_locals) - set(das_locals))
                d["varnames_missing_in_source"] = sorted(set(das_locals) - set(src_locals))
            if das_cell != src_cell:
                d["cellvars"] = {"das": das_cell, "source": src_cell}
            if das_free != src_free:
                d["freevars"] = {"das": das_free, "source": src_free}
            signal = {k: v for k, v in d.items()}
            signal.pop("docstring_in_source", None)
            if signal.get("names_extra_in_source") == ["__doc__"] and len(signal) == 1:
                signal = {}
            if signal.get("names_missing_in_source") == [] and len(signal) == 1:
                signal = {}
            if d:
                diffs.append({"object": q, "real": bool(signal), **d})
        real = [x for x in diffs if x.get("real")]
        if real:
            bad += 1
        rows.append({"module": mod, "status": "ok" if not real else "DIFF",
                     "real": len(real), "diffs": diffs})

    totals = {"modules": len(rows), "clean": sum(1 for r in rows if r["status"] == "ok"),
              "diff": sum(1 for r in rows if r["status"] != "ok"),
              "differing_objects": sum(len(r.get("diffs", [])) for r in rows)}
    json.dump({"totals": totals, "rows": rows}, open(a.json, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(f"# deep code-object check: modules={totals['modules']} clean={totals['clean']} "
          f"diff={totals['diff']} differing_objects={totals['differing_objects']}")
    shown = 0
    for r in rows:
        if r["status"] == "ok":
            continue
        print(f"  ! {r['module']}")
        for d in r["diffs"][:4]:
            print(f"      {d['object']}: " + "; ".join(
                f"{k}={v}" for k, v in d.items() if k != "object")[:400])
            shown += 1
            if shown >= a.top:
                break
        if shown >= a.top:
            break
    print(f"# wrote {a.json}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())