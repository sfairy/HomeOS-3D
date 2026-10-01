#!/usr/bin/env python3
"""Parse PyArmor 1shot .das disassembly files into structured code-object trees.

Stdlib only.  Compatible with Python 3.9+ (target interpreter: /usr/bin/python3).

Usage:
    /usr/bin/python3 recovered/tools/pyarmor_extract.py
    /usr/bin/python3 recovered/tools/pyarmor_extract.py --root /path/to/workspace
"""
from __future__ import annotations

import argparse
import ast
import json
import os
import re
import sys

HEADER_KEYS = {
    "File Name",
    "Object Name",
    "Qualified Name",
    "Arg Count",
    "Pos Only Arg Count",
    "KW Only Arg Count",
    "Stack Size",
    "Flags",
}
SECTION_RE = re.compile(r"^\[[A-Za-z][A-Za-z+ ]*\]$")
STR_TOKEN_RE = re.compile(
    r"(?<![A-Za-z0-9_'])(?:[rbufRBUF]{0,2})"
    r"('(?:[^'\\]|\\.)*'|\"(?:[^\"\\]|\\.)*\")"
)
NUM_TOKEN_RE = re.compile(r"(?<![A-Za-z0-9_.])(?:\d+\.\d+|\d+)(?![A-Za-z0-9_.])")
MARKER_RE = re.compile(r"__pyarmor_([a-z]+)_(\d+)__")


def extract_strings(text):
    """Return list of decoded string constants found in a [Constants] section."""
    out = []
    for m in STR_TOKEN_RE.finditer(text):
        tok = m.group(1)
        try:
            val = ast.literal_eval(tok)
        except Exception:
            continue
        if isinstance(val, bytes):
            try:
                val = val.decode("latin-1")
            except Exception:
                continue
        if isinstance(val, str):
            out.append(val)
    return out


def strip_strings(text):
    return STR_TOKEN_RE.sub(" ", text)


def extract_numbers(text):
    out = []
    for m in NUM_TOKEN_RE.finditer(strip_strings(text)):
        tok = m.group(0)
        if "." in tok:
            try:
                out.append(float(tok))
            except Exception:
                pass
        else:
            try:
                out.append(int(tok))
            except Exception:
                pass
    return out


def parse_das(text):
    lines = text.split("\n")
    objects = []
    stack = []
    header_lines = []
    for i, line in enumerate(lines):
        indent = len(line) - len(line.lstrip(" "))
        stripped = line.strip()
        if stripped == "[Code]":
            while stack and indent <= stack[-1]["indent"]:
                stack.pop()
            obj = {
                "index": len(objects),
                "indent": indent,
                "parent": stack[-1]["index"] if stack else -1,
                "start_line": i,
                "end_line": i,
                "header": {},
                "section": None,
                "sections": {},
            }
            objects.append(obj)
            stack.append(obj)
            continue
        while stack and indent <= stack[-1]["indent"]:
            stack.pop()
        if not stack:
            header_lines.append(line)
            continue
        top = stack[-1]
        top["end_line"] = i
        if indent == top["indent"] + 4 and SECTION_RE.match(stripped):
            top["section"] = stripped
            continue
        if indent == top["indent"] + 4 and ":" in stripped:
            k, v = stripped.split(":", 1)
            k = k.strip()
            if k in HEADER_KEYS:
                top["header"][k] = v.strip()
                continue
        sec = top["section"] or "<preamble>"
        top["sections"].setdefault(sec, []).append(line)
    return lines, objects, header_lines


def qname_of(obj):
    h = obj["header"]
    q = h.get("Qualified Name") or h.get("Object Name") or "<anonymous>"
    return q


def build_record(obj, lines, module_id):
    raw = "\n".join(lines[obj["start_line"] : obj["end_line"] + 1])
    secs = {k: "\n".join(v) for k, v in obj["sections"].items()}
    names_txt = secs.get("[Names]", "")
    locals_txt = secs.get("[Locals+Names]", "")
    cell_txt = secs.get("[Cell Vars]", "")
    free_txt = secs.get("[Free Vars]", "")
    consts_txt = secs.get("[Constants]", "")
    disasm_txt = secs.get("[Disassembly]", "")
    exc_txt = secs.get("[Exception Table]", "")
    h = obj["header"]
    try:
        flags = int(h.get("Flags", "0").split()[0], 0)
    except Exception:
        flags = 0
    rec = {
        "index": obj["index"],
        "parent": obj["parent"],
        "indent": obj["indent"],
        "start_line": obj["start_line"] + 1,
        "end_line": obj["end_line"] + 1,
        "module": module_id,
        "file_name": h.get("File Name", ""),
        "object_name": h.get("Object Name", ""),
        "qualified_name": qname_of(obj),
        "arg_count": h.get("Arg Count", ""),
        "pos_only": h.get("Pos Only Arg Count", ""),
        "kw_only": h.get("KW Only Arg Count", ""),
        "stack_size": h.get("Stack Size", ""),
        "flags": flags,
        "names": extract_strings(names_txt),
        "locals": extract_strings(locals_txt),
        "cellvars": extract_strings(cell_txt),
        "freevars": extract_strings(free_txt),
        "consts": extract_strings(consts_txt),
        "num_consts": extract_numbers(consts_txt),
        "has_disasm": bool(disasm_txt.strip()),
        "has_exc_table": bool(exc_txt.strip()),
        "sections": sorted(secs.keys()),
        "raw": raw,
    }
    return rec


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    default_root = os.path.dirname(os.path.dirname(here))
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=os.environ.get("HA_ROOT", default_root))
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    root = os.path.abspath(args.root)
    out_dir = args.out or os.path.join(root, "recovered", ".work", "das")
    os.makedirs(out_dir, exist_ok=True)

    das_files = []
    for base, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in (".git", "node_modules", "recovered")]
        for f in files:
            if f.endswith(".py.1shot.das"):
                das_files.append(os.path.join(base, f))
    das_files.sort()

    index = {}
    totals = {"files": 0, "code_objects": 0, "assert": 0, "enter": 0, "exit": 0,
              "leave": 0, "bcc": 0, "other_marker": 0}
    problems = []
    for path in das_files:
        rel = os.path.relpath(path, root)
        module_id = rel[: -len(".1shot.das")]
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            text = fh.read()
        lines, objects, header_lines = parse_das(text)
        recs = [build_record(o, lines, module_id) for o in objects]
        if not recs:
            problems.append("no [Code] block in %s" % rel)
            continue
        depth = {}
        for r in recs:
            depth[r["index"]] = 0 if r["parent"] < 0 else depth[r["parent"]] + 1
            r["depth"] = depth[r["index"]]

        markers = {}
        for m in MARKER_RE.finditer(text):
            kind = m.group(1)
            markers[kind] = markers.get(kind, 0) + 1
        for k, v in markers.items():
            if k in totals:
                totals[k] += v
            else:
                totals["other_marker"] += v

        top = recs[0]
        qnames = [r["qualified_name"] for r in recs]
        out_path = os.path.join(out_dir, module_id + ".json")
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        payload = {
            "module": module_id,
            "source": rel,
            "file_name": top["file_name"],
            "object_count": len(recs),
            "max_depth": max(depth.values()) if depth else 0,
            "objects": recs,
        }
        with open(out_path, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False)
        index[module_id] = {
            "source": rel,
            "file_name": top["file_name"],
            "bytes": len(text.encode("utf-8")),
            "object_count": len(recs),
            "max_depth": max(depth.values()) if depth else 0,
            "markers": markers,
            "qualified_names": qnames,
            "module_names": top["names"],
            "module_consts": top["consts"],
            "nested_consts": sum(len(r["consts"]) for r in recs[1:]),
            "out": os.path.relpath(out_path, root),
        }
        totals["files"] += 1
        totals["code_objects"] += len(recs)
        if not top["has_disasm"]:
            problems.append("module has no [Disassembly]: %s" % rel)

    with open(os.path.join(root, "recovered", ".work", "das_index.json"), "w",
              encoding="utf-8") as fh:
        json.dump({"totals": totals, "problems": problems, "modules": index}, fh,
                  ensure_ascii=False, indent=1)

    print(json.dumps(totals, indent=1))
    print("modules:", len(index))
    print("problems:", len(problems))
    for p in problems[:20]:
        print("  !", p)
    return 0


if __name__ == "__main__":
    sys.exit(main())
