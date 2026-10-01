"""Dump top-level metadata + [Disassembly] of each code object (nested [Code] blocks removed)."""
import json, os, re, sys

HDR = re.compile(r"^(\s*)\[([A-Za-z ]+)\]\s*$")

def trim_nested(lines):
    out = []
    skip_indent = None
    first = True
    for ln in lines:
        m = HDR.match(ln)
        if m:
            ind = len(m.group(1))
            if m.group(2).strip() == "Code":
                if first:
                    first = False
                    continue
                skip_indent = ind
                continue
            first = False
            if skip_indent is not None:
                if ind <= skip_indent:
                    skip_indent = None
                else:
                    continue
            out.append(ln)
            continue
        if skip_indent is not None:
            continue
        out.append(ln)
    return out

def slice_section(lines, name):
    out = []
    on = False
    for ln in lines:
        m = HDR.match(ln)
        if m:
            if m.group(2).strip() == name:
                on = True
                out.append(ln)
                continue
            if on:
                break
        if on:
            out.append(ln)
    return out

mod = sys.argv[1]
out = sys.argv[2]
p = os.path.join("recovered", ".work", "das", mod + ".json")
d = json.load(open(p, encoding="utf-8"))
with open(out, "w", encoding="utf-8") as fh:
    for o in d["objects"]:
        fh.write("=" * 78 + chr(10))
        fh.write("index %d depth %d %s" % (o["index"], o.get("depth", 0), o.get("qualified_name")) + chr(10))
        fh.write("args=%s stack=%s flags=%s lines %s-%s" % (o.get("arg_count"), o.get("stack_size"), o.get("flags"), o.get("start_line"), o.get("end_line")) + chr(10))
        lines = trim_nested((o.get("raw") or "").splitlines())
        for sec in ("Names", "Locals+Names", "Constants", "Disassembly", "Exception Table"):
            s = slice_section(lines, sec)
            if s:
                fh.write(chr(10).join(s) + chr(10))
print("wrote", out)