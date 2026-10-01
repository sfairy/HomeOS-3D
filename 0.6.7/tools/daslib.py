#!/usr/bin/env python3
"""daslib - structured access to PyArmor/1shot .das disassembly trees.

An extracted .das JSON is a dict with keys:
  module, source, file_name, object_count, max_depth, objects
Each object has:
  index, parent, indent, start_line, end_line, module, file_name, object_name,
  qualified_name, arg_count, pos_only, kw_only, stack_size, flags, names, locals,
  cellvars, freevars, consts, num_consts, has_disasm, has_exc_table, sections, raw, depth
"""
import json
import re

DIS_RE = re.compile(r'^(\d+)\s+([A-Z][A-Z0-9_]*)\s*(.*)$')
ARG_RE = re.compile(r'^(-?\d+)')
SECTION_RE = re.compile(r'^\[[A-Za-z+ ]+\]$')


def load(path):
    with open(path, 'r', encoding='utf-8') as fh:
        return json.load(fh)


def children_of(data, obj):
    return [o for o in data['objects'] if o['parent'] == obj['index']]


def body_lines(data, obj):
    """Yield (lineno, text) for lines belonging to this object alone."""
    ranges = [(c['start_line'], c['end_line']) for c in children_of(data, obj)]
    n = obj['start_line']
    for text in obj['raw'].split('\n'):
        if not any(a <= n <= b for a, b in ranges):
            yield n, text
        n += 1


def sections(data, obj):
    """Return {section_name: [line_text, ...]} for this object's own sections."""
    out = {}
    cur = None
    for _, text in body_lines(data, obj):
        if not text.strip():
            continue
        st = text.strip()
        if SECTION_RE.match(st):
            cur = out.setdefault(st, [])
            continue
        if cur is not None:
            cur.append(st)
    return out


def disasm(obj):
    """Return [(offset, mnemonic, arg_text)] from an already extracted 'sections' dict."""
    sec = obj.get('sections')
    if isinstance(sec, list):
        return []
    return []


def parse_disasm(lines):
    """Parse raw disassembly text lines into [(offset, mnemonic, arg_text)]."""
    out = []
    for st in lines:
        m = DIS_RE.match(st)
        if not m:
            continue
        off = int(m.group(1))
        mnem = m.group(2)
        rest = m.group(3).strip()
        out.append((off, mnem, rest))
    return out


def const_lines(data, obj):
    return sections(data, obj).get('[Constants]', [])

