"""srcregion.py <module_rel> <qualname_exact> <from_idx> <count>

Print compiled-src instruction lines [from_idx, from_idx+count) of one code
object, with the source line number of each instruction (Instruction.positions,
NOT co_positions() -- the latter includes CACHE entries and misaligns).
"""
import dis, os, sys, types

REC = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
mod, qual, lo, cnt = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
src = os.path.join(REC, mod)
top = compile(open(src, encoding="utf-8").read(), mod, "exec")


def walk(co):
    yield co
    for k in co.co_consts:
        if isinstance(k, types.CodeType):
            yield from walk(k)


mine = None
for c in walk(top):
    if c.co_qualname == qual:
        mine = list(dis.get_instructions(c, show_caches=False))
        break
if mine is None:
    sys.exit("no src object " + qual)
print("### %s :: %s  %d insns total" % (mod, qual, len(mine)))
for i in range(lo, min(cnt + lo, len(mine))):
    x = mine[i]
    print("src#%-5d line=%-5s %-28s %s" % (i, x.positions.lineno, x.opname, (x.argrepr or "").strip()))
