
import re, pathlib, sys, os, glob

CODE_RE = re.compile(r"^(\s*)\[Code\]\s*$")

def parse(path):
    lines = pathlib.Path(path).read_text(encoding="utf-8", errors="replace").splitlines()
    objs = {}
    for i, line in enumerate(lines):
        m = CODE_RE.match(line)
        if not m: continue
        ind = m.group(1) + "    "
        f, locs, in_locals = {}, [], False
        for j in range(i + 1, len(lines)):
            l = lines[j]
            if not l.startswith(ind) and l.strip():
                break
            if l.rstrip() == ind + "[Locals+Names]":
                in_locals = True; continue
            if re.match(r"^\s*\[[A-Za-z]", l) and l.rstrip() != ind + "[Locals+Names]":
                if in_locals: break
                continue
            if in_locals:
                if l.strip():
                    locs.append(l.strip().strip("'"))
                continue
            mm = re.match(re.escape(ind) + r"(Qualified Name|Arg Count|Pos Only Arg Count|KW Only Arg Count): ?(.*)$", l)
            if mm:
                f[mm.group(1)] = mm.group(2).strip()
        q = f.get("Qualified Name")
        if q: objs[q] = (f.get("Arg Count"), f.get("Pos Only Arg Count"), f.get("KW Only Arg Count"), tuple(locs))
    return objs

def real(p):
    return pathlib.Path(p).resolve()

mods = sorted(p[len("recovered/"):] for p in glob.glob("recovered/backend/**/*.py", recursive=True))
tot = same = 0
for rel in mods:
    p67 = f"recovered/.work/ref067/{rel}.1shot.das"
    p66 = f"../0.6.6/tools/reference/.extracted/{rel}.1shot.das"
    if not (os.path.exists(p67) and os.path.exists(p66)): 
        print("  missing das:", rel); continue
    a, b = parse(p67), parse(p66)
    for q in sorted(set(a) & set(b)):
        tot += 1
        if a[q][:3] != b[q][:3]:
            print(f"  SIGDIFF {rel} :: {q} 067={a[q][:3]} 066={b[q][:3]}")
        elif a[q][3] != b[q][3]:
            only67 = [x for x in a[q][3] if x not in b[q][3]]
            only66 = [x for x in b[q][3] if x not in a[q][3]]
            if only67 or only66:
                print(f"  LOCALS {rel} :: {q} 067-only={only67[:6]} 066-only={only66[:6]}")
        else:
            same += 1
print(f"objects compared={tot} identical_signature_and_locals={same}")