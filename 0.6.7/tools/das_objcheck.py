#!/usr/bin/env python3
"""Independent code-object shape check.

For each protected 0.6.7 module, compare the set of code objects the .das says exist
(Object/Qualified Names, via recovered/.work/das_index.json) against the set of code
objects the recovered source actually produces when compiled with CPython 3.12 --
the same bytecode version the .das was captured from, so PEP 709 inlining and
PEP 649 annotations cannot distort the comparison.

MUST be run with the 3.12 interpreter: recovered/.work/py312/python/bin/python3.12
Usage: python3.12 tools/das_objcheck.py [--root .] [--json OUT] [module ...]
"""
from __future__ import annotations
import argparse, json, os, sys, types

TOOLS = os.path.dirname(os.path.abspath(__file__))
RECOVERED = os.path.dirname(TOOLS)
WS = os.path.dirname(RECOVERED)
WORK = os.path.join(RECOVERED, ".work")


# CO_VARARGS|CO_VARKEYWORDS|CO_NESTED|CO_GENERATOR|CO_COROUTINE|CO_ASYNC_GENERATOR
FLAG_MASK = 0x4 | 0x8 | 0x10 | 0x20 | 0x80 | 0x200


def collect(code, out):
    # co_qualname only: co_name would inject bare spellings (__init__, <genexpr>)
    # that the .das reports class-qualified, manufacturing false differences.
    out[code.co_qualname] = code
    for const in code.co_consts:
        if isinstance(const, types.CodeType):
            collect(const, out)
    return out


def normalize(q):
    # 3.12 qualnames already match the .das spellings; belt and braces for
    # module-level spelling differences only.
    return q


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=RECOVERED)
    ap.add_argument("--index", default=os.path.join(WORK, "das_index.json"))
    ap.add_argument("--json", default=os.path.join(WORK, "backend_objcheck.json"))
    ap.add_argument("modules", nargs="*")
    a = ap.parse_args()

    idx = json.load(open(a.index, encoding="utf-8"))["modules"]
    names = a.modules or sorted(idx)
    rows, bad = [], 0
    for mod in names:
        rec = idx[mod]
        want = {normalize(q) for q in rec["qualified_names"]}
        src_path = os.path.join(a.root, mod)
        row = {"module": mod, "das_objects": len(want)}
        try:
            src = open(src_path, encoding="utf-8").read()
            code = compile(src, src_path, "exec", dont_inherit=True)
        except SyntaxError as e:
            rows.append({**row, "status": "SYNTAX-ERROR", "detail": f"{e.msg} @ line {e.lineno}"})
            bad += 1
            continue
        got = collect(code, {})
        missing = sorted(want - set(got))
        extra = sorted(set(got) - want)
        # signature check on objects both sides agree exist
        sig = []
        das_path = rec.get("out")
        if das_path and not os.path.isabs(das_path):
            das_path = os.path.join(WS, das_path)
        das_objects = json.load(open(das_path, encoding="utf-8"))["objects"] if das_path and os.path.exists(das_path) else []
        das_by_q = {}
        for o in das_objects:
            das_by_q.setdefault(o["qualified_name"], o)
        for q in sorted(want & set(got)):
            d = das_by_q.get(q)
            c = got[q]
            if not d:
                continue
            # .das renders the counts as strings
            want_t = (int(d["arg_count"]), int(d["pos_only"]), int(d["kw_only"]),
                      int(d["flags"]) & FLAG_MASK)
            have_t = (c.co_argcount, c.co_posonlyargcount, c.co_kwonlyargcount,
                      c.co_flags & FLAG_MASK)
            if want_t != have_t:
                sig.append({"object": q, "das": want_t, "source": have_t})
        row.update(status="ok" if not (missing or extra or sig) else "DIFF",
                   got_objects=len(got), missing=missing, extra=extra, signature=sig)
        if row["status"] != "ok":
            bad += 1
        rows.append(row)

    totals = {"modules": len(rows),
              "clean": sum(1 for r in rows if r["status"] == "ok"),
              "diff": sum(1 for r in rows if r["status"] == "DIFF"),
              "syntax_error": sum(1 for r in rows if r["status"] == "SYNTAX-ERROR")}
    json.dump({"totals": totals, "rows": rows}, open(a.json, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(f"# das object-shape check: modules={totals['modules']} clean={totals['clean']} "
          f"diff={totals['diff']} syntax_error={totals['syntax_error']}")
    for r in rows:
        if r["status"] == "ok":
            continue
        print(f"  ! {r['module']:<58} {r['status']}")
        if r.get("missing"):
            print(f"      missing-in-source : {', '.join(r['missing'][:12])}")
        if r.get("extra"):
            print(f"      extra-in-source   : {', '.join(r['extra'][:12])}")
        for s in r.get("signature", [])[:12]:
            print(f"      signature {s['object']}: das={s['das']} source={s['source']}")
    print(f"# wrote {a.json}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
