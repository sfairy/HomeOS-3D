"""docstring_audit3.py -- per-object docstring verdicts (byte-verified) for the 67 recoverable backend modules.

Detection rules (PyArmor keeps docstrings):
  * module / class body: the str loaded by LOAD_CONST immediately before STORE_NAME __doc__
  * function / method / comprehension: [Constants] c0 when it is a non-empty str and no instruction loads const 0
Verdicts: ok | extended (das text is a prefix of the recovered text) | text-differs | extra (das has none) | missing (src has none)
"""
import ast, json, os, re, sys

REC = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
DAS = os.path.join(REC, ".work", "ref067")
INSTR = re.compile(r"^(\s*)(\d+)\s+([A-Z][A-Z0-9_]*)\s*(.*)$")
QN = re.compile(r"^\s*Qualified Name:\s*(.+?)\s*$")
SECTH = re.compile(r"^\s*\[(?:Names|Locals\+Names|Constants|Disassembly|Code)\]\s*$")
STRV = re.compile(r"^('.*'|\".*\")\s*$")
MARK = re.compile(r"^'__pyarmor_")
def ind(s): return len(s) - len(s.lstrip())

def parse_das(rel):
    lines = open(os.path.join(DAS, rel + ".1shot.das"), encoding="utf-8", errors="replace").read().splitlines()
    n = len(lines)
    out = {}
    for i, l in enumerate(lines):
        m = QN.match(l)
        if not m: continue
        ind_i, qual = ind(l), m.group(1)
        first_sec = None
        for k in range(i + 1, n):
            if SECTH.match(lines[k]) and ind(lines[k]) == ind_i: first_sec = k; break
        if first_sec is None: continue
        end = n
        for k in range(first_sec + 1, n):
            s = lines[k]
            if not s.strip(): continue
            if ind(s) <= ind_i and (s.strip().startswith("Object Name:") or s.strip().startswith("File Name:") or s.strip().startswith("[Code]")):
                end = k; break
        sec = {}
        for k in range(first_sec, end):
            s = lines[k]
            if s.strip() and ind(s) == ind_i and SECTH.match(s): sec[s.strip()] = k
        c0 = None
        if "[Constants]" in sec:
            k = sec["[Constants]"] + 1
            while k < end and not lines[k].strip(): k += 1
            if k < end and ind(lines[k]) == ind_i + 4 and STRV.match(lines[k].strip()) and not MARK.match(lines[k].strip()):
                try:
                    v = ast.literal_eval(lines[k].strip())
                    if isinstance(v, str) and v: c0 = v
                except Exception: pass
        doc, dis, hasdoc = None, [], False
        if "[Disassembly]" in sec:
            k = sec["[Disassembly]"] + 1
            while k < end:
                s = lines[k]
                if s.strip() and ind(s) <= ind_i: break
                mm = INSTR.match(s)
                if mm: dis.append((mm.group(3), mm.group(4).strip()))
                k += 1
            for x in range(len(dis) - 1):
                if dis[x][0] == "LOAD_CONST" and dis[x + 1][0] == "STORE_NAME" and dis[x + 1][1].endswith("__doc__"):
                    hasdoc = True
                    mm = re.match(r"^\d+:\s*(.*)$", dis[x][1]); lit = mm.group(1) if mm else ""
                    if STRV.match(lit):
                        try:
                            v = ast.literal_eval(lit)
                            if isinstance(v, str): doc = v
                        except Exception: pass
                    break
            if not hasdoc:
                loaded0 = any(op == "LOAD_CONST" and re.match(r"^0:", a) for op, a in dis)
                if c0 is not None and not loaded0: doc = c0
        out[qual] = doc
    return out

def recovered(rel):
    tree = ast.parse(open(os.path.join(REC, rel), encoding="utf-8").read())
    out = {}
    md = ast.get_docstring(tree, clean=False)
    if md is not None: out["<module>"] = md
    def walk(node, prefix):
        for child in getattr(node, "body", []):
            if isinstance(child, ast.ClassDef):
                q = prefix + child.name
                d = ast.get_docstring(child, clean=False)
                if d is not None: out[q] = d
                walk(child, q + ".")
            elif isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                q = prefix + child.name
                d = ast.get_docstring(child, clean=False)
                if d is not None: out[q] = d
                walk(child, q + ".<locals>.")
    walk(tree, "")
    return out

files = []
for root, dirs, fs in os.walk(os.path.join(REC, "backend")):
    if "__pycache__" in root: continue
    for f in fs:
        if f.endswith(".py"):
            rel = os.path.relpath(os.path.join(root, f), REC)
            if os.path.exists(os.path.join(DAS, rel + ".1shot.das")): files.append(rel)
files.sort()

rep, agg, ex = {}, {}, {}
agg["das_objects_with_doc"] = 0
for rel in files:
    try: src = recovered(rel)
    except SyntaxError as e:
        rep[rel] = {"_error": str(e)}; continue
    das = parse_das(rel)
    per = {}
    for q, s in src.items():
        d = das.get(q, "\x00absent")
        if d == "\x00absent": v = "object-not-in-das"
        elif d is None: v = "extra"
        elif d == s: v = "ok"
        elif s.startswith(d): v = "extended"
        else: v = "text-differs"
        per[q] = {"verdict": v, "src_head": s[:140], "das": d}
        agg[v] = agg.get(v, 0) + 1
        ex.setdefault(v, [])
        if len(ex[v]) < 8: ex[v].append("%s::%s | das=%s | src=%s" % (rel, q, repr(d)[:70], repr(s)[:70]))
    agg["das_objects_with_doc"] += sum(1 for v in das.values() if v)
    for q, d in das.items():
        if d and q not in src:
            per[q] = {"verdict": "missing", "src_head": None, "das": d}
            agg["missing"] = agg.get("missing", 0) + 1
            ex.setdefault("missing", [])
            if len(ex["missing"]) < 8: ex["missing"].append("%s::%s | das=%s" % (rel, q, repr(d)[:90]))
    rep[rel] = per

json.dump(rep, open(os.path.join(REC, ".work", "docstring_audit3.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
tot = sum(agg.get(k, 0) for k in ("ok", "extended", "text-differs", "extra", "missing"))
print("modules=%d  recovered_docstrings=%d  das_objects_with_docstring=%d" % (len(files), tot, agg["das_objects_with_doc"]))
for k in ("ok", "extended", "text-differs", "extra", "missing", "object-not-in-das"):
    if agg.get(k): print("  %-18s %d" % (k, agg[k]))
for k in ("ok", "text-differs", "missing"):
    if ex.get(k):
        print("-- %s examples --" % k)
        for x in ex[k][:5]: print("   ", x)
