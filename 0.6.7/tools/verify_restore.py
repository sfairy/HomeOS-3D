#!/usr/bin/env python3
"""Fidelity check for the PyArmor restoration.

The restored ``.py`` files are derived from the ``.1shot.cdc.py`` text and the
``.1shot.das`` disassembly.  The disassembly is *exact*: it lists, for every
code object it contains, the names the code referenced and the constants it
embedded.  A faithful restoration must therefore still mention every one of
them.

This tool is deliberately *version independent*: it does not compare bytecode
(the only interpreter available here is newer than the 3.12 that produced the
dump) but compares

* every string constant in the ``.das`` ``[Constants]`` sections, decoded, and
* every entry of every ``.das`` ``[Names]`` / ``[Locals+Names]`` section

against the set of string literals and identifiers of the restored source,
extracted through :mod:`tokenize` so comments and formatting cannot mask a
difference.

PyArmor's own markers and interpreter-generated names are filtered, and the
comparison is one-way (``.das`` -> source): the restoration is allowed to
introduce readable helper names, but it may not lose a referenced name or a
string literal.

Reviewed behaviour changes are the only exception, and each one must be listed
explicitly in :data:`INTENTIONAL_DROPS` (per file, per exact value) so a real
regression cannot hide behind a blanket ignore.

Usage::

    python3 tools/verify_restore.py [--verbose] [path ...]
"""

from __future__ import annotations

import ast
import io
import re
import sys
import tokenize
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from reference import das_for  # noqa: E402

# --------------------------------------------------------------------------
# .das parsing
# --------------------------------------------------------------------------

SECTION_RE = re.compile(r"^\[([A-Za-z+][^\]]*)\]$")
QUOTED_RE = re.compile(
    r"(?<![A-Za-z0-9_])"
    r"(?P<literal>[bBrRfFuU]{0,2}(?:'''(?:\\.|[^\\])*?'''|\"\"\"(?:\\.|[^\\])*?\"\"\""
    r"|'(?:\\.|[^'\\\n])*'|\"(?:\\.|[^\"\\\n])*\"))"
)

PYARMOR_NAME_RE = re.compile(r"^(?:__pyarmor_|__assert_armored__$)")
GENERATED_NAMES = {
    "__name__",
    "__module__",
    "__qualname__",
    "__doc__",
    "__class__",
    "__classdict__",
    "__annotations__",
    "__classcell__",
    ".0",
}
GENERATED_NAME_RE = re.compile(r"^(?:\.\d+|implicit\d+|__pyarmor_)")

REPO_ROOT = Path(__file__).resolve().parents[1]

# --------------------------------------------------------------------------
# intentional deviations from the disassembly
# --------------------------------------------------------------------------
# The comparison is otherwise strict ("the restoration must not lose a
# referenced name or a string literal").  A reviewed behaviour change is the one
# exception, and it must be listed here explicitly, per file and per exact
# value, so that a real regression can never hide behind a blanket ignore.
#
# ``backend/app/config.py`` used to hard-code the vendor's licence endpoints,
# key ids and public-key fingerprints.  They were deliberately removed: the
# project now ships its own licence authority (``store/``), the client defaults
# to ``http://127.0.0.1:18082`` and trusts the in-repo ``keys/`` mirror.  Those
# literals disappearing *is* the change, so they are excused here.
INTENTIONAL_DROPS: dict[str, set[str]] = {
    "backend/app/migrations.py": {
        # The shipped build carried a second, PyArmor-generated copy of the
        # migration scripts under ``alembic_runtime/`` and preferred it whenever
        # the directory existed.  That tree was pure PyArmor residue: every one
        # of its 21 modules was a one-line ``import_module`` re-export of the
        # real implementation in ``migrations/``.  The shim tree has been
        # deleted, so the preference and the probe that fed it went with it and
        # ``alembic.ini``'s ``script_location = migrations`` is now the only
        # route.  Behaviour is unchanged - a fresh boot applies the same 20
        # revisions, which verify_all.sh section 9 checks - so these four values
        # are a reviewed removal rather than an accidental loss.
        "alembic_runtime",  # the string naming the deleted shim directory
        "is_dir",  # the Path.is_dir() probe that selected it
        "release_scripts",  # the local that held that directory
        "script_location",  # the local, now inlined into set_main_option
    },
}
# Historical record only: the 0.5.4 restoration deliberately dropped the multi-server
# production licence endpoints.  The 0.6.5 restoration is faithful to the shipped
# build, so nothing is excused here; the table is kept for reference.
_UNUSED_05_4_DROPS: dict[str, set[str]] = {
    "backend/app/config.py": {
        # strings
        "https://hbjh1.habridge.cn",
        "https://hbjh2.habridge.cn",
        "https://hbjheas1.onestrm.cn",
        "https://hbjheas2.onestrm.cn",
        "https://hbjheo1.onestrm.cn",
        "https://hbjheo2.onestrm.cn",
        "hb-2026-01",
        "hb-transport-2026-01",
        "56ad5028f6a48378b2475be119bed0dc912d317c399b94726e7ba43c3c8beab7",
        "5b9856b097de0fecb3699a4fae7c698de1cfbe60046e7658f345c1e95c6018d8",
        # names
        "PRODUCTION_LICENSE_CURRENT_KEY_ID",
        "PRODUCTION_LICENSE_DIRECT_SERVERS",
        "PRODUCTION_LICENSE_EO_SERVERS",
        "PRODUCTION_LICENSE_ESA_SERVERS",
        "PRODUCTION_LICENSE_PUBLIC_KEY_SHA256",
        "PRODUCTION_LICENSE_SERVER_BATCHES",
        "PRODUCTION_LICENSE_SERVER_URL",
        "PRODUCTION_LICENSE_TRANSPORT_KEY_ID",
        "PRODUCTION_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256",
        "PRODUCTION_LICENSE_TRUSTED_PUBLIC_KEYS",
    },
}


def intentional_drops(target: Path) -> set[str]:
    """Return the reviewed deviations that apply to ``target``."""
    try:
        key = target.resolve().relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return set()
    return INTENTIONAL_DROPS.get(key, set())


@dataclass
class CodeObject:
    file_name: str = ""
    object_name: str = ""
    qualified_name: str = ""
    arg_count: int = 0
    kw_only_arg_count: int = 0
    flags: str = ""
    names: list[str] = field(default_factory=list)
    locals_and_names: list[str] = field(default_factory=list)
    strings: list[str] = field(default_factory=list)
    children: list["CodeObject"] = field(default_factory=list)

    def walk(self):
        yield self
        for child in self.children:
            yield from child.walk()


def _indent_of(line: str) -> int:
    return len(line) - len(line.lstrip())


def _decode_literals(text: str) -> list[str]:
    """Decode every string literal found in ``text`` (ignore failures)."""
    found: list[str] = []
    for match in QUOTED_RE.finditer(text):
        literal = match.group("literal")
        try:
            value = ast.literal_eval(literal)
        except (SyntaxError, ValueError):
            continue
        if isinstance(value, bytes):
            try:
                value = value.decode("utf-8")
            except UnicodeDecodeError:
                continue
        if isinstance(value, str):
            found.append(value)
    return found


def parse_das(path: Path) -> list[CodeObject]:
    """Return the top-level code objects of a ``.das`` file."""
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    try:
        first = next(
            index for index, line in enumerate(lines) if line.strip() == "[Code]"
        )
    except StopIteration:
        return []

    def parse_block(start: int, indent: int) -> tuple[CodeObject, int]:
        code = CodeObject()
        index = start + 1
        section: str | None = None
        section_indent = 0
        while index < len(lines):
            line = lines[index]
            stripped = line.strip()
            if not stripped:
                index += 1
                continue
            current = _indent_of(line)
            if current <= indent:
                break
            if stripped == "[Code]":
                child, index = parse_block(index, current)
                code.children.append(child)
                continue
            name_match = SECTION_RE.match(stripped)
            if name_match and current == indent + 4:
                section = name_match.group(1)
                section_indent = current
                index += 1
                continue
            if (
                current == indent + 4
                and ":" in stripped
                and not stripped.startswith(("'", '"', "b'", 'b"'))
                and not stripped.startswith(("(", "[", "{"))
            ):
                key, _, value = stripped.partition(":")
                key = key.strip()
                value = value.strip()
                if key == "Object Name":
                    code.object_name = value
                elif key == "Qualified Name":
                    code.qualified_name = value
                elif key == "File Name":
                    code.file_name = value
                elif key == "Arg Count":
                    try:
                        code.arg_count = int(value)
                    except ValueError:
                        pass
                elif key == "KW Only Arg Count":
                    try:
                        code.kw_only_arg_count = int(value)
                    except ValueError:
                        pass
                elif key == "Flags":
                    code.flags = value
                index += 1
                continue
            if section and current >= section_indent + 4:
                if section in ("Names", "Locals+Names"):
                    for value in _decode_literals(stripped):
                        target = (
                            code.names if section == "Names" else code.locals_and_names
                        )
                        target.append(value)
                elif section == "Constants":
                    code.strings.extend(_decode_literals(stripped))
                index += 1
                continue
            index += 1
        return code, index

    roots: list[CodeObject] = []
    index = first
    while index < len(lines):
        if lines[index].strip() == "[Code]":
            node, index = parse_block(index, _indent_of(lines[index]))
            roots.append(node)
        else:
            index += 1
    return roots


# --------------------------------------------------------------------------
# source introspection
# --------------------------------------------------------------------------


@dataclass
class SourceFacts:
    strings: set[str] = field(default_factory=set)
    identifiers: set[str] = field(default_factory=set)
    compact: str = ""
    error: str | None = None


def inspect_source(path: Path) -> SourceFacts:
    """Collect the string values and identifiers a source file mentions.

    Strings come from the AST rather than from ``tokenize``: the parser folds
    implicit literal concatenation and exposes the literal parts of f-strings
    (which ``tokenize`` splits into ``FSTRING_*`` tokens since CPython 3.12).
    Identifiers come from both the AST and ``tokenize``: ``tokenize`` also sees
    names inside comments and strings (harmless -- the question is only whether
    the source mentions a name at all), while before CPython 3.12 it hands a
    whole f-string over as one STRING token, so a name that occurs only inside
    a replacement field (``f"{value.casefold()}"``) would look missing.
    """
    facts = SourceFacts()
    text = path.read_text(encoding="utf-8", errors="replace")
    facts.compact = re.sub(r"\s+", "", text)

    def collect(value) -> None:
        if isinstance(value, bytes):
            try:
                value = value.decode("utf-8")
            except UnicodeDecodeError:
                return
        if isinstance(value, str):
            facts.strings.add(value)

    try:
        tree = ast.parse(text)
    except (SyntaxError, ValueError) as error:
        facts.error = str(error)
        tree = None
    if tree is not None:
        for node in ast.walk(tree):
            if isinstance(node, ast.Constant):
                collect(node.value)
            elif isinstance(node, ast.JoinedStr):
                for piece in node.values:
                    if isinstance(piece, ast.Constant):
                        collect(piece.value)
            # Identifiers the tree exposes.  ``getattr`` keeps this working on
            # interpreters without the pattern-matching nodes (3.9 and older).
            if isinstance(node, ast.Name):
                facts.identifiers.add(node.id)
            elif isinstance(node, ast.Attribute):
                facts.identifiers.add(node.attr)
            elif isinstance(node, ast.arg):
                facts.identifiers.add(node.arg)
            elif isinstance(node, ast.keyword) and node.arg:
                facts.identifiers.add(node.arg)
            elif isinstance(node, (ast.Global, ast.Nonlocal)):
                facts.identifiers.update(node.names)
            name = getattr(node, "name", None)
            if isinstance(name, str):
                facts.identifiers.add(name)
                facts.identifiers.update(part for part in name.split(".") if part)
    else:
        return facts

    try:
        for token in tokenize.generate_tokens(io.StringIO(text).readline):
            if token.type == tokenize.NAME:
                facts.identifiers.add(token.string)
            elif token.type == tokenize.STRING:
                for value in _decode_literals(token.string):
                    facts.strings.add(value)
    except (tokenize.TokenError, IndentationError, SyntaxError):
        pass
    return facts


# --------------------------------------------------------------------------
# comparison
# --------------------------------------------------------------------------


KW_NAMES_RE = re.compile(r"KW_NAMES\s+\d+:\s*\(([^)]*)\)")
ANNOTATION_TUPLE_RE = re.compile(r"LOAD_CONST\s+\d+:\s*\(([^)]*'return'[^)]*)\)")


def das_compiler_generated(path: Path) -> set[str]:
    """Strings the compiler emitted that never appear as literals in source.

    ``KW_NAMES`` tuples hold the keyword names of a call and ``MAKE_FUNCTION``
    annotation tuples hold the keyword/return annotation metadata; both show up
    in ``[Constants]`` but are written as ordinary syntax in the source, so they
    must not be reported as lost string literals.
    """
    text = path.read_text(encoding="utf-8", errors="replace")
    generated: set[str] = set()
    for pattern in (KW_NAMES_RE, ANNOTATION_TUPLE_RE):
        for match in pattern.finditer(text):
            generated.update(_decode_literals(match.group(1)))
    return generated


def das_facts(codes: list[CodeObject]) -> tuple[set[str], set[str]]:
    strings: set[str] = set()
    names: set[str] = set()
    for code in codes:
        for node in code.walk():
            for value in node.strings:
                if PYARMOR_NAME_RE.match(value) or value.startswith("__pyarmor_"):
                    continue
                if value == "<COAddr>" or value.startswith("<COAddr>"):
                    continue
                strings.add(value)
            for value in (*node.names, *node.locals_and_names):
                if PYARMOR_NAME_RE.match(value):
                    continue
                if value in GENERATED_NAMES or GENERATED_NAME_RE.match(value):
                    continue
                names.add(value)
    return strings, names


@dataclass
class Result:
    target: str
    missing_strings: list[str]
    missing_names: list[str]
    error: str | None
    strings_checked: int
    names_checked: int
    excused: list[str] = field(default_factory=list)


def verify(target: Path) -> Result:
    das_path = das_for(target)
    if das_path is None:
        return Result(str(target), [], [], "missing reference .das", 0, 0)
    if not target.is_file():
        return Result(str(target), [], [], "restored file missing", 0, 0)
    codes = parse_das(das_path)
    expected_strings, expected_names = das_facts(codes)
    expected_strings -= das_compiler_generated(das_path)
    facts = inspect_source(target)
    if facts.error:
        return Result(str(target), [], [], f"tokenize failed: {facts.error}", 0, 0)

    # ``[Constants]`` also carries compiler-generated ``KW_NAMES`` tuples and
    # ``IMPORT_NAME`` module paths.  Those appear in the source as keyword
    # argument syntax or as dotted import syntax, never as a string literal, so
    # accept a constant when its parts are present as identifiers too.
    tokens = set(facts.identifiers)
    for identifier in facts.identifiers:
        tokens.update(part for part in re.split(r"[^A-Za-z0-9_]+", identifier) if part)

    def missing_from_strings(value: str) -> bool:
        if value in facts.strings:
            return False
        if value.isidentifier() and value in tokens:
            return False
        parts = [part for part in value.split(".") if part]
        if len(parts) > 1 and all(part in tokens for part in parts):
            return False
        # ``from __future__ import annotations`` turns annotations into string
        # constants in the disassembly while the source spells them as ordinary
        # expressions, so fall back to a whitespace-insensitive text search.
        compact = re.sub(r"\s+", "", value)
        if compact and compact in facts.compact:
            return False
        return True

    def missing_from_names(value: str) -> bool:
        if value in facts.identifiers:
            return False
        parts = [part for part in value.split(".") if part]
        if len(parts) > 1 and all(part in tokens for part in parts):
            return False
        return True

    dropped = intentional_drops(target)
    missing_strings = sorted(
        v for v in expected_strings if v not in dropped and missing_from_strings(v)
    )
    missing_names = sorted(
        v for v in expected_names if v not in dropped and missing_from_names(v)
    )
    excused = sorted(
        value
        for value in dropped
        if (value in expected_strings and missing_from_strings(value))
        or (value in expected_names and missing_from_names(value))
    )
    return Result(
        str(target),
        missing_strings,
        missing_names,
        None,
        len(expected_strings),
        len(expected_names),
        excused,
    )


def discover(root: Path) -> list[Path]:
    targets = [
        path
        for path in sorted(root.rglob("*.py"))
        if ".1shot." not in path.name
    ]
    return [path for path in targets if das_for(path) is not None]


def main(argv: list[str]) -> int:
    root = Path(__file__).resolve().parents[1]
    verbose = "--verbose" in argv or "-v" in argv
    wants = [a for a in argv[1:] if not a.startswith("-")]
    targets = discover(root)
    if wants:
        targets = [t for t in targets if any(w in str(t) for w in wants)]
    clean = 0
    dirty: list[Result] = []
    errors: list[Result] = []
    excused: list[Result] = []
    for target in targets:
        result = verify(target)
        if result.error:
            errors.append(result)
        elif result.missing_strings or result.missing_names:
            dirty.append(result)
        else:
            clean += 1
        if result.excused:
            excused.append(result)
    for result in dirty:
        print(f"DIFF  {Path(result.target).relative_to(root)}")
        for value in result.missing_strings[:12]:
            print(f"        string not in source: {value!r}")
        if len(result.missing_strings) > 12:
            print(f"        ... {len(result.missing_strings) - 12} more strings")
        for value in result.missing_names[:12]:
            print(f"        name not in source:   {value}")
        if len(result.missing_names) > 12:
            print(f"        ... {len(result.missing_names) - 12} more names")
    for result in errors:
        print(f"ERROR {Path(result.target).relative_to(root)} :: {result.error}")
    for result in excused:
        print(
            f"NOTE  {Path(result.target).relative_to(root)}: "
            f"{len(result.excused)} reviewed deviation(s) excused "
            f"(see INTENTIONAL_DROPS in tools/verify_restore.py)"
        )
    if verbose:
        for target in targets:
            result = verify(target)
            print(
                f"{Path(result.target).relative_to(root)}: "
                f"{result.strings_checked} strings, {result.names_checked} names"
            )
    print(
        f"# verified {len(targets)} file(s): clean={clean} "
        f"with-differences={len(dirty)} errors={len(errors)}"
    )
    return 1 if dirty or errors else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
