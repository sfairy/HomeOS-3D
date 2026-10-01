import ast, os, re
REC = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
DAS = os.path.join(REC, ".work", "ref067", "backend")
print("=== AST-accurate tree-wide audit: src frozenset() calls vs das frozenset name loads ===")
bad = []
for dirpath, dirnames, files in os.walk(os.path.join(REC, "backend")):
    if ".work" in dirpath or "__pycache__" in dirpath: continue
    for f in files:
        if not f.endswith(".py"): continue
        p = os.path.join(dirpath, f)
        rel = os.path.relpath(p, REC)
        try: tree = ast.parse(open(p, encoding="utf-8").read())
        except Exception as e:
            print("  PARSE FAIL", rel, e); continue
        calls = [n for n in ast.walk(tree) if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "frozenset"]
        dpath = os.path.join(DAS, os.path.relpath(p, os.path.join(REC, "backend"))) + ".1shot.das"
        dpath = os.path.normpath(dpath)
        if not os.path.exists(dpath):
            if calls: print(f"  NO-DAS {rel}: src calls={len(calls)}")
            continue
        txt = open(dpath, encoding="utf-8", errors="replace").read()
        loads = re.findall(r"\b(?:LOAD_GLOBAL|LOAD_NAME)\b[^\n]*\bfrozenset\b", txt)
        if len(calls) != len(loads):
            bad.append((rel, len(calls), len(loads)))
print("  mismatches:", bad if bad else "NONE")
print()
print("=== license/service.py current state ===")
p = os.path.join(REC, "backend/app/license/service.py")
src = open(p, encoding="utf-8").read()
for i, l in enumerate(src.splitlines()[:60], 1):
    if 25 <= i <= 52: print(f"  {i:3d}| {l[:120]}")
tree = ast.parse(src)
for n in ast.walk(tree):
    if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "frozenset":
        print("  frozenset call at line", n.lineno)
print()
print("=== batch1 report ===")
rp = os.path.join(REC, ".work/fidelity/batch1-license.md")
print("  exists:", os.path.exists(rp))
if os.path.exists(rp):
    t = open(rp, encoding="utf-8", errors="replace").read()
    print("  bytes:", len(t))
    print("\n".join("  " + l[:130] for l in t.splitlines()[:40]))
