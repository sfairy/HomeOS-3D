#!/usr/bin/env node
/**
 * Studio 标识符重命名应用器（Phase 4）。
 *
 * 输入 JSON 数组，每项：{ file, line, col?, name, newName, allowExport? }
 * - file 为仓库相对路径；line/col 为 1-based。
 * - 先做 dry-run，输出每个符号的引用位置数；--write 才落盘。
 * - 使用 TypeScript Language Service 的 findRenameLocations，跨文件安全重命名。
 * - 默认拒绝 exported 声明；新拆分模块内部导出可用 allowExport:true。
 * - 只允许改动 homeos/frontend/src/studio/** 与 scripts/../studio 内文件。
 *
 * 用法:
 *   node ops/checks/studio/apply_renames.mjs renames.json [--write] [--json]
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const args = process.argv.slice(2);
const mappingPath = args.find((a) => !a.startsWith("--"));
const write = args.includes("--write");
const asJson = args.includes("--json");
if (!mappingPath) {
  console.error("usage: apply_renames.mjs <renames.json> [--write] [--json]");
  process.exit(2);
}
const repoRoot = path.resolve(import.meta.dirname, "../../..");
const studioRoot = path.join(repoRoot, "homeos/frontend/src/studio");
const renames = JSON.parse(fs.readFileSync(mappingPath, "utf8"));
if (!Array.isArray(renames) || renames.length === 0) {
  console.error("renames.json must be a non-empty array");
  process.exit(2);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.isFile() && p.endsWith(".ts") && !p.endsWith(".d.ts")) out.push(p);
  }
  return out;
}
const rootNames = walk(studioRoot);
const versions = new Map();
const overrides = new Map();
const host = {
  getScriptFileNames: () => rootNames,
  getScriptVersion: (f) => String(versions.get(f) ?? 0),
  getScriptSnapshot: (f) => {
    if (overrides.has(f)) return ts.ScriptSnapshot.fromString(overrides.get(f));
    if (!fs.existsSync(f)) return undefined;
    return ts.ScriptSnapshot.fromString(fs.readFileSync(f, "utf8"));
  },
  getCurrentDirectory: () => repoRoot,
  getCompilationSettings: () => ({
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowJs: false,
    jsx: ts.JsxEmit.Preserve,
    strict: false,
    noEmit: true,
    skipLibCheck: true,
    baseUrl: path.join(repoRoot, "homeos/frontend"),
    paths: { "@/*": ["src/*"] },
  }),
  getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
  fileExists: (f) => overrides.has(f) || fs.existsSync(f),
  readFile: (f) => (overrides.has(f) ? overrides.get(f) : fs.existsSync(f) ? fs.readFileSync(f, "utf8") : undefined),
  readDirectory: ts.sys.readDirectory,
  directoryExists: ts.sys.directoryExists,
  getDirectories: ts.sys.getDirectories,
};
const service = ts.createLanguageService(host, ts.createDocumentRegistry());

function findIdentifier(file, line, col, name) {
  const text = overrides.get(file) ?? fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let found = null;
  const visit = (node) => {
    if (ts.isIdentifier(node) && node.text === name) {
      const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      if (pos.line + 1 === line && (col == null || pos.character + 1 === col)) {
        if (!found) found = node.getStart(sf);
      }
    }
    if (!found) ts.forEachChild(node, visit);
  };
  visit(sf);
  if (found == null && col != null) {
    // 前面的重命名可能改变同一行内的列号；按行+名字回退匹配。
    return findIdentifier(file, line, null, name);
  }
  return found;
}

function isExportedSymbol(file, pos) {
  const program = service.getProgram();
  if (!program) return false;
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(file);
  if (!sf) return false;
  const node = findNodeAt(sf, pos);
  const symbol = node && checker.getSymbolAtLocation(ts.isIdentifier(node) ? node : node);
  if (!symbol) return false;
  return (symbol.declarations ?? []).some((d) => {
    const mods = ts.canHaveModifiers(d) ? ts.getModifiers(d) : undefined;
    return mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword || m.kind === ts.SyntaxKind.DefaultKeyword);
  });
}
function findNodeAt(sf, pos) {
  let found = null;
  const visit = (n) => {
    if (pos >= n.getStart(sf) && pos < n.getEnd() && ts.isIdentifier(n)) found = n;
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

const results = [];
const pendingByFile = new Map();
const orderedRenames = [...renames].sort((a, b) => {
  if (a.file !== b.file) return a.file.localeCompare(b.file);
  if (a.line !== b.line) return b.line - a.line;
  return (b.col ?? 0) - (a.col ?? 0);
});
for (const item of orderedRenames) {
  const file = path.resolve(repoRoot, item.file);
  if (!file.startsWith(studioRoot + path.sep)) {
    results.push({ ...item, ok: false, reason: "outside studio" });
    continue;
  }
  const pos = findIdentifier(file, item.line, item.col ?? null, item.name);
  if (pos == null) {
    results.push({ ...item, ok: false, reason: "identifier not found" });
    continue;
  }
  if (isExportedSymbol(file, pos) && !item.allowExport) {
    results.push({ ...item, ok: false, reason: "exported symbol refused" });
    continue;
  }
  const renameInfo = service.getRenameInfo(file, pos, { allowRenameOfImportPath: false });
  if (!renameInfo.canRename) {
    results.push({ ...item, ok: false, reason: renameInfo.localizedErrorMessage ?? "cannot rename" });
    continue;
  }
  const locations = service.findRenameLocations(file, pos, false, false, {
    providePrefixAndSuffixTextForRename: true,
  });
  if (!locations || locations.length === 0) {
    results.push({ ...item, ok: false, reason: "no rename locations" });
    continue;
  }
  const edits = locations.map((loc) => ({
    file: path.resolve(loc.fileName),
    start: loc.textSpan.start,
    length: loc.textSpan.length,
    text: item.newName,
  }));
  const grouped = new Map();
  for (const edit of edits) {
    if (!grouped.has(edit.file)) grouped.set(edit.file, []);
    grouped.get(edit.file).push(edit);
  }
  for (const [f, list] of grouped) {
    const base = overrides.get(f) ?? fs.readFileSync(f, "utf8");
    let next = base;
    for (const e of [...list].sort((a, b) => b.start - a.start)) {
      next = next.slice(0, e.start) + e.text + next.slice(e.start + e.length);
    }
    overrides.set(f, next);
    versions.set(f, (versions.get(f) ?? 0) + 1);
    if (!pendingByFile.has(f)) pendingByFile.set(f, []);
    pendingByFile.get(f).push({ old: item.name, new: item.newName, count: list.length });
  }
  results.push({ ...item, ok: true, refs: locations.length });
  // 更新后让 Language Service 重新读取快照
  service.getProgram()?.getTypeChecker();
}

const changed = [...pendingByFile.entries()].map(([file, list]) => ({
  file: path.relative(repoRoot, file),
  names: list,
}));
if (write) {
  for (const f of overrides.keys()) fs.writeFileSync(f, overrides.get(f));
}
const report = {
  dryRun: !write,
  requested: renames.length,
  applied: results.filter((r) => r.ok).length,
  failed: results.filter((r) => !r.ok),
  files: changed,
  results,
};
if (asJson) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`${write ? "applied" : "dry-run"}: ${report.applied}/${report.requested} symbols, ${changed.length} files`);
  for (const r of report.failed) console.log(`  FAIL ${r.file}:${r.line} ${r.name}: ${r.reason}`);
  if (report.failed.length) process.exitCode = 1;
}
