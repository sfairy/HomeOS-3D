import os, re, sys
REC = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
mod, qual = sys.argv[1], sys.argv[2]
p = os.path.join(REC, ".work", "ref067", mod + ".1shot.das")
lines = open(p, encoding="utf-8", errors="replace").read().splitlines()
cands = [i for i, l in enumerate(lines) if re.match(r"^\s*Qualified Name:\s*" + re.escape(qual) + r"\s*$", l)]
if not cands: sys.exit("no object " + qual)
i = cands[0]
# back up to Object Name:
j = i
while j > 0 and "Object Name:" not in lines[j]: j -= 1
k = i
while k < len(lines) and lines[k].strip() != "[Disassembly]": k += 1
out = lines[j:k]
for n, l in enumerate(out):
    print("%6d| %s" % (j + n + 1, l[:300]))
print(">>> disassembly starts at das line %d" % (k + 1))
