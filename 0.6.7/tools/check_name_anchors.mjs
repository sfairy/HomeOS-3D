#!/usr/bin/env node
/**
 * The DOM selector oracle: when a binding is initialised from a selector, its name
 * should say which selector.
 *
 * This is the one naming check that is *evidence* rather than convention.  The
 * declaration says
 *
 *     const Dv = document.querySelector('#panel-frame-glow-color');
 *
 * and the id in that string is the strongest statement available about what the
 * binding holds, so a name that does not contain panelFrameGlowColor is provably
 * wrong - no reviewer, no runtime, no taste required.  home.js alone has dozens of
 * querySelector('#...') bindings, and the first wave named them without reading the
 * id, because nothing forced it to.
 *
 * Resolution is by *name*, not by the line in the map key.  The wave applied maps
 * and then ran Prettier, which re-wraps long lines, so a stored @line can be stale by
 * the time anyone audits it; a name it just spent a batch installing is exact.  So:
 *
 *   - if the target name is declared somewhere in the file, that declarator is the
 *     one we inspect (applied maps, and the audit of the first wave)
 *   - otherwise the old name is looked up on the map's line (a fresh, unapplied map)
 *
 * What counts as an anchor: a string literal argument to getElementById, or to a call
 * whose callee ends in querySelector, that starts with '#'.  A class selector has no
 * single camel spelling ('.i3d-meter-unit' could be meterUnit or I3dMeterUnit), and a
 * data attribute is a judgement call, so both are counted as unanchored rather than
 * guessed at.  A name may carry a prefix or a suffix around the anchor - popupElement
 * and panelFrameGlowColorInput both contain theirs - the rule is containment.
 *
 * Usage:
 *   node tools/check_name_anchors.mjs <map.json> [--show N] [--quiet]
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { resolveBabelRoot } from './lib/babel-root.mjs';

const require = createRequire(import.meta.url);
const BABEL_ROOT = resolveBabelRoot();
const parser = require(BABEL_ROOT + '/@babel/parser');
const traverse = require(BABEL_ROOT + '/@babel/traverse').default;

const ROOT = process.cwd();

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(name + ' needs a value');
  return value;
}

/** 'panel-frame-glow-color' -> 'panelFrameGlowColor'; null when the string is not a plain id. */
function camelId(id) {
  if (typeof id !== 'string' || id.length === 0 || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) return null;
  const parts = id.split(/[-_]+/).filter(Boolean);
  if (parts.length === 0) return null;
  return parts[0].toLowerCase() + parts.slice(1).map((p) => p[0].toUpperCase() + p.slice(1)).join('');
}

/**
 * getElementById('climate-mode-icon') carries a bare id; querySelector needs the '#'
 * to be an id at all.  Anything else - a class, a data attribute, a tag - is not
 * anchored, because there is no unambiguous camel spelling to demand.
 */
function camelAnchor(selector, callee) {
  const trimmed = String(selector).trim();
  if (callee === 'getElementById') return camelId(trimmed.replace(/^#/, ''));
  if (!trimmed.startsWith('#')) return null;
  return camelId(trimmed.slice(1));
}

function staticSelector(node) {
  if (!node) return null;
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis.map((q) => q.value.cooked).join('');
  }
  return null;
}

/** First selector call inside an expression, or null. */
function findAnchor(node) {
  if (node === null || typeof node !== 'object') return null;
  if (node.type === 'CallExpression') {
    const callee = node.callee;
    const name =
      callee && callee.type === 'Identifier'
        ? callee.name
        : callee && callee.type === 'MemberExpression' && callee.property.type === 'Identifier'
          ? callee.property.name
          : null;
    if (name !== null && (name === 'getElementById' || name === 'querySelector') && node.arguments.length >= 1) {
      const selector = staticSelector(node.arguments[0]);
      if (selector !== null) return { anchor: camelAnchor(selector, name), selector, callee: name };
    }
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        const found = findAnchor(child);
        if (found) return found;
      }
    } else if (value !== null && typeof value === 'object' && typeof value.type === 'string') {
      const found = findAnchor(value);
      if (found) return found;
    }
  }
  return null;
}

/** declarator/param/function names -> the initialiser expression that might carry a selector. */
function bindingIndex(ast) {
  const byName = new Map();
  const byLine = new Map();
  const add = (name, node, init) => {
    const record = { name, init, line: node.loc.start.line };
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(record);
    if (!byLine.has(node.loc.start.line)) byLine.set(node.loc.start.line, []);
    byLine.get(node.loc.start.line).push(record);
  };
  traverse(ast, {
    VariableDeclarator(p) {
      const id = p.node.id;
      if (id.type === 'Identifier') add(id.name, id, p.node.init);
    },
    Function(p) {
      for (const param of p.node.params) {
        if (param.type === 'Identifier') add(param.name, param, null);
      }
      if (p.node.id) add(p.node.id.name, p.node.id, null);
    },
    ClassDeclaration(p) {
      if (p.node.id) add(p.node.id.name, p.node.id, null);
    },
    ImportSpecifier(p) {
      add(p.node.local.name, p.node.local, null);
    },
  });
  return { byName, byLine };
}

function main() {
  const positional = process.argv.slice(2).filter((a, i, all) => {
    if (a.startsWith('--')) return false;
    return !(i > 0 && all[i - 1].startsWith('--'));
  });
  const mapPath = positional[0];
  if (!mapPath) {
    console.error('usage: check_name_anchors.mjs <map.json> [--show N] [--quiet]');
    process.exit(2);
  }
  const show = Number(argValue('--show', '10')) || 10;
  const quiet = process.argv.includes('--quiet');

  const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  const files = Object.keys(map);
  if (files.length !== 1) {
    console.error('FAIL this map declares ' + files.length + ' files; a batch is one file');
    process.exit(2);
  }
  const rel = files[0];
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    console.error('FAIL map names a file that does not exist: ' + rel);
    process.exit(1);
  }

  const ast = parser.parse(fs.readFileSync(abs, 'utf8'), { sourceType: 'module', errorRecovery: false });
  const { byName, byLine } = bindingIndex(ast);

  const errors = [];
  const notes = [];
  let anchored = 0;
  let satisfied = 0;
  let unanchoredSelectors = 0;
  let resolved = 0;
  let unresolved = 0;

  for (const [key, newName] of Object.entries(map[rel])) {
    const match = /^(.+)@([0-9]+)(?::([0-9]+))?$/.exec(key);
    const oldName = match ? match[1] : key;
    const line = match ? Number(match[2]) : null;

    let own = byName.get(newName) || null;
    if (own === null && line !== null) {
      const onLine = byLine.get(line) || [];
      own = onLine.filter((c) => c.name === oldName);
      if (own.length === 0) own = null;
    }
    if (own === null) {
      unresolved += 1;
      continue;
    }
    resolved += 1;
    const found = findAnchor(own[0].init);
    if (found === null) continue;
    if (found.anchor === null) {
      unanchoredSelectors += 1;
      notes.push(
        key + ': "' + newName + '": ' + found.callee + '(' + JSON.stringify(found.selector) +
          ') has no single camel spelling, left unanchored',
      );
      continue;
    }
    anchored += 1;
    if (newName.includes(found.anchor)) {
      satisfied += 1;
    } else {
      errors.push(
        key + ': "' + (oldName === newName ? '' : oldName + '" -> "') + newName + '": ' + found.callee + '(' +
          JSON.stringify(found.selector) + ') says this binding is "' + found.anchor + '", which the name does not contain',
      );
    }
  }

  console.log(
    '# file=' + rel + ' entries=' + Object.keys(map[rel]).length + ' resolved=' + resolved +
      ' unresolved=' + unresolved + ' anchored=' + anchored + ' satisfied=' + satisfied +
      ' unsatisfied=' + errors.length + ' unanchored-selectors=' + unanchoredSelectors,
  );
  if (!quiet) {
    for (const line of errors.slice(0, show)) console.log('ERR  ' + line);
    if (errors.length > show) console.log('ERR  ... ' + (errors.length - show) + ' more');
    for (const line of notes.slice(0, Math.min(5, show))) console.log('note ' + line);
    if (notes.length > 5) console.log('note ... ' + (notes.length - 5) + ' more');
  }
  if (errors.length > 0) {
    console.log('FAIL a selector says what these bindings are, and the names disagree');
    process.exitCode = 1;
  } else {
    console.log('PASS every selector-derived name names its selector');
  }
}

main();
