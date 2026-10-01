"""dasobj.py <module_rel> <qualname_substr> [grep_regex] [ctx]

Print the disassembly of one .das object (from .work/ref067/<module_rel>.1shot.das),
optionally only instruction lines matching grep_regex plus ctx lines of context.
"""
import os, re, sys

REC = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
mod, target = sys.argv[1], sys.argv[2]
grep = sys.argv[3] if len(sys.argv) > 3 else None
ctx = int(sys.argv[4]) if len(sys.argv) > 4 else 0
path = os.path.join(REC, ".work", "ref067", mod + ".1shot.das")
lines = open(path, encoding="utf-8", errors="replace").read().splitlines()

hits = []
for i, l in enumerate(lines):
    m = re.match(r"^(\s*)Qualified Name:\s*(.+?)\s*$", l)
    if m and target in m.group(2):
        hits.append((i, len(m.group(1)), m.group(2)))
# prefer exact match
exact = [h for h in hits if h[2] == target]
chosen = (exact or hits)
if not chosen:
    print("no object matching", target); sys.exit(1)
if len(chosen) > 1 and not exact:
    print("### %d candidates: %s" % (len(chosen), [h[2] for h in chosen]))
start, indent, qn = chosen[0]
print("### %s :: %s  (das:%d)" % (mod, qn, start + 1))

# find this object's own [Disassembly]
j = start
while j < len(lines):
    s = lines[j].strip()
    if s == "[Disassembly]" and len(lines[j]) - len(lines[j].lstrip()) == indent:
        break
    if s.startswith("Object Name:") and len(lines[j]) - len(lines[j].lstrip()) <= indent:
        break
    j += 1
else:
    print("no disassembly found"); sys.exit(1)
print("### [Disassembly] at das:%d" % (j + 1))

INSTR = re.compile(r"^\s*(\d+)\s+([A-Z][A-Z0-9_]*)\s*(.*)$")
k = j + 1
seq = []
while k < len(lines):
    l = lines[k]
    s = l.strip()
    if INSTR.match(l):
        seq.append((k + 1, l.rstrip()))
    elif s == "":
        pass
    elif s.startswith("Object Name:") or s.startswith("[Code]") or s.startswith("Qualified Name:"):
        break
    k += 1

if grep:
    pat = re.compile(grep)
    idx = [i for i, (_, t) in enumerate(seq) if pat.search(t)]
    shown = set()
    for i in idx:
        for m in range(max(0, i - ctx), min(len(seq), i + ctx + 1)):
            shown.add(m)
    print("### %d/%d instruction lines match /%s/ (ctx=%d)" % (len(idx), len(seq), grep, ctx))
    for m in sorted(shown):
        print("%5d| %s" % (seq[m][0], seq[m][1]))
else:
    print("### %d instructions" % len(seq))
    for ln, t in seq:
        print("%5d| %s" % (ln, t))
