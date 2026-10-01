import ast, json, os, re, sys
REC = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
AUD = json.load(open(os.path.join(REC, '.work', 'docstring_audit3.json'), encoding='utf-8'))

def _has_ctrl(s):
    return any(ord(c) < 32 and c != '\t' for c in s)

def quote(s):
    if '\\' in s or s == '' or _has_ctrl(s):
        return repr(s)
    if '\"\"\"' not in s and not s.endswith('\"'):
        return '\"\"\"' + s + '\"\"\"'
    if "'''" not in s and not s.endswith("'"):
        return "'''" + s + "'''"
    return repr(s)

def _esc(s):
    return ''.join(('\\x%02x' % ord(c)) if (ord(c) < 32 and c != '\t') else c for c in s)

def comment_block(indent, text, none_case=False):
    text = _esc(text)
    lines = [l.strip() for l in text.split('\n')]
    while lines and not lines[0]: lines.pop(0)
    while lines and not lines[-1]: lines.pop()
    if not lines:
        return indent + '# [补充说明]（Python 原文此处无 docstring，.das 证实 __doc__ 为 None）' + '\n'
    out = [indent + '# [补充说明] ' + lines[0] + '\n']
    for l in lines[1:]:
        out.append((indent + '# ' + l).rstrip() + '\n')
    return ''.join(out)

def collect(tree):
    found = []
    md = ast.get_docstring(tree, clean=False)
    if md is not None and tree.body and isinstance(tree.body[0], ast.Expr) and isinstance(tree.body[0].value, ast.Constant):
        found.append(('<module>', tree.body[0], tree.body))
    def walk(node, prefix):
        for child in getattr(node, 'body', []):
            if isinstance(child, ast.ClassDef):
                q = prefix + child.name
                if child.body and isinstance(child.body[0], ast.Expr) and isinstance(child.body[0].value, ast.Constant):
                    found.append((q, child.body[0], child.body))
                walk(child, q + '.')
            elif isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                q = prefix + child.name
                if child.body and isinstance(child.body[0], ast.Expr) and isinstance(child.body[0].value, ast.Constant):
                    found.append((q, child.body[0], child.body))
                walk(child, q + '.<locals>.')
    walk(tree, '')
    return found

stats = {}
changed_files = []
report = []
for rel, per in sorted(AUD.items()):
    if '_error' in per: continue
    path = os.path.join(REC, rel)
    data = open(path, 'rb').read()
    lines = data.split(b'\n')
    ls, off = [], 0
    for l in lines:
        ls.append(off); off += len(l) + 1
    def abs_off(lineno, col):
        return ls[lineno - 1] + col
    src_text = data.decode('utf-8')
    tree = ast.parse(src_text)
    edits = []
    n_chg = 0
    for q, stmt, body in collect(tree):
        v = per.get(q)
        if v is None:
            stats['unaligned-not-in-das'] = stats.get('unaligned-not-in-das', 0) + 1
            continue
        verdict, das_text = v['verdict'], v['das']
        cur = stmt.value.value
        if isinstance(cur, bytes): cur = cur.decode('utf-8', 'replace')
        indent = ' ' * stmt.col_offset
        if verdict == 'ok':
            stats['ok'] = stats.get('ok', 0) + 1; continue
        if verdict in ('object-not-in-das',):
            stats['unaligned-not-in-das'] = stats.get('unaligned-not-in-das', 0) + 1; continue
        if verdict == 'extra':
            start = ls[stmt.lineno - 1]
            end = ls[stmt.end_lineno - 1] + len(lines[stmt.end_lineno - 1]) + 1
            blk = comment_block(indent, cur)
            if len(body) == 1 and not isinstance(stmt, type(None)):
                blk = blk + indent + 'pass' + '\n'
            edits.append((start, end, blk.encode('utf-8'), 'remove->comment'))
            n_chg += 1; stats['extra->comment'] = stats.get('extra->comment', 0) + 1
            continue
        if verdict in ('extended', 'text-differs'):
            # replace literal with das text; keep the leftover/src text as a comment after the statement
            s0 = abs_off(stmt.value.lineno, stmt.value.col_offset)
            e0 = abs_off(stmt.value.end_lineno, stmt.value.end_col_offset)
            newlit = quote(das_text).encode('utf-8')
            ins = ls[stmt.end_lineno - 1] + len(lines[stmt.end_lineno - 1]) + 1
            if verdict == 'extended':
                leftover = cur[len(das_text):]
            else:
                leftover = cur
            edits.append((s0, e0, newlit, 'literal->das'))
            if leftover.strip():
                edits.append((ins, ins, comment_block(indent, leftover).encode('utf-8'), 'leftover->comment'))
            n_chg += 1; stats[verdict] = stats.get(verdict, 0) + 1
            continue
        stats['other:' + verdict] = stats.get('other:' + verdict, 0) + 1
    if edits:
        edits.sort(key=lambda e: (e[0], e[1]), reverse=True)
        for s0, e0, nb, why in edits:
            data = data[:s0] + nb + data[e0:]
        open(path, 'wb').write(data)
        changed_files.append(rel)
        report.append((rel, n_chg))
    try:
        ast.parse(open(path, encoding='utf-8').read())
    except SyntaxError as e:
        print('SYNTAX FAIL', rel, e)
print('changed files:', len(changed_files))
print('stats:', json.dumps(stats, ensure_ascii=False, sort_keys=True))