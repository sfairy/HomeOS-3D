# RECIPE — rebuilding one PyArmor-protected module from its `.das` disassembly

This file is the authoritative procedure for the 0.6.6 restoration.  Read it fully
before touching a module.

## 0. Environment

    cd /Users/sfairy/项目/HA-Bridge/源代码/0.6.6
    PY=/Users/sfairy/项目/HomeOS/HomeOS-3D/.venv-store/bin/python3   # CPython 3.14.7

Layout for one protected module `backend/app/<pkg>/<name>.py`:

    backend/app/<pkg>/<name>.py.1shot.seq    # PyArmor-encrypted bytecode (binary, DO NOT READ)
    backend/app/<pkg>/<name>.py.1shot.das    # exact pycdas disassembly of the ORIGINAL bytecode
    backend/app/<pkg>/<name>.py.1shot.cdc.py # LOSSY pycdc decompile — hints only, never trust it
    backend/app/<pkg>/<name>.py              # the file you must produce

**The `.das` is the single source of truth.**  It was produced from CPython **3.12**
bytecode (note `KW_NAMES`+`CALL`, `END_FOR`, `RETURN_CONST`, `POP_JUMP_IF_NONE`).
The `.cdc.py` is provably wrong in many places (drops `with`/`try`/decorators,
invents `None(None)`, re-orders statements, emits `x = x` junk) — use it only to
guess an expression's shape, never as evidence.

## 1. Reading the disassembly

    $PY tools/das_view.py backend/app/<pkg>/<name>.py.1shot.das            # module code object
    $PY tools/das_view.py backend/app/<pkg>/<name>.py.1shot.das <FuncName> # one code object
    grep -n 'Object Name:' backend/app/<pkg>/<name>.py.1shot.das           # list every code object

`das_view.py` replaces every PyArmor `enter/exit/assert` instruction with a
`BYTECODE  # pyarmor marker` line and collapses runs of them.  Those markers and the
`b'<COAddr>...'` constants are obfuscation scaffolding — they never correspond to
source.  Everything else is the real program.

Each code object `.das` block has four parts you must read:

* `[Names]` — every global/builtin/attribute name the code touches.  `verify_restore`
  checks this set, so **every name listed must appear in your source**, and you must
  not invent names that are absent.
* `[Locals+Names]` — the local variable names (plus `__assert_armored__`, which is
  scaffolding and must NOT be written).
* `[Constants]` — every literal (strings must be copied **byte for byte**,
  including Chinese text and regexes).
* `[Disassembly]` — the instructions, with source line numbers in the first column.
  The first column is the original source line!  Two instructions with the same
  line number belong to the same source line.
* `[Exception Table]` — the `try`/`with`/`finally` structure.  An entry
  `A to B -> H` means the bytecode range [A,B) is protected and control transfers to
  offset H.  `lasti` marks a cleanup/re-raise handler; depth 1 with `lasti` is the
  classic `try/except` shape.

Name mangling: PyArmor renames nothing you need; the `Names`/`Locals`/`Constants`
tables give the original identifiers verbatim.  `__pyarmor_assert_NNNN__(...)` is
**not** an assert — ignore the whole call.

## 2. Bytecode → Python idioms (memorise these)

    x or y     ->  <x>; COPY 1; POP_JUMP_IF_TRUE end; POP_TOP; <y>; end:
    x and y    ->  <x>; COPY 1; POP_JUMP_IF_FALSE end; POP_TOP; <y>; end:
    A if C else B -> <C, inverted jump to else>; <A>; JUMP end; <B>; end:
    a is None  ->  LOAD a; ... IS_OP 0
    a not in b ->  CONTAINS_OP 1 ; a in b -> CONTAINS_OP 0
    x in {'a','b'} -> the constant shows as frozenset({'a','b'}) — write the set literal
    if not <X>: A  ->  <X>; POP_JUMP_IF_TRUE <over A>; <A>
    if <X>: A      ->  <X>; POP_JUMP_IF_FALSE <over A>; <A>
    for i in it    ->  GET_ITER; FOR_ITER <end>; STORE_FAST i; ...; JUMP_BACKWARD; END_FOR
    with EXPR as v ->  BEFORE_WITH / BEFORE_ASYNC_WITH ... plus a 'lasti' exception-table entry
    try: ... except T as e: ...  ->  exception-table entry [try range] -> handler; handler
        starts with PUSH_EXC_INFO, CHECK_EXC_MATCH, POP_JUMP_IF_FALSE next-handler,
        POP_TOP, STORE_FAST e, ...body..., POP_EXCEPT, JUMP_BACKWARD/RETURN
    a if ... else b (ternary) and short-circuit chains nest exactly as written above
    f"{a}"       -> FORMAT_VALUE / BUILD_STRING
    def f(a, b=1) -> module-level code builds a defaults tuple for MAKE_FUNCTION
    annotations   -> MAKE_FUNCTION flags 0x04 with an (name, value, ...) tuple

Function `def` statements live in the **enclosing** code object's disassembly: look for
`LOAD_CONST <CODE> <name>` + `MAKE_FUNCTION` next to the name/annotation/default
tuples.  Class bodies are their own code object loaded with `LOAD_BUILD_CLASS`+`.
Decorators appear as a call applied to the newly built function *before* `STORE_NAME`.

### `from __future__ import annotations`

If the module code object's `[Names]` contains `'__future__'` **and** `'annotations'`
(disassembly shows `IMPORT_NAME __future__` / `IMPORT_FROM annotations`), the file starts with
`from __future__ import annotations` and all annotations are unevaluated strings.
Otherwise the annotations are evaluated at runtime and the referenced types appear as
real names in `[Names]` — do **not** add the future import.

### Relative imports

`LOAD_CONST <level>` + `LOAD_CONST (<fromlist>)` + `IMPORT_NAME <module>` means
`from .module import name1, name2` when level is 1.  pycdc frequently renders these as a
bare `import module` plus a bogus `name = name` line, or drops them entirely; the
disassembly is authoritative.

## 3. Style conventions (match the already-restored 0.6.5 sources)

* Single quotes for ordinary strings; `'''...'''` for the module docstring,
  `"""..."""` for function docstrings.
* 4-space indent; one blank line between top-level definitions, two before a class.
* Empty dict is written `{ }` (pycdc style) inside expressions.
* Long boolean chains / dict literals stay on one line where the original clearly did.
* No type annotations beyond those the `[Names]`/`MAKE_FUNCTION` evidence proves.
* Never leave `pass  # TODO(restore)`, `x = x` junk lines, or commented-out stubs.

## 4. Acceptance — all four must be clean for your file

    $PY -c "import ast; ast.parse(open('backend/app/<pkg>/<name>.py').read()); print('syntax OK')"
    $PY tools/verify_imports.py    backend/app/<pkg>/<name>.py
    $PY tools/verify_restore.py    backend/app/<pkg>/<name>.py
    $PY tools/verify_with_blocks.py backend/app/<pkg>/<name>.py
    $PY tools/verify_try_blocks.py backend/app/<pkg>/<name>.py

Required output: `clean=1 with-differences=0 errors=0` and `files-with-todo=0`.
Any `DIFF` line is a real defect: read it, go back to the `.das`, fix the source.

`verify_restore` compares the *names* and *string constants* of your compiled source
against the `.das`.  It does **not** check control flow — a file can pass it with
invented logic.  Therefore you must also convince yourself, instruction by
instruction, that each statement, branch, loop, `with` and `except` you wrote
corresponds to what `[Disassembly]` actually does.  Missing `with`/`except` are
caught by the other two verifiers; missing `if`/`for`/`return`/short-circuits are not.

## 5. Worked example (real, already accepted)

`backend/app/modules/interaction3d/request_origin.py` — the disassembly contains

    234     LOAD_FAST   3: origin
    236     POP_JUMP_IF_NOT_NONE   27 (to 292)
    238 ... LOAD_ATTR 3: get  'referer'  CALL 1
    290     JUMP_FORWARD   1 (to 294)
    292     LOAD_CONST  0: None
    294     STORE_FAST  4: referer

which is exactly `referer = request.headers.get('referer') if origin is None else None`,
and the exception table

    328 to 1130 -> 1180 [0]        (handler: CHECK_EXC_MATCH ValueError -> valid = False)
    1130 to 1160 -> 1214 [0]

bounds the `try:` that ends with `except ValueError: valid = False`, followed by the
`if not valid: raise HTTPException(403, ...)` that lives *outside* the try.

Likewise `backend/app/ha/percentage_sources.py`:

    42-98   LOAD_GLOBAL str; state.get('entity_id'); COPY; POP_JUMP_IF_TRUE;
            POP_TOP; LOAD_CONST ''; CALL 1
    ->      entity_id = str(state.get('entity_id') or '')

    112-150 state.get('attributes'); COPY; POP_JUMP_IF_TRUE; POP_TOP; BUILD_MAP 0
    ->      attributes = state.get('attributes') or { }

    444-450 CONTAINS_OP 0 (in); POP_JUMP_IF_TRUE <over body>; JUMP_BACKWARD <loop>
    ->      if not key in attributes: continue        (note the inverted test: this
            shape, not the usual 'not in', is what the disassembly proves)
