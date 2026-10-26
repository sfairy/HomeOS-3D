/**
 * 安防布防/撤防结果解读的纯函数回归。
 *
 * 这些文案直接决定用户是否知道「布防到底生效了没有」：
 * - 同模式换防区被后端跳过时必须显示 skipped，不能当作已重新布防；
 * - 联动部分失败必须显示 partial，不能显示成功；
 * - 模式已提交但没落库要提示重启回退。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  describeSecurityArmItems,
  interpretSecurityArmResult,
} from "../../../../homeos/frontend/src/shared/security/utils/panel-arm-result.util.ts";

test("跳过（同模式同防区）返回 skipped，不谎报已布防", () => {
  const outcome = interpretSecurityArmResult("armed_away", "离家布防", {
    success: true,
    skipped: true,
    mode: "armed_away",
  });
  assert.equal(outcome.kind, "skipped");
});

test("布防 fail-closed：success=false 时按失败提示并列出未执行设备", () => {
  const outcome = interpretSecurityArmResult("armed_away", "离家布防", {
    success: false,
    mode: "disarmed",
    actions: { executed: 1, failed: 1 },
    failedItems: [{ entity_id: "lock.da_men", message: "unavailable" }],
  });
  assert.equal(outcome.kind, "failed");
  assert.match(outcome.message, /未生效/);
  assert.match(outcome.message, /lock\.da_men/);
});

test("部分联动失败（degraded）提示 partial 而不是成功", () => {
  const outcome = interpretSecurityArmResult("armed_home", "在家布防", {
    success: true,
    degraded: true,
    mode: "armed_home",
    actions: { executed: 2, failed: 1 },
    appliedCount: 2,
    failedItems: [{ entity_id: "switch.water_valve", message: "timeout" }],
    compensated: 1,
  });
  assert.equal(outcome.kind, "partial");
  assert.match(outcome.message, /已生效/);
  assert.match(outcome.message, /已补偿 1 条/);
});

test("撤防 fail-open：模式已撤防但联动失败仍提示 partial", () => {
  const outcome = interpretSecurityArmResult("disarmed", "撤防", {
    success: false,
    mode: "disarmed",
    actions: { executed: 0, failed: 2 },
    failedItems: [{ entity_id: "light.entry" }],
  });
  assert.equal(outcome.kind, "partial");
  assert.match(outcome.message, /已撤防/);
});

test("模式提交但未落库：提示重启回退，不报失败", () => {
  const outcome = interpretSecurityArmResult("armed_night", "夜间布防", {
    success: true,
    mode: "armed_night",
    persisted: false,
  });
  assert.equal(outcome.kind, "partial");
  assert.match(outcome.message, /重启后可能回退/);
});

test("describeSecurityArmItems 汇总执行/失败/补偿/不可撤销", () => {
  const text = describeSecurityArmItems({
    appliedCount: 2,
    actions: { failed: 1 },
    compensated: 1,
    failedItems: [{ entity_id: "lock.da_men" }],
    irreversibleItems: [{ entity_id: "scene.away" }],
    compensationFailures: [{ entity_id: "switch.valve" }],
  });
  assert.match(text, /已执行 2 条/);
  assert.match(text, /未执行 1 条/);
  assert.match(text, /已补偿 1 条/);
  assert.match(text, /失败设备：lock\.da_men/);
  assert.match(text, /不可撤销：scene\.away/);
  assert.match(text, /补偿未完成/);
});
