#!/usr/bin/env node
/**
 * 前端「禁止写法」门禁：承接原来 ESLint 的 `no-restricted-syntax` 两条选择器。
 *
 * 为什么单独写脚本
 * ----------------
 * Biome 的 linter 没有 `no-restricted-syntax` 等价物（它只提供按规则名开关，不支持自定义
 * AST 选择器），GritQL 插件在 2.6.5 上编译失败。这两条规则又是**语义性**的规范约束：
 * 漏掉的代价不是格式难看，而是绕过统一的时间/实体名格式化出口，各页面自己拼中文日期、
 * 自己读 `friendly_name` 兜底，最终同一个实体在不同页面显示不同名字。
 *
 * 被约束的写法
 * ------------
 * 1. `xxx.toLocaleString('zh-CN', ...)` —— 中文日期/数字必须走
 *    `@/shared/utils/format/locale-format.util` 里的语义化函数（`formatLocaleDate` 等），
 *    否则各处的时区/月日顺序/单位会慢慢漂移。
 * 2. `xxx.attributes.friendly_name` —— 实体展示名必须走 `getEntityDisplayName(entityId, entity)`
 *    （`@/shared/entity/utils/derived.util`），它处理缺名、去后缀、多语言兜底。
 *
 * 豁免方式
 * --------
 * 在违规行**上一行**或同一行写：
 *
 *     // check-restricted-syntax-ignore: <为什么这里必须直写>
 *
 * 理由必填：允许「规范实现本身」豁免，但不允许「懒得改」豁免。没有理由的标记按违规处理。
 *
 * 用法：`node ops/checks/frontend/check_restricted_syntax.mjs [--root <src目录>]`
 * 退出码：0 通过，1 有违规。
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..', 'homeos', 'frontend', 'src');
const ROOT_INDEX = process.argv.indexOf('--root');
const ROOT = ROOT_INDEX > -1 ? path.resolve(process.argv[ROOT_INDEX + 1]) : DEFAULT_ROOT;

/**
 * eslint 时代的规则只覆盖 `src/**` 且 `ignores: ['src/studio/**']`，studio 由单独一块
 * 只开 unused-imports。为了「换掉 linter 不改产品行为」，studio 的存量违规**计数但不阻断**：
 * 改 studio 的展示名解析属于产品改动，应单独一批、带视觉回归地做。
 * 想现在就把 studio 也卡上，加 `--strict`。
 */
const STRICT = process.argv.includes('--strict');
const DEFERRED_PREFIX = path.join('studio', '');

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.mts', '.js', '.mjs']);
const IGNORE_MARKER = /check-restricted-syntax-ignore\s*:\s*\S/;

const RULE_TO_LOCALE = {
  id: 'no-restricted-to-locale-zh-cn',
  message:
    "禁止直接调用 toLocaleString('zh-CN', ...)：中文日期/数字请用 @/shared/utils/format/locale-format.util 中的语义化函数",
};

const RULE_FRIENDLY_NAME = {
  id: 'no-restricted-friendly-name',
  message:
    '禁止直接读取 .attributes.friendly_name：实体展示名请用 getEntityDisplayName(entityId, entity)，见 @/shared/entity/utils/derived.util',
};

/** 递归收集待检查文件。 */
function collectFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      collectFiles(full, out);
      continue;
    }
    const ext = path.extname(entry.name);
    if (SOURCE_EXTS.has(ext) || ext === '.vue') out.push(full);
  }
  return out;
}

/**
 * 取出 `.vue` 的 `<script>` 内容并保持行号对齐。
 *
 * 直接把 `<script>` 之前的字符替换成等量换行，`start` 偏移与原始文件一致 —— 这样
 * 报错行号不需要任何换算，也不会因为 `<template>` 里的同名文本误报。
 */
function extractScript(text, ext) {
  if (ext !== '.vue') return text;
  let result = text.replace(/[\s\S]/g, '\n');
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/g;
  let match = re.exec(text);
  while (match) {
    const start = match.index + match[0].indexOf('>') + 1;
    const body = match[1];
    result = `${result.slice(0, start)}${body}${result.slice(start + body.length)}`;
    match = re.exec(text);
  }
  return result;
}

function scriptKindOf(ext) {
  if (ext === '.tsx' || ext === '.vue') return ts.ScriptKind.TSX;
  if (ext === '.mts') return ts.ScriptKind.TS;
  if (ext === '.mjs' || ext === '.js') return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/** 违规行或其上一行是否有带理由的豁免标记。 */
function hasIgnoreComment(lines, lineIndex) {
  return [lineIndex, lineIndex - 1].some((i) => i >= 0 && IGNORE_MARKER.test(lines[i] ?? ''));
}

function isToLocaleZhCn(node) {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== 'toLocaleString') return false;
  const first = node.arguments[0];
  return Boolean(first && ts.isStringLiteralLike(first) && first.text === 'zh-CN');
}

function isFriendlyNameAccess(node) {
  if (!ts.isPropertyAccessExpression(node) || node.name.text !== 'friendly_name') return false;
  const object = node.expression;
  return ts.isPropertyAccessExpression(object) && object.name.text === 'attributes';
}

/** 主流程：逐文件解析并收集违规。 */
function scanFile(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const ext = path.extname(file);
  const text = extractScript(raw, ext);
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.ES2022,
    true,
    scriptKindOf(ext),
  );
  const lines = text.split('\n');
  const violations = [];

  const report = (node, rule) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    if (hasIgnoreComment(lines, line)) return;
    violations.push({
      file: path.relative(process.cwd(), file),
      line: line + 1,
      column: source.getLineAndCharacterOfPosition(node.getStart(source)).character + 1,
      rule,
      snippet: (lines[line] ?? '').trim().slice(0, 120),
    });
  };

  const visit = (node) => {
    if (isToLocaleZhCn(node)) report(node, RULE_TO_LOCALE);
    if (isFriendlyNameAccess(node)) report(node, RULE_FRIENDLY_NAME);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return violations;
}

if (!fs.existsSync(ROOT)) {
  console.error(`[restricted-syntax] 找不到源码目录：${ROOT}`);
  process.exit(1);
}

const violations = collectFiles(ROOT).flatMap(scanFile);

const deferred = violations.filter((v) =>
  path.relative(ROOT, path.resolve(process.cwd(), v.file)).startsWith(DEFERRED_PREFIX),
);
const blocking = STRICT ? violations : violations.filter((v) => !deferred.includes(v));

if (deferred.length > 0) {
  console.log(
    `[restricted-syntax] studio 存量 ${deferred.length} 处（本期不阻断，改展示名解析需单独一批 + 视觉回归）`,
  );
}

if (blocking.length === 0) {
  console.log(`[restricted-syntax] 通过：${path.relative(process.cwd(), ROOT)}`);
  process.exit(0);
}

console.error(`[restricted-syntax] 发现 ${blocking.length} 处违规：\n`);
for (const v of blocking) {
  console.error(`  ${v.file}:${v.line}:${v.column}  ${v.rule.id}`);
  console.error(`    ${v.snippet}`);
  console.error(
    `    → ${v.rule === RULE_TO_LOCALE ? RULE_TO_LOCALE.message : RULE_FRIENDLY_NAME.message}\n`,
  );
}
console.error(
  '如确属规范实现本身，在违规行上一行加：// check-restricted-syntax-ignore: <理由>',
);
process.exit(1);
