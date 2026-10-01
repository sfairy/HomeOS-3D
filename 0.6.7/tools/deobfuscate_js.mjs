// deobfuscate_js.mjs -- single-file transformer for javascript-obfuscator output.
//
// Reverses: (a) string-array provider + rotate IIFE + decoder, (b) hex identifier
// renaming (_0x[0-9a-f]{4,}), (c) !0x1 / !0x0 boolean literals.
//
// Usage as a library:  import { transform } from "./deobfuscate_js.mjs";
// Usage from CLI:      node deobfuscate_js.mjs <src> <dst>

import { createRequire } from "module";
import vm from "vm";
import fs from "fs";
import path from "path";

const ROOT = "/Users/sfairy/项目/HA-Bridge/源代码/0.6.7";
const TOOLS_NODE = path.join(ROOT, "recovered", ".tools-node") + path.sep;

const require = createRequire(TOOLS_NODE);
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generate = require("@babel/generator").default;
const t = require("@babel/types");
const prettier = require("prettier");

export const IDENT_OBF_RE = /^_0x[0-9a-f]{4,}$/;
export const OBF_ANY_RE = /_0x[0-9a-f]{4,}/;

const BASE_PLUGINS = [
  "importAttributes",
  "topLevelAwait",
  "classProperties",
  "classPrivateProperties",
  "classPrivateMethods",
  "classStaticBlock",
  "dynamicImport",
  "exportDefaultFrom",
  "exportNamespaceFrom",
  "objectRestSpread",
  "optionalChaining",
  "nullishCoalescingOperator",
  "numericSeparator",
  "logicalAssignment",
  "bigInt",
  "importMeta",
  "asyncGenerators",
  "regexpUnicodeSets",
];
const PLUGIN_SETS = [
  BASE_PLUGINS,
  BASE_PLUGINS.concat(["jsx"]),
  BASE_PLUGINS.concat(["flow"]),
  BASE_PLUGINS.concat(["jsx", "flow"]),
];

export function parseAny(code) {
  let lastErr = null;
  for (const plugins of PLUGIN_SETS) {
    try {
      const ast = parser.parse(code, {
        sourceType: "module",
        allowReturnOutsideFunction: true,
        allowAwaitOutsideFunction: true,
        allowUndeclaredExports: true,
        allowSuperOutsideMethod: true,
        allowNewTargetOutsideFunction: true,
        plugins,
      });
      return { ast, plugins, err: null };
    } catch (e) {
      lastErr = e;
    }
  }
  return { ast: null, plugins: null, err: lastErr };
}

function generateCode(ast) {
  return generate(ast, {
    comments: true,
    retainLines: false,
    compact: false,
    concise: false,
    jsescOption: { minimal: true },
    decoratorsBeforeExport: false,
  }).code;
}

/* ------------------------------------------------------------------ */
/* exports / imports fingerprints                                      */
/* ------------------------------------------------------------------ */

export function collectExports(ast) {
  const out = [];
  for (const n of ast.program.body) {
    if (n.type === "ExportAllDeclaration") {
      out.push({ kind: "all", name: n.exported ? (n.exported.name || n.exported.value) : "*", source: n.source.value });
    } else if (n.type === "ExportDefaultDeclaration") {
      out.push({ kind: "default", name: "default" });
    } else if (n.type === "ExportNamedDeclaration") {
      if (n.declaration) {
        const d = n.declaration;
        if (d.type === "FunctionDeclaration" || d.type === "ClassDeclaration") {
          if (d.id) out.push({ kind: "decl", name: d.id.name, type: d.type });
        } else if (d.type === "VariableDeclaration") {
          for (const dd of d.declarations) {
            for (const k of Object.keys(t.getBindingIdentifiers(dd.id))) out.push({ kind: "decl", name: k, type: d.type });
          }
        }
      }
      for (const s of n.specifiers || []) {
        if (s.type === "ExportSpecifier") {
          const exp = s.exported.type === "Identifier" ? s.exported.name : s.exported.value;
          out.push({ kind: "spec", name: exp, source: n.source ? n.source.value : null });
        } else if (s.type === "ExportNamespaceSpecifier") {
          out.push({ kind: "ns", name: s.exported.name || s.exported.value });
        } else if (s.type === "ExportDefaultSpecifier") {
          out.push({ kind: "default-spec", name: s.exported.name });
        }
      }
    }
  }
  return out;
}

export function collectImports(ast) {
  const out = [];
  for (const n of ast.program.body) {
    if (n.type !== "ImportDeclaration") continue;
    const sources = [{ imported: null, local: null, kind: "source", defaultName: null }];
    for (const s of n.specifiers) {
      if (s.type === "ImportDefaultSpecifier") {
        sources.push({ imported: "default", local: s.local.name, kind: "default" });
      } else if (s.type === "ImportNamespaceSpecifier") {
        sources.push({ imported: "*", local: s.local.name, kind: "namespace" });
      } else {
        const imp = s.imported.type === "Identifier" ? s.imported.name : s.imported.value;
        sources.push({ imported: imp, local: s.local.name, kind: s.importKind || "named" });
      }
    }
    out.push({ source: n.source.value, importKind: n.importKind || "value", specifiers: sources.slice(1) });
  }
  return out;
}

/** Canonical fingerprint used by the validator (imported names + module source, local aliases excluded). */
export function importFingerprint(list) {
  return list.map((d) => d.source + " :: " + d.specifiers.map((s) => s.kind + ":" + s.imported).join(",")).join(" | ");
}
export function exportFingerprint(list) {
  return list.map((e) => e.kind + ":" + e.name).sort().join(" | ");
}

/* ------------------------------------------------------------------ */
/* preamble (provider / decoder / IIFE) handling                       */
/* ------------------------------------------------------------------ */

function isObfName(n) {
  return typeof n === "string" && IDENT_OBF_RE.test(n);
}

export function analyzePreamble(ast) {
  let bodyPaths = null;
  traverse(ast, { Program(p) { if (!bodyPaths) bodyPaths = p.get("body"); } });
  const body = bodyPaths ? bodyPaths.map((bp) => bp.node) : ast.program.body;
  const fnDecls = [];
  for (const n of body) {
    if (n.type === "FunctionDeclaration" && n.id && isObfName(n.id.name)) fnDecls.push(n);
  }
  const providers = fnDecls.filter((n) => n.params.length === 0);
  const twoArg = fnDecls.filter((n) => n.params.length >= 2);
  let decoder = null;
  if (twoArg.length) {
    const providerNames = new Set(providers.map((n) => n.id.name));
    decoder = twoArg.find((n) => {
      let found = false;
      traverse(n, { noScope: true, Identifier(p) { if (providerNames.has(p.node.name)) found = true; } });
      return found;
    }) || twoArg[0];
  }
  const aliasDeclarators = [];
  const aliasDeclarations = [];
  for (const n of body) {
    if (n.type !== "VariableDeclaration") continue;
    let has = false;
    for (const d of n.declarations) {
      if (d.id.type === "Identifier" && isObfName(d.id.name) && d.init && d.init.type === "Identifier" && isObfName(d.init.name)) {
        aliasDeclarators.push(d);
        has = true;
      }
    }
    if (has) aliasDeclarations.push(n);
  }
  const iifes = [];
  for (const n of body) {
    if (n.type === "ExpressionStatement" && n.expression.type === "CallExpression") {
      const c = n.expression.callee;
      if (c.type === "FunctionExpression" || c.type === "ArrowFunctionExpression") iifes.push(n);
    }
  }
  const aliasNames = new Set(aliasDeclarators.map((d) => d.id.name));
  return {
    providers,
    decoder,
    decoderName: decoder ? decoder.id.name : null,
    providerNames: new Set(providers.map((n) => n.id.name)),
    aliasDeclarators,
    aliasDeclarations,
    aliasNames,
    iifes,
  };
}

const VM_SANDBOX_EXTRA = {
  console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
};

export function buildPreambleScript(src, pre) {
  const parts = [];
  const push = (n) => parts.push({ start: n.start, end: n.end });
  for (const n of pre.providers) push(n);
  if (pre.decoder) push(pre.decoder);
  for (const n of pre.aliasDeclarations || []) push(n);
  for (const n of pre.iifes) push(n);
  parts.sort((a, b) => a.start - b.start);
  const text = parts.map((p) => src.slice(p.start, p.end)).join("\n");
  return text + "\n;globalThis.__DEOB_DECODER__ = " + pre.decoderName + ";\n";
}

export function runPreamble(src, pre) {
  const script = buildPreambleScript(src, pre);
  const ctx = vm.createContext(Object.assign({}, VM_SANDBOX_EXTRA));
  try {
    vm.runInContext(script, ctx, { timeout: 10000, filename: "preamble.js" });
  } catch (e) {
    return { decoder: null, error: e, script };
  }
  const decoder = ctx.__DEOB_DECODER__;
  if (typeof decoder !== "function") return { decoder: null, error: new Error("decoder not callable"), script };
  return { decoder, error: null, script };
}

/* ------------------------------------------------------------------ */
/* inlining decoder calls                                              */
/* ------------------------------------------------------------------ */

function evalConst(node) {
  if (!node) return { ok: false };
  switch (node.type) {
    case "NumericLiteral": return { ok: true, value: node.value };
    case "StringLiteral": return { ok: true, value: node.value };
    case "BooleanLiteral": return ok2(node.value);
    case "NullLiteral": return ok2(null);
    case "UnaryExpression": {
      const a = evalConst(node.argument);
      if (!a.ok) return a;
      if (node.operator === "-") return ok2(-a.value);
      if (node.operator === "+") return ok2(+a.value);
      if (node.operator === "!") return ok2(!a.value);
      if (node.operator === "void") return ok2(undefined);
      return { ok: false };
    }
    case "BinaryExpression": {
      const l = evalConst(node.left), r = evalConst(node.right);
      if (!l.ok || !r.ok) return { ok: false };
      switch (node.operator) {
        case "+": return ok2(l.value + r.value);
        case "-": return ok2(l.value - r.value);
        case "*": return ok2(l.value * r.value);
        case "/": return ok2(l.value / r.value);
        default: return { ok: false };
      }
    }
    case "ParenthesizedExpression": return evalConst(node.expression);
    default: return { ok: false };
  }
  function ok2(v) { return { ok: true, value: v }; }
}

/**
 * Replace every decoder call whose arguments are statically evaluable with the
 * real string literal.  Returns stats.
 */
/**
 * Build a scope-correct, memoised predicate deciding whether a binding holds the
 * string-array decoder. javascript-obfuscator re-aliases the decoder locally in
 * almost every function (`const _0xLocal = _0xOuter;`, sometimes several levels
 * deep), so a one-level `init.name === decoderName` test resolves only the first
 * layer. This walks the whole `const A = B = C = decoder` chain.
 */
export function makeDecoderResolver(pre) {
  const decoderName = pre.decoderName;
  const memo = new Map();
  const resolve = (binding, depth) => {
    if (!binding || depth > 64) return false;
    if (memo.has(binding)) return memo.get(binding);
    memo.set(binding, false); // in-progress / cycle guard
    let out = false;
    const bp = binding.path;
    if (bp && bp.node) {
      if (bp.isFunctionDeclaration()) out = !!bp.node.id && bp.node.id.name === decoderName;
      else if (bp.isVariableDeclarator()) {
        const init = bp.node.init;
        if (init && init.type === "Identifier") out = resolve(bp.scope.getBinding(init.name), depth + 1);
      } else if (bp.isIdentifier()) out = bp.node.name === decoderName;
    }
    memo.set(binding, out);
    return out;
  };
  return (binding) => resolve(binding, 0);
}

export function inlineDecoderCalls(ast, src, pre, decoder) {
  const decoderName = pre.decoderName;
  const stats = { inlined: 0, dynamic: 0, failed: [], unique: new Set() };
  if (!decoderName) return stats;
  const isDecoderBinding = makeDecoderResolver(pre);
  const preambleNodes = new Set();
  for (const n of pre.providers) preambleNodes.add(n);
  if (pre.decoder) preambleNodes.add(pre.decoder);
  for (const d of pre.aliasDeclarations || []) preambleNodes.add(d);
  for (const n of pre.iifes) preambleNodes.add(n);

  const isPreamble = (p) => {
    let cur = p;
    while (cur) { if (preambleNodes.has(cur.node)) return true; cur = cur.parentPath; }
    return false;
  };

  const jobs = [];
  traverse(ast, {
    CallExpression(p) {
      const callee = p.node.callee;
      if (callee.type !== "Identifier") return;
      const name = callee.name;
      if (!isObfName(name)) return;
      const binding = p.scope.getBinding(name);
      if (!binding) return;
      if (!isDecoderBinding(binding)) return;
      if (isPreamble(p)) return;
      const argVals = [];
      let ok = true;
      for (const a of p.node.arguments) {
        const r = evalConst(a);
        if (!r.ok) { ok = false; break; }
        argVals.push(r.value);
      }
      if (!ok) { stats.dynamic++; jobs.push({ p, dynamic: true }); return; }
      let value;
      try { value = decoder.apply(null, argVals); } catch (e) { stats.failed.push(String(e && e.message)); stats.dynamic++; return; }
      if (typeof value !== "string") { stats.failed.push("non-string decode for args " + JSON.stringify(argVals)); stats.dynamic++; return; }
      stats.inlined++;
      stats.unique.add(value);
      jobs.push({ p, value, dynamic: false });
    },
  });
  for (const j of jobs) {
    if (j.dynamic) continue;
    j.p.replaceWith(t.stringLiteral(j.value));
  }
  return stats;
}

/* ------------------------------------------------------------------ */
/* dead local decoder aliases                                          */
/* ------------------------------------------------------------------ */

/**
 * Collect, by node identity, every Identifier node that is genuinely still
 * attached to the current AST. After `replaceWith` on a parent expression the
 * old child reference paths stay in `binding.referencePaths` while their node
 * is orphaned, so path-based liveness checks over-report. Identity membership
 * in this set is immune to that.
 */
export function collectLiveIdentifierNodes(ast) {
  const live = new Set();
  traverse(ast, {
    noScope: true,
    Identifier(p) {
      live.add(p.node);
    },
  });
  return live;
}

/**
 * After inlining, a local `const _0xAlias = _0xDecoder;` often becomes unused.
 * Such declarators are pure (init is a bare Identifier), so removing an unused
 * one is always safe; it also lets the decoder itself be pruned.
 * Only `_0x`-named bindings are touched.
 */
export function removeDeadObfuscatedAliases(ast) {
  const removed = [];
  const liveNodes = collectLiveIdentifierNodes(ast);
  traverse(ast, {
    VariableDeclarator(p) {
      const id = p.node.id;
      if (id.type !== "Identifier" || !isObfName(id.name)) return;
      const init = p.node.init;
      if (!init || init.type !== "Identifier" || !isObfName(init.name)) return;
      const gp = p.parentPath && p.parentPath.parentPath;
      if (gp && gp.node && /^For/.test(gp.node.type)) return; // for(;;) heads
      const b = p.scope.getBinding(id.name);
      if (!b) return;
      const live = b.referencePaths.filter(
        (rp) => rp.node && liveNodes.has(rp.node) && rp.node.type === "Identifier" && rp.node.name === id.name
      );
      if (live.length) return;
      if (b.constantViolations.filter((v) => v.node).length) return;
      p.remove();
      removed.push(id.name);
    },
  });
  return { removed: removed.length, names: removed };
}

/* ------------------------------------------------------------------ */
/* pruning the preamble                                                */
/* ------------------------------------------------------------------ */

export function prunePreamble(ast, pre) {
  const statements = new Map(); // node -> {names:Set, node, path}
  const addStmt = (node, names) => {
    if (!node) return;
    statements.set(node, { node, names: new Set(names) });
  };
  for (const n of pre.providers) addStmt(n, [n.id.name]);
  if (pre.decoder) addStmt(pre.decoder, [pre.decoder.id.name]);
  for (const stmt of pre.aliasDeclarations || []) {
    if (!statements.has(stmt)) addStmt(stmt, []);
    for (const d of stmt.declarations) {
      if (d.id.type === "Identifier" && isObfName(d.id.name)) statements.get(stmt).names.add(d.id.name);
    }
  }
  for (const n of pre.iifes) addStmt(n, []);

  // name -> statement node
  const nameToStmt = new Map();
  for (const [node, info] of statements) for (const nm of info.names) nameToStmt.set(nm, node);

  const stmtNodes = new Set(statements.keys());
  const insideStmt = (p) => {
    let cur = p;
    while (cur) { if (stmtNodes.has(cur.node)) return true; cur = cur.parentPath; }
    return false;
  };

  // Build edges: statement -> statements it references
  const edges = new Map();
  const roots = new Set();
  for (const [node, info] of statements) {
    const refs = new Set();
    traverse(node, {
      noScope: true,
      Identifier(p) {
        const nm = p.node.name;
        if (nameToStmt.has(nm) && nameToStmt.get(nm) !== node) refs.add(nameToStmt.get(nm));
      },
    });
    edges.set(node, refs);
  }
  // The rotate IIFE mutates the string array in place; if the decoder is still
  // alive at runtime the rotation must stay, so make it depend on the decoder.
  if (pre.decoder && statements.has(pre.decoder)) {
    const de = edges.get(pre.decoder) || new Set();
    for (const n of pre.iifes) if (statements.has(n)) de.add(n);
    edges.set(pre.decoder, de);
  }

  // roots: a declared name referenced from outside any preamble statement
  const liveNodes = collectLiveIdentifierNodes(ast);
  traverse(ast, {
    Program(p) {
      for (const nm of nameToStmt.keys()) {
        const b = p.scope.getBinding(nm);
        if (!b) continue;
        for (const rp of b.referencePaths) {
          if (!rp.node || rp.node.type !== "Identifier" || rp.node.name !== nm) continue;
          if (!liveNodes.has(rp.node)) continue;
          if (!insideStmt(rp)) { roots.add(nameToStmt.get(nm)); break; }
        }
      }
    },
  });

  const alive = new Set(roots);
  const stack = Array.from(roots);
  while (stack.length) {
    const cur = stack.pop();
    for (const e of edges.get(cur) || []) if (!alive.has(e)) { alive.add(e); stack.push(e); }
  }

  const removed = new Set();
  for (const [node] of statements) if (!alive.has(node)) removed.add(node);
  if (removed.size) {
    ast.program.body = ast.program.body.filter((n) => !removed.has(n));
  }
  const kept = Array.from(alive).filter((n) => n.type === "FunctionDeclaration").map((n) => n.id.name);
  return { removedStatements: removed.size, keptDeclarations: kept };
}

/* ------------------------------------------------------------------ */
/* identifier renaming                                                 */
/* ------------------------------------------------------------------ */

const BAD_PROP_NAMES = new Set([
  "length", "value", "values", "name", "id", "type", "kind", "key", "keys", "constructor",
  "prototype", "toString", "valueOf", "then", "catch", "finally", "string", "number",
  "boolean", "object", "function", "undefined", "null", "default", "class", "return",
  "new", "delete", "in", "of", "for", "if", "else", "var", "let", "const", "this",
  "super", "import", "export", "with", "case", "switch", "do", "while", "try", "throw",
  "yield", "await", "async", "static", "enum", "extends", "instanceof", "typeof",
]);

const RESERVED = new Set([
  "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete",
  "do", "else", "enum", "export", "extends", "false", "finally", "for", "function", "if",
  "import", "in", "instanceof", "new", "null", "return", "super", "switch", "this", "throw",
  "true", "try", "typeof", "var", "void", "while", "with", "yield", "let", "static",
  "await", "implements", "interface", "package", "private", "protected", "public", "arguments", "eval",
]);

function validIdent(nm) {
  return typeof nm === "string" && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(nm) && !RESERVED.has(nm);
}
function lowerFirst(s) { return s ? s[0].toLowerCase() + s.slice(1) : s; }
function memberPropName(node) {
  if (!node || node.type !== "MemberExpression") return null;
  const p = node.property;
  if (!node.computed && p.type === "Identifier") return p.name;
  if (node.computed && p.type === "StringLiteral") return p.value;
  return null;
}

const DOM_STRONG = new Set([
  "appendChild", "removeChild", "classList", "dataset", "textContent", "innerHTML", "outerHTML",
  "setAttribute", "getAttribute", "removeAttribute", "querySelector", "querySelectorAll",
  "addEventListener", "removeEventListener", "dispatchEvent", "offsetWidth", "offsetHeight",
  "offsetTop", "offsetLeft", "tagName", "parentNode", "parentElement", "children", "firstChild",
  "insertBefore", "replaceChild", "closest", "getBoundingClientRect", "createElement",
]);
const DOM_WEAK = new Set(["style", "value", "checked", "disabled", "focus", "blur", "click", "remove", "hidden", "title", "href", "src"]);
const ARRAY_PROPS = new Set(["push", "pop", "shift", "unshift", "splice", "slice", "indexOf", "lastIndexOf", "includes", "forEach", "filter", "reduce", "join", "sort", "reverse", "concat", "find", "findIndex", "some", "every", "flat", "flatMap", "entries", "fill", "copyWithin", "at"]);
const MAP_PROPS = new Set(["set", "has", "delete", "clear", "get"]);
const VECTOR_PROPS = new Set(["x", "y", "z", "w", "set", "clone", "copy", "normalize", "add", "sub", "multiply", "dot", "applyQuaternion", "setFromMatrixPosition", "lookAt", "distanceTo"]);
const FN_STRIP = /^(get|create|make|build|find|load|fetch|read|parse|compute|resolve|query|select|render|update|apply|init|ensure|to|from|is|has|on|handle)/;

function deriveFromInit(init) {
  if (!init) return null;
  switch (init.type) {
    case "Identifier": return validIdent(init.name) && !IDENT_OBF_RE.test(init.name) ? init.name : null;
    case "MemberExpression": {
      const nm = memberPropName(init);
      if (nm && validIdent(nm) && !BAD_PROP_NAMES.has(nm) && !IDENT_OBF_RE.test(nm)) return nm;
      return null;
    }
    case "NewExpression": {
      if (init.callee.type === "Identifier" && validIdent(init.callee.name) && !IDENT_OBF_RE.test(init.callee.name)) {
        const n = lowerFirst(init.callee.name);
        return BAD_PROP_NAMES.has(n) ? null : n;
      }
      return null;
    }
    case "StringLiteral": return "text";
    case "NumericLiteral": return "num";
    case "BooleanLiteral": return "flag";
    case "NullLiteral": return "value";
    case "ObjectExpression": return init.properties.length ? "options" : "options";
    case "ArrayExpression": return "list";
    case "TaggedTemplateExpression":
    case "TemplateLiteral": return "text";
    case "AwaitExpression": return deriveFromInit(init.argument);
    case "ConditionalExpression":
      return deriveFromInit(init.consequent) || deriveFromInit(init.alternate);
    case "LogicalExpression":
      return deriveFromInit(init.right) || deriveFromInit(init.left);
    case "CallExpression": {
      const c = init.callee;
      if (c.type === "Identifier" && !IDENT_OBF_RE.test(c.name) && validIdent(c.name)) {
        const s = c.name.replace(FN_STRIP, "");
        const n = s ? lowerFirst(s) : null;
        if (n && validIdent(n) && !BAD_PROP_NAMES.has(n)) return n;
      }
      if (c.type === "MemberExpression") {
        const pn = memberPropName(c);
        if (pn && validIdent(pn)) {
          const s = pn.replace(FN_STRIP, "");
          const n = s ? lowerFirst(s) : null;
          if (n && validIdent(n) && !BAD_PROP_NAMES.has(n)) return n;
        }
      }
      return null;
    }
    default: return null;
  }
}

function deriveFromUsage(binding) {
  const props = new Map();
  for (const rp of binding.referencePaths) {
    const parent = rp.parentPath;
    if (!parent) continue;
    const pn = parent.node;
    if ((pn.type === "MemberExpression" || pn.type === "OptionalMemberExpression") && pn.object === rp.node) {
      const nm = memberPropName(pn);
      if (nm) props.set(nm, (props.get(nm) || 0) + 1);
    }
  }
  if (!props.size) return null;
  let dom = 0, arr = 0, mp = 0, vec = 0;
  for (const [k, v] of props) {
    if (DOM_STRONG.has(k)) dom += 2 * v; else if (DOM_WEAK.has(k)) dom += v;
    if (ARRAY_PROPS.has(k)) arr += v;
    if (MAP_PROPS.has(k)) mp += v;
    if (VECTOR_PROPS.has(k)) vec += v;
  }
  const scores = [["element", dom], ["vector", vec], ["map", mp], ["list", arr]];
  scores.sort((a, b) => b[1] - a[1]);
  if (scores[0][1] >= 2) return scores[0][0];
  return null;
}

export function unshorthand(ast) {
  let n = 0;
  traverse(ast, {
    ObjectProperty(p) {
      if (!p.node.shorthand) return;
      const { key, value } = p.node;
      if (key.type === "Identifier" && value.type === "Identifier") {
        if (key === value) p.node.value = t.identifier(value.name);
        p.node.shorthand = false;
        n++;
      }
    },
    ExportSpecifier(p) {
      if (p.node.local === p.node.exported) p.node.exported = t.identifier(p.node.exported.name);
    },
    ImportSpecifier(p) {
      if (p.node.local === p.node.imported) p.node.imported = t.identifier(p.node.imported.name);
    },
  });
  return n;
}

export function collectBindings(ast) {
  const bindings = [];
  const seen = new Set();
  traverse(ast, {
    enter(p) {
      if (typeof p.isScope === "function" && p.isScope() && p.scope && p.scope.path === p) {
        for (const b of Object.values(p.scope.bindings)) {
          if (!seen.has(b)) { seen.add(b); bindings.push(b); }
        }
      }
    },
  });
  return bindings;
}

function renameBindingNodes(binding, newName) {
  const oldName = binding.identifier.name;
  if (binding.identifier.type === "Identifier") binding.identifier.name = newName;
  for (const rp of binding.referencePaths) {
    if (rp.node && rp.node.type === "Identifier") rp.node.name = newName;
    else if (rp.node && rp.node.type === "JSXIdentifier") rp.node.name = newName;
  }
  for (const cv of binding.constantViolations) {
    const n = cv.node;
    if (!n) continue;
    if (n.type === "Identifier") n.name = newName;
    else if (n.type === "AssignmentExpression") renamePatternIdentifiers(n.left, oldName, newName);
    else if (n.type === "UpdateExpression") renamePatternIdentifiers(n.argument, oldName, newName);
    else if (n.type === "VariableDeclarator") renamePatternIdentifiers(n.id, oldName, newName);
  }
}
function renamePatternIdentifiers(node, oldName, newName) {
  const ids = t.getBindingIdentifiers(node);
  for (const nm of Object.keys(ids)) {
    if (nm === oldName && ids[nm].type === "Identifier") ids[nm].name = newName;
  }
}

export function renameIdentifiers(ast) {
  const bindings = collectBindings(ast);
  // collect every identifier name currently used in the file (collision avoidance)
  const used = new Set();
  traverse(ast, {
    Identifier(p) { used.add(p.node.name); },
    PrivateName(p) { },
  });
  const counters = { v: 0, arg: 0, fn: 0, Cls: 0, err: 0, loop: 0, opt: 0 };

  const exportedAlias = new Map(); // local obf name -> exported name
  for (const n of ast.program.body) {
    if (n.type !== "ExportNamedDeclaration") continue;
    for (const s of n.specifiers || []) {
      if (s.type === "ExportSpecifier" && s.local.type === "Identifier") {
        const exp = s.exported.type === "Identifier" ? s.exported.name : s.exported.value;
        if (IDENT_OBF_RE.test(s.local.name) && !IDENT_OBF_RE.test(exp)) exportedAlias.set(s.local.name, exp);
      }
    }
  }

  function makeUnique(base) {
    if (!base || !validIdent(base)) return null;
    if (!used.has(base)) { used.add(base); return base; }
    for (let i = 2; i < 10000; i++) {
      const cand = base + i;
      if (!used.has(cand)) { used.add(cand); return cand; }
    }
    return null;
  }
  function fallback(kind, binding) {
    for (;;) {
      counters[kind]++;
      const base = kind === "Cls" ? "Cls" + counters[kind] : kind + counters[kind];
      if (!used.has(base)) { used.add(base); return base; }
    }
  }

  const obfBindings = bindings.filter((b) => b.identifier && b.identifier.type === "Identifier" && IDENT_OBF_RE.test(b.identifier.name));
  obfBindings.sort((a, b) => (a.identifier.start | 0) - (b.identifier.start | 0));

  const renames = [];
  for (const b of obfBindings) {
    const old = b.identifier.name;
    let base = null;
    const bp = b.path;
    if (bp && bp.isImportSpecifier && bp.isImportSpecifier()) {
      const imp = bp.node.imported;
      base = imp.type === "Identifier" ? imp.name : imp.value;
    } else if (bp && bp.isImportDefaultSpecifier && bp.isImportDefaultSpecifier()) {
      base = "defaultImport";
    } else if (bp && bp.isImportNamespaceSpecifier && bp.isImportNamespaceSpecifier()) {
      base = "ns";
    } else if (exportedAlias.has(old)) {
      base = exportedAlias.get(old);
    }
    if (!base) base = deriveFromInit(bp && bp.node && bp.node.init ? bp.node.init : null);
    if (!base && bp && (bp.isVariableDeclarator() || bp.parentPath && bp.parentPath.isVariableDeclarator())) {
      base = deriveFromUsage(b);
    }
    let kind = "v";
    if (bp) {
      if (bp.isFunctionDeclaration && bp.isFunctionDeclaration()) kind = "fn";
      else if (bp.isClassDeclaration && bp.isClassDeclaration()) kind = "Cls";
      else if (bp.isIdentifier && bp.isIdentifier() && bp.parentPath) {
        const parent = bp.parentPath;
        if (parent.isFunction && parent.isFunction()) kind = "arg";
        else if (parent.isCatchClause && parent.isCatchClause()) kind = "err";
        else if (parent.isForInStatement || parent.isForOfStatement) kind = "loop";
      }
    }
    if (!base && !bp) kind = "v";
    let name = makeUnique(base);
    if (!name) name = fallback(kind, b);
    if (!name) continue;
    renames.push({ binding: b, newName: name });
  }
  for (const r of renames) renameBindingNodes(r.binding, r.newName);
  return { renamed: renames.length, total: bindings.length };
}

export function foldBooleans(ast) {
  let n = 0;
  traverse(ast, {
    UnaryExpression(p) {
      if (p.node.operator !== "!") return;
      const a = p.node.argument;
      let truthy = null;
      if (a.type === "NumericLiteral") truthy = a.value !== 0;
      else if (a.type === "StringLiteral") truthy = a.value.length > 0;
      else if (a.type === "BooleanLiteral") truthy = a.value;
      else if (a.type === "NullLiteral") truthy = false;
      else if (a.type === "ArrayExpression" || a.type === "ObjectExpression") truthy = true;
      if (truthy === null) return;
      p.replaceWith(t.booleanLiteral(!truthy));
      n++;
    },
  });
  return n;
}

/* ------------------------------------------------------------------ */
/* leftover detection                                                  */
/* ------------------------------------------------------------------ */

export function countLeftovers(code) {
  const m = code.match(/_0x[0-9a-f]{4,}/g);
  return m ? m.length : 0;
}

export function listLeftoverIdentifiers(ast) {
  const out = new Set();
  traverse(ast, { Identifier(p) { if (IDENT_OBF_RE.test(p.node.name)) out.add(p.node.name); } });
  return Array.from(out).sort();
}

/* ------------------------------------------------------------------ */
/* prettier                                                            */
/* ------------------------------------------------------------------ */

export async function prettify(code) {
  try {
    const res = await prettier.format(code, {
      parser: "babel",
      printWidth: 100,
      singleQuote: false,
      // Keep the original quoting of property keys. The obfuscator emits
      // {"name": x}; prettier default "as-needed" rewrites that to {name: x},
      // a pure spelling change that makes the output stop matching the 0.6.6
      // donor under the alpha-equivalence gate.
      quoteProps: "preserve",
      semi: true,
      trailingComma: "none",
      arrowParens: "always",
      bracketSpacing: true,
      tabWidth: 2,
      useTabs: false,
    });
    return { code: res, error: null };
  } catch (e) {
    return { code, error: e };
  }
}

/* ------------------------------------------------------------------ */
/* top level transform                                                 */
/* ------------------------------------------------------------------ */

function isVendorOrMin(rel) {
  return /(^|\/)vendor\//.test(rel) || /\.min\.js$/.test(rel);
}

export async function transform(code, rel) {
  const res = {
    rel,
    bytesIn: Buffer.byteLength(code),
    mode: null,
    parseOkBefore: false,
    parseOkAfter: false,
    stringsDecoded: 0,
    uniqueStrings: [],
    decoderCallsInlined: 0,
    dynamicDecoderCalls: 0,
    renamings: 0,
    bindings: 0,
    preambleRemoved: 0,
    preambleKept: [],
    exportsBefore: [],
    exportsAfter: [],
    importsBefore: [],
    importsAfter: [],
    notes: [],
    errors: [],
    leftovers: 0,
  };

  const { ast, err } = parseAny(code);
  if (!ast) {
    res.mode = "parse-failed";
    res.errors.push("parse: " + (err && err.message));
    res.code = code;
    return res;
  }
  res.parseOkBefore = true;
  res.mode = "deobfuscated";
  res.exportsBefore = collectExports(ast);
  res.importsBefore = collectImports(ast);

  const isObf = OBF_ANY_RE.test(code);
  if (!isObf) {
    if (isVendorOrMin(rel)) {
      res.mode = "verbatim";
      res.code = code;
      res.exportsAfter = res.exportsBefore;
      res.importsAfter = res.importsBefore;
      res.parseOkAfter = true;
      res.notes.push("not obfuscated; vendor/min file copied verbatim");
      return res;
    }
    const { code: pretty, error } = await prettify(code);
    if (error) {
      res.mode = "verbatim";
      res.code = code;
      res.notes.push("prettier failed: " + error.message);
    } else {
      res.mode = "prettify-only";
      res.code = pretty;
    }
    const chk = parseAny(res.code);
    res.parseOkAfter = !!chk.ast;
    if (!chk.ast || !prettify) {
      res.code = code;
      res.mode = "verbatim";
      res.parseOkAfter = true;
      res.notes.push("prettify output did not parse; kept original bytes");
    }
    const a2 = chk.ast || ast;
    res.exportsAfter = collectExports(a2);
    res.importsAfter = collectImports(a2);
    return res;
  }

  /* --- obfuscated --- */
  const pre0 = analyzePreamble(ast);
  if (!pre0.decoderName) {
    res.notes.push("no 2-arg decoder declaration found; treating as generic obfuscated file");
  }
  let decoder = null;
  if (pre0.decoderName) {
    const r = runPreamble(code, pre0);
    if (!r.decoder) {
      res.errors.push("preamble run failed: " + (r.error && r.error.message));
    } else decoder = r.decoder;
  }

  const unique = new Set();
  let inlined = 0;
  let dynamic = 0;
  let deadAliases = 0;
  let rounds = 0;
  let cur = code;
  if (decoder) {
    for (let round = 0; round < 8; round++) {
      const pp = parseAny(cur);
      if (!pp.ast) break;
      const pre = analyzePreamble(pp.ast);
      if (!pre.decoderName) break;
      const st = inlineDecoderCalls(pp.ast, cur, pre, decoder);
      for (const s of st.unique) unique.add(s);
      inlined += st.inlined;
      dynamic = st.dynamic;
      if (st.failed.length) res.notes.push("decoder threw for: " + st.failed.slice(0, 5).join("; "));
      const da = removeDeadObfuscatedAliases(pp.ast);
      deadAliases += da.removed;
      rounds++;
      cur = generateCode(pp.ast);
      if (st.inlined === 0 && da.removed === 0) break;
    }
    // Re-run dead-alias elimination to a fixpoint: an alias only becomes dead
    // once the round that inlined its last call has finished.
    for (let pass = 0; pass < 4; pass++) {
      const pa = parseAny(cur);
      if (!pa.ast) break;
      const da2 = removeDeadObfuscatedAliases(pa.ast);
      deadAliases += da2.removed;
      if (da2.removed > 0) cur = generateCode(pa.ast);
      if (da2.removed === 0) break;
    }
    const pp2 = parseAny(cur);
    if (pp2.ast) {
      const pre2 = analyzePreamble(pp2.ast);
      if (pre2.decoderName) {
        const pr = prunePreamble(pp2.ast, pre2);
        res.preambleRemoved = pr.removedStatements;
        res.preambleKept = pr.keptDeclarations;
        if (pr.keptDeclarations.length) res.notes.push("kept preamble declarations: " + pr.keptDeclarations.join(","));
        cur = generateCode(pp2.ast);
      }
    }
  } else {
    res.notes.push("decoder could not be instantiated; string-array left in place");
  }
  res.decoderCallsInlined = inlined;
  res.dynamicDecoderCalls = dynamic;
  res.stringsDecoded = unique.size;
  res.uniqueStrings = Array.from(unique);
  if (deadAliases) res.notes.push(deadAliases + " dead local decoder alias declaration(s) removed");
  if (dynamic) res.notes.push(dynamic + " decoder call(s) had non-constant arguments; left untouched");
  if (rounds > 1) res.notes.push("inlining converged after " + rounds + " round(s)");
  const stage1 = cur;

  // re-parse for a clean AST before renaming
  const p2 = parseAny(stage1);
  if (!p2.ast) {
    res.errors.push("intermediate parse failed: " + (p2.err && p2.err.message));
    res.parseOkAfter = false;
    res.code = stage1;
    res.exportsAfter = res.exportsBefore;
    res.importsAfter = res.importsBefore;
    res.leftovers = countLeftovers(stage1);
    return res;
  }
  const ast2 = p2.ast;
  const sh = unshorthand(ast2);
  if (sh) res.notes.push(sh + " shorthand property/specifier expanded before renaming");
  const rn = renameIdentifiers(ast2);
  res.renamings = rn.renamed;
  res.bindings = rn.total;
  const folded = foldBooleans(ast2);
  if (folded) res.notes.push(folded + " boolean literal(s) folded");

  let out = generateCode(ast2);
  if (!isVendorOrMin(rel)) {
    const { code: pretty, error } = await prettify(out);
    if (error) res.notes.push("prettier failed: " + error.message);
    else out = pretty;
  } else {
    res.notes.push("vendor/min path: prettier skipped");
  }

  res.code = out;
  const p3 = parseAny(out);
  res.parseOkAfter = !!p3.ast;
  if (!p3.ast) {
    res.errors.push("output parse failed: " + (p3.err && p3.err.message));
    res.exportsAfter = res.exportsBefore;
    res.importsAfter = res.importsBefore;
  } else {
    res.exportsAfter = collectExports(p3.ast);
    res.importsAfter = collectImports(p3.ast);
    res.leftoverIdentifiers = listLeftoverIdentifiers(p3.ast);
  }
  res.leftovers = countLeftovers(out);
  res.bytesOut = Buffer.byteLength(out);
  return res;
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("usage: node deobfuscate_js.mjs <src> <dst>");
    process.exit(2);
  }
  const [src, dst] = args;
  const code = fs.readFileSync(src, "utf8");
  const rel = path.basename(src);
  const r = await transform(code, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, r.code);
  const summary = Object.assign({}, r);
  delete summary.code;
  console.log(JSON.stringify(summary, null, 1).slice(0, 4000));
}

if (process.argv[1] && process.argv[1].endsWith("deobfuscate_js.mjs")) {
  main();
}
