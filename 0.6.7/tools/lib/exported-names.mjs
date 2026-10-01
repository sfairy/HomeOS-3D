/**
 * The one definition of "this module exports the local binding X".
 *
 * Four tools need this set, and before this module they each computed it
 * slightly differently:
 *
 *   apply_frontend_renames.mjs   the complete version (export default, nested
 *                                destructuring patterns, re-export skip)
 *   plan_frontend_rename_ranges  only `export const X` and `export { X }`
 *   report_frontend_names.mjs    `export default` only when the declaration has
 *                                an id, so `export default handler` was missed
 *   brief_frontend_rename_range  same as the planner
 *
 * The disagreement is not cosmetic.  An exported binding is frozen public API,
 * and apply_frontend_renames.mjs refuses to rename one; a tool that under-counts
 * the set will offer a name in a brief that the renamer must then reject, while
 * one that over-counts hides a renameable name.  The frozen count printed by
 * report_frontend_names.mjs is quoted in frontend/NAMING.md, RESTORE-REPORT-0.6.6.md
 * and every batch sidecar, so the number has to come from one implementation.
 *
 * Semantics: the *local* name is what is frozen.  `export { a as b }` freezes
 * `a`, not `b` — `b` is a public name, and that set is a different question
 * (tools/verify_frontend_public_api.mjs).  A re-export such as
 * `export { x } from './m.js'` names no local binding at all, so it freezes
 * nothing: renaming the module's own `x` cannot break it.
 */

/** Collect every binding inside a destructuring pattern (possibly nested). */
function collectPattern(pattern, into) {
  if (!pattern) return;
  switch (pattern.type) {
    case 'Identifier':
      into.add(pattern.name);
      return;
    case 'ObjectPattern':
      for (const property of pattern.properties) {
        if (property.type === 'RestElement') collectPattern(property.argument, into);
        else collectPattern(property.value ?? property.key, into);
      }
      return;
    case 'ArrayPattern':
      for (const element of pattern.elements) collectPattern(element, into);
      return;
    case 'AssignmentPattern':
      collectPattern(pattern.left, into);
      return;
    case 'RestElement':
      collectPattern(pattern.argument, into);
      return;
    default:
  }
}

/**
 * The local names an ES module hands out.  `ast` is a @babel/parser Program
 * node's parent (the File node) or the Program itself.
 */
export function exportedLocalNames(ast) {
  const exported = new Set();
  const body = ast.program ? ast.program.body : ast.body;
  for (const statement of body) {
    if (statement.type === 'ExportDefaultDeclaration') {
      const declaration = statement.declaration;
      if (!declaration) continue;
      // `export default handler` freezes the local `handler`; the other two
      // forms declare their own name right there.
      if (declaration.type === 'Identifier') exported.add(declaration.name);
      else if ((declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration') && declaration.id) {
        exported.add(declaration.id.name);
      }
      continue;
    }
    if (statement.type !== 'ExportNamedDeclaration') continue;
    // `export { x } from './m.js'` has no local binding in this module.
    if (statement.source) continue;
    const declaration = statement.declaration;
    if (declaration) {
      if (declaration.declarations) {
        for (const declarator of declaration.declarations) collectPattern(declarator.id, exported);
      } else if (declaration.id) {
        exported.add(declaration.id.name);
      }
    }
    for (const specifier of statement.specifiers || []) {
      if (specifier.type === 'ExportSpecifier') exported.add(specifier.local.name);
    }
  }
  return exported;
}

export default exportedLocalNames;
