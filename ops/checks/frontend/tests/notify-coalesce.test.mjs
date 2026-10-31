/**
 * Toast 合并器回归。
 *
 * 背景：一次关 12 盏灯全部失败时，store 逐条 push「未生效，已恢复」→ 右侧竖排 12 张卡片、
 * 遮住整屏，读屏连播 12 次。合并器把这些压成一张带 ×N 徽标的卡片。
 * 这里钉住合并窗口、类型隔离、失效与上限这几条契约。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createNotifyCoalescer } from "../../../../homeos/frontend/src/shared/utils/ui/notify-coalesce.util.ts";

test("窗口内同文案同类型累加计数，不新起卡片", () => {
  const c = createNotifyCoalescer(2000);
  assert.equal(c.hit("warning", "未生效，已恢复", 1000), null);
  c.remember("warning", "未生效，已恢复", "id-1", 1000);

  assert.deepEqual(c.hit("warning", "未生效，已恢复", 1200), { id: "id-1", count: 2 });
  assert.deepEqual(c.hit("warning", "未生效，已恢复", 1500), { id: "id-1", count: 3 });
});

test("同文案不同严重级别各自一张（info 不吞 warning）", () => {
  const c = createNotifyCoalescer(2000);
  c.remember("info", "已保存", "id-info", 1000);
  assert.equal(c.hit("warning", "已保存", 1100), null);
});

test("超出窗口后不再合并", () => {
  const c = createNotifyCoalescer(2000);
  c.remember("warning", "未生效，已恢复", "id-1", 1000);
  assert.equal(c.hit("warning", "未生效，已恢复", 3001), null);
});

test("窗口按最近一次推送续期，持续失败不会中途断开", () => {
  const c = createNotifyCoalescer(2000);
  c.remember("warning", "未生效，已恢复", "id-1", 1000);
  assert.deepEqual(c.hit("warning", "未生效，已恢复", 2500), { id: "id-1", count: 2 });
  // 距上次命中只有 2500ms 之后 1900ms：仍在窗口内
  assert.deepEqual(c.hit("warning", "未生效，已恢复", 4400), { id: "id-1", count: 3 });
});

test("forget 之后同文案重新新建（用户关掉卡片后要能再提示）", () => {
  const c = createNotifyCoalescer(2000);
  c.remember("warning", "未生效，已恢复", "id-1", 1000);
  c.forget("id-1");
  assert.equal(c.hit("warning", "未生效，已恢复", 1100), null);
});

test("tracked 表有硬上限，长跑不会无界增长", () => {
  const c = createNotifyCoalescer(60_000, 4);
  for (let i = 0; i < 20; i += 1) c.remember("info", `消息 ${i}`, `id-${i}`, 1000 + i);
  // 最早的已被淘汰，不再命中；最后 4 条仍可合并
  assert.equal(c.hit("info", "消息 0", 2000), null);
  assert.deepEqual(c.hit("info", "消息 19", 2000), { id: "id-19", count: 2 });
});
