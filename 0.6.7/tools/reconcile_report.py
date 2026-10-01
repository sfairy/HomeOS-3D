#!/usr/bin/env python3
"""Emit a per-module reconciliation packet.

For one restored module it prints
  * the .das facts the source still misses (strings and names),
  * for every missing fact, the .das lines that reference it with context,
  * the expected intra-package import list recovered from the bytecode,
so the remaining reconstruction is a bounded, local edit rather than a
re-read of a 500 KB disassembly.
"""
from __future__ import annotations
import json, re, sys
from pathlib import Path

ROOT = Path("/Users/sfairy/项目/HomeOS/HA-Bridge").resolve()
sys.path.insert(0, str(ROOT / "tools"))
import verify_restore as V  # noqa: E402
import verify_imports as I  # noqa: E402


def context(das_text: str, needle: str, span: int = 6) -> list[str]:
    out = []
    pat = re.compile(re.escape(needle))
    for n, line in enumerate(das_text.splitlines(), 1):
        if pat.search(line):
            out.append(n)
    if not out:
        return []
    keep = set()
    lines = das_text.splitlines()
    for n in out[:4]:
        for i in range(max(1, n - span), min(len(lines), n + span) + 1):
            keep.add(i)
    return [f"{i:6d}  {lines[i-1]}" for i in sorted(keep)]


def packet(target: Path) -> str:
    das = Path(str(target) + ".1shot.das")
    out = [f"# reconcile {target.relative_to(ROOT)}", ""]
    if not das.is_file():
        return out[0] + "\n\n(no .das)\n"
    codes = V.parse_das(das)
    es, en = V.das_facts(codes)
    es -= V.das_compiler_generated(das)
    facts = V.inspect_source(target)
    tokens = set(facts.identifiers)
    for i in list(facts.identifiers):
        tokens.update(p for p in re.split(r"[^A-Za-z0-9_]+", i) if p)

    def hit_s(v):
        if v in facts.strings: return True
        if v.isidentifier() and v in tokens: return True
        parts = [p for p in v.split(".") if p]
        if len(parts) > 1 and all(p in tokens for p in parts): return True
        c = re.sub(r"\s+", "", v)
        return bool(c) and c in facts.compact

    def hit_n(v):
        if v in facts.identifiers: return True
        parts = [p for p in v.split(".") if p]
        return len(parts) > 1 and all(p in tokens for p in parts)

    ms = [v for v in sorted(es) if not hit_s(v)]
    mn = [v for v in sorted(en) if not hit_n(v)]
    text = das.read_text(encoding="utf-8", errors="replace")

    out.append(f"missing strings ({len(ms)}), missing names ({len(mn)})")
    out.append("")
    if ms:
        out.append("## missing string constants")
        for v in ms:
            out.append(f"- {v!r}")
            for line in context(text, repr(v)[1:-1] if not v.isidentifier() else v)[:40]:
                out.append("  " + line)
        out.append("")
    if mn:
        out.append("## missing names")
        for v in mn:
            out.append(f"- {v}")
            for line in context(text, "'" + v + "'")[:24]:
                out.append("  " + line)
        out.append("")
    imports = I.das_imports(das)
    if imports:
        out.append("## expected imports from the bytecode (level, module)")
        for item in imports:
            level = getattr(item, "level", None)
            module = getattr(item, "module", None)
            names = getattr(item, "names", None)
            out.append(f"  level={level} module={module}"
                       + (f" names={list(names)}" if names else ""))
        out.append("")
    out.append("## current source imports")
    try:
        for level, module in I.source_imports(target):
            out.append(f"  level={level} module={module}")
    except Exception as exc:  # noqa: BLE001
        out.append(f"  (unparseable: {exc})")
    out.append("")
    return "\n".join(out)


if __name__ == "__main__":
    for arg in sys.argv[1:]:
        target = (ROOT / arg).resolve()
        dest = ROOT / ".restore/reconcile" / (arg.replace("/", "__") + ".md")
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(packet(target), encoding="utf-8")
        print("wrote", dest.relative_to(ROOT))
