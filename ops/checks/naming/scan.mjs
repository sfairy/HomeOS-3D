#!/usr/bin/env node
/**
 * 全仓标识符命名扫描 CLI。
 *
 * 用法:
 *   node ops/checks/naming/scan.mjs                  # 摘要
 *   node ops/checks/naming/scan.mjs --json           # 完整 JSON（stdout）
 *   node ops/checks/naming/scan.mjs --out scan.json  # 完整 JSON 落盘
 *   node ops/checks/naming/scan.mjs --report         # 摘要 + 违规榜
 */
import fs from "node:fs";
import path from "node:path";
import {
  scanRepo,
  isCountedViolation,
  isShortName,
  toRel,
  REPO_ROOT,
} from "./lib.mjs";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const report = args.includes("--report");
const outIndex = args.indexOf("--out");
const outPath = outIndex >= 0 ? args[outIndex + 1] : null;
const rootArgs = args.filter((a) => a.startsWith("--root=")).map((a) => a.slice("--root=".length));

const allowPath = path.join(import.meta.dirname, "allow.json");
const allow = JSON.parse(fs.readFileSync(allowPath, "utf8"));
const result = scanRepo({ roots: rootArgs.length ? rootArgs : undefined });
const violations = result.items.filter((item) => isCountedViolation(item, allow));
const frozenExports = result.items.filter((item) => isShortName(item.name) && item.exported);

if (outPath) {
  const payload = {
    ...result,
    allowPath: toRel(allowPath),
    violationCount: violations.length,
    violations,
    frozenExports,
  };
  fs.writeFileSync(path.resolve(REPO_ROOT, outPath), JSON.stringify(payload, null, 2));
}

if (asJson) {
  console.log(JSON.stringify({ ...result, violations, frozenExports }, null, 2));
} else {
  console.log("== 命名扫描 ==");
  console.log("源码文件: " + result.fileCount + "，声明: " + result.items.length);
  console.log(
    "1–2 字符声明: " +
      result.stats.short +
      "（" +
      result.stats.shortFiles +
      " 文件），其中导出符号: " +
      result.stats.exportedShort +
      "，模板可见: " +
      result.stats.templateVisibleShort,
  );
  console.log("按类型: " + JSON.stringify(result.stats.byKind));
  console.log("门禁违规: " + violations.length + "（" + new Set(violations.map((v) => v.file)).size + " 文件）");
  if (result.errors.length) console.log("解析失败: " + result.errors.length + " 文件");
  if (report) {
    const byName = new Map();
    const byFile = new Map();
    for (const v of violations) {
      byName.set(v.name, (byName.get(v.name) ?? 0) + 1);
      byFile.set(v.file, (byFile.get(v.file) ?? 0) + 1);
    }
    console.log("\n-- 高频名 --");
    for (const [name, count] of [...byName].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
      console.log("  " + name + "  " + count);
    }
    console.log("\n-- 高密度文件 --");
    for (const [file, count] of [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
      console.log("  " + count + "  " + file);
    }
  }
  if (outPath) console.log("已写入 " + outPath);
}
