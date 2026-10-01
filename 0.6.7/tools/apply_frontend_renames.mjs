/**
 * Apply an explicit, human-authored binding rename map to frontend modules.
 *
 * This is the semantic-renaming counterpart to `rename_frontend_locals.mjs`.
 * That tool *invented* mechanical names (`value1234`) to remove the last `_0x`
 * names; this one applies names a reader chose, so the interesting work stays
 * with the reader and the mechanical work - and all the ways it can go wrong -
 * stays with the machine.
 *
 * A rename map is a JSON object keyed by path relative to the repository root:
 *
 *     {
 *       "frontend/static/renderer/entity-metadata.js": {
 *         "arg1@1": "metadata",
 *         "value3": "responseBody"
 *       }
 *     }
 *
 * Keys are either `name` - accepted only when the file binds that name exactly
 * once - or `name@line`, where `line` is the 1-based line of the binding's
 * declaring identifier, which disambiguates the many independent `value1`s that
 * a file may bind in different scopes.  When one line declares the same name
 * twice (`arr.map(t => t.folder).sort((t, b) => ...)` binds `t` at two columns),
 * append the column: `name@line:column`, both 1-based as Babel reports them.
 * Values are the new names.
 *
 * Why a map instead of asking for the rewritten file: the rewrite is where
 * mistakes happen.  Renaming by byte range through the AST means comments,
 * indentation, quote style and the `?v=...` cache-busting query strings are
 * preserved byte-for-byte, and the following rules - each of which has broken
 * real code in the past - are enforced as assertions rather than trusted:
 *
 *   - an exported binding is never renamed (it is the module's public API; the
 *     alpha-equivalence check cannot see this class of breakage);
 *   - a non-computed member property (`obj.prop`), a non-computed object or
 *     class key (`{ key: v }`) and the *imported* side of an import specifier
 *     (including the shorthand `import { x }`, where `imported` and `local` are
 *     two nodes sharing one byte range) are never rewritten;
 *   - a shorthand property or shorthand import is expanded instead of renamed,
 *     so the property/imported name survives: `{ value1 }` becomes
 *     `{ value1: response }`, `import { x }` becomes `import { x as rate }`;
 *   - a new name may not collide with any binding in the file, nor shadow a
 *     global the file references;
 *   - every entry in the map must resolve; an unresolved or ambiguous entry
 *     fails the run instead of being silently dropped.
 *
 * Usage:
 *   node tools/apply_frontend_renames.mjs <map.json> [--dry] [--report]
 *   node tools/apply_frontend_renames.mjs <map.json> --allow-semantic
 *   node tools/apply_frontend_renames.mjs <map.json> --allow-export
 *
 * Exit status is non-zero when any entry failed to apply, or when nothing at
 * all could be applied.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolveBabelRoot } from './lib/babel-root.mjs';

import { classifyName } from './lib/name-buckets.mjs';
import { exportedLocalNames } from './lib/exported-names.mjs';

const require = createRequire(import.meta.url);
const BABEL_ROOT = resolveBabelRoot();

const parser = require(`${BABEL_ROOT}/@babel/parser`);
const traverse = require(`${BABEL_ROOT}/@babel/traverse`).default;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function parse(code) {
  return parser.parse(code, { sourceType: 'module', errorRecovery: false });
}

// The frozen set is shared: tools/lib/exported-names.mjs is its only definition,
// so the brief, the planner, the coverage check and this renamer cannot disagree
// about which bindings are public API.  See that file for the semantics.

/**
 * Rename the requested bindings of one module.
 *
 * Returns `{ code, applied, errors }`.  Nothing is written when `errors` is
 * non-empty, so a partially applied map can never reach disk.
 */
function applyRenames(code, mapping, options) {
  const ast = parse(code);
  const exported = exportedLocalNames(ast);

  // Every binding in the file, indexed by `name@declarationStart` so that the
  // same name bound in several scopes stays distinguishable.
  const bindings = new Map();
  const byName = new Map();
  traverse(ast, {
    Scopable(p) {
      for (const [name, binding] of Object.entries(p.scope.bindings)) {
        const declaration = binding.identifier;
        if (!declaration || declaration.start === undefined) continue;
        const key = `${name}@${declaration.start}`;
        if (bindings.has(key)) continue;
        const entry = {
          key,
          name,
          binding,
          line: declaration.loc ? declaration.loc.start.line : null,
          column: declaration.loc ? declaration.loc.start.column : null,
          exported: exported.has(name),
        };
        bindings.set(key, entry);
        if (!byName.has(name)) byName.set(name, []);
        byName.get(name).push(entry);
      }
    },
  });

  // Names a new identifier must not collide with: every binding in the file,
  // plus every free identifier (a global such as `document`) it references.
  //
  // "Free identifier" is decided by `isReferencedIdentifier`, which asks the
  // question semantically instead of by enumerating node types.  The previous
  // hand-maintained exclusion list covered `obj.prop` and `{ key: v }` but not
  // `ObjectMethod` / `ClassMethod` keys, so a method key like
  // `beginCameraMotion() { ... }` was treated as a global reference and
  // reserved.  That did not break code - it only *rejected valid renames* while
  // reporting "collides with a binding or a global already present in this
  // file", a collision that did not exist.  In a file with hundreds of object
  // methods that hands agents a false map of the name space and pushes them
  // toward contorted names.
  const reserved = new Set();
  for (const entry of bindings.values()) reserved.add(entry.name);
  traverse(ast, {
    Identifier(p) {
      if (!p.isReferencedIdentifier()) return;
      reserved.add(p.node.name);
    },
  });

  const errors = [];
  const applied = [];
  const namesSeen = new Set();

  /** Resolve one map key to exactly one binding. */
  const resolve = (rawKey) => {
    // `name`, `name@line` or `name@line:col`.  The column form exists because a
    // single line can declare the same name twice - `arr.map(t => t.folder)
    // .sort((t, b) => ...)` binds `t` at two columns of one line, and matching
    // on the line alone would always pick the first, leaving the second
    // unaddressable while the error message advised "disambiguate with
    // name@line", advice that cannot be followed in that case.
    const at = rawKey.lastIndexOf('@');
    const hasLine = at > 0 && /^\d+(?::\d+)?$/.test(rawKey.slice(at + 1));
    const name = hasLine ? rawKey.slice(0, at) : rawKey;
    let line = null;
    let column = null;
    if (hasLine) {
      const [lineText, columnText] = rawKey.slice(at + 1).split(':');
      line = Number(lineText);
      column = columnText === undefined ? null : Number(columnText);
    }

    const candidates = byName.get(name) || [];
    if (candidates.length === 0) {
      errors.push(`${rawKey}: no binding named "${name}" in this file`);
      return null;
    }
    const describe = () =>
      candidates.map((entry) => `${entry.line}:${entry.column}`).join(', ');
    if (line !== null) {
      const onLine = candidates.filter((entry) => entry.line === line);
      if (onLine.length === 0) {
        errors.push(
          `${rawKey}: "${name}" is not declared on line ${line}; it is declared at ` +
            `${describe()}`
        );
        return null;
      }
      if (column !== null) {
        const match = onLine.find((entry) => entry.column === column);
        if (!match) {
          errors.push(
            `${rawKey}: "${name}" is not declared at column ${column} of line ${line}; ` +
              `line ${line} declares it at ${onLine.map((e) => e.column).join(', ')}`
          );
          return null;
        }
        return match;
      }
      if (onLine.length > 1) {
        errors.push(
          `${rawKey}: line ${line} declares "${name}" ${onLine.length} times, at ` +
            `columns ${onLine.map((entry) => entry.column).join(', ')}; ` +
            `disambiguate with "name@line:column"`
        );
        return null;
      }
      return onLine[0];
    }
    if (candidates.length > 1) {
      const sameLine = new Set(candidates.map((entry) => entry.line)).size === 1;
      errors.push(
        `${rawKey}: "${name}" is bound in ${candidates.length} scopes ` +
          `(at ${describe()}); ` +
          (sameLine
            ? `they share a line, so disambiguate with "name@line:column"`
            : `disambiguate with "name@line"`)
      );
      return null;
    }
    return candidates[0];
  };

  const targets = new Map();
  for (const [rawKey, newName] of Object.entries(mapping)) {
    const entry = resolve(rawKey);
    if (!entry) continue;

    if (targets.has(entry.key)) {
      errors.push(`${rawKey}: "${entry.name}" already mapped by another entry`);
      continue;
    }
    if (!IDENTIFIER_RE.test(newName)) {
      errors.push(`${rawKey}: "${newName}" is not a valid identifier`);
      continue;
    }
    if (newName === entry.name) {
      errors.push(`${rawKey}: new name is identical to the old one`);
      continue;
    }
    if (entry.exported && !options.allowExport) {
      errors.push(
        `${rawKey}: "${entry.name}" is exported, so it is public API and must keep ` +
          `its name; pass --allow-export only if consumers are updated too`
      );
      continue;
    }
    if (!options.allowSemantic && classifyName(entry.name) === 'semantic') {
      errors.push(
        `${rawKey}: "${entry.name}" is already meaningful; renaming it is not part ` +
          `of this cleanup (pass --allow-semantic to override)`
      );
      continue;
    }
    if (namesSeen.has(newName)) {
      errors.push(`${rawKey}: new name "${newName}" is used by another entry`);
      continue;
    }
    if (reserved.has(newName)) {
      errors.push(
        `${rawKey}: new name "${newName}" collides with a binding or a global ` +
          `already present in this file`
      );
      continue;
    }

    namesSeen.add(newName);
    targets.set(entry.key, { ...entry, newName });
  }

  if (errors.length > 0) return { errors, applied: [] };

  /**
   * Every edit, keyed by byte range.  Editing by byte range is what keeps the
   * rest of the file - formatting, comments, quote style, `?v=...` query
   * strings - byte-identical.
   *
   * @type {Map<string, {start: number, end: number, text: string, note?: string}>}
   */
  const edits = new Map();
  const addEdit = (start, end, text, note) => {
    const key = `${start}:${end}`;
    const existing = edits.get(key);
    if (existing && existing.text !== text) {
      errors.push(
        `conflicting edits for byte range ${start}-${end}: ` +
          `"${existing.text}" vs "${text}"`
      );
      return;
    }
    edits.set(key, { start, end, text, note });
  };
  /** True when an already-planned edit spans this node, so it needs no edit. */
  const coveredBy = (node) =>
    [...edits.values()].some((edit) => edit.start <= node.start && node.end <= edit.end);

  const parentOf = new Map();
  traverse(ast, {
    enter(p) {
      if (p.parent) parentOf.set(p.node, p.parent);
    },
  });

  /**
   * Build the `{ key: value }` / `{ key: value = default }` expansion for a
   * shorthand property.  The property name is not a lexical binding, so it has
   * to survive the rename explicitly.
   */
  const shorthandPropertyText = (property, newName) => {
    const fallback =
      property.value && property.value.type === 'AssignmentPattern'
        ? ` = ${code.slice(property.value.right.start, property.value.right.end)}`
        : '';
    return `${property.key.name}: ${newName}${fallback}`;
  };

  /**
   * The edit for a binding's declaration site.  Shorthand syntax needs an
   * expansion rather than a rename, because the name being replaced also
   * carries meaning that is not lexical:
   *
   *   `{ value1 }`         -> `{ value1: response }`       property name kept
   *   `{ value1 = 1 }`     -> `{ value1: response = 1 }`   property name kept
   *   `import { value1 }`  -> `import { value1 as rate }`  imported name kept
   *
   * Renaming instead is the classic silent breakage: `{ value1 }` would become
   * `{ response }`, changing the object's keys, and `import { value1 }` would
   * become `import { rate }`, changing which export is imported.
   */
  const declarationEdit = (target) => {
    const declaration = target.binding.identifier;
    const directParent = parentOf.get(declaration) || null;

    // `{ value1 = 1 }`: the binding is the left side of an AssignmentPattern
    // that is itself the value of a shorthand property.
    let property = directParent;
    if (property && property.type === 'AssignmentPattern') property = parentOf.get(property);
    if (
      property &&
      property.type === 'ObjectProperty' &&
      property.shorthand &&
      (property.key === declaration ||
        property.value === declaration ||
        (property.value && property.value.left === declaration))
    ) {
      addEdit(
        property.start,
        property.end,
        shorthandPropertyText(property, target.newName),
        'expanded shorthand property'
      );
      return;
    }

    // `import { value1 }`: `imported` and `local` are distinct nodes sharing one
    // byte range, so replacing that range needs an explicit alias.
    if (directParent && directParent.type === 'ImportSpecifier' && directParent.local === declaration) {
      if (directParent.imported.start === declaration.start) {
        addEdit(
          declaration.start,
          declaration.end,
          `${directParent.imported.name} as ${target.newName}`,
          'expanded shorthand import'
        );
        return;
      }
    }

    addEdit(declaration.start, declaration.end, target.newName);
  };

  for (const target of targets.values()) declarationEdit(target);

  traverse(ast, {
    Identifier(p) {
      const binding = p.scope.getBinding(p.node.name);
      if (!binding || !binding.identifier || binding.identifier.start === undefined) return;
      const target = targets.get(`${p.node.name}@${binding.identifier.start}`);
      if (!target) return;

      const parent = p.parentPath ? p.parentPath.node : null;
      if (parent) {
        // `import { realName as local }`: never the imported side.
        if (
          parent.type === 'ImportSpecifier' &&
          parent.imported === p.node &&
          parent.local !== p.node
        ) {
          return;
        }
        // `export { local as exported }`: an exported name is public API, and a
        // target is never exported, so any identifier here is the local side.
        if (parent.type === 'ExportSpecifier') return;
        // `obj.prop` / `obj[prop]` - a property, not a variable.
        if (
          (parent.type === 'MemberExpression' ||
            parent.type === 'OptionalMemberExpression') &&
          parent.property === p.node &&
          !parent.computed
        ) {
          return;
        }
        // `{ key: value }` / `class { key() {} }` - not a variable.  A shorthand
        // property *window* is different: the key is the variable, and the name
        // has to survive, so it expands here too.  When the shorthand is the
        // binding's own declaration site the edit already exists and `coveredBy`
        // skips it.
        if (
          (parent.type === 'ObjectProperty' ||
            parent.type === 'ObjectMethod' ||
            parent.type === 'ClassProperty' ||
            parent.type === 'ClassMethod' ||
            parent.type === 'ClassPrivateProperty') &&
          parent.key === p.node &&
          !parent.computed
        ) {
          if (parent.type === 'ObjectProperty' && parent.shorthand && !coveredBy(p.node)) {
            addEdit(
              parent.start,
              parent.end,
              shorthandPropertyText(parent, target.newName),
              'expanded shorthand property'
            );
          }
          return;
        }
        // The `value` side of a shorthand property shares the key's byte range;
        // the key branch above produces the single expansion for the pair.
        if (parent.type === 'ObjectProperty' && parent.shorthand && parent.value === p.node) {
          return;
        }
      }

      if (coveredBy(p.node)) return;
      addEdit(p.node.start, p.node.end, target.newName);
    },
  });

  if (errors.length > 0) return { errors, applied: [] };

  const ordered = [...edits.values()].sort((a, b) => a.start - b.start);
  let output = '';
  let cursor = 0;
  for (const edit of ordered) {
    if (edit.start < cursor) {
      errors.push(`overlapping edits at offset ${edit.start}`);
      return { errors, applied: [] };
    }
    output += code.slice(cursor, edit.start) + edit.text;
    cursor = edit.end;
  }
  output += code.slice(cursor);

  // A rename must not move code across lines: every edit stays inside one line.
  if (output.split('\n').length !== code.split('\n').length) {
    errors.push('line count changed, which a rename must never do');
    return { errors, applied: [] };
  }

  for (const target of targets.values()) {
    applied.push({
      name: target.name,
      newName: target.newName,
      line: target.line,
      occurrences: [...edits.values()].filter(
        (edit) => edit.text === target.newName || edit.text.includes(target.newName)
      ).length,
    });
  }

  return { code: output, applied, errors: [] };
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const report = args.includes('--report');
const options = {
  allowSemantic: args.includes('--allow-semantic'),
  allowExport: args.includes('--allow-export'),
};
const mapPath = args.find((a) => !a.startsWith('--'));

if (!mapPath) {
  console.error('usage: node tools/apply_frontend_renames.mjs <map.json> [--dry] [--report]');
  console.error('       [--allow-semantic] [--allow-export]');
  process.exit(2);
}

const mapping = JSON.parse(fs.readFileSync(path.resolve(mapPath), 'utf8'));

let filesChanged = 0;
let totalApplied = 0;
let failed = 0;

for (const [relativePath, fileMapping] of Object.entries(mapping)) {
  const file = path.resolve(ROOT, relativePath);
  if (!fs.existsSync(file)) {
    console.log(`FAIL  ${relativePath} :: file not found`);
    failed += 1;
    continue;
  }

  const original = fs.readFileSync(file, 'utf8');
  let result;
  try {
    result = applyRenames(original, fileMapping, options);
  } catch (error) {
    console.log(`FAIL  ${relativePath} :: ${error.message}`);
    failed += 1;
    continue;
  }

  if (result.errors.length > 0) {
    console.log(`FAIL  ${relativePath}`);
    for (const message of result.errors) console.log(`        ${message}`);
    failed += 1;
    continue;
  }

  const requested = Object.keys(fileMapping).length;
  if (result.applied.length !== requested) {
    console.log(
      `FAIL  ${relativePath} :: applied ${result.applied.length} of ${requested} entries`
    );
    failed += 1;
    continue;
  }

  if (!dry) fs.writeFileSync(file, result.code);
  filesChanged += 1;
  totalApplied += result.applied.length;
  console.log(
    `OK    ${relativePath}  ${result.applied.length} binding(s), ` +
      `${original.length} -> ${result.code.length} bytes`
  );
  if (report) {
    for (const entry of result.applied) {
      console.log(`        ${entry.name}@${entry.line} -> ${entry.newName}`);
    }
  }
}

console.log(
  `# ${dry ? 'would apply' : 'applied'} files=${filesChanged} bindings=${totalApplied} ` +
    `failed=${failed}`
);
if (failed > 0) process.exitCode = 1;
