#!/usr/bin/env node
/**
 * Does every renamed binding *of the right shape* carry the right kind of name?
 *
 * check_glossary.mjs checks the vocabulary (no compressed names, no numbering, no
 * banned disambiguators) and check_name_anchors.mjs checks selector-derived names.
 * Neither sees the mistake this file exists for: a binding that holds a DOM
 * element named `...Text`, a Map named without its key, a Set named like a list,
 * a boolean named like a count.  The plan calls this the shape oracle, and unlike
 * the vocabulary it is decidable from the AST:
 *
 *   element  the initialiser creates/queries an element (document.createElement,
 *            querySelector, getElementById, or a local factory that returns one)
 *            or the binding is used as a node (.append(/.setAttribute(/.classList)
 *                                                       ->  name contains Element
 *   Map      new Map(/new WeakMap(                            ->  *By<Key> or *Map
 *   Set      new Set(/new WeakSet(                            ->  *Set
 *   boolean  a boolean literal, !, a comparison, or a predicate call
 *                                                             ->  is/has/should/can*
 *
 * It is deliberately *sound before complete*: a binding whose shape cannot be
 * decided (a destructured property, a local factory call, `let x = null` filled in
 * later) is reported as unknown and never counted as an error.  A false error here
 * costs a reviewer a real name and teaches nothing.
 *
 * Evidence comes from the *pre-batch* copy: after the rename the old name is gone,
 * so the map has to be read against the tree the batch started from.
 *
 * Usage:
 *   node tools/check_name_kinds.mjs <map.json> --before <file> [--show N]
 */

import fs from 'node:fs';
import process from 'node:process';
import { createRequire } from 'node:module';
import { resolveBabelRoot } from './lib/babel-root.mjs';

const require = createRequire(import.meta.url);
const BABEL_ROOT = resolveBabelRoot();
const parser = require(BABEL_ROOT + '/@babel/parser');
const traverse = require(BABEL_ROOT + '/@babel/traverse').default;

const USAGE = 'usage: check_name_kinds.mjs <map.json> --before <file> [--show N]';

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(name + ' needs a value');
  return value;
}

/** Methods whose receiver is, with no further evidence, a DOM node. */
const ELEMENT_CALLS = new Set([
  'append', 'appendChild', 'prepend', 'insertBefore', 'removeChild', 'replaceChildren',
  'setAttribute', 'removeAttribute', 'getAttribute', 'hasAttribute', 'addEventListener',
  'removeEventListener', 'cloneNode', 'querySelector', 'querySelectorAll', 'closest',
  'getBoundingClientRect', 'focus', 'blur', 'remove', 'contains', 'matches',
]);
// 'style' is deliberately NOT here.  It is not DOM-exclusive: this codebase's
// component records are plain objects that carry `.style.scale`, so a lone
// `.style` read/write on an otherwise opaque binding is not evidence of a DOM
// node.  Counting it produced six false 'holds an element, name it as a node'
// errors on frontend/static/renderer/renderer.js in batch b12-renderer-c1,
// and a false error costs the reviewer a real name and teaches nothing
// (frontend/NAMING.md:204).  Sound-before-complete: a DOM node created by an
// opaque factory and touched only through `.style` is now left alone.
const ELEMENT_PROPS = new Set([
  'classList', 'dataset', 'innerHTML', 'disabled', 'checked', 'hidden',
  'children', 'firstChild', 'lastChild', 'parentElement', 'clientWidth', 'clientHeight',
  'offsetWidth', 'offsetHeight', 'scrollTop',
]);
const BOOLEAN_CALLS = new Set(['includes', 'startsWith', 'endsWith', 'test', 'isFinite', 'isInteger', 'isArray']);

/**
 * Words that name what a DOM node *is*.  A node may be called <purpose>Element or
 * after its tag role (Button, Dialog, Row, Container...), which is what the first
 * wave did (powerButton, choiceButton, metricEntry, statusElement, errorElement).
 * What no node may be called is after a scalar: `headingText` holding a <div>, or
 * `selectionValue` holding an <input>.  So the rule is about the tail word, and
 * 'Text' is deliberately absent: it is the word this oracle exists to reject.
 */
const DOM_NODE_TAILS = new Set([
  'Element', 'Node', 'Host', 'Container', 'Wrapper', 'Panel', 'Dialog', 'Modal', 'Overlay',
  'Menu', 'Bar', 'Header', 'Heading', 'Body', 'Footer', 'Actions', 'Section', 'Row', 'Cell',
  'Table', 'List', 'Card', 'Field', 'Label', 'Input', 'Select', 'Checkbox', 'Radio',
  'Toggle', 'Button', 'Icon', 'Image', 'Canvas', 'Link', 'Note', 'Status', 'Error', 'Message',
  'Hint', 'Badge', 'Tag', 'Preview', 'Slider', 'Spinner', 'Tooltip', 'Popover', 'Frame',
  'Viewport', 'Stage', 'Root', 'Shell', 'Area', 'Box', 'Grid', 'Stack', 'Column', 'Track',
  'Handle', 'Marker', 'Anchor', 'Control', 'Form', 'Layout', 'Legend', 'Caption', 'Title',
]);

/** The last camel-case word of a name: moveMetricUpButton -> Button. */
function tailWord(name) {
  const words = name.match(/[A-Z][a-z0-9]*/g) || [];
  return words.length > 0 ? words[words.length - 1] : name;
}
const COMPARISON_OPS = new Set(['===', '!==', '==', '!=', '<', '>', '<=', '>=', 'in', 'instanceof']);
const DOM_QUERY = new Set(['createElement', 'getElementById', 'querySelector', 'querySelectorAll']);
const MAP_CLASSES = new Set(['Map', 'WeakMap']);
const SET_CLASSES = new Set(['Set', 'WeakSet']);
const NON_ELEMENT_LITERALS = new Set(['StringLiteral', 'NumericLiteral', 'BooleanLiteral', 'ArrayExpression', 'ObjectExpression', 'TemplateLiteral']);
const NON_ELEMENT_CALLS = new Set(['parse', 'stringify', 'structuredClone', 'freeze']);

/** Local names that produce a DOM element, so a call to one is element evidence. */
function elementFactoryNames(ast, code) {
  const names = new Set();
  traverse(ast, {
    VariableDeclarator(p) {
      const init = p.node.init;
      if (!init || (init.type !== 'ArrowFunctionExpression' && init.type !== 'FunctionExpression')) return;
      if (!/document\.(createElement|querySelector|getElementById)\(/.test(code.slice(init.start, init.end))) return;
      if (p.node.id && p.node.id.type === 'Identifier') names.add(p.node.id.name);
    },
    FunctionDeclaration(p) {
      if (!p.node.id || !p.node.body) return;
      if (!/document\.(createElement|querySelector|getElementById)\(/.test(code.slice(p.node.body.start, p.node.body.end))) return;
      names.add(p.node.id.name);
    },
  });
  return names;
}

/** What kind of value is this initialiser, as far as the AST can tell? */
function describeInit(node, code, factories) {
  if (!node) return { kind: 'unknown', text: '' };
  const text = code.slice(node.start, node.end);
  if (node.type === 'BooleanLiteral') return { kind: 'boolean', text };
  if (node.type === 'UnaryExpression' && node.operator === '!') return { kind: 'boolean', text };
  if (node.type === 'BinaryExpression' && COMPARISON_OPS.has(node.operator)) return { kind: 'boolean', text };
  if (node.type === 'LogicalExpression') return { kind: 'unknown', text };
  if (node.type === 'NewExpression') {
    const name = node.callee && node.callee.type === 'Identifier' ? node.callee.name : '';
    if (MAP_CLASSES.has(name)) return { kind: 'map', text };
    if (SET_CLASSES.has(name)) return { kind: 'set', text };
    return { kind: 'unknown', text };
  }
  if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' || node.type === 'ClassExpression') {
    return { kind: 'function', text };
  }
  if (node.type === 'CallExpression') {
    const callee = node.callee;
    if (callee.type === 'Identifier') {
      if (factories.has(callee.name)) return { kind: 'element', text };
      return { kind: 'unknown', text };
    }
    if (callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier') {
      const prop = callee.property.name;
      const objectName = callee.object && callee.object.type === 'Identifier' ? callee.object.name : '';
      if (objectName === 'document' && DOM_QUERY.has(prop)) return { kind: 'element', text };
      if (factories.has(prop)) return { kind: 'element', text };
      if (BOOLEAN_CALLS.has(prop)) return { kind: 'boolean', text };
      if (NON_ELEMENT_CALLS.has(prop)) return { kind: 'nonElement', text };
      return { kind: 'unknown', text };
    }
    return { kind: 'unknown', text };
  }
  if (NON_ELEMENT_LITERALS.has(node.type)) return { kind: 'nonElement', text };
  return { kind: 'unknown', text };
}

function main() {
  const positional = process.argv.slice(2).filter((a, i, all) => {
    if (a.startsWith('--')) return false;
    return !(i > 0 && all[i - 1].startsWith('--'));
  });
  const mapPath = positional[0];
  const batchId = argValue('--batch', '');
  const beforeFlag = argValue('--before', '');
  const beforePath =
    beforeFlag ||
    (batchId
      ? '.restore/batch-snapshots/' + batchId + '/' + Object.keys(JSON.parse(fs.readFileSync(mapPath, 'utf8')))[0]
      : '');
  const show = Number(argValue('--show', '20')) || 20;
  if (!mapPath || !beforePath) {
    console.error(USAGE);
    process.exit(2);
  }

  const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  const files = Object.keys(map);
  if (files.length !== 1) {
    console.error('FAIL this map declares ' + files.length + ' files; a batch is one file');
    process.exit(2);
  }
  const rel = files[0];
  const renames = map[rel];
  const code = fs.readFileSync(beforePath, 'utf8');
  const ast = parser.parse(code, { sourceType: 'module', errorRecovery: false });
  const factories = elementFactoryNames(ast, code);

  /** name@line -> what the binding is, from the pre-batch tree. */
  const evidence = new Map();
  traverse(ast, {
    Scopable(p) {
      for (const [name, binding] of Object.entries(p.scope.bindings)) {
        const id = binding.identifier;
        if (!id || id.start === undefined || !id.loc) continue;
        const key = name + '@' + id.loc.start.line;
        if (evidence.has(key)) continue;
        const declarator =
          binding.path && binding.path.node && binding.path.node.type === 'VariableDeclarator' ? binding.path.node : null;
        const described = describeInit(declarator ? declarator.init : null, code, factories);
        const uses = [];
        let elementUse = false;
        for (const ref of binding.referencePaths || []) {
          const memberPath = ref.parentPath;
          const parent = memberPath && memberPath.node;
          if (!parent || parent.type !== 'MemberExpression' || parent.object !== ref.node || parent.computed) continue;
          const prop = parent.property && parent.property.type === 'Identifier' ? parent.property.name : '';
          if (!prop) continue;
          // A DOM *property* is evidence on a bare read; a DOM *method* is only
          // evidence when it is actually called.  Without that distinction a
          // plain action record carrying a boolean `remove` flag
          // (`change.remove && map.length > 1`, percentage-bar-model.js) reads as
          // a DOM node and the binding is forced into a name it does not deserve.
          // Same precedent as `.style` above: a false error costs a real name and
          // teaches nothing, and this oracle is declared sound-before-complete.
          const callPath = memberPath.parentPath;
          const isCalled =
            !!callPath && callPath.type === 'CallExpression' && callPath.node.callee === parent;
          if (ELEMENT_PROPS.has(prop) || (ELEMENT_CALLS.has(prop) && isCalled)) {
            elementUse = true;
            if (!uses.includes(prop)) uses.push(prop);
          }
        }
        evidence.set(key, { kind: described.kind, text: described.text, uses, elementUse });
      }
    },
  });

  const errors = [];
  let resolved = 0;
  let unresolved = 0;
  let undecided = 0;
  for (const [key, newName] of Object.entries(renames)) {
    const oldName = key.replace(/@.*$/, '');
    const flags = evidence.get(key);
    if (!flags) {
      unresolved += 1;
      continue;
    }
    resolved += 1;
    const isElementName = DOM_NODE_TAILS.has(tailWord(newName));
    const isMapName = /By[A-Z]/.test(newName) || /Map$/.test(newName);
    const isSetName = /Set$/.test(newName);
    const isBooleanName = /^(is|has|should|can)[A-Z]/.test(newName);
    const shape = flags.kind === 'unknown' ? 'unknown' : flags.kind;
    if (shape === 'unknown') undecided += 1;
    const elementish = flags.kind === 'element' || flags.elementUse;
    if (elementish && !isElementName) {
      errors.push('ERR ' + key + ': "' + oldName + '" -> "' + newName + '": holds an element (init ' + JSON.stringify(flags.text.slice(0, 60)) + ', uses ' + flags.uses.join('/') + ') but the name does not say Element');
    } else if (flags.kind === 'nonElement' && isElementName && !flags.elementUse) {
      errors.push('ERR ' + key + ': "' + oldName + '" -> "' + newName + '": says Element but the initialiser is ' + JSON.stringify(flags.text.slice(0, 60)));
    }
    if (flags.kind === 'map' && !isMapName) {
      errors.push('ERR ' + key + ': "' + oldName + '" -> "' + newName + '": built by ' + JSON.stringify(flags.text.slice(0, 60)) + ' but the name does not say Map or By<Key>');
    }
    if (flags.kind === 'set' && !isSetName) {
      errors.push('ERR ' + key + ': "' + oldName + '" -> "' + newName + '": built by ' + JSON.stringify(flags.text.slice(0, 60)) + ' but the name does not say Set');
    }
    if (flags.kind === 'boolean' && !isBooleanName) {
      errors.push('ERR ' + key + ': "' + oldName + '" -> "' + newName + '": boolean evidence (' + JSON.stringify(flags.text.slice(0, 60)) + ') but the name is not is/has/should/can');
    }
  }

  console.log(
    '# file=' + rel + ' entries=' + Object.keys(renames).length + ' resolved=' + resolved + ' unresolved=' + unresolved +
      ' shape-undecided=' + undecided + ' errors=' + errors.length,
  );
  for (const line of errors.slice(0, show)) console.log(line);
  if (errors.length > show) console.log('# ... ' + (errors.length - show) + ' more');
  if (errors.length > 0) {
    console.error('FAIL a name does not match the shape of the value it replaced');
    process.exitCode = 1;
  } else {
    console.log('PASS every decided value is named after its shape');
  }
}

main();