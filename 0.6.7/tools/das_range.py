"""dasrange.py <module_rel> <qualname_exact> <from_idx> <count>

Print das instruction lines [from_idx, from_idx+count) of one .das object.
Object lookup and [Disassembly] location follow dasobj.py / count_obj.py
(this object's own [Disassembly] header has exactly the same indent as its
Qualified Name field; nested children's headers are deeper).
"""
import os, re, sys

REC = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
mod, qual, lo, cnt = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
p = os.path.join(REC, ".work", "ref067", mod + ".1shot.das")
lines = open(p, encoding="utf-8", errors="replace").read().splitlines()
indent = None
for l in lines:
    m = re.match(r"^(\s*)Qualified Name:\s*(.+?)\s*$", l)
    if m and m.group(2) == qual:
        indent = len(m.group(1)); break
if indent is None:
    sys.exit("no das object " + qual)
j = 0
seen = -1
for i, l in enumerate(lines):
    if l.strip() == "[Disassembly]" and (len(l) - len(l.lstrip())) == indent:
        if seen < 0: seen = i
for i, l in enumerate(lines):
    m = re.match(r"^(\s*)Qualified Name:\s*(.+?)\s*$", l)
    if m and m.group(2) == qual:
        k = i
        while k < len(lines):
            if lines[k].strip() == "[Disassembly]" and (len(lines[k]) - len(lines[k].lstrip())) == indent:
                j = k; break
            k += 1
        break
INSTR = re.compile(r"^\s*(\d+)\s+([A-Z][A-Z0-9_]*)\s*(.*)$")
ins, k = [], j + 1
while k < len(lines):
    m = INSTR.match(lines[k]); s = lines[k].strip()
    if m: ins.append((k + 1, m.group(1), m.group(2), m.group(3).strip()))
    elif s == "" or s.startswith("#"): pass
    else: break
    k += 1
print("### %s :: %s  %d insns total (search start das:%d)" % (mod, qual, len(ins), j + 1))
for n in range(lo, min(cnt + lo, len(ins))):
    ln, off, op, arg = ins[n]
    print("das#%-5d %5d| %6s %-28s %s" % (n, ln, off, op, arg))
