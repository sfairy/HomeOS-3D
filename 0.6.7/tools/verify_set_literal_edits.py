import ast, os

REC = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
files = ["backend/app/api/assets.py","backend/app/api/global_logs.py","backend/app/api/license.py",
         "backend/app/api/studio3d.py","backend/app/config.py","backend/app/global_log.py",
         "backend/app/ha/state_hub.py","backend/app/license/service.py"]

def transform(data):
    src = data.decode("utf-8")
    blines = data.split(b"\n")
    tree = ast.parse(src)
    hits = []
    def is_const(node):
        return isinstance(node, ast.Set) and len(node.elts) > 0 and all(isinstance(e, ast.Constant) for e in node.elts)
    def walk(node, qual):
        for child in ast.iter_child_nodes(node):
            nq = qual
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                nq = (qual + "." if qual else "") + child.name
            if isinstance(child, ast.Call) and isinstance(child.func, ast.Name) and child.func.id == "frozenset" and len(child.args) == 1:
                if qual and is_const(child.args[0]):
                    inner = ast.get_source_segment(src, child.args[0]).encode("utf-8")
                    hits.append((child.lineno, child.col_offset, child.end_lineno, child.end_col_offset, inner))
            walk(child, nq)
    walk(tree, "")
    hits.sort(key=lambda h: (h[0], h[1]), reverse=True)
    for (l1, c1, l2, c2, inner) in hits:
        if l1 == l2:
            blines[l1-1] = blines[l1-1][:c1] + inner + blines[l1-1][c2:]
        else:
            blines[l1-1:l2] = [blines[l1-1][:c1] + inner + blines[l2-1][c2:]]
    return b"\n".join(blines), len(hits)

for m in files:
    seed = open(os.path.join(REC, ".work", "seed67", m), "rb").read()
    cur = open(os.path.join(REC, m), "rb").read()
    exp, n = transform(seed)
    print("%-46s frozenset-calls=%-3d MATCH=%s" % (m, n, exp == cur))
