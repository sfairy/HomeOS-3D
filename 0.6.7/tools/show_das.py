#!/usr/bin/env python3
"""Print the pycdas disassembly slices stored by pyarmor_extract.py.

  show_das.py <module_id> [--name NAME] [--index N] [--consts] [--max-lines N]

<module_id> is the path relative to the workspace, e.g. backend/app/api/icons.py.
--name matches object_name or qualified_name (substring). --index prints one code
object by its index. Without filters every object's header is listed.
"""
import argparse, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
WS = os.path.dirname(os.path.dirname(HERE))
DAS = os.path.join(WS, "recovered", ".work", "das")


def load(module_id):
    p = os.path.join(DAS, module_id + ".json")
    if not os.path.exists(p):
        sys.exit("no das json for %r (%s)" % (module_id, p))
    with open(p, "r", encoding="utf-8") as fh:
        return json.load(fh)


def slice_constants(raw):
    lines = raw.splitlines()
    out, indent, on = [], None, False
    for ln in lines:
        m = re.match(r"^(\s*)\[([A-Za-z ]+)\]\s*$", ln)
        if m:
            if m.group(2).strip() == "Constants":
                indent, on = len(m.group(1)), True
                out.append(ln)
                continue
            if on and len(m.group(1)) <= (indent or 0):
                break
        if on:
            if re.match(r"^\s*\[Code\]\s*$", ln):
                break
            out.append(ln)
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("module")
    ap.add_argument("--name")
    ap.add_argument("--index", type=int)
    ap.add_argument("--consts", action="store_true")
    ap.add_argument("--max-lines", type=int, default=200)
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()
    d = load(a.module)
    objs = d["objects"]
    if a.list or (a.name is None and a.index is None):
        print("%-4s %-5s %s" % ("idx", "depth", "qualified_name"))
        for o in objs:
            print("%-4d %-5d %s" % (o["index"], o.get("depth", 0), o.get("qualified_name")))
        return
    sel = []
    for o in objs:
        if a.index is not None and o["index"] == a.index:
            sel.append(o)
        elif a.name and (a.name == o.get("object_name") or a.name in (o.get("qualified_name") or "")):
            sel.append(o)
    if not sel:
        sys.exit("no object matched")
    for o in sel:
        print("=" * 78)
        print("index %d  depth %d  %s" % (o["index"], o.get("depth", 0), o.get("qualified_name")))
        print("file=%s args=%s stack=%s flags=%s lines %s-%s" % (
            o.get("file_name"), o.get("arg_count"), o.get("stack_size"), o.get("flags"),
            o.get("start_line"), o.get("end_line")))
        raw = o.get("raw") or ""
        body = slice_constants(raw) if a.consts else raw
        lines = body.splitlines()
        if a.max_lines and len(lines) > a.max_lines:
            lines = lines[: a.max_lines] + ["... (%d more lines)" % (len(lines) - a.max_lines)]
        print("\n".join(lines))


if __name__ == "__main__":
    main()
