#!/usr/bin/env node
/**
 * 把同一 label 下多次 3D 采集（3d-run1.json、3d-run2.json …）合成一份 3d.json。
 *
 * 3D 的时序受 GPU 驱动、灯光缓存和页面关闭时机影响，单次数字波动可达 10%；
 * 报告里使用多次运行的中位数，并保留每次原始值供复核。
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.env.HOMEOS_PERF_ROOT || "/tmp/homeos-perf";
const label = process.argv[2] || "before";
const dir = join(root, "results", label);
const files = readdirSync(dir)
  .filter((name) => /^3d-run\d+\.json$/.test(name))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
if (!files.length) {
  console.error(`没有找到 ${dir}/3d-run*.json`);
  process.exit(1);
}
const runs = files.map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")));
const median = (values) => {
  const sorted = values.filter((value) => typeof value === "number" && Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const summaries = runs.map((run) => run.summary || {});
const summary = {};
for (const key of Object.keys(summaries[0])) {
  const values = summaries.map((item) => item[key]);
  if (values.every((value) => typeof value === "number")) summary[key] = Number(median(values).toFixed(2));
  else summary[key] = values.find((value) => value !== null && value !== undefined) ?? null;
}
const phaseKeys = new Set(runs.flatMap((run) => Object.keys(run.phaseTimings || {})));
const phaseTimings = {};
for (const key of phaseKeys) phaseTimings[key] = Number(median(runs.map((run) => run.phaseTimings?.[key])).toFixed(2));
const base = { ...runs[0], summary, phaseTimings, runs: files, runSummaries: summaries };
writeFileSync(join(dir, "3d.json"), JSON.stringify(base, null, 2) + "\n");
console.log(`[${label}] 3D 中位数（${files.length} 次）：${join(dir, "3d.json")}`);
console.log(JSON.stringify(summary, null, 2));
