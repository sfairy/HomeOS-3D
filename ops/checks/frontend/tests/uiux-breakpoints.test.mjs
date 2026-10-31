import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../../..");
const roots = [
  "homeos/frontend/src",
  "homeos-store/frontend/src",
  "packages/shared/src",
];

/** 响应式断点契约：视口/容器查询只允许这些值，禁止新增一次性魔法数字。 */
const BREAKPOINTS = new Set([
  240, 360, 480, 600, 640, 720, 768, 900, 1024, 1100, 1200, 1280, 1366, 1440, 1920, 3200,
]);

function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) sourceFiles(rel, out);
    else if (/\.(css|vue)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

test("响应式断点收敛到统一刻度，且不再出现 639/719 等一次性值", () => {
  const violations = [];
  for (const file of roots.flatMap((dir) => sourceFiles(dir))) {
    const source = readFileSync(join(root, file), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/<!--[\s\S]*?-->/g, "");
    for (const match of source.matchAll(/@(?:media|container)\b[^{]*\{/g)) {
      for (const query of match[0].matchAll(/\((?:max|min)-(?:width|inline-size):\s*(\d+)px\)/g)) {
        const value = Number(query[1]);
        if (!BREAKPOINTS.has(value)) violations.push(`${file}: ${value}px`);
      }
    }
  }
  assert.deepEqual(violations, [], `存在未收敛的断点：\n${violations.join("\n")}`);
});

test("顶栏收纳的 JS 阈值与 CSS 640px 断点一致", () => {
  const source = readFileSync(
    join(root, "homeos/frontend/src/shared/utils/ui/main-layout-nav.util.ts"),
    "utf8",
  );
  assert.ok(source.includes("width <= 640"), "main-layout-nav.util.ts 应使用 640 作为窄屏阈值");
  assert.ok(!source.includes("width <= 639"), "main-layout-nav.util.ts 仍残留 639 阈值");
});
