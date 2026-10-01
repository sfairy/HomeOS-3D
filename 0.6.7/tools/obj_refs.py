"""count_obj.py <module_rel> <qualname> [opname_filter]

Compare das instructions vs compiled-src instructions for one object:
prints per-opcode counts, and (with a filter) the matching lines from both sides.
"""
import dis, os, re, sys, types

REC = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
mod, qual = sys.argv[1], sys.argv[2]
filt = sys.argv[3] if len(sys.argv) > 3 else None

# ---- das side ----
p = os.path.join(REC, ".work", "ref067", mod + ".1shot.das")
lines = open(p, encoding="utf-8", errors="replace").read().splitlines()
cands = []
for i, l in enumerate(lines):
    m = re.match(r"^(\s*)Qualified Name:\s*(.+?)\s*$", l)
    if m and m.group(2) == qual:
        cands.append((i, len(m.group(1))))
if not cands:
    sys.exit("no das object for " + qual)
start, indent = cands[0]
j = start
while j < len(lines):
    s = lines[j].strip()
    if s == "[Disassembly]" and len(lines[j]) - len(lines[j].lstrip()) == indent:
        break
    if s.startswith("Object Name:") and len(lines[j]) - len(lines[j].lstrip()) <= indent:
        sys.exit("no disassembly")
    j += 1
INSTR = re.compile(r"^\s*(\d+)\s+([A-Z][A-Z0-9_]*)\s*(.*)$")
das = []
k = j + 1
while k < len(lines):
    m = INSTR.match(lines[k]); s = lines[k].strip()
    if m:
        das.append((m.group(2), m.group(3).strip()))
    elif s == "" or s.startswith("#"):
        pass
    else:
        break
    k += 1

# ---- src side ----
src = open(os.path.join(REC, mod), encoding="utf-8").read()
top = compile(src, mod, "exec")
found = []
def walk(co, prefix=""):
    for c in co.co_consts:
        if isinstance(c, types.CodeType):
            walk(c)
    if getattr(co, "co_qualname", "") == qual:
        found.append(co)
walk(top)
if not found:
    sys.exit("no src code object for " + qual)
mine = [(i.opname, (i.argrepr or "")) for i in dis.get_instructions(found[0])]

def counts(seq):
    d = {}
    for op, arg in seq:
        key = op
        if arg and op in ("LOAD_GLOBAL", "LOAD_ATTR", "LOAD_NAME", "STORE_ATTR", "STORE_NAME",
                          "LOAD_FAST", "STORE_FAST", "LOAD_METHOD", "LOAD_DEREF", "STORE_DEREF"):
            key = op + " " + re.sub(r"^(\d+:\s*|NULL \| )", "", arg).strip()
        d[key] = d.get(key, 0) + 1
    return d

cd, cm = counts(das), counts(mine)
print("### %s :: %s   das=%d insns  src=%d insns" % (mod, qual, len(das), len(mine)))
for key in sorted(set(cd) | set(cm)):
    a, b = cd.get(key, 0), cm.get(key, 0)
    if a != b:
        print("   DIFF %-28s das=%d src=%d" % (key, a, b))
if filt:
    print("--- das lines matching /%s/ ---" % filt)
    for n, (op, arg) in enumerate(das):
        if filt in op or filt in arg:
            print("   das#%-4d %s %s" % (n, op, arg))
    print("--- src lines matching /%s/ ---" % filt)
    for n, (op, arg) in enumerate(mine):
        if filt in op or filt in arg:
            print("   src#%-4d %s %s" % (n, op, arg))
