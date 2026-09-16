#!/usr/bin/env node
/**
 * 构建期混淆业务 JavaScript，写入原路径（就地替换）。
 *
 * 跳过 vendor / 已压缩的第三方库，避免破坏 three.js、hls.js、jQuery 等。
 * ES module 的 import/export 路径保持不变；字符串数组做 base64 编码以抬高逆向成本。
 *
 * 用法:
 *   node docker/obfuscate_javascript.mjs frontend
 *   node docker/obfuscate_javascript.mjs store/static
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import JavaScriptObfuscator from "javascript-obfuscator";

const SKIP_DIR_NAMES = new Set(["vendor", "node_modules", ".git"]);
const SKIP_FILE_SUFFIXES = [".min.js", ".min.mjs"];
const SKIP_FILE_NAMES = new Set([
  "jquery.min.js",
  "jquery.qrcode.min.js",
  "hls.min.js",
]);

const OBFUSCATOR_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.45,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: "hexadecimal",
  ignoreImports: true,
  numbersToExpressions: true,
  renameGlobals: false,
  renameProperties: false,
  reservedNames: ["^ha_bridge_", "^homeos", "^THREE$", "^Hls$", "^jQuery$", "^\\$"],
  reservedStrings: [],
  seed: 0x486f6d65, // Home
  selfDefending: false,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 8,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayEncoding: ["base64"],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 3,
  stringArrayWrappersType: "function",
  stringArrayThreshold: 0.75,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
  target: "browser",
  sourceMap: false,
};

function shouldSkipFile(filePath) {
  const base = path.basename(filePath);
  if (SKIP_FILE_NAMES.has(base)) return true;
  if (SKIP_FILE_SUFFIXES.some((suffix) => base.endsWith(suffix))) return true;
  const parts = filePath.split(path.sep);
  return parts.some((part) => SKIP_DIR_NAMES.has(part));
}

function listJavaScriptFiles(rootDir) {
  const results = [];
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
        if (!SKIP_DIR_NAMES.has(entry.name)) stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!(entry.name.endsWith(".js") || entry.name.endsWith(".mjs"))) continue;
      if (shouldSkipFile(fullPath)) continue;
      results.push(fullPath);
    }
  }
  return results.sort();
}

function looksLikeModule(source) {
  return /^\s*(import|export)\b/m.test(source) || /\bimport\s*\(/.test(source);
}

function obfuscateFile(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  if (!source.trim()) return { skipped: true, reason: "empty" };

  const options = {
    ...OBFUSCATOR_OPTIONS,
    // 带 import/export 的文件按 module 解析，避免破坏模块边界
    sourceMap: false,
  };

  // javascript-obfuscator 对 ESM 默认兼容；显式关掉会改写 import 路径的选项已在上面设置
  const result = JavaScriptObfuscator.obfuscate(source, options);
  const code = result.getObfuscatedCode();
  if (!code || code.length < 1) {
    throw new Error(`混淆结果为空: ${filePath}`);
  }
  // 模块文件混淆后仍应保留 import/export 关键字（路径可能被编码进字符串数组再还原）
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
    const files = listJavaScriptFiles(root);
    console.log(`混淆 ${root}（${files.length} 个文件）`);
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
