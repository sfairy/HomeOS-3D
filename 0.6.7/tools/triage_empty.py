#!/usr/bin/env python3
"""Find function bodies that pycdc emptied: a recovered def/class whose body is a
single 'pass' (or a stray 'return None') while the .das shows real code.

Usage: /usr/local/bin/python3.14 recovered/tools/triage_empty.py [--top N]
Writes recovered/.work/triage_empty.json
"""
import ast, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
WS = os.path.dirname(os.path.dirname(HERE))
REC = os.path.join(WS, "recovered")
WORK = os.path.join(REC, ".work")
SECTION_RE = re.compile(r"^(\s*)\[([A-Za-z +]+)\]\s*$")


def disasm_len(raw):
    lines = raw.splitlines()
    on = False
    indent = None
    n = 0
    for ln in lines:
        m = SECTION_RE.match(ln)
        if m:
            name = m.group(2).strip()
            if name == "Disassembly":
                on, indent = True, len(m.group(1))
                continue
            if on and len(m.group(1)) <= (indent or 0):
                break
        if on and ln.strip():
            n += 1
    return n


def trivial_body(node):
    body = [s for s in node.body if not (isinstance(s, ast.Expr) and isinstance(s.value, ast.Constant)
                                        and isinstance(s.value.value, str))]
    if len(body) != 1:
        return None
    s = body[0]
    if isinstance(s, ast.Pass):
        return "pass"
    if isinstance(s, ast.Return) and (s.value is None or
                                      (isinstance(s.value, ast.Constant) and s.value.value is None)):
        return "return None"
    return None


def walk_defs(tree):
    """Yield (name, node) for every def/class, using the .das-style qualified name."""
    out = []

    def rec(node, prefix):
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                q = (prefix + "." if prefix else "") + child.name
                out.append((q, child))
                rec(child, q)
            else:
                rec(child, prefix)
    rec(tree, "")
    return out


def main():
    top = 40
    if "--top" in sys.argv:
        top = int(sys.argv[sys.argv.index("--top") + 1])
    index = json.load(open(os.path.join(WORK, "das_index.json"), "r", encoding="utf-8"))
    findings = []
    for module_id in sorted(index["modules"]):
        path = os.path.join(REC, module_id)
        if not os.path.exists(path):
            continue
        try:
            tree = ast.parse(open(path, "r", encoding="utf-8").read(), feature_version=(3, 12))
        except SyntaxError:
            continue
        das_path = os.path.join(WORK, "das", module_id + ".json")
        if not os.path.exists(das_path):
            continue
        d = json.load(open(das_path, "r", encoding="utf-8"))
        by_name = {}
        for o in d.get("objects") or []:
            q = o.get("qualified_name") or ""
            if q:
                by_name.setdefault(q, o)
        for q, node in walk_defs(tree):
            shape = trivial_body(node)
            if not shape:
                continue
            o = by_name.get(q) or by_name.get(q.replace(".", ".<locals>.", 1))
            n = disasm_len(o.get("raw") or "") if o else -1
            if n > 6:
                findings.append({"module": module_id, "qname": q, "shape": shape,
                                 "das_ops": n, "line": node.lineno,
                                 "das_consts": (o or {}).get("num_consts")})
    findings.sort(key=lambda f: -f["das_ops"])
    json.dump({"count": len(findings), "findings": findings},
              open(os.path.join(WORK, "triage_empty.json"), "w", encoding="utf-8"), indent=1)
    print("emptied bodies with real disassembly: %d" % len(findings))
    for f in findings[:top]:
        print("  %-58s %-46s %-11s %4d ops (line %d)" % (f["module"], f["qname"], f["shape"], f["das_ops"], f["line"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
