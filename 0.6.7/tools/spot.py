#!/usr/bin/env python3
"""For each differing semantic key of one code object: show the .das window and
the restored source lines involved.  Run with the bundled 3.12.

  .work/py312/python/bin/python3.12 .work/spot.py <module_rel> <qualname> [--win N]
"""
import dis, os, sys
from collections import Counter, defaultdict
from objkeys import das_ins_with_off, walk, REF67, REC
from faith_objects import SEMANTIC_OPS, canon_das, canon_src


def main():
    mod, q = sys.argv[1], sys.argv[2]
    win = int(sys.argv[sys.argv.index("--win") + 1]) if "--win" in sys.argv else 5
    objs = [o for o in das_ins_with_off(os.path.join(REF67, mod + ".1shot.das")) if o["qual"] == q]
    code = compile(open(os.path.join(REC, mod), encoding="utf-8").read(), mod, "exec", dont_inherit=True)
    S = []; walk(code, S)
    hits = [c for c in S if c.co_qualname == q]
    lines = open(os.path.join(REC, mod), encoding="utf-8").read().splitlines()
    for o, c in zip(objs, hits):
        ins = o["ins"]
        dc, sc = Counter(), Counter()
        dpos, spos = defaultdict(list), defaultdict(list)
        for idx, (off, op, arg) in enumerate(ins):
            if op in SEMANTIC_OPS:
                k = (op, canon_das(op, arg)); dc[k] += 1; dpos[k].append(idx)
        for i in dis.get_instructions(c, show_caches=False):
            if i.opname in SEMANTIC_OPS:
                k = (i.opname, canon_src(i)); sc[k] += 1
                spos[k].append((i.offset, i.positions.lineno if i.positions else None))
        for k in sorted(set(dc) | set(sc), key=lambda k: -(abs(dc[k] - sc[k]))):
            if dc[k] == sc[k]: continue
            print(f"\n################ {mod}::{q}  key={k[0]} {k[1]!r}  das={dc[k]} src={sc[k]}")
            if dc[k]:
                for idx in dpos[k][:3]:
                    lo, hi = max(0, idx - win), min(len(ins), idx + win + 1)
                    print(f"  --- DAS window around {ins[idx][0]}")
                    for off, op, arg in ins[lo:hi]:
                        mark = ">>" if off == ins[idx][0] else "  "
                        print(f"   {mark}{off:>6} {op:<24} {arg}")
            if sc[k]:
                seen = []
                for off, ln in spos[k][:4]:
                    if ln is None: continue
                    a, b = max(1, ln - 4), min(len(lines), ln + 4)
                    if seen and a <= seen[-1][1]: a = seen[-1][1] + 1
                    print(f"  --- SRC window (src offset {off})")
                    for n in range(a, b + 1):
                        mark = ">>" if n == ln else "  "
                        print(f"   {mark}{n:>5}: {lines[n-1]}")
                    seen.append((a, b))


if __name__ == "__main__":
    main()
