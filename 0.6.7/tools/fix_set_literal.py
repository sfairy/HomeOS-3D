import ast, os, sys

REC = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
module = sys.argv[1]
path = os.path.join(REC, module)
data = open(path, "rb").read()
src = data.decode("utf-8")
blines = data.split(b"\n")
tree = ast.parse(src)
hits = []
def is_const_literal(node):
    return isinstance(node, ast.Set) and len(node.elts) > 0 and all(isinstance(e, ast.Constant) for e in node.elts)
def walk(node, qual):
    for child in ast.iter_child_nodes(node):
        nq = qual
        if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            nq = (qual + "." if qual else "") + child.name
        if isinstance(child, ast.Call) and isinstance(child.func, ast.Name) and child.func.id == "frozenset" and len(child.args) == 1:
            if qual and is_const_literal(child.args[0]):
                inner = ast.get_source_segment(src, child.args[0]).encode("utf-8")
                hits.append((child.lineno, child.col_offset, child.end_lineno, child.end_col_offset, inner, qual))
        walk(child, nq)
walk(tree, "")
hits.sort(key=lambda h: (h[0], h[1]), reverse=True)
for (l1, c1, l2, c2, inner, qual) in hits:
    if l1 == l2:
        blines[l1-1] = blines[l1-1][:c1] + inner + blines[l1-1][c2:]
    else:
        blines[l1-1:l2] = [blines[l1-1][:c1] + inner + blines[l2-1][c2:]]
    print("  line %-5d %s" % (l1, qual))
open(path, "wb").write(b"\n".join(blines))
print("refixed", module, len(hits))
