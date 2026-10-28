/**
 * 逐文件差异清单的生成器（「四路证据」合流）。
 *
 * 单看任何一路都会误判：
 * - 只看字节：混淆器每次发版换种子，文件名没变、内容全变，858 条「改动」里大半是噪音；
 * - 只看 token 相似度：两个文件可能相似度 0.99 但漏了一行权限校验；
 * - 只看 `?v=` 缓存 tag：它反映作者改过，但有些 tag 只是内部重构；
 * - 只看契约字符串：能抓住接口变化，但抓不到 UI 与样式。
 *
 * 所以这里把四路证据按文件汇到一行，交给 01-diff-inventory.md 逐条定性：
 *   ①文件级增删改（内容哈希） ②标识符掩码后的 token Jaccard 相似度
 *   ③HTML 里 `?v=` 缓存 tag 的增删 ④契约字符串（错误码/请求头/配置键）的增删
 *
 * 用法：node ops/port/inventory.mjs  →  docs/port/0.8.1/inventory.json
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildUpstreamIndex } from "./lib/asset-map.mjs";
import { diffGlb } from "./lib/glb-diff.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const CACHE = join(ROOT, ".port-cache");
const FROM = "0.8.0";
const TO = "0.8.1";

const FRONTEND_RELEVANT = /\.(js|css|html)$/i;
const BACKEND_RELEVANT = /\.py$/;
const CONFIG_RELEVANT = /(^|\/)(VERSION|release-manifest\.json|sbom\.cdx\.json|package\.json)$/;

function walk(dir, base = dir, out = new Map()) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, base, out);
    else out.set(relative(base, full), full);
  }
  return out;
}

function sha(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** 把字符串字面量归一成「值」，因为混淆器在两版里会交替用单/双引号。 */
function canonicalString(literal) {
  const body = literal.slice(1, -1);
  return body.replace(/\\(x[0-9a-fA-F]{2}|u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|.)/g, (_m, esc) => {
    if (esc[0] === "x") return String.fromCharCode(Number.parseInt(esc.slice(1), 16));
    if (esc[0] === "u" && esc[1] === "{") return String.fromCodePoint(Number.parseInt(esc.slice(2, -1), 16));
    if (esc[0] === "u") return String.fromCharCode(Number.parseInt(esc.slice(1), 16));
    const map = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", "0": "\0" };
    return map[esc] ?? esc;
  });
}

/**
 * Python 反编译产物専用的归一化。
 *
 * pycdc 会在**不同位置**插入 `# WARNING: Decompyle incomplete`（我们转成 FIXME 注释）、
 * 并把缺失表达式写成 `<NODE:12>`。这些是反编译器噪声，不是上游改动；不剥掉的话
 * 一个语义完全没变的模块也会被算成 0.95 左右，30 个「改动」里大半是假的。
 */
function normalizePython(src) {
  return src
    .replace(/<NODE:\d+>/g, "<NODE>")
    .replace(/#[^\n]*/g, "")
    .replace(/^\s*\n/gm, "");
}

/**
 * 标识符掩码 + 分词。
 *
 * 去混淆后标识符按出现顺序重命名成 `v1/v2…`，两版同名但序号对不上，所以必须先掩码，
 * 否则同一份代码会被算成完全不同。字符串字面量同样要归一 —— 混淆器在两版里会交替
 * 用 `'x'` 与 `"x"`，不归一的话 `"startsWith"` 和 `'startsWith'` 会被当成两个 token，
 * 实测能把同一份代码的相似度压到 0.3 以下。保留数字与标点，它们才是语义所在。
 *
 * @param {string} src
 * @param {{ python?: boolean }} [options]
 */
function tokenSet(src, options = {}) {
  const text = options.python ? normalizePython(src) : src;
  const masked = text
    .replace(/(`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g, (m) => `\uE000${canonicalString(m)}\uE000`)
    .replace(/\b[A-Za-z_$][\w$]*\b/g, (m) => (/^v\d+$/.test(m) ? "ID" : m));
  const tokens = masked.match(/\uE000[^\uE000]*?\uE000|[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|[^\s]/g) ?? [];
  return new Set(tokens);
}

function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 1;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / (a.size + b.size - shared);
}

function classify(fromFiles, toFiles, relevant) {
  const added = [];
  const removed = [];
  const changed = [];
  let identical = 0;
  for (const [rel, path] of toFiles) {
    if (!relevant.test(rel)) continue;
    const before = fromFiles.get(rel);
    if (!before) {
      added.push(rel);
      continue;
    }
    if (sha(before) === sha(path)) {
      identical += 1;
      continue;
    }
    const beforeText = readFileSync(before, "utf8");
    const afterText = readFileSync(path, "utf8");
    const python = rel.endsWith(".py");
    const a = tokenSet(beforeText, { python });
    const b = tokenSet(afterText, { python });
    changed.push({
      path: rel,
      similarity: Number(jaccard(a, b).toFixed(3)),
      tokensBefore: a.size,
      tokensAfter: b.size,
      bytesBefore: beforeText.length,
      bytesAfter: afterText.length,
    });
  }
  for (const rel of fromFiles.keys()) {
    if (relevant.test(rel) && !toFiles.has(rel)) removed.push(rel);
  }
  changed.sort((x, y) => x.similarity - y.similarity);
  return { added: added.sort(), removed: removed.sort(), changed, identical };
}

/**
 * 从 HTML 里抓 `?v=…` 缓存 tag；上游用它当逐文件的变更记录。
 *
 * 一个 `?v=` 的值是**多个 tag 串起来的**（`20261027-floor-idle-v1-20261027-floor-reopen-v2`），
 * 每个 tag 以 `YYYYMMDD-` 开头。整体比会把「链变长」误判成新 tag，所以这里按日期前缀
 * 拆成单个 tag，才能回答「哪个文件的哪次改动是新出现的」。
 */
const VERSION_TAG = /\?v=([A-Za-z0-9][\w.-]*)/g;
const TAG_COMPONENT = /(?=\d{8}-)/;

function extractVersionTags(files) {
  const tags = new Map();
  for (const [rel, path] of files) {
    if (!rel.endsWith(".html")) continue;
    const text = readFileSync(path, "utf8");
    for (const match of text.matchAll(VERSION_TAG)) {
      for (const tag of match[1].split(TAG_COMPONENT)) {
        if (!/^\d{8}-/.test(tag)) continue;
        if (!tags.has(tag)) tags.set(tag, new Set());
        tags.get(tag).add(rel);
      }
    }
  }
  return tags;
}

/**
 * 契约字符串：全大写下划线错误码、`x-…` 请求头、以及 `?v=` 之外的配置键。
 * 只做「集合增删」，不做语义解释 —— 解释写在报告里。
 */
function extractContracts(files) {
  const contracts = new Map();
  for (const [rel, path] of files) {
    if (!FRONTEND_RELEVANT.test(rel) && !BACKEND_RELEVANT.test(rel)) continue;
    const text = readFileSync(path, "utf8");
    for (const match of text.matchAll(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){1,}\b/g)) {
      if (!contracts.has(match[0])) contracts.set(match[0], new Set());
      contracts.get(match[0]).add(rel);
    }
    for (const match of text.matchAll(/\bx-[a-z0-9]+(?:-[a-z0-9]+)+\b/gi)) {
      const key = match[0].toLowerCase();
      if (!contracts.has(key)) contracts.set(key, new Set());
      contracts.get(key).add(rel);
    }
  }
  return contracts;
}

function diffSets(before, after) {
  const added = [...after.keys()].filter((k) => !before.has(k)).sort();
  const removed = [...before.keys()].filter((k) => !after.has(k)).sort();
  return { added, removed };
}

/** 资产：按模型 id 对齐两版上游目录，逐 id 结构比对。 */
function diffAssets() {
  const upstreamFrom = join(ROOT, "源代码", FROM, "frontend/static/3d-studio/models");
  const upstreamTo = join(ROOT, "源代码", TO, "frontend/static/3d-studio/models");
  const from = buildUpstreamIndex(upstreamFrom);
  const to = buildUpstreamIndex(upstreamTo);
  const buckets = { "slot-drop": [], "slot-add": [], rebake: [], identical: [], structure: [] };
  const added = [];
  const removed = [];

  for (const [key, after] of to) {
    const before = from.get(key);
    if (!before) {
      added.push(key);
      continue;
    }
    const result = diffGlb(before.absPath, after.absPath);
    buckets[result.kind].push({ id: key, ...result.details });
  }
  for (const key of from.keys()) if (!to.has(key)) removed.push(key);

  return { buckets, added, removed, total: to.size };
}

function main() {
  const fromRoot = join(CACHE, FROM);
  const toRoot = join(CACHE, TO);
  const fromFiles = walk(fromRoot);
  const toFiles = walk(toRoot);

  const frontendFrom = walk(join(fromRoot, "frontend"));
  const frontendTo = walk(join(toRoot, "frontend"));
  const backendFrom = walk(join(fromRoot, "backend"));
  const backendTo = walk(join(toRoot, "backend"));

  const frontend = classify(frontendFrom, frontendTo, FRONTEND_RELEVANT);
  const backend = classify(backendFrom, backendTo, BACKEND_RELEVANT);

  const tagsFrom = extractVersionTags(frontendFrom);
  const tagsTo = extractVersionTags(frontendTo);
  const cacheTags = diffSets(tagsFrom, tagsTo);

  const contractsFrom = extractContracts(frontendFrom);
  const contractsTo = extractContracts(frontendTo);

  const assets = diffAssets();

  const topLevel = [...toFiles.keys()]
    .filter((rel) => !rel.startsWith("frontend/") && !rel.startsWith("backend/") && CONFIG_RELEVANT.test(rel))
    .map((rel) => ({
      path: rel,
      changed: !fromFiles.has(rel) || sha(fromFiles.get(rel)) !== sha(toFiles.get(rel)),
    }));

  const inventory = {
    meta: {
      generatedAt: new Date().toISOString(),
      from: FROM,
      to: TO,
      note: "由 ops/port/inventory.mjs 生成；token 相似度已对标识符掩码，只用于排序，定性请对照源码。",
    },
    summary: {
      frontend: {
        added: frontend.added.length,
        removed: frontend.removed.length,
        changed: frontend.changed.length,
        identical: frontend.identical,
      },
      backend: {
        added: backend.added.length,
        removed: backend.removed.length,
        changed: backend.changed.length,
        identical: backend.identical,
      },
      assets: {
        total: assets.total,
        added: assets.added.length,
        removed: assets.removed.length,
        slotDrop: assets.buckets["slot-drop"].length,
        slotAdd: assets.buckets["slot-add"].length,
        rebake: assets.buckets.rebake.length,
        identical: assets.buckets.identical.length,
        structure: assets.buckets.structure.length,
      },
      cacheTags: { added: cacheTags.added.length, removed: cacheTags.removed.length },
      contracts: {
        added: contractsFrom.size ? [...contractsTo.keys()].filter((k) => !contractsFrom.has(k)).length : 0,
        removed: [...contractsFrom.keys()].filter((k) => !contractsTo.has(k)).length,
      },
    },
    frontend,
    backend,
    assets,
    cacheTags,
    contracts: {
      added: [...contractsTo.keys()].filter((k) => !contractsFrom.has(k)).sort(),
      removed: [...contractsFrom.keys()].filter((k) => !contractsTo.has(k)).sort(),
    },
    topLevel,
  };

  const out = join(ROOT, "docs/port/0.8.1/inventory.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(inventory, null, 2));

  console.log(`[inventory] 前端：新增 ${frontend.added.length} / 删除 ${frontend.removed.length} / 改动 ${frontend.changed.length} / 相同 ${frontend.identical}`);
  console.log(`[inventory] 后端：新增 ${backend.added.length} / 删除 ${backend.removed.length} / 改动 ${backend.changed.length} / 相同 ${backend.identical}`);
  console.log(`[inventory] 资产：${assets.total} 个，掉槽 ${assets.buckets["slot-drop"].length} / 加槽 ${assets.buckets["slot-add"].length} / 重烘焙 ${assets.buckets.rebake.length} / 无变化 ${assets.buckets.identical.length} / 结构变 ${assets.buckets.structure.length}`);
  console.log(`[inventory] 缓存 tag：新增 ${cacheTags.added.length} / 消失 ${cacheTags.removed.length}`);
  console.log(`[inventory] → ${relative(ROOT, out)}`);
}

main();
