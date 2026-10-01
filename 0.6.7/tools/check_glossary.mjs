#!/usr/bin/env node
/**
 * Does a rename map speak the controlled vocabulary in tools/rename-glossary.json?
 *
 * The first wave named each binding on its own terms, and the same concept ended up
 * with several names: the one THREE namespace argument is called threeNamespace,
 * threeCore, threeToolkit and threeContext in four functions of one file, because
 * the applier requires each new name to be unique within its file and nothing else
 * constrained the choice.  So the vocabulary is deliberately *open* - the wave left
 * 3269 distinct names for 3404 bindings, of which only 112 appear in more than one
 * file, and a closed list would reject the entire corpus and teach nothing.
 *
 * This tool therefore enforces two different things:
 *
 *   HARD (exit status 1)
 *     - a compressed name (two characters or fewer)
 *     - a word+digits shape: the numbering is exactly what the wave is removing
 *     - a banned disambiguator - core, toolkit, ctx, ns, namespace, helper, util,
 *       manager, temp, obj, ... - which names the problem rather than the value
 *     - the same target name used for two different bindings in one file
 *     - a target name the file already binds or references for something else
 *
 *   SOFT (reported, exit status unchanged)
 *     - a name no canonical covers, printed with the canonicals its words suggest
 *     - a name that shadows a browser global
 *     - one canonical used under several owner prefixes in the same file, which is
 *       the shape that produced threeNamespace/threeCore/threeToolkit/threeContext
 *
 * What it cannot check is that the chosen concept fits the *value* - an Array for a
 * -s name, new Map() for *By<Key>, a numeric initialiser for *Ms.  Those T1-T8
 * evidence rules need the declaration expression and live in the brief and review.
 *
 * Usage:
 *   node tools/check_glossary.mjs <map.json> [--glossary <file>] [--exceptions <file>] [--show N] [--applied]
 *
 * --applied is for auditing a map that has already been applied (the whole first
 * wave, and any batch you re-check afterwards).  The collision test asks whether the
 * file already uses the target name for something else, and after an apply it always
 * does - that is the rename.  So on an applied map the test is not merely noisy, it
 * is meaningless, and passing --applied drops it while keeping every other rule.
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

/** Names a module can see without declaring them.  Shadowing one is legal, but it is never what a rename meant. */
const BROWSER_GLOBALS = new Set([
  'name', 'status', 'length', 'origin', 'event', 'top', 'parent', 'self', 'location', 'history',
  'screen', 'frames', 'closed', 'external', 'menubar', 'toolbar', 'window', 'document', 'console',
  'navigator', 'localStorage', 'sessionStorage', 'performance', 'crypto', 'fetch', 'Response',
  'Request', 'Headers', 'URL', 'Blob', 'File', 'Image', 'Audio', 'Option', 'Text', 'Element',
  'Node', 'Event', 'CustomEvent', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Symbol', 'Proxy',
  'Reflect', 'JSON', 'Math', 'Date', 'Object', 'Array', 'String', 'Number', 'Boolean', 'RegExp',
  'Error', 'TypeError', 'RangeError', 'parseInt', 'parseFloat', 'isNaN', 'setTimeout', 'setInterval',
  'requestAnimationFrame', 'cancelAnimationFrame', 'queueMicrotask', 'structuredClone',
  'AbortController', 'AbortSignal', 'FormData', 'FileReader', 'TextEncoder', 'TextDecoder', 'Intl', 'BigInt',
]);

const upperFirst = (s) => (s.length === 0 ? s : s[0].toUpperCase() + s.slice(1));
const lowerFirst = (s) => (s.length === 0 ? s : s[0].toLowerCase() + s.slice(1));
function words(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

const UNIT_SUFFIXES = ['Ms', 'Px', 'Rad', 'Deg', 'Ratio', 'Count', 'Index'];
const PIPELINE_PREFIXES = ['raw', 'normalized', 'parsed', 'serialized', 'cached', 'previous', 'next', 'pending'];

function main() {
  const positional = process.argv.slice(2).filter((a, i, all) => {
    if (a.startsWith('--')) return false;
    return !(i > 0 && all[i - 1].startsWith('--'));
  });
  const mapPath = positional[0];
  if (!mapPath) {
    console.error('usage: check_glossary.mjs <map.json> [--glossary <file>] [--exceptions <file>] [--show N]');
    process.exit(2);
  }
  const glossaryPath = argValue('--glossary', 'tools/rename-glossary.json');
  const exceptionsPath = argValue('--exceptions', 'tools/rename-maps/exceptions.json');
  const show = Number(argValue('--show', '8')) || 8;
  const applied = process.argv.includes('--applied');

  const glossary = JSON.parse(fs.readFileSync(glossaryPath, 'utf8'));
  const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  const files = Object.keys(map);
  if (files.length !== 1) {
    console.error('FAIL this map declares ' + files.length + ' files; a batch is one file (verify_map_coverage.mjs enforces the same)');
    process.exit(2);
  }
  const rel = files[0];
  const renames = map[rel];

  const canonicals = new Map();
  for (const entry of glossary.entries) canonicals.set(entry.canonical, entry);
  const numericMeaning = new Set(glossary.numericMeaning || []);
  const banned = new Set(glossary.bannedDisambiguators || []);
  for (const token of Object.keys(glossary.aliasTokens || {})) banned.add(token);
  banned.add('namespace');

  const exceptions = fs.existsSync(exceptionsPath)
    ? JSON.parse(fs.readFileSync(exceptionsPath, 'utf8')).entries || []
    : [];
  const exceptionFor = (file, name) => exceptions.find((e) => e.name === name && (e.file === file || e.file === '*'));

  const oldNames = new Set();
  for (const key of Object.keys(renames)) oldNames.add(key.replace(/@.*$/, ''));

  const abs = path.join(ROOT, rel);
  const identifiers = new Set();
  if (!applied) {
    if (!fs.existsSync(abs)) {
      console.error('FAIL map names a file that does not exist: ' + rel);
      process.exit(1);
    }
    const ast = parser.parse(fs.readFileSync(abs, 'utf8'), { sourceType: 'module', errorRecovery: false });
    traverse(ast, {
      Identifier(p) {
        // Only names that *denote* something.  A property key, a member name, the
        // imported side of an import specifier and a label are all Identifier nodes
        // that resolve to nothing, so counting them as collisions rejects the most
        // natural rename there is: a destructured parameter taking its own key
        // (`{ component: arg1 }` -> `component: component`).  Shorthand properties
        // keep their single node as a real reference, and `document.createElement`
        // keeps `document`, which is the collision this rule exists to catch.
        if (isDenotingIdentifier(p.node, p.parent)) identifiers.add(p.node.name);
      },
    });
  }

  /**
 * True when this Identifier node denotes a binding or a reference, false when it is
 * pure syntax (property key, member name, imported/exported alias, label).
 */
function isDenotingIdentifier(node, parent) {
  if (!parent) return true;
  if ((parent.type === 'MemberExpression' || parent.type === 'OptionalMemberExpression') && parent.property === node && !parent.computed) return false;
  if ((parent.type === 'ObjectProperty' || parent.type === 'Property') && parent.key === node && !parent.computed && !parent.shorthand) return false;
  if ((parent.type === 'ObjectMethod' || parent.type === 'ClassMethod' || parent.type === 'ClassProperty' || parent.type === 'ClassPrivateProperty') && parent.key === node && !parent.computed) return false;
  if (parent.type === 'ImportSpecifier' && parent.imported === node && parent.local !== node) return false;
  if (parent.type === 'ExportSpecifier' && parent.exported === node && parent.local !== node) return false;
  if ((parent.type === 'LabeledStatement' || parent.type === 'BreakStatement' || parent.type === 'ContinueStatement') && parent.label === node) return false;
  return true;
}
/** Try every sanctioned shape; null when nothing fits. */
  function classify(name) {
    if (canonicals.has(name)) return { via: 'canonical', concept: name };
    for (const suffix of UNIT_SUFFIXES) {
      if (!name.endsWith(suffix)) continue;
      const base = name.slice(0, -suffix.length);
      if (canonicals.has(base) && (canonicals.get(base).allowedTransforms || []).includes('T6')) {
        return { via: 'T6:' + suffix, concept: base };
      }
    }
    for (const prefix of PIPELINE_PREFIXES) {
      if (!name.startsWith(prefix) || name.length === prefix.length) continue;
      const base = lowerFirst(name.slice(prefix.length));
      if (canonicals.has(base) && (canonicals.get(base).allowedTransforms || []).includes('T5')) {
        return { via: 'T5:' + prefix, concept: base };
      }
    }
    for (const prefix of ['on', 'handle']) {
      if (!name.startsWith(prefix) || name.length === prefix.length) continue;
      const base = lowerFirst(name.slice(prefix.length));
      if (canonicals.has(base) && (canonicals.get(base).allowedTransforms || []).includes('T8')) {
        return { via: 'T8:' + prefix, concept: base };
      }
    }
    if (name.endsWith('Set')) {
      const base = name.slice(0, -'Set'.length);
      const singular = base.endsWith('s') ? base.slice(0, -1) : base;
      const concept = canonicals.has(base) ? base : canonicals.has(singular) ? singular : null;
      if (concept && (canonicals.get(concept).allowedTransforms || []).includes('T3')) return { via: 'T3', concept };
    }
    const byMatch = /^([A-Za-z0-9]+?)By([A-Za-z0-9]+)$/.exec(name);
    if (byMatch) {
      const base = byMatch[1];
      const key = byMatch[2];
      const singular = base.endsWith('s') ? base.slice(0, -1) : base;
      const concept = canonicals.has(base) ? base : canonicals.has(singular) ? singular : null;
      const keyOk = canonicals.has(key) || canonicals.has(lowerFirst(key));
      if (concept && keyOk && (canonicals.get(concept).allowedTransforms || []).includes('T2')) {
        return { via: 'T2:By' + key, concept };
      }
    }
    if (name.endsWith('s')) {
      const base = name.slice(0, -1);
      if (canonicals.has(base) && (canonicals.get(base).allowedTransforms || []).includes('T1')) {
        return { via: 'T1', concept: base };
      }
    }
    return null;
  }

  /** T7-shaped reading: the tail is a canonical and the head is an owner word. */
  function ownerReading(name) {
    let best = null;
    for (const concept of canonicals.keys()) {
      const tail = upperFirst(concept);
      if (concept.length >= name.length || !name.endsWith(tail)) continue;
      const owner = name.slice(0, name.length - tail.length);
      if (owner.length === 0) continue;
      if (best === null || concept.length > best.concept.length) best = { concept, owner };
    }
    return best;
  }

  function suggestionsFor(name) {
    const out = [];
    const tail = ownerReading(name);
    if (tail) out.push(tail.concept + ' (via T7 owner "' + tail.owner + '")');
    const parts = words(name);
    for (const [canonical] of canonicals) {
      if (out.length >= 3) break;
      const cw = words(canonical);
      if (cw.length > 0 && cw.every((w) => parts.includes(w)) && canonical !== name) out.push(canonical);
    }
    return out;
  }

  const errors = [];
  const warnings = [];
  const byNewName = new Map();
  const byConcept = new Map();
  let sanctioned = 0;
  let seenByGlossary = 0;
  let excepted = 0;

  for (const [key, newName] of Object.entries(renames)) {
    const oldName = key.replace(/@.*$/, '');
    const exception = exceptionFor(rel, newName);
    const where = key + ': "' + oldName + '" -> "' + newName + '"';
    if (typeof newName !== 'string' || newName.length === 0) {
      errors.push(where + ': empty target name');
      continue;
    }
    if (newName === oldName) {
      errors.push(where + ': maps a name to itself');
      continue;
    }
    if (!byNewName.has(newName)) byNewName.set(newName, []);
    byNewName.get(newName).push(key);

    if (newName.length <= 2 && !(exception && exception.kind === 'frozen-short-export')) {
      errors.push(where + ': two characters or fewer is a compressed name, not a semantic one');
      continue;
    }
    const numericShape = /^[a-z][A-Za-z]*[0-9]+$/.test(newName);
    if (numericShape && !numericMeaning.has(newName) && !canonicals.has(newName) && !(exception && exception.kind === 'allowed-numeric')) {
      errors.push(where + ': word+digits shape - the numbering is the thing being removed (plan section 3, D5)');
      continue;
    }

    const hit = classify(newName);
    const badWords = words(newName).filter((w) => banned.has(w));
    // A name that is a ratified canonical is sanctioned even if one of its words is
    // on the banned list (serviceData is the domain's own name for it); the ban is
    // about inventing a *new* disambiguator.
    if (!hit && badWords.length > 0) {
      errors.push(where + ': "' + badWords.join('/') + '" is a banned disambiguator - name the value, not the problem (T7 may prefix an owner canonical instead)');
      continue;
    }
    if (hit) {
      sanctioned += 1;
      seenByGlossary += 1;
    } else if (exception) {
      excepted += 1;
      warnings.push(where + ': not in the glossary, allowed by exception (' + exception.kind + ', approved by ' + exception.approvedBy + ')');
    } else {
      const suggestions = suggestionsFor(newName);
      warnings.push(
        where + ': no canonical covers this name' + (suggestions.length > 0 ? '; consider ' + suggestions.join(' | ') : ''),
      );
    }

    if (!applied && identifiers.has(newName) && !oldNames.has(newName)) {
      errors.push(where + ': the file already binds or references "' + newName + '" for something else');
      continue;
    }
    if (BROWSER_GLOBALS.has(newName)) warnings.push(where + ': shadows the global "' + newName + '"');

    const reading = ownerReading(newName);
    if (reading) {
      if (!byConcept.has(reading.concept)) byConcept.set(reading.concept, []);
      byConcept.get(reading.concept).push(newName);
    }
  }

  for (const [newName, keys] of byNewName) {
    if (keys.length > 1) {
      errors.push('name "' + newName + '" is used by ' + keys.length + ' entries of one file (' + keys.slice(0, 4).join(', ') + ')');
    }
  }

  // The shape that started this: one canonical, several owner prefixes, one file.
  for (const [concept, names] of byConcept) {
    const distinct = [...new Set(names)];
    if (distinct.length > 1 && !distinct.includes(concept)) {
      warnings.push('one canonical under ' + distinct.length + ' names in this file: ' + distinct.join(', ') + ' - the applier forces uniqueness, but T7 is the only sanctioned way to disambiguate, and only when the canonical is genuinely taken');
    }
  }

  console.log(
    '# file=' + rel + (applied ? ' (applied)' : '') + ' entries=' + Object.keys(renames).length + ' sanctioned=' + sanctioned +
      ' covered=' + seenByGlossary + ' exceptions=' + excepted +
      ' errors=' + errors.length + ' warnings=' + warnings.length,
  );
  for (const line of errors.slice(0, show)) console.log('ERR  ' + line);
  if (errors.length > show) console.log('ERR  ... ' + (errors.length - show) + ' more');
  for (const line of warnings.slice(0, show)) console.log('WARN ' + line);
  if (warnings.length > show) console.log('WARN ... ' + (warnings.length - show) + ' more');
  if (errors.length > 0) {
    console.log('FAIL the map does not speak the controlled vocabulary');
    process.exitCode = 1;
  } else {
    console.log('PASS no compressed, numbered or banned-disambiguated names');
  }
}

main();
