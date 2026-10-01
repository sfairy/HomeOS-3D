#!/usr/bin/env python3
"""Validate the recovered backend sources against the pycdas disassembly index.

Checks (see REPORT.md / VALIDATION.md):
  AC-B1  88/88 modules parse as Python 3.12
  AC-B2  no '__pyarmor_', no 'Decompyle incomplete', no 'None(None)' artifacts
  AC-B3  every def/class name in the .das exists in the recovered source
  AC-B4  string-constant coverage vs the .das [Constants] sections
  AC-B5  every relative import resolves inside the recovered tree

Usage: /usr/local/bin/python3.14 recovered/tools/validate_backend.py
Writes recovered/.work/backend_validation.json and .md
"""
import ast, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
WS = os.path.dirname(os.path.dirname(HERE))
REC = os.path.join(WS, "recovered")
WORK = os.path.join(REC, ".work")

SECTION_RE = re.compile(r"^(\s*)\[([A-Za-z +]+)\]\s*$")
QUOTED_RE = re.compile(r"(?<![\w])([rbRB]{0,2})('(?:[^'\\]|\\.)*'|\"(?:[^\"\\]|\\.)*\")")


def das_constants(raw):
    """Strings from the [Constants] section of one pycdas code object."""
    lines = raw.splitlines()
    out, indent, on = [], None, False
    for ln in lines:
        m = SECTION_RE.match(ln)
        if m:
            name = m.group(2).strip()
            if name == "Constants":
                indent, on = len(m.group(1)), True
                continue
            if on and len(m.group(1)) <= (indent or 0):
                break
        if not on:
            continue
        if re.match(r"^\s*\[Code\]\s*$", ln):
            break
        for mm in QUOTED_RE.finditer(ln):
            prefix, lit = mm.group(1), mm.group(2)
            try:
                val = ast.literal_eval(prefix + lit)
            except Exception:
                continue
            if isinstance(val, bytes):
                try:
                    val = val.decode("utf-8")
                except UnicodeDecodeError:
                    continue
            if isinstance(val, str) and val and not val.startswith("<"):
                out.append(val)
    return out


def collect_defs(tree):
    names = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
    return names


def collect_strings(tree, src):
    vals = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            vals.add(node.value)
    return vals


def expected_names(das):
    """Top-level-ish names from the .das qualified names (drop <> pseudo entries)."""
    names = set()
    for q in das.get("qualified_names") or []:
        for part in str(q).split("."):
            if part and not part.startswith("<") and part != "locals":
                names.add(part)
    return names


def main():
    with open(os.path.join(WORK, "das_index.json"), "r", encoding="utf-8") as fh:
        index = json.load(fh)
    modules = index["modules"]

    report = {"totals": {}, "modules": {}, "notes": []}
    t = dict(modules=0, parse_ok=0, parse_fail=0, marker_files=0, marker_hits=0,
             names_ok=0, names_missing=0, strings_expected=0, strings_missing=0,
             imports_unresolved=0, missing_modules=0)
    worst = []

    for module_id in sorted(modules):
        entry = {"file": module_id}
        path = os.path.join(REC, module_id)
        if not os.path.exists(path):
            entry["missing"] = True
            t["missing_modules"] += 1
            report["modules"][module_id] = entry
            continue
        t["modules"] += 1
        src = open(path, "r", encoding="utf-8").read()
        entry["lines"] = src.count("\n") + 1
        entry["bytes"] = len(src.encode("utf-8"))
        das = modules[module_id]
        entry["das_objects"] = das.get("object_count")

        # AC-B2 marker / artifact scan
        hits = []
        for token in ("__pyarmor_", "Decompyle incomplete", "None(None)"):
            n = src.count(token)
            if n:
                hits.append("%s x%d" % (token, n))
        entry["artifacts"] = hits
        if hits:
            t["marker_files"] += 1
            t["marker_hits"] += sum(int(h.split("x")[-1]) for h in hits)

        # AC-B1 parse
        try:
            tree = ast.parse(src, filename=module_id, feature_version=(3, 12))
            entry["parse_ok"] = True
            t["parse_ok"] += 1
        except SyntaxError as exc:
            entry["parse_ok"] = False
            entry["parse_error"] = "%s (line %s)" % (exc.msg, exc.lineno)
            t["parse_fail"] += 1
            worst.append((module_id, "parse", entry["parse_error"]))
            report["modules"][module_id] = entry
            continue

        # AC-B3 names
        exp = expected_names(das)
        got = collect_defs(tree)
        missing = sorted(exp - got)
        entry["defs_expected"] = len(exp)
        entry["defs_found"] = len(got)
        entry["defs_missing"] = missing[:12]
        if not missing:
            t["names_ok"] += 1
        else:
            t["names_missing"] += 1
            worst.append((module_id, "names", "%d missing: %s" % (len(missing), ", ".join(missing[:6]))))

        # AC-B4 strings
        das_json_path = os.path.join(WORK, "das", module_id + ".json")
        expected_strings = set()
        if os.path.exists(das_json_path):
            d = json.load(open(das_json_path, "r", encoding="utf-8"))
            for o in d.get("objects") or []:
                expected_strings.update(das_constants(o.get("raw") or ""))
        got_strings = collect_strings(tree, src)
        joined = "\n".join(got_strings)
        miss = [s for s in sorted(expected_strings)
                if s not in got_strings and s not in joined]
        entry["strings_expected"] = len(expected_strings)
        entry["strings_missing"] = len(miss)
        entry["strings_missing_sample"] = miss[:10]
        entry["strings_coverage"] = (round(100.0 * (len(expected_strings) - len(miss)) / len(expected_strings), 2)
                                     if expected_strings else 100.0)
        t["strings_expected"] += len(expected_strings)
        t["strings_missing"] += len(miss)
        if expected_strings and entry["strings_coverage"] < 99.0:
            worst.append((module_id, "strings", "%.2f%% (%d missing)" % (entry["strings_coverage"], len(miss))))

        # AC-B5 imports
        unresolved = []
        pkg_dir = os.path.dirname(module_id)
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.level:
                base = pkg_dir
                for _ in range(node.level - 1):
                    base = os.path.dirname(base)
                target = os.path.join(base, *(node.module.split(".") if node.module else ["__init__"]))
                if not (os.path.exists(os.path.join(REC, target + ".py"))
                        or os.path.isdir(os.path.join(REC, target))):
                    unresolved.append("%s%s" % ("." * node.level, node.module or ""))
        entry["imports_unresolved"] = unresolved
        t["imports_unresolved"] += len(unresolved)
        report["modules"][module_id] = entry

    t["strings_coverage"] = (round(100.0 * (t["strings_expected"] - t["strings_missing"]) / t["strings_expected"], 2)
                             if t["strings_expected"] else 100.0)
    report["totals"] = t
    report["worst"] = worst

    with open(os.path.join(WORK, "backend_validation.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=1, sort_keys=True)

    lines = ["# recovered backend — mechanical validation", "",
             "| criterion | value |", "| --- | --- |"]
    lines.append("| modules found | %d / %d |" % (t["modules"], len(modules)))
    lines.append("| AC-B1 parse ok (3.12) | %d / %d |" % (t["parse_ok"], t["modules"]))
    lines.append("| AC-B2 files with artifacts | %d |" % t["marker_files"])
    lines.append("| AC-B3 modules with all .das names present | %d / %d |" % (t["names_ok"], t["modules"]))
    lines.append("| AC-B4 string coverage | %.2f%% (%d missing of %d) |"
                 % (t["strings_coverage"], t["strings_missing"], t["strings_expected"]))
    lines.append("| AC-B5 unresolved relative imports | %d |" % t["imports_unresolved"])
    lines.append("")
    lines.append("## Modules needing attention")
    lines.append("")
    for module_id, kind, detail in worst:
        lines.append("- `%s` — %s: %s" % (module_id, kind, detail))
    lines.append("")
    lines.append("## Per-module table")
    lines.append("")
    lines.append("| module | lines | objects | parse | defs | strings | coverage | artifacts |")
    lines.append("| --- | --- | --- | --- | --- | --- | --- | --- |")
    for module_id in sorted(report["modules"]):
        e = report["modules"][module_id]
        if e.get("missing"):
            lines.append("| %s | - | - | MISSING | - | - | - | - |" % module_id)
            continue
        lines.append("| %s | %s | %s | %s | %s/%s | %s/%s | %s%% | %s |" % (
            module_id, e.get("lines"), e.get("das_objects"),
            "ok" if e.get("parse_ok") else "FAIL",
            e.get("defs_found"), e.get("defs_expected"),
            (e.get("strings_expected", 0) - e.get("strings_missing", 0)), e.get("strings_expected", 0),
            e.get("strings_coverage"), ", ".join(e.get("artifacts") or []) or "-"))
    with open(os.path.join(WORK, "backend_validation.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")

    print(json.dumps(t, indent=1))
    for module_id, kind, detail in worst[:40]:
        print("  ! %-55s %s: %s" % (module_id, kind, detail))


if __name__ == "__main__":
    main()
