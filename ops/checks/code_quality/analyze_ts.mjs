/**
 * TS/Vue 侧离线静态分析：未使用导出/局部声明、无用文件、不可达语句、重复实现、循环内不变量候选。
 *
 * 判定保持保守：任一 import（含 `export {x} from`、`export *` 可达闭包、模板标识符、字符串出现）
 * 都算作使用；studio/runtime、studio/shims、packages 公共面只报告不删除。
 * 输出确定性 JSON，供 run.mjs 合并。
 */
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const args = process.argv.slice(2);
const repoArg = args.indexOf('--repo');
const repo = resolve(repoArg >= 0 ? args[repoArg + 1] : '.');
const outArg = args.indexOf('--out');
const outFile = outArg >= 0 ? args[outArg + 1] : '';

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.venv',
  '.venv-store',
  '__pycache__',
  'vendor',
  'reports',
]);
const SOURCE_ROOTS = [
  'homeos/frontend/src',
  'homeos-store/frontend/src',
  'packages/shared/src',
  'packages/shared-i18n/src',
  'ops',
];
const TRACKED_EXT = new Set(['.ts', '.tsx', '.vue', '.mjs', '.js']);
const ANALYZE_EXT = new Set(['.ts', '.tsx', '.vue']);
const ENTRY_DIRS = ['homeos/frontend/src/studio/runtime', 'homeos/frontend/src/studio/shims'];
const PUBLIC_DIRS = ['packages/'];
const SKIP_FINDINGS = ['homeos/frontend/src/studio/runtime/', 'homeos/frontend/src/studio/shims/', 'packages/'];

const stats = { files: 0, parsed: 0, parseErrors: [] };

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (TRACKED_EXT.has(extname(entry.name))) out.push(full);
  }
  return out;
}

function rel(p) {
  return relative(repo, p).split('\\').join('/');
}

function isUnder(file, prefix) {
  return file.startsWith(prefix);
}

function isAnalyzed(file) {
  return ANALYZE_EXT.has(extname(file));
}

function isInsideRoots(file) {
  return SOURCE_ROOTS.some((root) => isUnder(file, `${root}/`));
}

function isEntrySurface(file) {
  return ENTRY_DIRS.some((dir) => isUnder(file, `${dir}/`)) || PUBLIC_DIRS.some((dir) => isUnder(file, dir));
}

function isSkippedForFindings(file) {
  return SKIP_FINDINGS.some((prefix) => isUnder(file, prefix));
}

function lineOf(sf, pos) {
  return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

function endLineOf(sf, node) {
  return sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
}

function hasModifier(node, kind) {
  return Boolean(node.modifiers?.some((m) => m.kind === kind));
}

function scriptBlocks(file, text) {
  if (!file.endsWith('.vue')) return [{ text, offsetLines: 0 }];
  const blocks = [];
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(text))) {
    const before = text.slice(0, match.index + match[0].indexOf(match[1]));
    const offsetLines = (before.match(/\n/g) || []).length;
    blocks.push({ text: match[1], offsetLines });
  }
  return blocks;
}

function templateNames(file, text) {
  const names = new Set();
  if (!file.endsWith('.vue')) return names;
  const re = /<template\b[^>]*>([\s\S]*)<\/template>/gi;
  let match;
  while ((match = re.exec(text))) {
    for (const word of match[1].matchAll(/\b[A-Za-z_$][\w$]*\b/g)) names.add(word[0]);
  }
  return names;
}

function parseFile(absPath) {
  const text = readFileSync(absPath, 'utf8');
  const file = rel(absPath);
  const blocks = scriptBlocks(file, text);
  const templates = templateNames(file, text);
  if (process.env.QC_DEBUG_FILE && file.endsWith(process.env.QC_DEBUG_FILE)) {
    process.stderr.write(`DBG ${file} templates=${templates.size} hasTableLabel=${templates.has('tableLabel')}\n`);
  }
  const records = { file, exports: [], imports: [], statements: [], refs: new Map(), dyn: [], templateNames: templates, blocks: [] };
  for (const block of blocks) {
    const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(file, block.text, ts.ScriptTarget.Latest, true, kind);
    if (sf.parseDiagnostics?.length) {
      stats.parseErrors.push(`${file}: ${sf.parseDiagnostics.length} diagnostic(s)`);
      continue;
    }
    const line = (pos) => lineOf(sf, pos) + block.offsetLines;
    const endLine = (node) => endLineOf(sf, node) + block.offsetLines;
    records.blocks.push({ sf, offsetLines: block.offsetLines });
    records.statements.push({ sf, line, endLine, offsetLines: block.offsetLines });
    collectTopLevel(sf, sf, records, line, endLine);
    collectRefs(sf, records);
    for (const name of templates) addRef(records, name);
    collectDynamic(sf, sf, records);
    stats.parsed += 1;
  }
  return records;
}

function addRef(records, name) {
  records.refs.set(name, (records.refs.get(name) || 0) + 1);
}

function collectTopLevel(sf, scope, records, line, endLine) {
  for (const stmt of scope.statements) {
    const exported = hasModifier(stmt, ts.SyntaxKind.ExportKeyword);
    const isDefault = hasModifier(stmt, ts.SyntaxKind.DefaultKeyword);
    if (ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt) || ts.isEnumDeclaration(stmt)) {
      if (exported || isDefault) {
        records.exports.push({
          name: stmt.name?.text ?? '',
          kind: ts.SyntaxKind[stmt.kind],
          line: line(stmt.getStart(sf)),
          endLine: endLine(stmt),
          body: null,
          sf,
        });
      }
    } else if (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) {
      const name = stmt.name?.text ?? '';
      if (exported || isDefault) {
        records.exports.push({
          name: isDefault ? 'default' : name,
          kind: ts.SyntaxKind[stmt.kind],
          line: line(stmt.getStart(sf)),
          endLine: endLine(stmt),
          body: ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt) ? stmt : null,
          sf,
        });
      } else if (name) {
        records.statements.push({ kind: 'decl', name, line: line(stmt.getStart(sf)), endLine: endLine(stmt), sf });
      }
    } else if (ts.isVariableStatement(stmt)) {
      const decls = stmt.declarationList.declarations;
      if (exported) {
        for (const decl of decls) {
          const names = collectBindingNames(decl.name);
          for (const name of names) {
            records.exports.push({
              name,
              kind: 'Variable',
              line: line(decl.getStart(sf)),
              endLine: endLine(decl),
              body: decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) ? decl.initializer : null,
              sf,
            });
          }
        }
      } else {
        for (const decl of decls) {
          for (const name of collectBindingNames(decl.name)) {
            records.statements.push({ kind: 'decl', name, line: line(decl.getStart(sf)), endLine: endLine(decl), sf });
          }
        }
      }
    } else if (ts.isExportDeclaration(stmt)) {
      const moduleSpec = stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier) ? stmt.moduleSpecifier.text : '';
      if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
        const sourceNames = [];
        for (const el of stmt.exportClause.elements) {
          records.exports.push({
            name: el.name.text,
            kind: 'ReExport',
            line: line(el.getStart(sf)),
            endLine: endLine(el),
            from: moduleSpec,
            sf,
          });
          if (moduleSpec) sourceNames.push(el.propertyName?.text ?? el.name.text);
        }
        if (sourceNames.length) {
          records.imports.push({ spec: moduleSpec, names: sourceNames, line: line(stmt.getStart(sf)) });
        }
      }
      records.imports.push({ spec: moduleSpec, names: [], reexportAll: !stmt.exportClause, line: line(stmt.getStart(sf)) });
    } else if (ts.isImportDeclaration(stmt) && stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const names = [];
      const clause = stmt.importClause;
      if (clause) {
        if (clause.name) names.push('default');
        const bindings = clause.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) names.push('*');
        if (bindings && ts.isNamedImports(bindings)) {
          for (const el of bindings.elements) names.push(el.propertyName?.text ?? el.name.text);
        }
      }
      records.imports.push({ spec: stmt.moduleSpecifier.text, names, line: line(stmt.getStart(sf)) });
    } else if (ts.isImportEqualsDeclaration(stmt)) {
      records.imports.push({ spec: stmt.moduleReference.getText(sf), names: ['*'], line: line(stmt.getStart(sf)) });
    }
  }
}

function collectBindingNames(nameNode) {
  const names = [];
  if (ts.isIdentifier(nameNode)) {
    names.push(nameNode.text);
  } else if (ts.isObjectBindingPattern(nameNode) || ts.isArrayBindingPattern(nameNode)) {
    for (const el of nameNode.elements) {
      if (ts.isBindingElement(el)) names.push(...collectBindingNames(el.name));
    }
  }
  return names;
}

function collectRefs(sf, records) {
  const visit = (node) => {
    if (ts.isIdentifier(node)) addRef(records, node.text);
    else if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name)) addRef(records, node.name.text);
    else if (ts.isJsxAttribute(node) && node.name) addRef(records, node.name.getText(sf));
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

function collectDynamic(node, scope, records) {
  const visit = (n) => {
    if (ts.isCallExpression(n)) {
      const expr = n.expression;
      const text = expr.getText(scope);
      if (text === 'import' || text === 'require' || text === 'import.meta.glob' || text.endsWith('.glob')) {
        for (const arg of n.arguments) records.dyn.push({ line: lineOf(scope, n.getStart(scope)), text: arg.getText(scope).slice(0, 120) });
      }
      if (text.endsWith('.define') && n.arguments.length) {
        records.dyn.push({ line: lineOf(scope, n.getStart(scope)), text: text.slice(0, 120) });
      }
    }
    if (ts.isElementAccessExpression(n) && n.argumentExpression && ts.isStringLiteral(n.argumentExpression)) {
      records.dyn.push({ line: lineOf(scope, n.getStart(scope)), text: n.argumentExpression.text });
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
}

function resolveSpec(fromFile, spec) {
  if (!spec || (!spec.startsWith('.') && !spec.startsWith('@/') && !spec.startsWith('@app/') && !spec.startsWith('@runtime/') && !spec.startsWith('@store/'))) return null;
  let base;
  const srcRoot = fromFile.startsWith('homeos-store/')
    ? join(repo, 'homeos-store/frontend/src')
    : fromFile.startsWith('packages/')
      ? join(repo, fromFile.split('/src/')[0], 'src')
      : join(repo, 'homeos/frontend/src');
  if (spec.startsWith('@/')) base = join(srcRoot, spec.slice(2));
  else if (spec.startsWith('@app/')) base = join(repo, 'homeos/frontend/src/studio/app', spec.slice(5));
  else if (spec.startsWith('@runtime/')) base = join(repo, 'homeos/frontend/src/studio/runtime', spec.slice(9));
  else if (spec.startsWith('@store/')) base = join(repo, 'homeos-store/frontend/src', spec.slice(7));
  else base = resolve(join(repo, fromFile, '..'), spec.split('?')[0]);
  const jsSuffix = base.endsWith('.js') ? base.slice(0, -3) : null;
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.vue`, join(base, 'index.ts'), join(base, 'index.vue')];
  if (jsSuffix) candidates.push(`${jsSuffix}.ts`, `${jsSuffix}.tsx`, join(jsSuffix, 'index.ts'));
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return rel(candidate);
    } catch {
      // try next
    }
  }
  return null;
}

function main() {
  const allFiles = walk(repo);
  stats.files = allFiles.length;
  const analyzed = allFiles.filter(isAnalyzed);
  const files = analyzed.filter((abs) => isInsideRoots(rel(abs)));
  if (process.env.QC_DEBUG) {
    process.stderr.write(`all=${allFiles.length} analyzed=${analyzed.length} inside=${files.length} sample=${analyzed[0]}\n`);
    process.stderr.write(`rel=${analyzed[0] ? rel(analyzed[0]) : '-'} inside0=${analyzed[0] ? isInsideRoots(rel(analyzed[0])) : '-'}\n`);
  }
  const records = files.map((abs) => {
    try {
      return parseFile(abs);
    } catch (error) {
      stats.parseErrors.push(`${rel(abs)}: ${error.message}`);
      return null;
    }
  }).filter(Boolean);
  const byFile = new Map(records.map((r) => [r.file, r]));
  const dynSpecs = [];
  for (const rec of records) {
    for (const item of rec.dyn) {
      const spec = item.text.replace(/^['"`]|['"`]$/g, '');
      if (spec.startsWith('.') || spec.startsWith('@/') || spec.startsWith('@app/') || spec.startsWith('@runtime/') || spec.startsWith('@store/')) {
        dynSpecs.push({ file: rec.file, spec });
      }
    }
  }

  const importedNames = new Set();
  const importedFiles = new Set();
  for (const item of dynSpecs) {
    const target = resolveSpec(item.file, item.spec);
    if (target) {
      importedFiles.add(target);
      // 动态 import 的具名解构无法静态枚举；按命名空间整体使用处理（保守，宁可不报死）。
      const targetRec = byFile.get(target);
      if (targetRec) for (const exp of targetRec.exports) importedNames.add(exp.name);
    }
  }
  const reexportAll = [];
  for (const rec of records) {
    for (const imp of rec.imports) {
      for (const name of imp.names) importedNames.add(name);
      const target = resolveSpec(rec.file, imp.spec);
      if (target) importedFiles.add(target);
      if (imp.reexportAll) reexportAll.push({ from: rec.file, spec: imp.spec });
    }
    for (const exp of rec.exports) {
      if (exp.from) {
        importedNames.add(exp.name);
        const target = resolveSpec(rec.file, exp.from);
        if (target) importedFiles.add(target);
      }
    }
  }
  for (const rec of records) {
    for (const imp of rec.imports) {
      if (!imp.names.includes('*')) continue;
      const target = resolveSpec(rec.file, imp.spec);
      const targetRec = target ? byFile.get(target) : null;
      if (!targetRec) continue;
      for (const exp of targetRec.exports) importedNames.add(exp.name);
    }
  }
  // `export *` 可达闭包：目标文件所有导出都视为已使用（桶文件语义）
  const queue = reexportAll.slice();
  const closureSeen = new Set(queue.map((item) => `${item.from}:${item.spec}`));
  while (queue.length) {
    const item = queue.pop();
    const target = resolveSpec(item.from, item.spec);
    if (!target) continue;
    const targetRec = byFile.get(target);
    if (!targetRec) continue;
    for (const exp of targetRec.exports) importedNames.add(exp.name);
    for (const imp of targetRec.imports) {
      if (!imp.reexportAll) continue;
      const key = `${target}:${imp.spec}`;
      if (closureSeen.has(key)) continue;
      closureSeen.add(key);
      queue.push({ from: target, spec: imp.spec });
    }
  }

  const findings = [];
  const add = (item) => findings.push(item);

  for (const rec of records) {
    if (isSkippedForFindings(rec.file)) continue;
    for (const exp of rec.exports) {
      if (!exp.name || exp.name === 'default') continue;
      if (importedNames.has(exp.name)) continue;
      const risk = rec.dyn.filter((d) => d.text.includes(exp.name)).map((d) => `${rec.file}:${d.line} ${d.text}`);
      add({
        type: 'dead',
        labels: ['dead'],
        path: rec.file,
        line_start: exp.line,
        line_end: exp.endLine,
        symbol: `export ${exp.kind} ${exp.name}`,
        evidence: `${stats.files} 个文件范围内无 import/re-export/模板引用`,
        impact: isEntrySurface(rec.file) ? '入口/公共面导出，删除会破坏 URL 或外部契约' : '未被引用的导出面；删除或去掉 export 不改变运行时',
        action: isEntrySurface(rec.file) || rec.file.endsWith('.d.ts') ? 'manual-confirm' : 'remove-export',
        manual: isEntrySurface(rec.file) || rec.file.endsWith('.d.ts') || risk.length > 0,
        dynamic_risk: risk,
        meta: { entrySurface: isEntrySurface(rec.file) },
      });
    }
    for (const stmt of rec.statements) {
      if (stmt.kind !== 'decl' || rec.file.endsWith('.d.ts')) continue;
      const count = rec.refs.get(stmt.name) || 0;
      if (count > 1) continue;
      const inTemplate = rec.templateNames.has(stmt.name);
      const dyn = rec.dyn.filter((d) => d.text.includes(stmt.name));
      add({
        type: 'dead',
        labels: ['dead'],
        path: rec.file,
        line_start: stmt.line,
        line_end: stmt.endLine,
        symbol: `const/local ${stmt.name}`,
        evidence: `文件内标识符出现 ${count} 次（仅声明）${inTemplate ? '；模板中出现' : ''}`,
        impact: '模块内部未使用符号',
        action: inTemplate || dyn.length ? 'manual-confirm' : 'remove',
        manual: inTemplate || dyn.length > 0 || isEntrySurface(rec.file),
        dynamic_risk: dyn.map((d) => `${rec.file}:${d.line} ${d.text}`),
        meta: {},
      });
    }
    // 重复实现：函数体结构归一化完全一致
  }

  const dupGroups = new Map();
  for (const rec of records) {
    const seen = new Set();
    const visit = (node, sf, offsetLines) => {
      const isFn = ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)
        || ts.isArrowFunction(node) || ts.isFunctionExpression(node);
      if (isFn && node.body && ts.isBlock(node.body) && node.body.statements.length >= 6) {
        const startLine = lineOf(sf, node.getStart(sf)) + offsetLines;
        const endLine = endLineOf(sf, node) + offsetLines;
        if (endLine - startLine + 1 >= 15) {
          const name = node.name?.text || '<anonymous>';
          const key = `${startLine}:${endLine}:${name}`;
          if (!seen.has(key)) {
            seen.add(key);
            const sig = tokenSignature(node.body, sf);
            const list = dupGroups.get(sig) || [];
            list.push({ file: rec.file, line: startLine, endLine, name });
            dupGroups.set(sig, list);
          }
        }
      }
      ts.forEachChild(node, (child) => visit(child, sf, offsetLines));
    };
    for (const block of rec.blocks) visit(block.sf, block.sf, block.offsetLines);
  }
  for (const members of dupGroups.values()) {
    if (members.length < 2) continue;
    const locations = members.map((m) => `${m.file}:${m.line}-${m.endLine}`).join('、');
    for (const member of members) {
      add({
        type: 'duplicate',
        labels: ['duplicate'],
        path: member.file,
        line_start: member.line,
        line_end: member.endLine,
        symbol: `function ${member.name}`,
        evidence: `与另外 ${members.length - 1} 处函数体结构归一化后完全一致：${locations}`,
        impact: `重复实现共 ${members.length} 处；修复需同步所有副本`,
        action: 'extract-helper',
        manual: false,
        dynamic_risk: [],
        meta: { group_size: members.length, group_locations: locations },
      });
    }
  }

  for (const rec of records) {
    if (isSkippedForFindings(rec.file)) continue;
    // 未引用文件（保守：仅报告，不自动删）
    if (!importedFiles.has(rec.file) && !isEntrySurface(rec.file) && !isEntryLike(rec.file)) {
      add({
        type: 'dead',
        labels: ['dead', 'unused-file'],
        path: rec.file,
        line_start: 1,
        line_end: Math.max(1, readFileSync(join(repo, rec.file), 'utf8').split('\n').length),
        symbol: 'file',
        evidence: '无法从任何被分析文件解析到 import 边（动态 import 已计入解析）',
        impact: '可能是路由/清单驱动的懒加载入口；删除前需确认',
        action: 'manual-confirm',
        manual: true,
        dynamic_risk: [],
        meta: {},
      });
    }
  }

  findings.sort((a, b) => (a.path === b.path ? a.line_start - b.line_start : a.path < b.path ? -1 : 1));
  const payload = {
    analyzer: 'analyze_ts.mjs',
    files: stats.files,
    parsed: stats.parsed,
    parseErrors: stats.parseErrors,
    findings,
    stats: { byType: countByType(findings) },
  };
  const text = JSON.stringify(payload, null, 2);
  if (outFile) require('node:fs').writeFileSync(outFile, `${text}\n`);
  else process.stdout.write(`${text}\n`);
}

function isEntryLike(file) {
  return /\/(main|index)\.(ts|tsx|vue)$/.test(file) || file.includes('vite.config') || file.includes('vite-');
}

function countByType(findings) {
  const out = {};
  for (const item of findings) out[item.type] = (out[item.type] || 0) + 1;
  return out;
}

function tokenSignature(node, sf) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, node.getText(sf));
  const parts = [];
  let tok = scanner.scan();
  while (tok !== ts.SyntaxKind.EndOfFileToken) {
    if (tok === ts.SyntaxKind.Identifier || tok === ts.SyntaxKind.PrivateIdentifier) parts.push('ID');
    else if (tok >= ts.SyntaxKind.FirstLiteralToken && tok <= ts.SyntaxKind.LastLiteralToken) parts.push('LIT');
    else if (tok === ts.SyntaxKind.TemplateHead || tok === ts.SyntaxKind.TemplateMiddle || tok === ts.SyntaxKind.TemplateTail || tok === ts.SyntaxKind.NoSubstitutionTemplateLiteral) parts.push('TMPL');
    else parts.push(String(tok));
    tok = scanner.scan();
  }
  return parts.join(',');
}


main();
