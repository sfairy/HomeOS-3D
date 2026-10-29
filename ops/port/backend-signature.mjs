/**
 * 后端「真源判定」差分器：绕开反编译产物，直接比对 Pyarmor 字节码结构。
 *
 * 为什么单靠 `inventory.mjs` 的后端那一路不够：它比的是反混淆出来的 `.py` 文本，而
 * pycdc 对这两个版本的成功率不同 —— 有的文件 0.8.1 只解出几行、0.8.2 解出一整段，
 * 相似度就会失真；反过来，两个版本都失败的函数在 `.py` 里是同一句
 * `pass# WARNING: Decompyle incomplete`，真实改动反而**看不见**。
 *
 * 实测踩到的坑（0.8.1 → 0.8.2）：
 * - `app/api/ha.py`、`app/api/backups.py` 的 `.py` 逐字节相同，但 `.das` 里新增了
 *   `append_async` 调用 → 漏报；
 * - `app/api/ui_packs.py` 没有 `.das`（随包不发 Pyarmor，是明文源码），它确实改了，
 *   但按 `.das` 判定会被当成「不存在」→ 也漏报。
 *
 * 因此这里对发布物分三类，各用各的真源：
 *   1. 有同名 `.das` → 以 **`.das`（反汇编）** 为真源；
 *   2. 无 `.das` → 以 **`.py` 原文**为真源（明文模块）；
 *   3. `.cdc.py` / `.1shot.*` 这类中间产物一律不参与比较。
 *
 * `.das` 的归一化只保留「结构指纹」：代码对象名、名字表、字符串常量。丢掉的东西是
 * 每次发版必然变、但和语义无关的噪声 —— 反汇编偏移、`b'<COAddr>…'` 字节地址、
 * 异常表行号、`__pyarmor_enter_8949__` 这类按构建递增的序号。
 *
 * 用法：
 *   node ops/port/backend-signature.mjs                  # 0.8.1 → 0.8.2，打印结论
 *   node ops/port/backend-signature.mjs --json           # 机器可读
 *   node ops/port/backend-signature.mjs --from 0.8.0 --to 0.8.1
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");

function parseArgs(argv) {
  const out = { from: "0.8.1", to: "0.8.2", json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") out.json = true;
    else if (arg === "--from") out.from = argv[++i];
    else if (arg === "--to") out.to = argv[++i];
  }
  return out;
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * `.das` → 结构指纹。
 *
 * 逐行过滤而不是整段删块：反汇编里 [Names]/[Constants]/[Exception Table] 交替出现，
 * 按块删很容易把紧随其后的结构信息一起删掉。
 */
function dasSignature(text) {
  const kept = [];
  for (const raw of text.split("\n")) {
    let line = raw.trim();
    if (!line) continue;
    // 反汇编指令行（`120     LOAD_GLOBAL …`）与异常表（`30 to 72 -> 466 [0]`）
    if (/^\d+\s/.test(line)) continue;
    if (/^\d+ to \d+ -> \d+/.test(line)) continue;
    // 字节地址：形如 b'<COAddr>\x01\x00…'
    line = line.replace(/b?'<COAddr>[^']*'/g, "<COADDR>");
    // 按构建递增的 pyarmor 序号
    line = line.replace(/__pyarmor_(?:assert|enter|exit|bcc)_\d+__/g, "__pyarmor__");
    if (line.startsWith("b'") || line.startsWith('b"')) continue;
    kept.push(line);
  }
  return kept.join("\n");
}

function signatureOf(file) {
  const text = readFileSync(file, "utf8");
  return file.endsWith(".das") ? dasSignature(text) : text;
}

function main() {
  const { from, to, json } = parseArgs(process.argv.slice(2));
  const dirFrom = join(ROOT, ".port-cache", from, "backend");
  const dirTo = join(ROOT, ".port-cache", to, "backend");

  const collect = (dir) => {
    const map = new Map();
    for (const file of walk(dir)) {
      const rel = relative(dir, file).replaceAll("\\", "/");
      if (!/\.(py|das)$/.test(rel)) continue;
      if (rel.endsWith(".cdc.py")) continue;
      // pyarmor 运行时是随包二进制，每次构建必然重写，不参与语义比较
      if (/^pyarmor_runtime_[0-9]+\//.test(rel)) continue;
      // 同一模块若同时有 .das 与 .py，只保留 .das（真源优先）
      const stem = rel.replace(/\.(py|das)$/, "");
      const existing = map.get(stem);
      if (existing && existing.endsWith(".das")) continue;
      map.set(stem, rel);
    }
    return map;
  };

  const filesFrom = collect(dirFrom);
  const filesTo = collect(dirTo);

  const added = [];
  const removed = [];
  const changed = [];
  const identical = [];

  for (const [stem, rel] of filesTo) {
    const prev = filesFrom.get(stem);
    if (!prev) {
      added.push(rel);
      continue;
    }
    const a = signatureOf(join(dirFrom, prev));
    const b = signatureOf(join(dirTo, rel));
    if (a === b) identical.push(rel);
    else changed.push(rel);
  }
  for (const [stem, rel] of filesFrom) {
    if (filesTo.has(stem)) continue;
    removed.push(rel);
  }

  const result = {
    from,
    to,
    added: added.sort(),
    removed: removed.sort(),
    changed: changed.sort(),
    identicalCount: identical.length,
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`后端真源差分 ${from} → ${to}`);
  console.log(`  字节码/明文等价：${result.identicalCount}`);
  console.log(`  改动：${changed.length}`);
  for (const rel of result.changed) console.log(`    ~ ${rel}`);
  console.log(`  新增：${added.length}`);
  for (const rel of result.added) console.log(`    + ${rel}`);
  console.log(`  删除：${removed.length}`);
  for (const rel of removed) console.log(`    - ${rel}`);
}

main();
