#!/usr/bin/env node
/**
 * 全仓标识符重命名应用器（.ts / .vue）。
 *
 * 输入 JSON 数组，每项：
 *   { file, line?, col?, offset?, name, newName, kind?, exported?, scriptSetupTopLevel?,
 *     templateVisible?, allowTemplate?, allowExport? }
 *
 * 安全策略：
 * - 默认 dry-run；--write 才落盘。
 * - 只允许改 SRC_ROOTS 下的文件；--allow-outside 供测试夹具使用。
 * - 默认拒绝导出符号（--allow-export 才允许，本任务不使用）。
 * - script setup 顶层绑定若在模板中出现，默认拒绝；allowTemplate 且模板只出现一次时，
 *   同步改写模板里的那一个标识符。
 * - 简写属性/简写绑定由 TS 的 prefixText/suffixText 处理，保留对象键。
 *
 * 用法:
 *   node ops/checks/naming/rename.mjs renames.json [--write] [--json] [--strict]
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { parse as parseSfc } from "@vue/compiler-sfc";
import {
  REPO_ROOT,
  SRC_ROOTS,
  collectSourceFiles,
  templateOccurrences,
  toRel,
} from "./lib.mjs";

const args = process.argv.slice(2);
const mappingPath = args.find((a) => !a.startsWith("--"));
const write = args.includes("--write");
const asJson = args.includes("--json");
const strict = args.includes("--strict");
const allowOutside = args.includes("--allow-outside");
const allowExport = args.includes("--allow-export");
if (!mappingPath) {
  console.error("usage: rename.mjs <renames.json> [--write] [--json] [--strict] [--allow-outside]");
  process.exit(2);
}
const renames = JSON.parse(fs.readFileSync(path.resolve(mappingPath), "utf8"));
if (!Array.isArray(renames) || renames.length === 0) {
  console.error("renames.json 必须是非空数组");
  process.exit(2);
}

const srcAbs = SRC_ROOTS.map((root) => path.join(REPO_ROOT, root));
const withinRoots = (file) => srcAbs.some((root) => file === root || file.startsWith(root + path.sep));

const RESERVED = new Set(
  "break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with as implements interface let package private protected public static yield async await of".split(
    " ",
  ),
);

const sourceFiles = collectSourceFiles();
const tsFiles = sourceFiles.filter((f) => f.endsWith(".ts"));
const vueFiles = sourceFiles.filter((f) => f.endsWith(".vue"));
const virtuals = new Map();
const vueHosts = new Map();
const versions = new Map();
const overrides = new Map();
const scriptFileNames = [...tsFiles];

function indexVue(realFile, source) {
  let parsed;
  try {
    parsed = parseSfc(source, { filename: realFile });
  } catch (error) {
    throw new Error("SFC 解析失败 " + realFile + ": " + String(error?.message ?? error));
  }
  if (parsed.errors?.length) {
    throw new Error("SFC 解析错误 " + realFile + ": " + parsed.errors.map(String).join("; "));
  }
  const list = [];
  for (const [kind, block] of [
    ["script", parsed.descriptor.script],
    ["scriptSetup", parsed.descriptor.scriptSetup],
  ]) {
    if (!block || !block.content.trim()) continue;
    const name = realFile + ".__" + kind + ".ts";
    const existing = virtuals.get(name);
    const info = existing ?? { name, realFile, kind, blockOffset: 0, content: "", startLine: 1 };
    info.blockOffset = block.loc.start.offset;
    info.startLine = block.loc.start.line;
    info.content = block.content;
    virtuals.set(name, info);
    if (!existing) scriptFileNames.push(name);
    versions.set(name, (versions.get(name) ?? 0) + 1);
    list.push(info);
  }
  vueHosts.set(realFile, list);
  return list;
}

for (const file of vueFiles) {
  try {
    indexVue(file, fs.readFileSync(file, "utf8"));
  } catch (error) {
    console.error("[warn] " + String(error?.message ?? error));
  }
}

// 测试/外部夹具：把输入目标额外加入程序。
const extraSeen = new Set();
for (const item of renames) {
  const file = path.resolve(REPO_ROOT, item.file);
  if (extraSeen.has(file) || !fs.existsSync(file)) continue;
  extraSeen.add(file);
  if (file.endsWith(".ts")) {
    if (!scriptFileNames.includes(file)) scriptFileNames.push(file);
  } else if (file.endsWith(".vue") && !vueHosts.has(file)) {
    indexVue(file, fs.readFileSync(file, "utf8"));
  }
}

const host = {
  getScriptFileNames: () => scriptFileNames,
  getScriptVersion: (f) => String(versions.get(f) ?? 0),
  getScriptSnapshot: (f) => {
    if (virtuals.has(f)) return ts.ScriptSnapshot.fromString(virtuals.get(f).content);
    if (overrides.has(f)) return ts.ScriptSnapshot.fromString(overrides.get(f));
    if (!fs.existsSync(f)) return undefined;
    return ts.ScriptSnapshot.fromString(fs.readFileSync(f, "utf8"));
  },
  getCurrentDirectory: () => REPO_ROOT,
  getCompilationSettings: () => ({
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowJs: false,
    jsx: ts.JsxEmit.Preserve,
    strict: false,
    noEmit: true,
    skipLibCheck: true,
    baseUrl: REPO_ROOT,
    paths: {
      "@/*": ["homeos/frontend/src/*"],
      "@app/*": ["homeos/frontend/src/app/*"],
      "@runtime/*": ["homeos/frontend/src/runtime/*"],
      "@store/*": ["homeos-store/frontend/src/*"],
    },
  }),
  getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
  fileExists: (f) => virtuals.has(f) || overrides.has(f) || fs.existsSync(f),
  readFile: (f) => {
    if (virtuals.has(f)) return virtuals.get(f).content;
    if (overrides.has(f)) return overrides.get(f);
    return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : undefined;
  },
  readDirectory: ts.sys.readDirectory,
  directoryExists: ts.sys.directoryExists,
  getDirectories: ts.sys.getDirectories,
};
const service = ts.createLanguageService(host, ts.createDocumentRegistry());

function textOf(scriptFile) {
  if (virtuals.has(scriptFile)) return virtuals.get(scriptFile).content;
  if (overrides.has(scriptFile)) return overrides.get(scriptFile);
  return fs.readFileSync(scriptFile, "utf8");
}

function realText(realFile) {
  return overrides.get(realFile) ?? fs.readFileSync(realFile, "utf8");
}

function parseScript(scriptFile) {
  return ts.createSourceFile(
    scriptFile,
    textOf(scriptFile),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function findIdentifier(scriptFile, offset, name) {
  const sf = parseScript(scriptFile);
  let exact = null;
  let next = null;
  const visit = (node) => {
    if (ts.isIdentifier(node) && node.text === name) {
      const start = node.getStart(sf);
      if (offset == null) {
        if (exact == null) exact = start;
      } else if (start <= offset && offset <= node.getEnd()) {
        exact = start;
      } else if (start >= offset && (next == null || start < next)) {
        next = start;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return exact ?? next;
}

function findNodeAt(sf, pos) {
  let found = null;
  const visit = (node) => {
    if (pos >= node.getStart(sf) && pos < node.getEnd() && ts.isIdentifier(node)) found = node;
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

function declarationNameNode(node) {
  if (
    (ts.isVariableDeclaration(node) ||
      ts.isParameter(node) ||
      ts.isBindingElement(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node)) &&
    node.name &&
    ts.isIdentifier(node.name)
  ) {
    return node.name;
  }
  if (ts.isImportSpecifier(node) && node.name) return node.name;
  return null;
}

function declarationsInSubtree(root, name) {
  const out = [];
  const visit = (node) => {
    const nameNode = declarationNameNode(node);
    if (nameNode && nameNode.text === name) out.push(nameNode);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return out;
}

function enclosingScopeNode(node) {
  let current = node;
  while (current) {
    if (
      ts.isSourceFile(current) ||
      ts.isBlock(current) ||
      ts.isCatchClause(current) ||
      ts.isForStatement(current) ||
      ts.isForOfStatement(current) ||
      ts.isForInStatement(current) ||
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current) ||
      ts.isConstructorDeclaration(current) ||
      ts.isGetAccessorDeclaration(current) ||
      ts.isSetAccessorDeclaration(current)
    ) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function hasScopeConflict(scriptFile, pos, newName) {
  const program = service.getProgram();
  if (!program) return true;
  const sf = program.getSourceFile(scriptFile);
  if (!sf) return true;
  const node = findNodeAt(sf, pos);
  if (!node) return true;
  const scope = enclosingScopeNode(node);
  if (scope && declarationsInSubtree(scope, newName).length > 0) return true;
  const checker = program.getTypeChecker();
  const target = checker.getSymbolAtLocation(node);
  const flags =
    ts.SymbolFlags.Value |
    ts.SymbolFlags.Type |
    ts.SymbolFlags.Namespace |
    ts.SymbolFlags.Alias;
  for (const symbol of checker.getSymbolsInScope(node, flags)) {
    if (symbol.name !== newName || symbol === target) continue;
    if (symbol.flags & ts.SymbolFlags.Alias) return true;
    if (symbol.declarations?.some((declaration) => declaration.getSourceFile() === sf)) {
      return true;
    }
  }
  return false;
}

function symbolIsExported(scriptFile, pos) {
  const program = service.getProgram();
  if (!program) return false;
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(scriptFile);
  if (!sf) return false;
  const node = findNodeAt(sf, pos);
  if (!node) return false;
  const symbol = checker.getSymbolAtLocation(node);
  if (!symbol) return false;
  const moduleSymbol = checker.getSymbolAtLocation(sf);
  if (!moduleSymbol) return false;
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    let target = exported;
    if (exported.flags & ts.SymbolFlags.Alias) {
      try {
        target = checker.getAliasedSymbol(exported);
      } catch {
        target = exported;
      }
    }
    if (target === symbol) return true;
  }
  return false;
}

function resolveTarget(item) {
  const realFile = path.resolve(REPO_ROOT, item.file);
  if (!allowOutside && !withinRoots(realFile)) {
    throw new Error("outside allowed roots");
  }
  if (!fs.existsSync(realFile)) throw new Error("file not found");
  if (realFile.endsWith(".ts")) {
    if (!scriptFileNames.includes(realFile)) throw new Error("ts file not indexed");
    let offset = item.offset ?? null;
    if (offset == null && item.line != null) {
      const text = textOf(realFile);
      const sf = ts.createSourceFile(realFile, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      offset = sf.getPositionOfLineAndCharacter(Math.max(0, item.line - 1), 0);
    }
    return { realFile, scriptFile: realFile, offset, virtual: null };
  }
  if (realFile.endsWith(".vue")) {
    const source = realText(realFile);
    if (!vueHosts.has(realFile)) indexVue(realFile, source);
    const blocks = vueHosts.get(realFile);
    let offset = item.offset ?? null;
    if (offset == null) {
      const fullSf = ts.createSourceFile(realFile, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      offset = fullSf.getPositionOfLineAndCharacter(Math.max(0, item.line - 1), Math.max(0, (item.col ?? 1) - 1));
    }
    const block = blocks.find(
      (b) => offset >= b.blockOffset && offset <= b.blockOffset + b.content.length,
    );
    if (!block) throw new Error("offset is not inside a script block");
    return {
      realFile,
      scriptFile: block.name,
      offset: offset - block.blockOffset,
      virtual: block,
    };
  }
  throw new Error("only .ts/.vue supported");
}

function mapLocation(loc) {
  const virtual = virtuals.get(loc.fileName) ?? virtuals.get(path.resolve(loc.fileName));
  if (virtual) {
    return {
      realFile: virtual.realFile,
      start: virtual.blockOffset + loc.textSpan.start,
      length: loc.textSpan.length,
    };
  }
  return { realFile: path.resolve(loc.fileName), start: loc.textSpan.start, length: loc.textSpan.length };
}

function applyEdits(text, edits) {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let next = text;
  let lastStart = Infinity;
  for (const edit of sorted) {
    if (edit.start < 0 || edit.start + edit.length > text.length) {
      throw new Error("edit out of range");
    }
    if (edit.start + edit.length > lastStart) throw new Error("overlapping edits");
    next = next.slice(0, edit.start) + edit.text + next.slice(edit.start + edit.length);
    lastStart = edit.start;
  }
  return next;
}

function reindexAndStore(realFile, nextText) {
  overrides.set(realFile, nextText);
  versions.set(realFile, (versions.get(realFile) ?? 0) + 1);
  if (realFile.endsWith(".vue")) {
    try {
      indexVue(realFile, nextText);
    } catch (error) {
      throw new Error("重命名后 SFC 无法重新解析：" + String(error?.message ?? error));
    }
  }
}

const results = [];
const changedFiles = new Set();
const templateRenamed = new Set();

const ordered = [...renames].sort((a, b) => {
  if (a.file !== b.file) return a.file.localeCompare(b.file);
  const ao = a.offset ?? a.line ?? 0;
  const bo = b.offset ?? b.line ?? 0;
  return bo - ao;
});

for (const item of ordered) {
  const base = {
    file: item.file,
    line: item.line,
    col: item.col,
    name: item.name,
    newName: item.newName,
  };
  try {
    if (!item.name || !item.newName) throw new Error("name/newName 必填");
    if (item.name === item.newName) throw new Error("新旧名相同");
    if (!ts.isIdentifierText(item.newName, ts.ScriptTarget.Latest) || RESERVED.has(item.newName)) {
      throw new Error("newName 不是合法标识符");
    }
    const target = resolveTarget(item);
    const pos = findIdentifier(target.scriptFile, target.offset, item.name);
    if (pos == null) throw new Error("identifier not found");
    if ((item.exported || symbolIsExported(target.scriptFile, pos)) && !allowExport) {
      throw new Error("exported symbol refused");
    }
    if (hasScopeConflict(target.scriptFile, pos, item.newName)) {
      throw new Error("new name conflicts in scope");
    }
    const renameInfo = service.getRenameInfo(target.scriptFile, pos, {
      allowRenameOfImportPath: false,
    });
    if (!renameInfo.canRename) {
      throw new Error(renameInfo.localizedErrorMessage ?? "cannot rename");
    }
    const locations = service.findRenameLocations(target.scriptFile, pos, false, false, {
      providePrefixAndSuffixTextForRename: true,
    });
    if (!locations || locations.length === 0) throw new Error("no rename locations");

    const editsByFile = new Map();
    for (const loc of locations) {
      const mapped = mapLocation(loc);
      if (!editsByFile.has(mapped.realFile)) editsByFile.set(mapped.realFile, []);
      editsByFile.get(mapped.realFile).push({
        start: mapped.start,
        length: mapped.length,
        text: (loc.prefixText ?? "") + item.newName + (loc.suffixText ?? ""),
      });
    }

    let templateEdit = null;
    if (target.virtual?.kind === "scriptSetup" && item.scriptSetupTopLevel) {
      const source = realText(target.realFile);
      const parsed = parseSfc(source, { filename: target.realFile });
      const template = parsed.descriptor.template;
      if (template) {
        const occurrences = templateOccurrences(template.content, item.name);
        if (occurrences.length > 0) {
          if (!item.allowTemplate) throw new Error("template-visible; set allowTemplate");
          if (templateRenamed.has(target.realFile)) {
            throw new Error("only one template-renamed binding per .vue per batch");
          }
          const edits = [];
          for (const index of occurrences) {
            const before = template.content.slice(0, index).trimEnd();
            const after = template.content.slice(index + item.name.length).trimStart();
            if (before.endsWith(".") || before.endsWith("?.")) {
              throw new Error("template hit is a property name");
            }
            if (after.startsWith(":")) throw new Error("template hit is an object key");
            if (/<\/?[A-Za-z0-9-]*$/.test(before)) throw new Error("template hit looks like a tag name");
            edits.push({
              start: template.loc.start.offset + index,
              length: item.name.length,
              text: item.newName,
            });
          }
          templateEdit = { realFile: target.realFile, edits };
        }
      }
    }

    for (const [file, edits] of editsByFile) {
      const text = file.endsWith(".vue") ? realText(file) : textOf(file);
      const next = applyEdits(text, edits);
      reindexAndStore(file, next);
      changedFiles.add(file);
    }
    if (templateEdit) {
      const text = realText(templateEdit.realFile);
      const next = applyEdits(text, templateEdit.edits);
      reindexAndStore(templateEdit.realFile, next);
      changedFiles.add(templateEdit.realFile);
      templateRenamed.add(templateEdit.realFile);
    }
    results.push({ ...base, ok: true, refs: locations.length, template: !!templateEdit });
  } catch (error) {
    results.push({ ...base, ok: false, reason: String(error?.message ?? error) });
  }
}

if (write) {
  for (const file of changedFiles) {
    fs.writeFileSync(file, overrides.get(file));
  }
}

const failed = results.filter((r) => !r.ok);
const applied = results.filter((r) => r.ok);
const report = {
  dryRun: !write,
  requested: renames.length,
  applied: applied.length,
  failed,
  files: [...changedFiles].map(toRel),
  results,
};
if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(
    (write ? "已应用" : "dry-run") +
      ": " +
      applied.length +
      "/" +
      renames.length +
      " 个符号，" +
      changedFiles.size +
      " 个文件",
  );
  for (const r of failed) {
    console.log("  FAIL " + r.file + ":" + (r.line ?? "?") + " " + r.name + " -> " + r.newName + "：" + r.reason);
  }
}
if (strict && failed.length) process.exitCode = 1;
