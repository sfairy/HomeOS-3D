#!/usr/bin/env python3
"""Mechanically clean PyArmor/pycdc artifacts out of .1shot.cdc.py files.

Produces recovered/.work/scaffold/<module>.py plus recovered/.work/prep_report.json.

Every pass is provable and idempotent:
  P1 strip the leading pycdc banner comment block
  P2 delete bare string-statement marker lines '__pyarmor_enter_NNN__(...)'
  P3 delete bare statements exactly "None(None)"
  P4 delete module-level (indent 0) stray "return None"
  P5 delete dead returns: a "return X" immediately preceded by an identical
     "return X" at the same indent, and "return None" immediately preceded by
     any "return ..." at the same indent
  P6 re-insert "pass" into blocks emptied by P2/P3
  P7 insert a missing "try:" before an orphaned except/finally clause
Everything else is left byte-for-byte verbatim; anything ambiguous is only
recorded in the report, never rewritten.
"""
from __future__ import annotations

import argparse
import ast
import json
import os
import re
import shutil
import sys

MARKER_LINE_RE = re.compile(
    r"^(['\"])__pyarmor_(?P<kind>enter|exit|leave|assert|bcc)_[0-9]+__\([^)]*\)\1$"
)
NONE_NONE_RE = re.compile(r"^None\(None\)$")
WARN_TOKEN = "WARNING: Decompyle incomplete"
DEF_RE = re.compile(r"^(?P<indent>[ \t]*)(?:async[ \t]+)?(?:def|class)[ \t]+(?P<name>[A-Za-z_][A-Za-z0-9_]*)")
BLOCK_OPEN_RE = re.compile(
    r"^[ \t]*(?:async[ \t]+def|def|class|if|elif|else|for|while|try|except|finally|with|match|case)\b.*:[ \t]*(?:#.*)?$"
)
ORPHAN_RE = re.compile(r"^[ \t]*(?:except|finally)\b.*:[ \t]*$")
RETURN_RE = re.compile(r"^(?P<ind>[ \t]*)return\b(?P<rest>.*)$")


def split_header(lines):
    """Return index of first real code line."""
    i = 0
    while i < len(lines):
        s = lines[i].strip()
        if s == "" or s.startswith("#"):
            i += 1
            continue
        break
    return i


def indent_of(line):
    return len(line) - len(line.lstrip(" \t"))


def enclosing_def(lines, idx):
    """Walk upward from idx to the nearest def/class line; return (name, lineno)."""
    best = None
    indent = indent_of(lines[idx])
    for j in range(idx - 1, -1, -1):
        m = DEF_RE.match(lines[j])
        if not m:
            continue
        li = len(m.group("indent"))
        if li <= indent:
            best = (m.group("name"), j + 1)
            if li < indent:
                break
    return best or ("<module>", 0)


def is_content(line):
    s = line.strip()
    return s != "" and not s.startswith("#")


def pass_empty_blocks(lines, report):
    """P6: insert 'pass' where a pass removed the only statement of a block."""
    out = []
    n = len(lines)
    i = 0
    fixed = 0
    while i < n:
        line = lines[i]
        out.append(line)
        if BLOCK_OPEN_RE.match(line) and not line.rstrip().endswith("\\"):
            base = indent_of(line)
            j = i + 1
            while j < n and not is_content(lines[j]):
                j += 1
            if j >= n or indent_of(lines[j]) <= base:
                pad = " " * (base + 4)
                out.append(pad + "pass")
                fixed += 1
        i += 1
    if fixed:
        report.append("P6:inserted_pass=%d" % fixed)
    return out, fixed


def orphan_except_fix(lines, report):
    """P7: give an orphaned except/finally its missing 'try:'."""
    fixed = 0
    i = 0
    while i < len(lines):
        line = lines[i]
        if ORPHAN_RE.match(line):
            ind = indent_of(line)
            # locate the enclosing parent block opener
            parent = None
            for j in range(i - 1, -1, -1):
                if not is_content(lines[j]):
                    continue
                if indent_of(lines[j]) < ind:
                    parent = j
                    break
            if parent is not None:
                has_try = False
                for j in range(parent, i):
                    s = lines[j].strip()
                    if indent_of(lines[j]) == ind and (s == "try:" or s.startswith("try:")):
                        has_try = True
                        break
                if not has_try:
                    # first content line of the parent body
                    k = parent + 1
                    while k < i and not is_content(lines[k]):
                        k += 1
                    if k < i and indent_of(lines[k]) == ind:
                        # pycdc emitted the try body at the same indent as the
                        # orphaned clause: re-indent it under the new "try:"
                        lines[k:i] = [("    " + l) if l.strip() else l for l in lines[k:i]]
                        lines.insert(k, " " * ind + "try:")
                        fixed += 1
                        i += 1
        i += 1
    if fixed:
        report.append("P7:inserted_try=%d" % fixed)
    return lines, fixed


def clean_body(body, report):
    """P2/P3 on the raw statement lines."""
    kept = []
    counts = {"enter": 0, "exit": 0, "leave": 0, "assert": 0, "bcc": 0, "nonenone": 0}
    warn_lines = []
    for line in body:
        s = line.strip()
        m = MARKER_LINE_RE.match(s)
        if m:
            counts[m.group("kind")] = counts.get(m.group("kind"), 0) + 1
            continue
        if NONE_NONE_RE.match(s):
            counts["nonenone"] += 1
            continue
        if WARN_TOKEN in line:
            warn_lines.append(len(kept))
        kept.append(line)
    return kept, counts, warn_lines


def dead_returns(lines, report):
    """P4 + P5."""
    p4 = p5 = 0
    out = []
    prev_content = None  # (indent, stripped)
    for line in lines:
        s = line.strip()
        if s == "":
            out.append(line)
            continue
        m = RETURN_RE.match(line)
        if m:
            ind = len(m.group("ind"))
            if ind == 0 and s == "return None":
                p4 += 1
                continue
            if prev_content is not None:
                pind, ps = prev_content
                if pind == ind and ps.startswith("return"):
                    if s == "return None" or ps == s:
                        p5 += 1
                        continue
        out.append(line)
        if s and not s.startswith("#"):
            prev_content = (indent_of(line), s)
    if p4:
        report.append("P4:dropped_module_return_none=%d" % p4)
    if p5:
        report.append("P5:dropped_dead_return=%d" % p5)
    return out, p4, p5


def try_parse(src):
    try:
        ast.parse(src, filename="<scaffold>", feature_version=(3, 12))
        return True, None, None
    except SyntaxError as exc:
        return False, exc.msg, exc.lineno
    except Exception as exc:  # pragma: no cover
        return False, "%s: %s" % (type(exc).__name__, exc), None


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    default_root = os.path.dirname(os.path.dirname(here))
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=os.environ.get("HA_ROOT", default_root))
    args = ap.parse_args()
    root = os.path.abspath(args.root)
    work = os.path.join(root, "recovered", ".work")
    out_dir = os.path.join(work, "scaffold")
    if os.path.isdir(out_dir):
        shutil.rmtree(out_dir)
    os.makedirs(out_dir, exist_ok=True)

    cdc_files = []
    for base, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in (".git", "node_modules", "recovered")]
        for f in files:
            if f.endswith(".py.1shot.cdc.py"):
                cdc_files.append(os.path.join(base, f))
    cdc_files.sort()

    report = {}
    totals = {"files": 0, "parse_ok": 0, "parse_fail": 0, "warnings": 0,
              "enter_removed": 0, "exit_removed": 0, "leave_removed": 0,
              "assert_removed": 0, "bcc_removed": 0, "nonenone_removed": 0,
              "header_lines": 0, "pass_inserted": 0, "try_inserted": 0,
              "dead_return_dropped": 0}

    for path in cdc_files:
        rel = os.path.relpath(path, root)
        module_id = rel[: -len(".1shot.cdc.py")]
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            raw = fh.read()
        lines = raw.split("\n")
        hdr_end = split_header(lines)
        body = lines[hdr_end:]

        log = []
        kept, counts, warn_lines = clean_body(body, log)
        kept, p4, p5 = dead_returns(kept, log)
        kept, npass = pass_empty_blocks(kept, log)
        kept, ntry = orphan_except_fix(kept, log)

        src = "\n".join(kept)
        if not src.endswith("\n"):
            src += "\n"
        out_path = os.path.join(out_dir, module_id)
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as fh:
            fh.write(src)

        ok, msg, lineno = try_parse(src)
        defs = []
        if ok:
            tree = ast.parse(src, feature_version=(3, 12))
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                    defs.append(node.name)

        warn_defs = []
        for wl in warn_lines:
            nm, ln = enclosing_def(kept, min(wl, len(kept) - 1))
            warn_defs.append({"line": wl + 1, "def": nm, "def_line": ln})

        report[module_id] = {
            "source": rel,
            "header_lines_stripped": hdr_end,
            "removed": counts,
            "passes": log,
            "warnings": len(warn_lines),
            "warning_defs": warn_defs[:200],
            "parse_ok": ok,
            "parse_error": msg,
            "parse_error_line": lineno,
            "loc": len(kept),
            "defs": defs,
        }
        totals["files"] += 1
        totals["parse_ok" if ok else "parse_fail"] += 1
        totals["warnings"] += len(warn_lines)
        totals["header_lines"] += hdr_end
        totals["pass_inserted"] += npass
        totals["try_inserted"] += ntry
        totals["dead_return_dropped"] += p4 + p5
        for k, v in counts.items():
            totals[{"enter": "enter_removed", "exit": "exit_removed",
                    "leave": "leave_removed", "assert": "assert_removed",
                    "bcc": "bcc_removed", "nonenone": "nonenone_removed"}[k]] += v

    with open(os.path.join(work, "prep_report.json"), "w", encoding="utf-8") as fh:
        json.dump({"totals": totals, "modules": report}, fh, ensure_ascii=False, indent=1)

    print(json.dumps(totals, indent=1))
    print("--- modules still failing ast.parse (%d) ---" % totals["parse_fail"])
    for k, v in sorted(report.items()):
        if not v["parse_ok"]:
            print("  %-56s line %-5s %s" % (k, v["parse_error_line"], (v["parse_error"] or "")[:70]))
    return 0


if __name__ == "__main__":
    sys.exit(main())

