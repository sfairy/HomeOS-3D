"""dasctx.py <module_rel> <qualname_exact> <regex> [ctx=10] -- print das disassembly context around matching instructions."""
import os, re, sys
REC = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
mod, qual, pat = sys.argv[1], sys.argv[2], sys.argv[3]
ctx = int(sys.argv[4]) if len(sys.argv) > 4 else 10
p = os.path.join(REC, ".work", "ref067", mod + ".1shot.das")
lines = open(p, encoding="utf-8", errors="replace").read().splitlines()
cands = []
for i, l in enumerate(lines):
    m = re.match(r"^(\s*)Qualified Name:\s*(.+?)\s*$", l)
    if m and m.group(2) == qual:
        cands.append((i, len(m.group(1))))
if not cands: sys.exit("no das object " + qual)
start, indent = cands[0]
j = start
while j < len(lines):
    if lines[j].strip() == "[Disassembly]" and len(lines[j]) - len(lines[j].lstrip()) == indent:
        break
    j += 1
INSTR = re.compile(r"^\s*(\d+)\s+([A-Z][A-Z0-9_]*)\s*(.*)$")
ins, k = [], j + 1
while k < len(lines):
    m = INSTR.match(lines[k]); s = lines[k].strip()
    if m: ins.append((k + 1, m.group(1), m.group(2), m.group(3).strip()))
    elif s == "" or s.startswith("#"): pass
    else: break
    k += 1
rx = re.compile(pat)
hit = [n for n, (ln, off, op, arg) in enumerate(ins) if rx.search(op + " " + arg)]
print("### %s :: %s  (%d insns, %d hits for /%s/)" % (mod, qual, len(ins), len(hit), pat))
for n in hit:
    lo, hi = max(0, n - ctx), min(len(ins), n + ctx + 1)
    print("--- hit at #%d (das line %d) ---" % (n, ins[n][0]))
    for m in range(lo, hi):
        ln, off, op, arg = ins[m]
        print("   %s #%-4d %s %-28s %s" % ("->" if m == n else "  ", m, off, op, arg))
