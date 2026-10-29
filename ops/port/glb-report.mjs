#!/usr/bin/env node
/**
 * 资产差异明细：哪些模型在两版之间「掉槽 / 加槽 / 重烘焙 / 结构变了」。
 *
 * 直接产出 `docs/port/<to>/asset-diff.json`（默认 0.8.1 → 0.8.2），供 05 选择性资产同步使用。
 * 判据见 `lib/glb-diff.mjs`；这里只负责把 654 个 id 跑一遍并归类。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildUpstreamIndex } from "./lib/asset-map.mjs";
import { diffGlb } from "./lib/glb-diff.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
/** 比对一对上游版本：默认「上一次移植基线 → 本次目标」，可用 `--from/--to` 覆盖。 */
const argOf = (name, fallback) =>
  process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback;
const FROM = argOf("--from", "0.8.1");
const TO = argOf("--to", "0.8.2");

const upstream = (v) => join(ROOT, "源代码", v, "frontend/static/3d-studio/models");

const from = buildUpstreamIndex(upstream(FROM));
const to = buildUpstreamIndex(upstream(TO));
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

const out = join(ROOT, `docs/port/${TO}/asset-diff.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ from: FROM, to: TO, total: to.size, added, removed, buckets }, null, 2));

console.log(`[glb] ${to.size} 个模型：掉槽 ${buckets["slot-drop"].length} / 加槽 ${buckets["slot-add"].length} / 重烘焙 ${buckets.rebake.length} / 无变化 ${buckets.identical.length} / 结构变 ${buckets.structure.length}`);
for (const item of buckets["slot-drop"]) {
  console.log(`  ↓ ${item.id}: ${item.slotsBefore} 槽 → ${item.slotsAfter} 槽，删除 ${JSON.stringify(item.removed)}`);
}
console.log(`[glb] → ${out}`);
