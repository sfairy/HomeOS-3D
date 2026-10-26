/**
 * 展示端「按草稿裁剪组件族」的纯函数回归测试。
 *
 * 这两条口径最容易被改坏：
 * 1. 文档里没出现的族**不能**被算进来（否则懒加载没有收益）；
 * 2. 文档里出现的族**不能**被漏掉（否则面板画成「控件尚未实现」且没人重试）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  componentFamiliesForDocument,
  componentFamiliesForTypes,
} from "../../../../homeos/frontend/src/studio/app/renderer/registry/component-families.ts";

test("没有面板组件时不需要任何族（3D 户型 + 日志墙只在同步路径）", () => {
  const document = {
    sharedComponents: [{ type: "event-log-wall" }],
    pages: [{ components: [{ type: "interaction3d", children: [] }] }],
  };
  assert.deepEqual(componentFamiliesForDocument(document), []);
});

test("只加载文档里出现的族，重复类型只算一次", () => {
  const document = {
    pages: [{ components: [{ type: "time" }, { type: "date" }, { type: "weather" }] }],
  };
  assert.deepEqual(componentFamiliesForDocument(document).sort(), ["clock", "weather"]);
});

test("共享组件与嵌套 children 里的类型都要算进来", () => {
  const document = {
    sharedComponents: [{ type: "vacuum-map" }],
    pages: [
      {
        components: [
          { type: "panel-frame", children: [{ type: "line-chart" }] },
          { type: "air-conditioner", children: [{ type: "presence-sensor" }] },
        ],
      },
    ],
  };
  assert.deepEqual(componentFamiliesForDocument(document).sort(), [
    "climate",
    "line-chart",
    "presence-sensor",
    "vacuum-map",
  ]);
});

test("缺字段 / 脏数据不抛错，按「不需要族」处理", () => {
  assert.deepEqual(componentFamiliesForDocument(null), []);
  assert.deepEqual(componentFamiliesForDocument({}), []);
  assert.deepEqual(
    componentFamiliesForDocument({
      sharedComponents: [null, 42, "camera", { type: 7 }],
      pages: [{ components: null }],
    }),
    [],
  );
});

test("未知类型被忽略，不会传出不存在的族名", () => {
  assert.deepEqual(componentFamiliesForTypes(["camera", "no-such-type", "", null, undefined]), [
    "camera",
  ]);
});

test("每个动态族都能被至少一个类型触发", () => {
  const families = new Set(
    componentFamiliesForTypes([
      "presence-sensor",
      "air-conditioner",
      "camera",
      "vacuum-map",
      "time",
      "weather",
      "line-chart",
      "scene-mode",
    ]),
  );
  assert.deepEqual([...families].sort(), [
    "camera",
    "climate",
    "clock",
    "line-chart",
    "presence-sensor",
    "scene-mode",
    "vacuum-map",
    "weather",
  ]);
});
