// Merge the b23 range maps of a giant file into one file map and resolve
// cross-band duplicate target names by owner-qualifying with the nearest named
// enclosing function (its own new name when the map renames it, otherwise its
// current name when that is already semantic).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { resolveBabelRoot } from './lib/babel-root.mjs';

const require = createRequire(import.meta.url);
const BABEL_ROOT = resolveBabelRoot();
const parser = require(BABEL_ROOT + '/@babel/parser');

const [rel, outPath, ...parts] = process.argv.slice(2);
if (!rel || !outPath || parts.length === 0) {
  console.error('usage: merge_b23_bands.mjs <rel> <out> <band.json>...');
  process.exit(2);
}

const code = fs.readFileSync(rel, 'utf8');
const ast = parser.parse(code, { sourceType: 'module' });
const lines = code.split('\n');

// Named scopes whose name can prefix a colliding inner binding.  Class methods and
// function-valued declarators count: bundled units often live inside
// `class PanelRenderer { renderX() {...} }` or `const buildX = () => {...}`, and
// those names are just as usable as a top-level function's.
const scopes = [];
const addScope = (name, node) => {
  if (!name || !node || !node.loc) return;
  scopes.push({ name, start: node.loc.start.line, end: node.loc.end.line });
};
const scopeNameOfKey = (key) => {
  if (!key) return null;
  if (key.type === 'Identifier' || key.type === 'PrivateName') return key.name || (key.id && key.id.name);
  if (key.type === 'StringLiteral') return /^[a-z][A-Za-z0-9]*$/.test(key.value) ? key.value : null;
  return null;
};
const walk = (node) => {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'FunctionDeclaration' && node.id) addScope(node.id.name, node);
  if (
    (node.type === 'ClassMethod' || node.type === 'ObjectMethod' || node.type === 'ClassPrivateMethod') &&
    node.key
  ) {
    addScope(scopeNameOfKey(node.key), node);
  }
  if (node.type === 'VariableDeclarator' && node.id && node.id.type === 'Identifier' && node.init) {
    const init = node.init;
    if (
      init.type === 'ArrowFunctionExpression' ||
      init.type === 'FunctionExpression' ||
      init.type === 'ClassExpression'
    ) {
      addScope(node.id.name, init);
    }
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    const child = node[key];
    if (Array.isArray(child)) child.forEach(walk);
    else if (child && typeof child === 'object' && child.type) walk(child);
  }
};
walk(ast);

// name@line -> new name, and line -> key (so a scope's own rename can be looked up).
const map = {};
const byLine = new Map();
for (const part of parts) {
  const band = JSON.parse(fs.readFileSync(part, 'utf8'));
  const inner = band[rel] || band[Object.keys(band)[0]];
  for (const [key, value] of Object.entries(inner)) {
    if (map[key] !== undefined) throw new Error(`duplicate key ${key} across bands`);
    map[key] = value;
    byLine.set(Number(key.replace(/^.*@(\d+).*$/, '$1')), key);
  }
}

/** Name a scope is called after the batch: the map's name, else its current one if semantic. */
function scopeNewName(scope) {
  const key = byLine.get(scope.start);
  if (key && map[key]) return map[key];
  return /^[a-z][A-Za-z0-9]*$/.test(scope.name) && !/^[a-z]{1,2}[0-9]*$/.test(scope.name)
    ? scope.name
    : null;
}

function enclosing(scopeLine) {
  let best = null;
  for (const scope of scopes) {
    if (scope.start < scopeLine && scopeLine <= scope.end && scope.start !== scopeLine) {
      if (!best || scope.start > best.start) best = scope;
    }
  }
  return best;
}

const used = new Set(Object.values(map));
const taken = new Set();
const collisions = [];
const changes = [];
for (const [key, value] of Object.entries(map)) {
  if (!taken.has(value)) {
    taken.add(value);
    continue;
  }
  const line = Number(key.replace(/^.*@(\d+).*$/, '$1'));
  const scope = enclosing(line);
  const prefix = scope ? scopeNewName(scope) : null;
  let candidate = prefix ? prefix + value[0].toUpperCase() + value.slice(1) : null;
  if (!candidate || taken.has(candidate) || used.has(candidate)) {
    // No usable owner name: qualify with the nearest preceding renamed declaration
    // instead of an opaque placeholder, so the name still says what it belongs to.
    let base = prefix;
    if (!base) {
      for (let l = line; l > 0 && !base; l -= 1) {
        const key = byLine.get(l);
        if (key && map[key] && map[key] !== value) base = map[key];
      }
    }
    base = base || 'module';
    let n = 2;
    do {
      candidate = base + value[0].toUpperCase() + value.slice(1);
      if (taken.has(candidate) || used.has(candidate)) {
        candidate = base + value[0].toUpperCase() + value.slice(1) + (n === 2 ? 'Entry' : 'Entry' + String(n));
      }
      n += 1;
    } while (taken.has(candidate) || used.has(candidate));
  }
  taken.add(candidate);
  map[key] = candidate;
  collisions.push({ key, from: value, to: candidate, scope: scope ? scope.name : '(top level)' });
  changes.push(candidate);
}

fs.writeFileSync(outPath, JSON.stringify({ [rel]: map }, null, 2) + '\n');
console.log(`${rel}: entries=${Object.keys(map).length} duplicates=${collisions.length} uniqueTargets=${new Set(Object.values(map)).size}`);
for (const c of collisions.slice(0, 25)) console.log(`  ${c.key}  ${c.from} -> ${c.to}   [in ${c.scope}]`);
if (collisions.length > 25) console.log(`  ... ${collisions.length - 25} more`);
// A leftover short first line would signal a parse/format surprise.
console.log(`first line: ${JSON.stringify(lines[0].slice(0, 60))}`);
