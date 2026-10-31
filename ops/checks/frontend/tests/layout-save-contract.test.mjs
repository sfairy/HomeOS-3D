import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("布局脏标记：深 watch 只在干净时挂载，脏了立刻卸掉（不再每次变更都整树遍历）", () => {
  const source = read("homeos/frontend/src/stores/ui/create-layout-dirty-tracking.ts");
  // 仍然必须能感知嵌套字段（浅层 watch 会漏掉设置页的 v-model 修改）
  assert.match(source, /deep: true/);
  // 置脏后卸载 + 复位后重挂
  assert.match(source, /disarm\(\)/);
  assert.match(source, /arm\(\)/);
  assert.match(source, /flush: 'sync'/);
});

test("布局加载：成功路径与错误分级从在途请求里拆出来（长度 / 复杂度棘轮）", () => {
  const source = read("homeos/frontend/src/stores/ui/create-layout-persistence.ts");
  assert.match(source, /function applyLoadedProjectPayload\(/);
  assert.match(source, /function handleLoadConfigError\(/);
  // 401 仍然安静降级，不能把 unhandledrejection 抛给全局
  assert.match(source, /isUnauthorizedError\(err\)/);
});

test("布局保存：版本校验交给服务端原子写（前端仍按 409 提示 + 重载）", () => {
  const source = read("homeos/frontend/src/stores/ui/create-layout-persistence.ts");
  assert.match(source, /expectedUpdatedAt/);
  assert.match(source, /409/);
});
