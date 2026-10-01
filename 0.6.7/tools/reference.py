#!/usr/bin/env python3
"""Locate the PyArmor ``.das`` disassembly that belongs to a restored file.

The ``.1shot.*`` artefacts are removed from the working tree so that the
project is a clean, runnable checkout (left in place they break Alembic, which
globs ``migrations/versions/*.py``).  The disassembly files remain available as
a verification reference, bundled in ``tools/reference/1shot-das.tar.gz``.

Resolution order for the disassembly of ``backend/app/config.py``:

1. ``HB_1SHOT_REF`` environment variable, if it points at a directory holding
   the extracted reference tree;
2. a sibling file, ``backend/app/config.py.1shot.das`` (in case the reference
   was extracted in place);
3. ``tools/reference/.extracted``, populated on demand from the bundled
   tarball.

Usage::

    from reference import das_for, reference_root

    path = das_for(Path("backend/app/config.py"))   # -> Path | None
"""

from __future__ import annotations

import os
import tarfile
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = TOOLS_DIR.parent
BUNDLE = TOOLS_DIR / "reference" / "1shot-das.tar.gz"
EXTRACTED = TOOLS_DIR / "reference" / ".extracted"


def _extract_bundle() -> Path | None:
    if not BUNDLE.is_file():
        return None
    if EXTRACTED.is_dir() and any(EXTRACTED.rglob("*.das")):
        return EXTRACTED
    EXTRACTED.mkdir(parents=True, exist_ok=True)
    with tarfile.open(BUNDLE, "r:gz") as archive:
        archive.extractall(EXTRACTED)
    return EXTRACTED


def reference_root() -> Path | None:
    """Return the directory that holds the ``.1shot.*`` reference tree."""
    override = os.environ.get("HB_1SHOT_REF", "").strip()
    if override:
        candidate = Path(override).expanduser()
        if candidate.is_dir():
            return candidate
    return _extract_bundle()


def _relative_candidates(source: Path) -> list[Path]:
    source = Path(source)
    try:
        return [source.resolve().relative_to(PROJECT_ROOT)]
    except ValueError:
        return [source]


def das_for(source: Path) -> Path | None:
    """Return the disassembly file for ``source``, or ``None`` if unavailable."""
    source = Path(source)
    sibling = Path(f"{source}.1shot.das")
    if sibling.is_file():
        return sibling
    root = reference_root()
    if root is None:
        return None
    for relative in _relative_candidates(source):
        candidate = root / f"{relative}.1shot.das"
        if candidate.is_file():
            return candidate
    return None


def cdc_for(source: Path) -> Path | None:
    """Return the pycdc decompilation for ``source``, or ``None``."""
    source = Path(source)
    sibling = Path(f"{source}.1shot.cdc.py")
    if sibling.is_file():
        return sibling
    root = reference_root()
    if root is None:
        return None
    for relative in _relative_candidates(source):
        candidate = root / f"{relative}.1shot.cdc.py"
        if candidate.is_file():
            return candidate
    return None
