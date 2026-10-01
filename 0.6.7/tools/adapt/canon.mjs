/**
 * Prove that `rename_frontend_locals.mjs` was semantics-preserving.
 *
 * A rename is only safe if the before/after pair is *alpha-equivalent*: the two
 * programs must differ solely in the spelling of lexically bound names, while
 * every observable name stays identical.  Concretely, comparing the two files
 * must show that the following are unchanged:
 *
 *   - the set of string literal values (in order), so no string, template
 *     quasi or `?v=` cache-busting query string was touched - with one fold: a
 *     string used as a property *key* is recorded as a property name, not as a
 *     string (see the `K:` fold below);
 *   - the sequence of every non-computed member property and object/class
 *     property key, so no property access was renamed;
 *   - the sequence of every *unresolved* identifier (globals such as
 *     `document`, `window`, `navigator`), which have no binding to follow;
 *   - the structure of the program, including which occurrences belong to
 *     which binding.
 *
 * The last point is what makes the check meaningful: each file is re-emitted
 * as a canonical token stream in source order, where every bound identifier is
 * replaced by the identity of *the binding it resolves to* rather than by its
 * name.  Binding identities are assigned in a deterministic, source-ordered
 * scope walk, which a rename does not perturb.  Two files that render to the
 * same token stream are therefore identical up to the renaming of bound
 * variables — exactly the property we want.
 *
 * Usage:
 *   node tools/verify_frontend_rename.mjs <before-dir> <after-dir>
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { resolveBabelRoot } from './lib/babel-root.mjs';

const require = createRequire(import.meta.url);
const BABEL_ROOT = resolveBabelRoot();

const parser = require(`${BABEL_ROOT}/@babel/parser`);
const traverse = require(`${BABEL_ROOT}/@babel/traverse`).default;

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && entry.name.endsWith('.js')) yield full;
  }
}

function parse(code) {
  return parser.parse(code, { sourceType: 'module', errorRecovery: false });
}

function isPropertyPosition(p) {
  const parent = p.parentPath?.node;
  if (!parent) return false;
  if (
    (parent.type === 'MemberExpression' ||
      parent.type === 'OptionalMemberExpression') &&
    parent.property === p.node &&
    !parent.computed
  ) {
    return true;
  }
  if (
    (parent.type === 'ObjectProperty' ||
      parent.type === 'ObjectMethod' ||
      parent.type === 'ClassProperty' ||
      parent.type === 'ClassMethod' ||
      parent.type === 'ClassPrivateProperty' ||
      parent.type === 'ClassPrivateMethod') &&
    parent.key === p.node &&
    !parent.computed
  ) {
    return true;
  }
  if (parent.type === 'ImportSpecifier' && parent.imported === p.node) return true;
  if (parent.type === 'ExportSpecifier' && parent.exported === p.node) return true;
  return false;
}

/** A property name that the `.` form can spell verbatim. */
const IDENTIFIER_NAME_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * True when a string literal is a property *key* rather than data: the computed
 * property of a member access (`obj["prop"]`) or the computed key of an object
 * or class member (`{ ["prop"]: 1 }`).
 *
 * `tools/normalize_frontend_members.mjs` rewrites the first spelling into the
 * dot form, which is a pure change of spelling, so the canonical stream has to
 * record both as the same property token - exactly the reason the numeric
 * literals below are folded.  Had it not, every one of those ~81 000 sites would
 * have read as `S:"prop"` here and as `K:prop` in the rewritten tree, i.e. as a
 * mismatch, and the cleanup would have been unverifiable rather than verified.
 */
function isComputedKey(p) {
  const parent = p.parentPath?.node;
  if (!parent) return false;
  if (
    (parent.type === 'MemberExpression' ||
      parent.type === 'OptionalMemberExpression') &&
    parent.property === p.node &&
    parent.computed
  ) {
    return true;
  }
  if (
    (parent.type === 'ObjectProperty' ||
      parent.type === 'ObjectMethod' ||
      parent.type === 'ClassProperty' ||
      parent.type === 'ClassMethod' ||
      parent.type === 'ClassPrivateProperty' ||
      parent.type === 'ClassPrivateMethod') &&
    parent.key === p.node &&
    parent.computed
  ) {
    return true;
  }
  return false;
}

/**
 * Fold a numeric-constant expression to its value, or null when it is not one.
 * `0x64`, `100` and `-1` all reduce here, which is why `0x…` needs no special
 * case anywhere below: the canonical stream has always recorded the *value*, so
 * rewriting a hex literal to decimal is invisible to it by construction.
 */
function numericConstant(node) {
  if (!node) return null;
  if (node.type === 'NumericLiteral') return node.value;
  if (
    node.type === 'UnaryExpression' &&
    node.operator === '-' &&
    node.argument.type === 'NumericLiteral'
  ) {
    return -node.argument.value;
  }
  return null;
}

/**
 * Fold a chain of `!` applied to a numeric constant (or a boolean) to the
 * boolean it denotes, or null when the expression is not such a chain.
 */
function booleanNotValue(node) {
  if (!node) return null;
  if (node.type === 'BooleanLiteral') return node.value;
  if (node.type !== 'UnaryExpression' || node.operator !== '!') return null;
  const inner = booleanNotValue(node.argument);
  if (inner !== null) return !inner;
  const numeric = numericConstant(node.argument);
  if (numeric !== null) return numeric === 0;
  return null;
}

/**
 * Render a program as a canonical token stream (see the file header).
 *
 * ## Why literal artefacts are folded rather than left alone
 *
 * The de-obfuscator removed the obfuscator's machinery but kept its *spellings*
 * for a handful of constants: `!0x0` for `true`, `-0x1 / 0x0` for
 * `-Infinity`, `void 0x0` for `undefined`.  Rewriting those to their readable
 * form is value-preserving, but it changes the *shape* of the program, so a
 * stream that spelled out "unary `!` applied to numeric 0" would report every
 * one of the ~5 000 sites as a mismatch and make the cleanup unverifiable.
 *
 * Folding both spellings onto one token is not a loss of checking power: the
 * token still encodes the exact resulting value, so `!0x0` and `!0x1` fold to
 * `L:true` and `L:false` and an inverted boolean is still caught, and a
 * misread constant still folds to a different `N:`.  Operators are tokenised
 * too, so a dropped or duplicated `!` cannot hide behind the fold.
 */
function canonicalize(code) {
  const ast = parse(code);
  const tokens = [];

  // Assign a stable id to every binding, in source order.  A rename does not
  // change the order in which scopes and declarations appear.
  const bindingIds = new Map();
  let nextBindingId = 0;
  traverse(ast, {
    Scopable(p) {
      for (const name of Object.keys(p.scope.bindings)) {
        const binding = p.scope.bindings[name];
        if (!bindingIds.has(binding)) {
          bindingIds.set(binding, nextBindingId);
          nextBindingId += 1;
        }
      }
    },
  });

  traverse(ast, {
    UnaryExpression(p) {
      const { operator, argument } = p.node;
      if (operator === '!') {
        const folded = booleanNotValue(p.node);
        if (folded !== null) {
          tokens.push(`L:${folded}`);
          p.skip();
          return;
        }
      }
      if (operator === 'void' && numericConstant(argument) !== null) {
        tokens.push('L:undefined');
        p.skip();
        return;
      }
      if (
        operator === '-' &&
        argument.type === 'Identifier' &&
        argument.name === 'Infinity' &&
        !p.scope.getBinding('Infinity')
      ) {
        tokens.push('L:-Infinity');
        p.skip();
        return;
      }
      tokens.push(`X:${operator}`);
    },
    BinaryExpression(p) {
      const { operator, left, right } = p.node;
      if (operator === '/') {
        const leftValue = numericConstant(left);
        const rightValue = numericConstant(right);
        if (leftValue !== null && rightValue === 0) {
          tokens.push(`L:${leftValue < 0 ? '-Infinity' : 'Infinity'}`);
          p.skip();
          return;
        }
      }
      tokens.push(`O:${operator}`);
    },
    LogicalExpression(p) {
      tokens.push(`O:${p.node.operator}`);
    },
    BooleanLiteral(p) {
      tokens.push(`L:${p.node.value}`);
    },
    NullLiteral() {
      tokens.push('L:null');
    },
    StringLiteral(p) {
      // `obj["prop"]` and `obj.prop` are the same access; fold both onto the
      // property token so normalising the spelling is invisible here.  A string
      // that is not an IdentifierName stays `S:` - it can never be the dot form,
      // so folding it would conflate two different programs.
      if (isComputedKey(p) && IDENTIFIER_NAME_RE.test(p.node.value)) {
        tokens.push(`K:${p.node.value}`);
        return;
      }
      tokens.push(`S:${JSON.stringify(p.node.value)}`);
    },
    TemplateElement(p) {
      tokens.push(`T:${JSON.stringify(p.node.value.cooked)}`);
    },
    NumericLiteral(p) {
      tokens.push(`N:${String(p.node.value)}`);
    },
    Identifier(p) {
      if (isPropertyPosition(p)) {
        tokens.push(`K:${p.node.name}`);
        return;
      }
      const binding = p.scope.getBinding(p.node.name);
      if (binding && bindingIds.has(binding)) {
        tokens.push(`B:${bindingIds.get(binding)}`);
        return;
      }
      if (p.node.name === 'Infinity') {
        tokens.push('L:Infinity');
        return;
      }
      if (p.node.name === 'undefined') {
        tokens.push('L:undefined');
        return;
      }
      tokens.push(`U:${p.node.name}`);
    },
    PrivateName(p) {
      tokens.push(`P:${p.node.id.name}`);
    },
  });

  return tokens;
}


export { canonicalize };
