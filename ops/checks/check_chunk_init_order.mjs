#!/usr/bin/env node
/**
 * 构建产物「跨 chunk 顶层常量读取」检测（TDZ/未初始化）。
 *
 * 为什么需要这个门禁
 * ----------------
 * Rolldown 的 entriesAware 兜底组会产生 `shared-*` 互环。ESM 在环内求值时，某个 chunk 的
 * 模块体可能在它依赖的 chunk 之前执行，于是**被 import 的 const 此刻是 `undefined`**：
 *
 *   - 读成下标 → `TypeError: Cannot read properties of undefined (reading '0')`（整块 UI 白屏）
 *   - 对象展开 → 不报错，只把表静默变空（域标签全变英文、默认告警规则全丢，最难查）
 *
 * 历史事故：`main-layout-nav.util.ts` 顶层 `media: EMBED_TAB_ACCENTS[0]` 与 `...embedIconMap`，
 * 与 `embed-*` 注册表落在同一个环里 → 顶栏渲染崩溃。修法是把它们并入 `shared-registry`
 * 叶子 chunk（见 vite.config.ts 的 codeSplitting.groups），本脚本负责**持续验证**这个不变量：
 * 只要再次出现「顶层读跨 chunk 常量 + 来源 chunk 反向可达」，构建产物就是不合格的。
 *
 * 判定细节
 * --------
 * 只统计**模块顶层**的读取（函数/类体里的读取发生在运行期，那时所有模块都已初始化）。
 * 被读的绑定如果是 `function` 声明（提升）则安全，跳过；`const` / `let`（TDZ）与 `var`
 * （值为 undefined）都算风险。
 *
 * 用法
 * ----
 *   node ops/checks/check_chunk_init_order.mjs                  # 检查默认产物目录
 *   node ops/checks/check_chunk_init_order.mjs --dir <dir>      # 检查指定目录
 *   node ops/checks/check_chunk_init_order.mjs --strict         # 产物缺失也算失败（CI 用）
 *
 * 产物目录缺失时默认 SKIP（本地没构建不该红），CI 构建后加 `--strict` 保证真的跑过。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const args = process.argv.slice(2);
const argOf = (name, fallback = '') => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const STRICT = args.includes('--strict');
const DEFAULT_DIRS = [
  'dist/homeos/frontend/static/assets',
  'dist/homeos-store/frontend/static/assets',
];
const DIRS = argOf('--dir') ? [argOf('--dir')] : DEFAULT_DIRS;

/** 解析单个 chunk，返回 { text, ast }。解析失败直接抛（产物坏了要看得见）。 */
function parseChunk(text, file) {
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  return ast;
}

/** 相对 import（`./x.js`）的源 chunk 名；其它（vendor / 裸模块）忽略。 */
function relativeSource(node) {
  if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) return null;
  const spec = node.moduleSpecifier.text;
  return spec.startsWith('./') ? spec.slice(2) : null;
}

/** 是否位于函数/类体内（那些读取是运行期的，不参与判定）。 */
function inDeferredScope(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (
      ts.isFunctionLike(p) ||
      ts.isClassLike(p) ||
      ts.isMethodDeclaration(p) ||
      ts.isPropertyDeclaration(p) ||
      ts.isGetAccessorDeclaration(p) ||
      ts.isSetAccessorDeclaration(p)
    ) {
      return true;
    }
  }
  return false;
}

/** 标识符是否是「名字位置」而不是取值（属性名 / 键 / 标签 / import-export 子句）。 */
function isNamePosition(node) {
  const p = node.parent;
  if (!p) return true;
  // `a.foo` 的 foo 不是取值（即使恰好与某个 import 同名）
  if (ts.isPropertyAccessExpression(p) && p.name === node) return true;
  if (ts.isPropertyAssignment(p) && p.name === node) return true;
  if (ts.isShorthandPropertyAssignment(p) && p.name === node) return false;
  if (ts.isMethodDeclaration(p) || ts.isPropertyDeclaration(p) || ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p)) {
    if (p.name === node) return true;
  }
  if (ts.isNamedImports(p) || ts.isNamedExports(p) || ts.isImportSpecifier(p) || ts.isExportSpecifier(p)) return true;
  if (ts.isImportClause(p) || ts.isNamespaceImport(p)) return true;
  if (ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p)) return true;
  return false;
}

/**
 * 收集 chunk 的 import：本地名 → 源 chunk。
 * 同时收集「本 chunk 导出了哪些本地名」（本地名 → 导出名），用于判断被读绑定的定义类型。
 */
function scanImports(ast) {
  const imports = new Map(); // local -> source chunk
  const deps = new Set();
  for (const stmt of ast.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const src = relativeSource(stmt);
    if (!src) continue;
    deps.add(src);
    const clause = stmt.importClause;
    if (!clause) continue;
    const named = clause.namedBindings;
    if (named && ts.isNamedImports(named)) {
      for (const el of named.elements) {
        const exported = el.propertyName ? el.propertyName.text : el.name.text;
        imports.set(el.name.text, { chunk: src, exported });
      }
    }
  }
  return { imports, deps };
}

/** 源 chunk 里「导出名 → 本地名」的映射（只覆盖 `export { a as b }` 这种产物形态）。 */
function exportAliases(ast) {
  const map = new Map();
  for (const stmt of ast.statements) {
    if (ts.isExportDeclaration(stmt) && !stmt.moduleSpecifier && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      for (const el of stmt.exportClause.elements) {
        const local = el.propertyName ? el.propertyName.text : el.name.text;
        map.set(el.name.text, local);
      }
    }
  }
  return map;
}

/**
 * 判定某个导出绑定的「定义种类」，用来区分安全与危险。
 *
 * chunk 边界会让导出变成多跳：A 从 B 引入 `X`，B 又把同一绑定转手导出给 C。
 * 因此要顺着 re-export 链一路走到**真正声明它**的 chunk：
 *   - `function f(){}` → `hoisted`（函数声明提升，环内提前读也是可调用的，安全）
 *   - `const/let/var`   → `binding`（环内提前读到 undefined，危险）
 *   - 无法判定          → `unknown`（按危险处理，宁严勿松）
 */
function resolveBindingKind(chunkName, exportedName, chunks, importMaps, exportAliasesCache, depth = 0) {
  if (depth > 8) return 'unknown';
  const entry = chunks.get(chunkName);
  if (!entry) return 'unknown';
  if (!exportAliasesCache.has(chunkName)) exportAliasesCache.set(chunkName, exportAliases(entry.ast));
  const local = exportAliasesCache.get(chunkName).get(exportedName) || exportedName;

  for (const stmt of entry.ast.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name?.text === local) return 'hoisted';
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === local) return 'binding';
      }
    }
  }
  // 该 chunk 只是转手：顺着它的 import 继续找
  const hop = importMaps.get(chunkName)?.get(local);
  if (hop) {
    return resolveBindingKind(hop.chunk, hop.exported, chunks, importMaps, exportAliasesCache, depth + 1);
  }
  return 'unknown';
}

/** 顶点可达性：from 能否沿 import 边走到 to。 */
function reaches(graph, from, to, seen = new Set()) {
  if (from === to) return true;
  if (seen.has(from)) return false;
  seen.add(from);
  for (const dep of graph.get(from) || []) {
    if (reaches(graph, dep, to, seen)) return true;
  }
  return false;
}

const findings = [];
let scannedDirs = 0;

for (const dir of DIRS) {
  if (!existsSync(dir)) continue;
  scannedDirs += 1;
  const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
  const chunks = new Map();
  for (const f of files) {
    const text = readFileSync(join(dir, f), 'utf8');
    chunks.set(f, { text, ast: parseChunk(text, f) });
  }

  const graph = new Map();
  const importMaps = new Map();
  for (const [f, { ast }] of chunks) {
    const { imports, deps } = scanImports(ast);
    graph.set(f, deps);
    importMaps.set(f, imports);
  }

  for (const [f, { text, ast }] of chunks) {
    const imports = importMaps.get(f);
    if (!imports || imports.size === 0) continue;
    const aliasCache = new Map();

    const check = (local, node) => {
      const hop = imports.get(local);
      if (!hop || !chunks.has(hop.chunk)) return;
      if (!reaches(graph, hop.chunk, f)) return; // 不成环 → 求值顺序有保障
      const kind = resolveBindingKind(hop.chunk, hop.exported, chunks, importMaps, aliasCache);
      // 函数声明提升：环内提前读也是可调用的，安全。其余（const/let/var/无法判定）都算风险。
      if (kind === 'hoisted') return;
      const start = node.getStart(ast);
      findings.push({
        chunk: f,
        binding: local,
        source: hop.chunk,
        kind,
        snippet: text.slice(Math.max(0, start - 70), start + 70).replace(/\s+/g, ' '),
      });
    };

    for (const stmt of ast.statements) {
      // 只看模块顶层语句；函数/类声明体内由 inDeferredScope 兜住。
      const visit = (node) => {
        if (ts.isIdentifier(node)) {
          if (inDeferredScope(node) || isNamePosition(node)) return;
          const local = node.text;
          if (imports.has(local)) check(local, node);
          return;
        }
        // import/export 子句本身不是取值，跳过
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
        ts.forEachChild(node, visit);
      };
      if (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) continue;
      visit(stmt);
    }
  }
}

if (scannedDirs === 0) {
  const msg = `chunk-init：跳过（产物目录不存在：${DIRS.join(', ')}）。先执行 bun run build:app。`;
  if (STRICT) {
    console.error(msg);
    process.exit(1);
  }
  console.log(msg);
  process.exit(0);
}

if (findings.length === 0) {
  console.log('chunk-init：OK（无「顶层读跨 chunk 常量 + 来源 chunk 反向可达」）');
  process.exit(0);
}

console.error(`chunk-init：发现 ${findings.length} 处风险（模块顶层读取，且来源 chunk 能反向回到本 chunk）：`);
for (const r of findings) {
  console.error(`  ${r.chunk}  读 \`${r.binding}\` ← ${r.source}（定义种类：${r.kind}）`);
  console.error(`     ${r.snippet}`);
}
console.error(
  [
    '',
    '修法（二选一）：',
    '  1) 把这类「纯常量/纯工具」模块并入 vite.config.ts 的 shared-registry 叶子组，切断环；',
    '  2) 消费端改成惰性求值（首次使用时才合并/读取），让求值晚于所有模块初始化。',
    '对象展开（{...X}）不会抛错，只会静默丢数据，别等线上白屏再查。',
  ].join('\n'),
);
process.exit(1);
