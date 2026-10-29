#!/usr/bin/env node
/**
 * 两个上游版本的「语义差异」逐行打印工具。
 *
 * `inventory.mjs` 只回答「哪些文件值得看」，不回答「改了什么」。定性的最后一步是
 * 把去混淆产物按 token 归一后做真正的 diff —— 但直接 `diff` 两版产物没用：标识符
 * 编号顺序不同、引号风格不同、`?v=` 每版都换，任何一处都会让整段被标成红绿。
 *
 * 所以这里在 diff 之前先做三件归一化（与 inventory 口径一致，但保留**顺序**，
 * 因为要输出连贯的行上下文）：
 *   1. `?v=…` 抹成 `?v=`（两版 revision 天生不同）；
 *   2. 字符串字面量统一成单引号；
 *   3. `v123` 形态的还原标识符抹成 `ID`。
 *
 * 用法：
 *   node ops/port/semantic-diff.mjs --file static/renderer/transform-geometry.js
 *   node ops/port/semantic-diff.mjs --file modules/interaction3d/config-editor.js --context 4
 *   node ops/port/semantic-diff.mjs --file app/license/service.py --from 0.8.1 --to 0.8.2
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const CACHE = join(ROOT, ".port-cache");

function parseArgs(argv) {
  const args = { file: null, from: "0.8.1", to: "0.8.2", context: 3 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--file") args.file = argv[++i];
    else if (argv[i] === "--from") args.from = argv[++i];
    else if (argv[i] === "--to") args.to = argv[++i];
    else if (argv[i] === "--context") args.context = Number(argv[++i]);
  }
  if (!args.file) throw new Error("缺少 --file");
  return args;
}

const LITERAL = /(`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*")/g;

/** 把双引号/模板字面量统一成单引号，避免「引号风格」被当成改动。 */
function unifyQuotes(line) {
  return line.replace(LITERAL, (m) => {
    if (!m.startsWith('"')) return m;
    const body = m.slice(1, -1).replace(/\\"/g, '"').replace(/'/g, "\\'");
    return `'${body}'`;
  });
}

function normalize(text) {
  return text
    .replace(/([?&])v=[A-Za-z0-9._-]+/g, "$1v=")
    .split("\n")
    .map((line) =>
      unifyQuotes(line)
        .replace(/\bv\d+\b/g, "ID")
        .replace(/__pyarmor_(?:enter|exit|assert|bcc)_\d+__/g, "PYARMOR")
        .replace(/\s+/g, " ")
        .trim(),
    );
}

/** 最小编辑脚本（LCS 版本），只用来生成带上下文的对齐输出。 */
function diffLines(a, b) {
  const n = a.length;
  const m = b.length;
  // 大文件（stage.js 十几万 token）用整表会吃满内存，先裁掉公共前后缀。
  let head = 0;
  while (head < n && head < m && a[head] === b[head]) head += 1;
  let tail = 0;
  while (tail < n - head && tail < m - head && a[n - 1 - tail] === b[m - 1 - tail]) tail += 1;
  const A = a.slice(head, n - tail);
  const B = b.slice(head, m - tail);
  const rows = A.length + 1;
  const cols = B.length + 1;
  if (rows * cols > 40_000_000) {
    return [
      ...a.slice(0, head).map((line) => [" ", line]),
      ["-", `（中间 ${A.length} 行 / ${B.length} 行超出对齐上限，请缩小 --file 范围）`],
      ...a.slice(n - tail).map((line) => [" ", line]),
    ];
  }
  const table = new Uint32Array(rows * cols);
  for (let i = A.length - 1; i >= 0; i -= 1) {
    for (let j = B.length - 1; j >= 0; j -= 1) {
      table[i * cols + j] =
        A[i] === B[j]
          ? table[(i + 1) * cols + j + 1] + 1
          : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
    }
  }
  const out = [];
  for (let i = 0; i < head; i += 1) out.push([" ", a[i]]);
  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) {
      out.push([" ", A[i]]);
      i += 1;
      j += 1;
    } else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) {
      out.push(["-", A[i]]);
      i += 1;
    } else {
      out.push(["+", B[j]]);
      j += 1;
    }
  }
  while (i < A.length) out.push(["-", A[i++]]);
  while (j < B.length) out.push(["+", B[j++]]);
  for (let k = n - tail; k < n; k += 1) out.push([" ", a[k]]);
  return out;
}

const { file, from, to, context } = parseArgs(process.argv.slice(2));

/** 副本目录镜像上游：前端文件在 `frontend/` 下，后端在 `backend/` 下，清单在根部。 */
function readVersioned(version) {
  const candidates = [
    join(CACHE, version, "frontend", file),
    join(CACHE, version, "backend", file),
    join(CACHE, version, file),
  ];
  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, "utf8");
    } catch {
      /* 试下一个 */
    }
  }
  throw new Error(`找不到 ${version} 的 ${file}（试过 ${candidates.length} 个位置）`);
}

const before = normalize(readVersioned(from));
const after = normalize(readVersioned(to));
const script = diffLines(before, after);

let changed = 0;
for (const row of script) if (row[0] !== " ") changed += 1;
console.log(`# ${file}  ${from} → ${to}   行 ${before.length} → ${after.length}，差异 ${changed}`);

// 只打印差异附近 context 行，避免把整份大文件倒出来。
const keep = new Array(script.length).fill(false);
for (let i = 0; i < script.length; i += 1) {
  if (script[i][0] === " ") continue;
  for (let d = -context; d <= context; d += 1) if (script[i + d]) keep[i + d] = true;
}
let last = -10;
for (let i = 0; i < script.length; i += 1) {
  if (!keep[i]) continue;
  if (i - last > 1) console.log("  ...");
  console.log(`${script[i][0]} ${script[i][1]}`);
  last = i;
}
