#!/usr/bin/env node
/**
 * 命名门禁：N1 非导出短名 / N2 数字后缀 / N3 snake_case 局部 / N4 下划线前缀函数。
 *
 * 用法:
 *   node ops/checks/naming/check_naming.mjs                 # 报告
 *   node ops/checks/naming/check_naming.mjs --check         # 超 baseline 退出 1
 *   node ops/checks/naming/check_naming.mjs --update-baseline
 *   node ops/checks/naming/check_naming.mjs --report --json
 *   node ops/checks/naming/check_naming.mjs --list N1
 */
import fs from "node:fs";
import path from "node:path";
import {
  scanRepo,
  isCountedViolation,
  isShortName,
  NUMERIC_NAME_RE,
  SNAKE_CASE_RE,
  UNDERSCORE_FN_RE,
  REPO_ROOT,
  toRel,
} from "./lib.mjs";

const args = process.argv.slice(2);
const check = args.includes("--check");
const report = args.includes("--report");
const asJson = args.includes("--json");
const updateBaseline = args.includes("--update-baseline");
const listIndex = args.indexOf("--list");
const listRule = listIndex >= 0 ? args[listIndex + 1] : null;

const dir = import.meta.dirname;
const allow = JSON.parse(fs.readFileSync(path.join(dir, "allow.json"), "utf8"));
const baselinePath = path.join(dir, "baseline.json");
const baseline = fs.existsSync(baselinePath)
  ? JSON.parse(fs.readFileSync(baselinePath, "utf8"))
  : null;

const scan = scanRepo();

const n1 = scan.items.filter((i) => !i.exported && isCountedViolation(i, allow));
const n2 = scan.items.filter((i) => !i.exported && NUMERIC_NAME_RE.test(i.name));
const n3 = scan.items.filter((i) => !i.exported && SNAKE_CASE_RE.test(i.name));
const n4 = scan.items.filter(
  (i) => !i.exported && (i.kind === "function" || i.kind === "class") && UNDERSCORE_FN_RE.test(i.name),
);
const frozen = scan.items.filter((i) => isShortName(i.name) && i.exported);
const domain = scan.items.filter(
  (i) => !i.exported && isShortName(i.name) && (allow.global?.[i.name] || []).length > 0 && !isCountedViolation(i, allow),
);
const rules = { N1: n1.length, N2: n2.length, N3: n3.length, N4: n4.length };
const total = rules.N1 + rules.N2 + rules.N3 + rules.N4;

function byName(items) {
  const m = new Map();
  for (const i of items) m.set(i.name, (m.get(i.name) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
function byFile(items) {
  const m = new Map();
  for (const i of items) m.set(i.file, (m.get(i.file) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
function fmt(items, limit = 200) {
  return items.slice(0, limit).map((i) => {
    return i.file + ":" + i.line + ":" + i.col + "  " + i.name + "  " + i.kind + "  " + (i.hints.join(",") || "-");
  });
}

const payload = {
  generatedAt: new Date().toISOString(),
  fileCount: scan.fileCount,
  declarations: scan.items.length,
  shortDeclarations: scan.stats.short,
  rules,
  total,
  baseline,
  frozenExports: frozen.map((i) => ({ file: i.file, line: i.line, name: i.name, kind: i.kind })),
  domainAllowed: { count: domain.length, names: byName(domain).slice(0, 40) },
  topNames: byName([...n1, ...n3, ...n4]).slice(0, 40),
  topFiles: byFile([...n1, ...n3, ...n4]).slice(0, 60),
  items: [...n1, ...n3, ...n4].map((i) => ({
    file: i.file,
    line: i.line,
    col: i.col,
    offset: i.offset,
    name: i.name,
    kind: i.kind,
    hints: i.hints,
    parent: i.parent,
    snippet: i.snippet,
    init: i.init ?? "",
    type: i.type ?? "",
  })),
};

if (listRule) {
  const map = { N1: n1, N2: n2, N3: n3, N4: n4 };
  const items = map[listRule];
  if (!items) {
    console.error("unknown rule " + listRule + " (N1|N2|N3|N4)");
    process.exit(2);
  }
  for (const line of fmt(items, 500)) console.log(line);
  process.exit(0);
}

if (updateBaseline) {
  const next = {
    version: 1,
    updatedAt: new Date().toISOString(),
    rules,
    total,
    frozenExports: frozen.length,
    note: "门禁基线：只允许逐波下调；新增违规会让 check:naming 失败。",
  };
  fs.writeFileSync(baselinePath, JSON.stringify(next, null, 2) + "\n");
  console.log("baseline updated: " + JSON.stringify(rules) + " total=" + total);
  process.exit(0);
}

if (asJson) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log("== 命名门禁 ==");
  console.log("文件 " + scan.fileCount + "，声明 " + scan.items.length + "，短名 " + scan.stats.short);
  console.log("N1 非导出短名: " + rules.N1);
  console.log("N2 数字后缀: " + rules.N2);
  console.log("N3 snake_case: " + rules.N3);
  console.log("N4 下划线函数: " + rules.N4);
  console.log("合计: " + total + (baseline ? "（baseline " + baseline.total + "）" : "（无 baseline）"));
  console.log("冻结导出短名: " + frozen.length);
  console.log("领域允许短名: " + domain.length);
  if (report) {
    console.log("\n-- 高频名 --");
    for (const [name, count] of byName([...n1, ...n3, ...n4]).slice(0, 30)) {
      console.log("  " + name + "  " + count);
    }
    console.log("\n-- 高密度文件 --");
    for (const [file, count] of byFile([...n1, ...n3, ...n4]).slice(0, 30)) {
      console.log("  " + count + "  " + file);
    }
  }
  if (frozen.length) {
    console.log("\n-- 冻结导出 --");
    for (const i of frozen) console.log("  " + i.file + ":" + i.line + "  " + i.name);
  }
}

if (check) {
  if (!baseline) {
    console.error("缺少 baseline.json，请先运行 --update-baseline");
    process.exit(1);
  }
  const problems = [];
  for (const key of ["N1", "N2", "N3", "N4"]) {
    if ((baseline.rules?.[key] ?? 0) < rules[key]) {
      problems.push(key + " " + rules[key] + " > baseline " + (baseline.rules?.[key] ?? 0));
    }
  }
  if (baseline.total < total) problems.push("total " + total + " > baseline " + baseline.total);
  if (problems.length) {
    console.error("命名门禁失败：");
    for (const p of problems) console.error("  " + p);
    process.exit(1);
  }
}
