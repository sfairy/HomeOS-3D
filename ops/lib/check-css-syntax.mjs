#!/usr/bin/env node
/**
 * 样式语法门禁：把「构建期只是 WARNING」的 CSS 语法错误升级成构建阻断。
 *
 * 背景：`vite build` 的 esbuild CSS 压缩器只把语法错误报成
 *   ▲ [WARNING] Unexpected "@media" [css-syntax-error]
 * 构建照样 `✓ built in ...` 成功。于是一条「只有选择器、没有声明块」的残缺规则
 * （`.settings-page.rooms-hub,` 后面直接跟 `@media`）在仓库里活了下来：紧随其后的
 * 整段 4K 断点 token 被浏览器当作非法选择器丢弃，而 CI 全绿。
 *
 * 这里复用**构建同一个引擎**（esbuild 的 CSS loader），判定与产物完全一致：
 * esbuild 报什么 warning，这里就报什么错误，不存在「编辑器说错、构建说对」的分歧。
 *
 * 用法（cwd = 包根目录）：
 *   node ../../ops/lib/check-css-syntax.mjs            # 扫描 ./src
 *   node ../ops/lib/check-css-syntax.mjs frontend/src  # 指定相对目录
 * 退出码 1 = 存在语法错误。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import * as esbuild from 'esbuild';

/** 预处理语言的 <style> 块交给各自的编译链，这里只管纯 CSS。 */
const PREPROCESSOR = /lang\s*=\s*["'](scss|sass|less|styl|stylus|postcss)/i;

/**
 * 已知且无害的 esbuild 告警，按 id 放行。
 *
 * - `invalid-@import`：Tailwind v4 的 `@import "tailwindcss"` 之后还要写 `@config`，
 *   而 `@config` 对 esbuild 是未知 at-rule，于是紧随其后的
 *   `@import "./hos-dropdown-theme.css"` 被判成「@import 不在最前」。
 *   Vite 的 CSS 插件仍会把它内联进产物（已验证 --hos-dd-* 令牌出现在 dist），
 *   所以这是误报。放行它，但**不放行** `css-syntax-error`。
 */
const IGNORED_WARNING_IDS = new Set(['invalid-@import']);

const target = resolve(process.cwd(), process.argv[2] ?? 'src');
if (!statSync(target, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`样式语法检查：找不到目录 ${target}`);
  process.exit(1);
}

/** @type {{ file: string, line: number, text: string }[]} */
const problems = [];
let cssFiles = 0;
let vueBlocks = 0;

/**
 * 用 esbuild 的 CSS loader 解析一段样式文本，收集语法告警。
 * @param {string} code 样式源码
 * @param {string} file 所属文件（报错定位用）
 * @param {number} lineBase 该段在文件中的起始行偏移（.vue 的 <style> 用）
 */
function check(code, file, lineBase) {
  if (!code.trim()) return;
  let result;
  try {
    result = esbuild.transformSync(code, { loader: 'css', minify: true, legalComments: 'none' });
  } catch (error) {
    // 抛异常是硬错误（例如括号彻底不配对），把 esbuild 的位置信息带出来。
    const detail = error.errors?.[0];
    problems.push({
      file,
      line: lineBase + (detail?.location?.line ?? 1),
      text: detail?.text ?? error.message,
    });
    return;
  }
  for (const warning of result.warnings) {
    if (warning.id && IGNORED_WARNING_IDS.has(warning.id)) continue;
    problems.push({
      file,
      line: lineBase + (warning.location?.line ?? 1),
      text: `${warning.text}${warning.id ? ` [${warning.id}]` : ''}`,
    });
  }
}

/**
 * 遍历源码树。
 * @param {string} dir 当前目录
 */
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path);
      continue;
    }
    if (entry.name.endsWith('.css')) {
      cssFiles += 1;
      check(readFileSync(path, 'utf8'), path, 0);
      continue;
    }
    if (!entry.name.endsWith('.vue')) continue;
    const source = readFileSync(path, 'utf8');
    for (const block of source.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/gi)) {
      if (PREPROCESSOR.test(block[1] ?? '')) continue;
      vueBlocks += 1;
      const bodyStart = block.index + block[0].indexOf('>') + 1;
      const lineBase = source.slice(0, bodyStart).split('\n').length - 1;
      check(block[2], path, lineBase);
    }
  }
}

walk(target);

const scope = `${cssFiles} 个 .css + ${vueBlocks} 个 .vue <style> 块`;
if (problems.length === 0) {
  console.log(`样式语法检查通过：${scope}`);
  process.exit(0);
}

console.error(`样式语法错误 ${problems.length} 处（检查范围：${scope}）\n`);
for (const { file, line, text } of problems) {
  console.error(`  ${relative(process.cwd(), file)}:${line}  ${text}`);
}
console.error(
  '\n提示：这类错误的典型成因是「只有选择器、没有声明块」的残缺规则，' +
    '它会把紧随其后的 @media / 下一条规则吞进选择器。修掉残缺选择器即可，不要靠关闭校验绕过。',
);
process.exit(1);
