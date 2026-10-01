import os, re, sys
REC = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
mod, qual = sys.argv[1], sys.argv[2]
p = os.path.join(REC, ".work", "ref067", mod + ".1shot.das")
lines = open(p, encoding="utf-8", errors="replace").read().splitlines()
cands = [i for i, l in enumerate(lines) if re.match(r"^\s*Qualified Name:\s*" + re.escape(qual) + r"\s*$", l)]
if not cands: sys.exit("no object " + qual)
i = cands[0]
k = i
while k < len(lines) and lines[k].strip() != "[Constants]": 
    if lines[k].strip() == "[Disassembly]": sys.exit("no constants section")
    k += 1
if k == len(lines): sys.exit("no constants")
out = []
m = k + 1
while m < len(lines) and not re.match(r"^\s*(\[|Object Name:|Qualified Name:)", lines[m]):
    out.append(lines[m]); m += 1
print("### %s :: %s  [Constants] (%d entries)" % (mod, qual, len(out)))
for n, l in enumerate(out[:14]):
    print("  c%-3d %s" % (n, l.strip()[:200]))
