#!/usr/bin/env node
/**
 * 构建期混淆业务 JavaScript，写入原路径（就地替换）。
 *
 * 只针对**主应用**（`dist/homeos/frontend`）。商店（`dist/homeos-store/frontend`）是自用
 * 后台，不混淆：`build:store` 不再调用本脚本，`obfuscate_javascript.mjs` 也不再接受该目录。
 *
 * `homeos/frontend/public/static/vendor/`（three / hls.js / mdi / meteocons /
 * meshoptimizer / qrcode-generator）是第三方插件：构建时由 Vite 原样复制到
 * `dist/<项目>/frontend/static/vendor/`，**整棵子树都不混淆**。它们不是本项目代码，
 * 混淆只会破坏与上游的一致性（ESM 说明符、sourcemap、许可证正文），没有保护收益。
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";


process.env.CI ??= "1";

const { default: JavaScriptObfuscator } = await import("javascript-obfuscator");

/**
 * 第三方代码目录名。按目录名而不是绝对路径判断：`public/` 会被构建原样搬到
 * `dist/<项目>/frontend/static/`，路径前缀随 target 变化，目录名不变。
 */
const THIRD_PARTY_DIR_NAME = "vendor";
const SKIP_DIR_NAMES = new Set([THIRD_PARTY_DIR_NAME, "node_modules", ".git"]);
const SKIP_FILE_SUFFIXES = [".min.js", ".min.mjs"];
const SKIP_FILE_NAMES = new Set([
  "hls.min.js",
]);

/**
 * 只做「标识符改名 + 紧凑」，**不再开启字符串数组 / 控制流平坦化 / 数字表达式化 /
 * splitStrings**。这不是保守，是实测结论（同一份 `vendor-vue` 产物，gzip -9）：
 *
 *   配置                        raw      gzip    解析+编译
 *   Vite 压缩后原始             207KB     76KB     2.7ms
 *   旧配置（上列全开 + base64） 1496KB    531KB    10.0ms
 *   本配置（仅改名）             400KB    122KB     3.2ms
 *
 * 换成整份产物看（`build:frontend` 前后各测一次，同一批文件，仅主应用）：
 *
 *   `static/assets/*.js`（66 个）   raw        gzip
 *   不混淆                          5.87MB     1.79MB
 *   旧配置                         33.13MB    11.48MB   (5.6x / 6.4x)
 *   本配置                          9.44MB     2.52MB   (1.6x / 1.4x)
 *
 * 首屏 12 个 js 引用：gzip 261KB → 旧配置 1591KB（6.1x），本配置 364KB（1.4x）。
 * 全量 352 个文件：7.76MB → 12.70MB（1.64x），耗时约 11s。
 *
 * 膨胀几乎全部来自 `stringArray`（含包装器链）与 `controlFlowFlattening`：前者让每个
 * 字符串字面量变成 `_0x…[n]` 查表，后者把函数体拆成 switch 状态机，V8 既难压缩也难
 * 优化 —— 而 gzip 对 base64 高熵数据无效（压缩率 31% → 35%），服务端压不回原来的
 * 量级。单项消融（`vendor-vue`）：去掉 `controlFlowFlattening` 仍是 5.5x，把
 * `stringArrayEncoding` 换成 none 仍有 7.2x，说明是这两族选项本身，不是 base64。
 *
 * 收益侧几乎没有损失：这类变换本来就能被 de4js / webcrack 整份还原，真正的授权与
 * 密钥校验在后端（前端不持有任何秘密）。所以这里换掉的是「体积与执行速度」，
 * 保留的是「不想被人一眼读懂」的最低成本形态。
 */
const OBFUSCATOR_OPTIONS = {
  compact: true,
  identifierNamesGenerator: "hexadecimal",
  ignoreImports: true,
  log: false,
  renameGlobals: false,
  renameProperties: false,
  reservedNames: ["^homeos", "^THREE$", "^Hls$", "^jQuery$", "^\\$"],
  seed: 0x486f6d65,
  selfDefending: false,
  simplify: true,
  target: "browser",
  sourceMap: false,
  // 显式关掉（而不是「删掉这行靠默认值」）：这些选项一旦被默认值或后来者打开，
  // 就是上面那组 5.6x 的体积回归，必须保持可读的 false。
  controlFlowFlattening: false,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  numbersToExpressions: false,
  splitStrings: false,
  stringArray: false,
  stringArrayCallsTransform: false,
  stringArrayEncoding: ["none"],
  stringArrayThreshold: 0,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
};

function shouldSkipFile(filePath) {
  const base = path.basename(filePath);
  if (SKIP_FILE_NAMES.has(base)) return true;
  if (SKIP_FILE_SUFFIXES.some((suffix) => base.endsWith(suffix))) return true;
  const parts = filePath.split(path.sep);
  return parts.some((part) => SKIP_DIR_NAMES.has(part));
}

/** 递归统计目录下的 .js/.mjs 数量：只用于构建日志里交代跳过了多少第三方文件。 */
function countJavaScriptFiles(rootDir) {
  let count = 0;
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && /\.m?js$/.test(entry.name)) {
        count += 1;
      }
    }
  }
  return count;
}

/**
 * 列出待混淆文件，并统计被跳过的第三方目录（`vendor/`）文件数。
 * 第三方目录整棵子树都不进入 `results`：其中的 .js/.mjs 一律不混淆。
 */
function listJavaScriptFiles(rootDir) {
  const results = [];
  let thirdPartyFiles = 0;
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === THIRD_PARTY_DIR_NAME) {
          thirdPartyFiles += countJavaScriptFiles(fullPath);
          continue;
        }
        if (!SKIP_DIR_NAMES.has(entry.name)) stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!(entry.name.endsWith(".js") || entry.name.endsWith(".mjs"))) continue;
      if (shouldSkipFile(fullPath)) continue;
      results.push(fullPath);
    }
  }
  return { files: results.sort(), thirdPartyFiles };
}

function looksLikeModule(source) {
  return /^\s*(import|export)\b/m.test(source) || /\bimport\s*\(/.test(source);
}

function obfuscateFile(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  if (!source.trim()) return { skipped: true, reason: "empty" };

  const options = {
    ...OBFUSCATOR_OPTIONS,
    sourceMap: false,
  };


  const result = JavaScriptObfuscator.obfuscate(source, options);
  const code = result.getObfuscatedCode();
  if (!code || code.length < 1) {
    throw new Error(`混淆结果为空: ${filePath}`);
  }

  if (looksLikeModule(source) && !/\b(import|export)\b/.test(code)) {
    throw new Error(`ESM 混淆后丢失 import/export: ${filePath}`);
  }
  fs.writeFileSync(filePath, code, "utf8");
  return {
    skipped: false,
    before: source.length,
    after: code.length,
  };
}

function main() {
  const targets = process.argv.slice(2);
  if (!targets.length) {
    console.error("用法: node obfuscate_javascript.mjs <dir> [dir...]");
    process.exit(2);
  }

  let total = 0;
  let bytesIn = 0;
  let bytesOut = 0;
  for (const target of targets) {
    const root = path.resolve(target);
    if (!fs.existsSync(root)) {
      throw new Error(`目录不存在: ${root}`);
    }
    const { files, thirdPartyFiles } = listJavaScriptFiles(root);
    console.log(
      `混淆 ${root}（${files.length} 个文件；跳过第三方 ${THIRD_PARTY_DIR_NAME}/ ${thirdPartyFiles} 个）`,
    );
    for (const filePath of files) {
      const outcome = obfuscateFile(filePath);
      if (outcome.skipped) continue;
      total += 1;
      bytesIn += outcome.before;
      bytesOut += outcome.after;
      console.log(`  OK ${path.relative(process.cwd(), filePath)} (${outcome.before} -> ${outcome.after})`);
    }
  }
  console.log(
    `完成：混淆 ${total} 个文件，${bytesIn} -> ${bytesOut} bytes`,
  );
}

main();
