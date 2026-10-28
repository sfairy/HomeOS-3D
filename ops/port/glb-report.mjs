#!/usr/bin/env node
/**
 * 资产差异明细：哪些模型在两版之间「掉槽 / 加槽 / 重烘焙 / 结构变了」。
 *
 * 直接产出 `docs/port/0.8.1/asset-diff.json`，供 05 选择性资产同步使用。
 * 判据见 `lib/glb-diff.mjs`；这里只负责把 654 个 id 跑一遍并归类。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildUpstreamIndex } from "./lib/asset-map.mjs";
import { diffGlb } from "./lib/glb-diff.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const FROM = "0.8.0";
const TO = "0.8.1";

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

const out = join(ROOT, "docs/port/0.8.1/asset-diff.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ from: FROM, to: TO, total: to.size, added, removed, buckets }, null, 2));

console.log(`[glb] ${to.size} 个模型：掉槽 ${buckets["slot-drop"].length} / 加槽 ${buckets["slot-add"].length} / 重烘焙 ${buckets.rebake.length} / 无变化 ${buckets.identical.length} / 结构变 ${buckets.structure.length}`);
for (const item of buckets["slot-drop"]) {
  console.log(`  ↓ ${item.id}: ${item.slotsBefore} 槽 → ${item.slotsAfter} 槽，删除 ${JSON.stringify(item.removed)}`);
}
console.log(`[glb] → ${out}`);
