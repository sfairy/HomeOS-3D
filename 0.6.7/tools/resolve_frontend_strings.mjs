/**
 * Round 1 of the frontend de-obfuscation: inline the string array.
 *
 * The shipped frontend was run through javascript-obfuscator (obfuscator.io):
 * every string literal lives in a rotated, base64-encoded string array and the
 * code calls _0xDECODER(0xNNN) instead.  This tool runs the obfuscator's own
 * string machinery inside a node:vm sandbox, resolves every decoder call site to
 * the string it really returns, replaces the call with that literal and drops
 * the (now dead) machinery.
 *
 * Deliberately *not* webcrack: webcrack 2.x needs isolated-vm, whose prebuilt
 * binaries stop at Node ABI 137 while this machine runs Node 26 / ABI 147.  It
 * would only be needed for control-flow flattening, which this build does not
 * contain (no business file has a switch statement).
 *
 * Usage: node tools/resolve_frontend_strings.mjs [--dry] [--stats] [path ...]
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolveBabelRoot } from './lib/babel-root.mjs';

const require = createRequire(import.meta.url);
const BABEL_ROOT = resolveBabelRoot();
const parser = require(BABEL_ROOT + '/@babel/parser');
const traverse = require(BABEL_ROOT + '/@babel/traverse').default;
const generate = require(BABEL_ROOT + '/@babel/generator').default;
const t = require(BABEL_ROOT + '/@babel/types');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND = path.join(ROOT, 'frontend');
const OBFUSCATED_NAME = /^_0x[0-9a-f]+$/;
const OBFUSCATED_PRESENT = /_0x[0-9a-f]{4,}/g;
const ROTATION_LOOP = /while\s*\(\s*!+\[\]\s*\)/;

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && entry.name.endsWith('.js')) yield full;
  }
}

function parse(code) {
  return parser.parse(code, { sourceType: 'module', errorRecovery: true });
}

function isObfuscated(code) {
  const head = code.slice(0, 4096);
  const matches = head.match(OBFUSCATED_PRESENT);
  return (matches ? matches.length : 0) >= 3;
}

function makeSandbox() {
  const cache = new Map();
  const handler = {
    get(_target, property) {
      if (!cache.has(property)) {
        const stub = function () {};
        stub.__stub = true;
        cache.set(property, stub);
      }
      return cache.get(property);
    },
    has() { return true; },
    set() { return true; },
  };
  const stubGlobal = new Proxy({}, handler);
  return Object.assign(Object.create(null), {
    window: stubGlobal,
    self: stubGlobal,
    document: stubGlobal,
    navigator: stubGlobal,
    console: { log() {}, warn() {}, error() {}, debug() {} },
  });
}

function withinRanges(position, ranges) {
  return ranges.some(function (r) { return position >= r[0] && position < r[1]; });
}

function topLevelAwaitRanges(ast) {
  const ranges = [];
  traverse(ast, {
    AwaitExpression(p) {
      if (p.getFunctionParent()) return;
      let cursor = p;
      while (cursor.parentPath && !cursor.parentPath.isProgram()) cursor = cursor.parentPath;
      if (cursor.node.start !== undefined) ranges.push([cursor.node.start, cursor.node.end]);
    },
  });
  return ranges;
}

function rotationRanges(ast, code) {
  const ranges = [];
  traverse(ast, {
    WhileStatement(p) {
      const test = code.slice(p.node.test.start, p.node.test.end);
      if (!/^!+\[\]$/.test(test)) return;
      ranges.push([p.node.start, p.node.end]);
    },
  });
  return ranges;
}

/** Run the obfuscator's string machinery and return its live decoder closures. */
function extractDecoders(code, ast) {
  const functionNames = [];
  const otherNames = [];
  const keep = [];
  for (const statement of ast.program.body) {
    let declaration = statement;
    if (statement.type.startsWith('Export')) {
      declaration = statement.declaration || null;
      if (declaration) keep.push(declaration);
    } else if (statement.type === 'ImportDeclaration') {
      continue;
    } else {
      keep.push(statement);
    }
    if (!declaration) continue;
    if (declaration.type === 'FunctionDeclaration' && declaration.id) {
      functionNames.push(declaration.id.name);
    }
    if (declaration.type === 'VariableDeclaration') {
      for (const declarator of declaration.declarations) {
        if (declarator.id.type === 'Identifier') otherNames.push(declarator.id.name);
      }
    }
  }
  const candidates = functionNames.concat(otherNames).filter(function (name) {
    return OBFUSCATED_NAME.test(name);
  });
  if (candidates.length === 0) {
    return { decoders: new Map(), candidates: candidates, rotationRequired: false };
  }
  const parts = [];
  let rotationRequired = false;
  const awaited = topLevelAwaitRanges(ast);
  parts.push('globalThis.__importMeta={url:"file:///stub/index.js",env:{},resolve:function(){return "";}};');
  for (const statement of keep) {
    if (statement.start === undefined) continue;
    if (withinRanges(statement.start, awaited)) continue;
    const text = code
      .slice(statement.start, statement.end)
      .replace(/\bimport\.meta\b/g, 'globalThis.__importMeta');
    let statement_text = text;
    if (ROTATION_LOOP.test(text)) {
      rotationRequired = true;
      // Mark completion from *inside* the loop test. The rotation IIFE is not
      // always its own statement: in `frontend/static/embed-runtime.js` it
      // shares one comma expression with the module body, so a body that throws
      // on the stubbed globals swallows a marker statement appended after it,
      // and the file is skipped as "rotation did not run" forever.
      statement_text = text.replace(ROTATION_LOOP, function (match) {
        return match.slice(0, -1) + '&&(globalThis.__rotationCompleted=true,true))';
      });
    }
    parts.push(statement_text);
  }
  parts.push('globalThis.__decoders={};');
  parts.push(
    candidates
      .map(function (name) {
        return 'try{globalThis.__decoders[' + JSON.stringify(name) + ']=' + name + ';}catch(__e){}';
      })
      .join('\n')
  );
  const context = vm.createContext(makeSandbox());
  try {
    vm.runInContext(parts.join('\n'), context, { timeout: 20000 });
  } catch (error) {
    /* the module body touches stubbed imports; anything already run is visible */
  }
  if (rotationRequired && context.__rotationCompleted !== true) {
    return { decoders: new Map(), candidates: candidates, rotationRequired: true, rotationCompleted: false };
  }
  const decoders = new Map();
  const registry = Object.assign({}, context.__decoders || {});
  for (const name of candidates) {
    if (!(name in registry) && typeof context[name] === 'function') registry[name] = context[name];
  }
  for (const entry of Object.entries(registry)) {
    if (typeof entry[1] === 'function') decoders.set(entry[0], entry[1]);
  }
  return { decoders: decoders, candidates: candidates, rotationRequired: rotationRequired, rotationCompleted: true };
}

function resolveDecoderName(name, scope, decoders) {
  if (decoders.has(name)) return name;
  let current = name;
  let currentScope = scope;
  for (let depth = 0; depth < 16; depth += 1) {
    const binding = currentScope ? currentScope.getBinding(current) : null;
    if (!binding) return null;
    const bindingPath = binding.path;
    if (
      bindingPath.isVariableDeclarator() &&
      bindingPath.node.init &&
      bindingPath.node.init.type === 'Identifier'
    ) {
      const next = bindingPath.node.init.name;
      if (decoders.has(next)) return next;
      current = next;
      currentScope = bindingPath.scope;
      continue;
    }
    if (
      (bindingPath.isFunctionDeclaration() || bindingPath.isFunctionExpression()) &&
      decoders.has(current)
    ) {
      return current;
    }
    return null;
  }
  return null;
}

function literalArgs(node) {
  const args = [];
  for (const arg of node.arguments) {
    if (arg.type === 'NumericLiteral' || arg.type === 'StringLiteral') args.push(arg.value);
    else if (arg.type === 'UnaryExpression' && arg.operator === '-' && arg.argument.type === 'NumericLiteral') {
      args.push(-arg.argument.value);
    } else return null;
  }
  return args;
}

function transform(code) {
  const ast = parse(code);
  const parseErrors = (ast.errors && ast.errors.length) || 0;
  const extracted = extractDecoders(code, ast);
  const decoders = extracted.decoders;
  if (decoders.size === 0) {
    return {
      ok: false,
      reason: extracted.rotationCompleted === false ? 'rotation did not run' : 'no decoder found',
      parseErrors: parseErrors,
    };
  }
  const rotation = rotationRanges(ast, code);
  const decoderNames = new Set(decoders.keys());
  let inlined = 0;
  let unresolved = 0;

  traverse(ast, {
    CallExpression(p) {
      const callee = p.node.callee;
      if (callee.type !== 'Identifier') return;
      const args = literalArgs(p.node);
      if (!args) return;
      if (withinRanges(p.node.start, rotation)) return;
      const root = resolveDecoderName(callee.name, p.scope, decoders);
      if (!root) {
        if (decoderNames.has(callee.name)) unresolved += 1;
        return;
      }
      let value;
      try {
        value = decoders.get(root).apply(null, args);
      } catch (error) {
        return;
      }
      if (typeof value !== 'string') return;
      p.replaceWith(t.stringLiteral(value));
      inlined += 1;
    },
  });

  // The rotation IIFE is a top-level statement that *contains* the loop, so it
  // has to be matched by containment, not by its own start offset.
  const machineryNames = new Set(decoderNames);
  for (const name of extracted.candidates) machineryNames.add(name);
  function containsRotation(statement) {
    if (statement.start === undefined) return false;
    return rotation.some(function (r) {
      return r[0] >= statement.start && r[1] <= statement.end;
    });
  }
  function isMachineryInit(node) {
    return node && node.type === 'Identifier' && machineryNames.has(node.name);
  }
  // Usually the rotation IIFE is a statement of its own, but obfuscator.io can
  // also splice it into a comma expression together with the live module body,
  // as in frontend/static/embed-runtime.js:
  //     (function (a, b) { ... while (!![]) { ... } ... })(arr, magic), (() => { ... })();
  // Dropping that whole statement would delete the module body, so remember the
  // shortest call expression that encloses the loop and neutralise only it.
  let rotationHost = null;
  traverse(ast, {
    CallExpression(p) {
      const node = p.node;
      if (node.start === undefined) return;
      const encloses = rotation.some(function (r) {
        return r[0] >= node.start && r[1] <= node.end;
      });
      if (!encloses) return;
      if (rotationHost === null || node.end - node.start < rotationHost.node.end - rotationHost.node.start) {
        rotationHost = { node: node, path: p };
      }
    },
  });
  const removals = new Set();
  for (const statement of ast.program.body) {
    if (statement.start === undefined) continue;
    if (containsRotation(statement)) {
      if (rotationHost !== null && statement.expression === rotationHost.node) {
        // The rotation is a statement of its own: drop the whole thing.
        removals.add(statement);
        rotationHost = null;
      }
      continue;
    }
    if (statement.type === 'FunctionDeclaration' && statement.id && machineryNames.has(statement.id.name)) {
      removals.add(statement);
      continue;
    }
    const declaration = statement.type.startsWith('Export') ? statement.declaration : statement;
    if (declaration && declaration.type === 'VariableDeclaration' && declaration.declarations.length > 0) {
      const kept = declaration.declarations.filter(function (d) {
        return !(d.id.type === 'Identifier' && isMachineryInit(d.init));
      });
      if (kept.length === 0) { removals.add(statement); continue; }
      if (kept.length !== declaration.declarations.length) declaration.declarations = kept;
    }
  }
  ast.program.body = ast.program.body.filter(function (s) { return !removals.has(s); });
  if (rotationHost !== null) {
    // The rotation already ran inside the sandbox, so in the emitted program it
    // is dead weight; a bare `0` keeps the surrounding comma expression valid.
    rotationHost.path.replaceWith(t.numericLiteral(0));
  }

  // Per-scope alias declarations (const _0x1a2b = _0xDECODER;) live inside
  // functions, so the program-body sweep above cannot see them, and the chains
  // can be several links deep (_0x1a = _0x2b = _0xDECODER).  Remove them to a
  // fixpoint, promoting each removed name to a known machinery name so the next
  // link in the chain is matched too.
  for (let pass = 0; pass < 12; pass += 1) {
    let changed = false;
    traverse(ast, {
      VariableDeclarator(p) {
        const id = p.node.id;
        const init = p.node.init;
        const idIsMachinery = id && id.type === 'Identifier' && machineryNames.has(id.name);
        const initIsMachinery = init && init.type === 'Identifier' && machineryNames.has(init.name);
        if (!idIsMachinery && !initIsMachinery) return;
        if (id && id.type === 'Identifier') machineryNames.add(id.name);
        p.remove();
        changed = true;
      },
    });
    if (!changed) break;
  }
  traverse(ast, {
    VariableDeclaration(p) {
      if (p.node.declarations.length === 0) p.remove();
    },
  });

  if (extracted.candidates.length) {
    const kept = [];
    for (const statement of ast.program.body) {
      if (statement.type === 'FunctionDeclaration' && statement.id) {
        const name = statement.id.name;
        if (extracted.candidates.indexOf(name) >= 0) {
          const others = ast.program.body
            .filter(function (s) { return s !== statement; })
            .map(function (s) { return code.slice(s.start, s.end); })
            .join('\n');
          const used = new RegExp('(?<![\\w$.])' + name + '(?![\\w$])').test(others);
          if (!used) continue;
        }
      }
      kept.push(statement);
    }
    ast.program.body = kept;
  }

  const output = generate(ast, {
    comments: true,
    compact: false,
    jsescOption: { minimal: true },
    retainLines: false,
  }).code;
  return { ok: true, output: output, inlined: inlined, unresolved: unresolved, parseErrors: parseErrors };
}

const argv = process.argv.slice(2);
const dry = argv.indexOf('--dry') >= 0;
const stats = argv.indexOf('--stats') >= 0;
const positional = argv.filter(function (a) { return a.indexOf('--') !== 0; });

let targets = [];
if (positional.length) {
  for (const p of positional) {
    const full = path.resolve(p);
    if (fs.statSync(full).isDirectory()) { for (const f of walk(full)) targets.push(f); }
    else targets.push(full);
  }
} else {
  for (const f of walk(FRONTEND)) targets.push(f);
}
targets = targets.filter(function (f) { return isObfuscated(fs.readFileSync(f, 'utf8')); }).sort();

let done = 0;
let skipped = 0;
let totalInlined = 0;
for (const file of targets) {
  const code = fs.readFileSync(file, 'utf8');
  let result;
  try {
    result = transform(code);
  } catch (error) {
    console.log('SKIP ' + path.relative(ROOT, file) + ' :: ' + error.message);
    skipped += 1;
    continue;
  }
  if (!result.ok) {
    console.log('SKIP ' + path.relative(ROOT, file) + ' :: ' + result.reason);
    skipped += 1;
    continue;
  }
  if (!result.output.trim()) {
    // An empty program means the sweep deleted live code rather than machinery;
    // never let that reach the disk.
    console.log('SKIP ' + path.relative(ROOT, file) + ' :: transform produced an empty program');
    skipped += 1;
    continue;
  }
  const residual = (result.output.match(/_0x[0-9a-f]{4,}/g) || []).length;
  console.log(
    (dry ? 'DRY  ' : 'OK   ') + path.relative(ROOT, file) +
    ' inlined=' + result.inlined + ' unresolved=' + result.unresolved +
    ' residual_0x=' + residual + ' bytes=' + code.length + '->' + result.output.length
  );
  if (!dry) fs.writeFileSync(file, result.output, 'utf8');
  done += 1;
  totalInlined += result.inlined;
}
console.log('# resolved ' + done + ' file(s), skipped ' + skipped + ', inlined ' + totalInlined + ' decoder call(s)');
