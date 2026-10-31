import test from "node:test";
import assert from "node:assert/strict";
import {
  contrastRatio,
  resolveReadableAccent,
} from "../../../../homeos/frontend/src/shared/utils/ui/color.util.ts";

test("强调色对比度：默认色与暖铜同时满足深色画布和按钮深字", () => {
  for (const accent of ["#0A84FF", "#3B82F6", "#ffc46a"]) {
    assert.equal(resolveReadableAccent(accent), accent.toUpperCase());
    assert.ok(contrastRatio(accent, "#070a0f") >= 3);
    assert.ok(contrastRatio(accent, "#041018") >= 4.5);
  }
});

test("强调色对比度：过暗或非法配置回落到系统蓝", () => {
  assert.equal(resolveReadableAccent("#000000"), "#0A84FF");
  assert.equal(resolveReadableAccent("#001020"), "#0A84FF");
  assert.equal(resolveReadableAccent("not-a-color"), "#0A84FF");
  assert.equal(resolveReadableAccent(null), "#0A84FF");
});

test("强调色对比度：边界色按 WCAG 阈值判定", () => {
  assert.equal(contrastRatio("#ffffff", "#000000"), 21);
  assert.equal(contrastRatio("#000000", "#000000"), 1);
  assert.equal(contrastRatio("#zzzzzz", "#000000"), null);
});
