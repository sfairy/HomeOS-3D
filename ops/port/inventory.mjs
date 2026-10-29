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
 *   ①文件级增删改（内容哈希） ②相似度（集合 Jaccard + 5-gram shingle Jaccard + 行多重集差）
 *   ③HTML 里 `?v=` 缓存 tag 的增删 ④契约字符串（错误码/请求头/配置键）的增删
 *
 * 为什么相似度要三路并联：集合 Jaccard 只看「出现过哪些 token」，对大文件天然失明 ——
 * 540KB 的 renderer.js 新增一行 import，token 集合只多了 1 个元素，相似度仍算出 1.000，
 * 于是一次真实改动被当成重混淆噪声丢掉。5-gram shingle 保留局部顺序，行多重集差保留
 * 「新增了几行」，两者并联才能把「大文件里的一处真实改动」捞出来。
 *
 * 用法：
 *   node ops/port/inventory.mjs                         # 默认 0.8.1 → 0.8.2
 *   node ops/port/inventory.mjs --from 0.8.0 --to 0.8.1
 *   node ops/port/inventory.mjs --to 0.8.2 --out docs/port/0.8.2/inventory.json
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

const FRONTEND_RELEVANT = /\.(js|css|html)$/i;
const BACKEND_RELEVANT = /\.py$/;
const CONFIG_RELEVANT = /(^|\/)(VERSION|release-manifest\.json|sbom\.cdx\.json|package\.json)$/;

/** 判定线：低于它才算「可能真改动」。三路里任意一路越线都要进清单，交给人工定性。 */
const SHINGLE_THRESHOLD = 0.9;
const TOKEN_DELTA_THRESHOLD = 0.01;
const SET_THRESHOLD = 0.97;

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
 * 上游把构建 revision 当 `?v=` 挂在每一条 `src` / `href` / `import` 上。两版 revision 天生
 * 不同（0.8.1 还是逐文件的 tag 链，0.8.2 换成一个统一 hash），不剥掉的话每一个前端文件
 * 都会因为「字符串变了」被算成改动。
 *
 * 注意这里是把 **整个 `v` 参数删掉**，而不是把值抹成空：0.8.1 的 `'./x.js'` 与 0.8.2 的
 * `'./x.js?v=f1422416e0cb9c82'` 必须归一成同一个字符串，否则「给 import 补 revision」
 * 这件事本身会被误判成一次语义改动 —— 而它只是机制层差异，由 `extractVersionTags` /
 * `extractBuildRevisions` 两条专门的通路统计。
 */
function stripResourceVersion(src) {
  return src
    .replace(/[?&]v=[A-Za-z0-9._%-]+/g, "")
    // 删掉参数后可能留下孤立的 `?` / `&`（`'./x.js?'`、`'?a=1&'`）。
    .replace(/[?&](?=["'`)\s]|$)/g, "");
}

/**
 * Python 反编译产物専用的归一化。
 *
 * pycdc 会在**不同位置**插入 `# WARNING: Decompyle incomplete`（我们转成 FIXME 注释）、
 * 并把缺失表达式写成 `<NODE:12>`。这些是反编译器噪声，不是上游改动；不剥掉的话
 * 一个语义完全没变的模块也会被算成 0.95 左右，30 个「改动」里大半是假的。
 * `__pyarmor_enter_12345__` 的序号每次发版都换，同理必须归一。
 */
function normalizePython(src) {
  return stripResourceVersion(src)
    .replace(/__pyarmor_(?:enter|exit|assert|bcc)_\d+__/g, "PYARMOR")
    .replace(/<NODE:\d+>/g, "<NODE>")
    .replace(/#[^\n]*/g, "")
    .replace(/^\s*\n/gm, "");
}

/** 统一入口：按语言选归一化函数。 */
function normalizeFor(src, { python }) {
  return python ? normalizePython(src) : stripResourceVersion(src);
}

const LITERAL = /(`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g;

/** 标识符掩码 + 分词。 */
function tokenSet(src, options = {}) {
  const masked = maskIdentifiers(
    normalizeFor(src, options).replace(LITERAL, (m) => `\uE000${canonicalString(m)}\uE000`),
    options,
  );
  const tokens = masked.match(/\uE000[^\uE000]*?\uE000|[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|[^\s]/g) ?? [];
  return new Set(tokens);
}

function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 1;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/**
 * 标识符掩码。
 *
 * 前端是 javascript-obfuscator 产物：**每个**标识符每版都会重排重命名，`A` 在两版里可能
 * 分别叫 `y` 和 `w`，语义完全没变。只掩 `v\d+` 这种「已还原」形态是不够的（实测
 * `static/modules/interaction3d/bridge.js` 因此被算成 34 行差异，实际只有 `?v=` 一处）。
 * 所以 JS 侧一律把标识符折成 `ID`：改名不再是改动信号，新增的字符串/字面量才是。
 *
 * 后端相反：Pyarmor 只加密字节码，源码里的函数名/表名是真实设计信息，全部掩掉会漏掉
 * 「新增了一个方法」这种关键改动。所以 Python 只掩 `__pyarmor_*_12345__` 这类带序号的
 * 运行时标记（序号每版都变），标识符保持原样。
 */
function maskIdentifiers(text, options) {
  if (options.python) {
    return text.replace(/\b[A-Za-z_$][\w$]*\b/g, (m) => (/^v\d+$/.test(m) ? "ID" : m));
  }
  return text.replace(/\b[A-Za-z_$][\w$]*\b/g, "ID");
}

/** 5-gram shingle：保留局部顺序，用来抓「大文件里只多了一行」的改动。 */
function shingleSet(src, options = {}, size = 5) {
  const text = maskIdentifiers(
    normalizeFor(src, options).replace(LITERAL, (m) => `\uE000${canonicalString(m)}\uE000`),
    options,
  );
  const tokens = text.match(/\uE000[^\uE000]*?\uE000|[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|[^\s]/g) ?? [];
  const out = new Set();
  for (let i = 0; i + size <= tokens.length; i += 1) out.add(tokens.slice(i, i + size).join(" "));
  return out;
}

/** 归一化后的 token 序列（标识符掩码、字面量归一），供多重集差使用。 */
function tokenBag(src, options) {
  const text = maskIdentifiers(
    normalizeFor(src, options).replace(LITERAL, (m) => `\uE000${canonicalString(m)}\uE000`),
    options,
  );
  return text.match(/\uE000[^\uE000]*?\uE000|[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|[^\s]/g) ?? [];
}

/**
 * token 多重集差：先归一化，再数「多了多少个 token、少了多少个」。
 *
 * 这是判断「文件真的长大/缩小」的唯一可靠指标。行级指标对单行文件（HTML 入口全部是
 * 一行）完全失效 —— `index.html` 只改了 release 哈希与版本号，行数比也算出 100%。
 * token 级没有这个问题：那两处改动只占 161KB 里的个位数 token。
 * 同时它也是把 `runtime.js`（78KB → 1.2KB，构建期重排）与「重混淆噪声」分开的依据。
 */
function tokenMultisetDelta(beforeSrc, afterSrc, options) {
  const count = (tokens) => {
    const m = new Map();
    for (const token of tokens) m.set(token, (m.get(token) ?? 0) + 1);
    return m;
  };
  const before = tokenBag(beforeSrc, options);
  const after = tokenBag(afterSrc, options);
  const a = count(before);
  const b = count(after);
  const keys = new Set([...a.keys(), ...b.keys()]);
  let added = 0;
  let removed = 0;
  for (const key of keys) {
    const delta = (b.get(key) ?? 0) - (a.get(key) ?? 0);
    if (delta > 0) added += delta;
    else removed -= delta;
  }
  const scale = Math.max(1, before.length, after.length);
  return {
    added,
    removed,
    before: before.length,
    after: after.length,
    // 双侧差异都计入：纯删除（78KB → 1.2KB）同样是真实改动。
    ratio: (added + removed) / 2 / scale,
  };
}

/** 字符串字面量集合：抓「新增了一个 URL / 错误码 / 选择器」这类单点改动。 */
function literalSet(src, options) {
  const out = new Set();
  for (const match of normalizeFor(src, options).matchAll(LITERAL)) {
    const value = canonicalString(match[0]);
    if (value.length >= 3) out.add(value);
  }
  return out;
}

/**
 * 反混淆稳定性判定。
 *
 * 有些文件（字符串数组被拆到文件末尾的形态）在两版里会被 js-deobf 还原成差异极大的
 * 结构：语义没变，但 token 总量、标识符数量全变了，相似度掉到 0.0x。这类文件必须单独
 * 标出来强制人工读源码，否则会被当成「最大改动」排在清单最前面，反而遮住真正的改动。
 *
 * 判据：相似度极低，但两侧体量接近（字节数比值在 0.6–1.6 之间）且导出名集合相同。
 * 这三条同时成立时，「代码没变、还原不稳」比「代码重写」更可能。
 */
function isDeobfUnstable({ similarity, shingle, bytesBefore, bytesAfter, exportsBefore, exportsAfter }) {
  if (similarity > 0.2 || shingle > 0.2) return false;
  const ratio = bytesBefore ? bytesAfter / bytesBefore : 1;
  if (ratio < 0.6 || ratio > 1.6) return false;
  if (exportsBefore.length !== exportsAfter.length) return false;
  return exportsBefore.every((name, index) => name === exportsAfter[index]);
}

/**
 * 导出面：`export function foo` 与 `export { local as foo }` 两种形态都要收。
 *
 * 0.8.2 把若干模块的实体搬进了 `startup-XXXXXXXX.js`，原模块只剩一行
 * `export { $i as openInteraction3dEditor }`。只认第一种写法会把这类文件误判成
 * 「导出被删了」—— 而导出面是判断「有没有破坏调用方」的第一道闸门，不能误报。
 */
const EXPORT_RE = /\bexport\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g;
const EXPORT_LIST_RE = /\bexport\s*\{([^}]*)\}/g;

function exportNames(src) {
  const names = [...src.matchAll(EXPORT_RE)].map((m) => m[1]);
  for (const match of src.matchAll(EXPORT_LIST_RE)) {
    for (const part of match[1].split(",")) {
      const piece = part.trim();
      if (!piece) continue;
      const alias = /\bas\s+([A-Za-z_$][\w$]*)$/.exec(piece);
      names.push(alias ? alias[1] : piece);
    }
  }
  return [...new Set(names)].sort();
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
    const options = { python };
    // 「只改了 ?v=」：把 revision 参数整个删掉之后逐字节相等。
    // 这类文件进 `versionOnly` 单独统计，不算语义改动。
    const versionOnly = normalizeFor(beforeText, options) === normalizeFor(afterText, options);
    if (versionOnly) {
      changed.push({ path: rel, versionOnly: true, interesting: false });
      continue;
    }
    const similarity = Number(jaccard(tokenSet(beforeText, options), tokenSet(afterText, options)).toFixed(4));
    const shingle = Number(jaccard(shingleSet(beforeText, options), shingleSet(afterText, options)).toFixed(4));
    const tokensDelta = tokenMultisetDelta(beforeText, afterText, options);
    const literalsBefore = literalSet(beforeText, options);
    const literalsAfter = literalSet(afterText, options);
    const literalsAdded = [...literalsAfter].filter((value) => !literalsBefore.has(value));
    const literalsRemoved = [...literalsBefore].filter((value) => !literalsAfter.has(value));
    const exportsBefore = exportNames(beforeText);
    const exportsAfter = exportNames(afterText);

    const unstable = isDeobfUnstable({
      similarity,
      shingle,
      bytesBefore: beforeText.length,
      bytesAfter: afterText.length,
      exportsBefore,
      exportsAfter,
    });
    // 「值得人工看」的判定：token 多重集有实质增删，或相似度/字符串/导出面越线。
    // 相似度两项都在 0.9999 以上且字符串与导出面完全一致的，是重混淆/重排噪声。
    const pureReorder = similarity >= 0.9999 && !literalsAdded.length && !literalsRemoved.length;
    const interesting =
      unstable ||
      (!pureReorder &&
        (tokensDelta.ratio > TOKEN_DELTA_THRESHOLD ||
          similarity < SET_THRESHOLD ||
          shingle < SHINGLE_THRESHOLD ||
          literalsAdded.length > 0 ||
          literalsRemoved.length > 0 ||
          exportsBefore.join() !== exportsAfter.join()));

    changed.push({
      path: rel,
      versionOnly: false,
      similarity,
      shingle,
      tokens: tokensDelta,
      exportsAdded: exportsAfter.filter((name) => !exportsBefore.includes(name)),
      exportsRemoved: exportsBefore.filter((name) => !exportsAfter.includes(name)),
      literalsAdded: literalsAdded.slice(0, 40),
      literalsRemoved: literalsRemoved.slice(0, 40),
      tokensBefore: tokenSet(beforeText, options).size,
      tokensAfter: tokenSet(afterText, options).size,
      bytesBefore: beforeText.length,
      bytesAfter: afterText.length,
      deobfUnstable: unstable,
      interesting,
    });
  }
  for (const rel of fromFiles.keys()) {
    if (relevant.test(rel) && !toFiles.has(rel)) removed.push(rel);
  }
  // 排序：先按「值得看」分组，组内按 shingle 升序（越低越可疑）。
  changed.sort((x, y) => {
    if (x.interesting !== y.interesting) return x.interesting ? -1 : 1;
    return (x.shingle ?? 1) - (y.shingle ?? 1);
  });
  return {
    added: added.sort(),
    removed: removed.sort(),
    changed,
    significant: changed.filter((entry) => entry.interesting).length,
    versionOnly: changed.filter((entry) => entry.versionOnly).length,
    unstable: changed.filter((entry) => entry.deobfUnstable).length,
    identical,
  };
}

/**
 * 从 HTML 里抓 `?v=…` 缓存 tag；上游用它当逐文件的变更记录。
 *
 * 一个 `?v=` 的值是**多个 tag 串起来的**（`20261027-floor-idle-v1-20261027-floor-reopen-v2`），
 * 每个 tag 以 `YYYYMMDD-` 开头。整体比会把「链变长」误判成新 tag，所以这里按日期前缀
 * 拆成单个 tag，才能回答「哪个文件的哪次改动是新出现的」。
 *
 * 0.8.2 起上游改用单一构建 revision（`?v=f1422416e0cb9c82`），没有日期前缀，所以额外
 * 收一路「非日期形态的 revision」，便于在报告里指出「tag 机制被整体替换」。
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
 * 非日期形态的 `?v=` 值（0.8.2 起上游用单一构建 revision 替换掉逐文件 tag 链）。
 *
 * 只扫 HTML 入口：`?v=` 是构建产物的引用标记，业务 JS 里出现的 `?v=xxx` 是误匹配 ——
 * 实测 `hls.min.js`（第三方压缩库）里就有 `?v=he` 这样的碎片，扫全树会凭空造出一个
 * 不存在的 revision。取值形态也只认两种：16 位小写十六进制，或 `YYYYMMDD-` 开头的 tag。
 */
const BUILD_REVISION = /^[0-9a-f]{16}$/;

function extractBuildRevisions(files) {
  const revisions = new Map();
  const other = new Map();
  for (const [rel, path] of files) {
    if (!rel.endsWith(".html")) continue;
    const text = readFileSync(path, "utf8");
    for (const match of text.matchAll(VERSION_TAG)) {
      for (const value of match[1].split(TAG_COMPONENT)) {
        if (/^\d{8}-/.test(value)) continue;
        const bucket = BUILD_REVISION.test(value) ? revisions : other;
        if (!bucket.has(value)) bucket.set(value, new Set());
        bucket.get(value).add(rel);
      }
    }
  }
  return { revisions, other };
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
function diffAssets(FROM, TO) {
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

function parseArgs(argv) {
  const args = { from: "0.8.1", to: "0.8.2", out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--from") args.from = argv[++i];
    else if (flag === "--to") args.to = argv[++i];
    else if (flag === "--out") args.out = argv[++i];
  }
  if (!args.out) args.out = join(ROOT, "docs/port", args.to, "inventory.json");
  return args;
}

function main() {
  const { from: FROM, to: TO, out: OUT } = parseArgs(process.argv.slice(2));
  const fromRoot = join(CACHE, FROM);
  const toRoot = join(CACHE, TO);
  if (!statSafe(fromRoot) || !statSafe(toRoot)) {
    throw new Error(`缺少反混淆副本，先跑：node ops/port/deobf.mjs --version ${FROM} --version ${TO}`);
  }
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

  const revisionsFrom = extractBuildRevisions(frontendFrom);
  const revisionsTo = extractBuildRevisions(frontendTo);
  const buildRevisions = {
    before: [...revisionsFrom.revisions.keys()].sort(),
    after: [...revisionsTo.revisions.keys()].sort(),
    beforeOtherFormat: [...revisionsFrom.other.keys()].sort(),
    afterOtherFormat: [...revisionsTo.other.keys()].sort(),
    filesUsingBuildRevision: revisionsTo.revisions.size
      ? [...revisionsTo.revisions.values()].reduce((sum, set) => sum + set.size, 0)
      : 0,
  };

  const contractsFrom = extractContracts(frontendFrom);
  const contractsTo = extractContracts(frontendTo);

  const assets = diffAssets(FROM, TO);

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
      note: "由 ops/port/inventory.mjs 生成；相似度为三路并联（集合 / shingle / token 多重集），只用于排序，定性请对照源码。",
    },
    summary: {
      frontend: {
        added: frontend.added.length,
        removed: frontend.removed.length,
        changed: frontend.changed.length,
        significant: frontend.significant,
        versionOnly: frontend.versionOnly,
        unstable: frontend.unstable,
        identical: frontend.identical,
      },
      backend: {
        added: backend.added.length,
        removed: backend.removed.length,
        changed: backend.changed.length,
        significant: backend.significant,
        versionOnly: backend.versionOnly,
        unstable: backend.unstable,
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
      buildRevisions,
      contracts: {
        added: [...contractsTo.keys()].filter((k) => !contractsFrom.has(k)).length,
        removed: [...contractsFrom.keys()].filter((k) => !contractsTo.has(k)).length,
      },
    },
    frontend,
    backend,
    assets,
    cacheTags,
    buildRevisions,
    contracts: {
      added: [...contractsTo.keys()].filter((k) => !contractsFrom.has(k)).sort(),
      removed: [...contractsFrom.keys()].filter((k) => !contractsTo.has(k)).sort(),
    },
    topLevel,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(inventory, null, 2));

  const line = (label, group) =>
    `[inventory] ${label}：新增 ${group.added.length} / 删除 ${group.removed.length} / 改动 ${group.changed.length}（其中仅 ?v= ${group.versionOnly}、实质改动 ${group.significant}、反混淆不稳 ${group.unstable}）/ 相同 ${group.identical}`;
  console.log(line("前端", frontend));
  console.log(line("后端", backend));
  console.log(
    `[inventory] 资产：${assets.total} 个，掉槽 ${assets.buckets["slot-drop"].length} / 加槽 ${assets.buckets["slot-add"].length} / 重烘焙 ${assets.buckets.rebake.length} / 无变化 ${assets.buckets.identical.length} / 结构变 ${assets.buckets.structure.length}`,
  );
  console.log(`[inventory] 日期 tag：新增 ${cacheTags.added.length} / 消失 ${cacheTags.removed.length}`);
  console.log(
    `[inventory] 构建 revision：${buildRevisions.before.length} → ${buildRevisions.after.length}（${buildRevisions.after.join(", ") || "无"}，覆盖 ${buildRevisions.filesUsingBuildRevision} 个 HTML）`,
  );
  if (buildRevisions.afterOtherFormat.length || buildRevisions.beforeOtherFormat.length) {
    console.log(
      `[inventory] 非 revision 形态的 ?v=（未纳入统一版本号）：${[...buildRevisions.beforeOtherFormat, ...buildRevisions.afterOtherFormat].join(", ")}`,
    );
  }
  console.log(`[inventory] → ${relative(ROOT, OUT)}`);
}

function statSafe(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

main();
