import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("T6-009 StudioView 增加未保存路由离开确认", () => {
  const source = read("homeos/frontend/src/studio/entries/StudioView.vue");
  assert.match(source, /onBeforeRouteLeave/);
  assert.match(source, /未保存的修改/);
});

test("T6-008 渲染循环在 sceneRootNode 置空后不再 setupSceneShadows", () => {
  const source = read(
    "homeos/frontend/src/studio/app/3d-studio/authoring/studio-app/render/studio-render-loop.ts",
  );
  assert.match(source, /settleLightTransitions/);
  assert.match(source, /!appCtx\.sceneRootNode \|\| !appCtx\.threeScene/);
});

test("T6-010 stage 的 message 监听随 pagehide 摘除", () => {
  const source = read("homeos/frontend/src/studio/runtime/core/stage.ts");
  assert.match(source, /removeEventListener\("message", handleHostMessage\)/);
});

test("T7-003 聊天历史不再用长期 localStorage", () => {
  const source = read("homeos/frontend/src/components/widgets/agent/AgentChatPalette.vue");
  assert.match(source, /window\.sessionStorage/);
  assert.doesNotMatch(source, /window\.localStorage\.setItem\(HISTORY_KEY/);
});

test("T7-004 reconnect 4s 兜底 timer 纳入统一清理", () => {
  const source = read("homeos/frontend/src/composables/entity/ws/ws-bind-lifecycle.ts");
  assert.match(source, /reconnectTimer/);
  assert.match(source, /clearTimeout\(reconnectTimer\)/);
});

test("T7-005 forceReset 不再复用清 cookie 前的 in-flight Promise", () => {
  const source = read("homeos/frontend/src/services/api/client.ts");
  assert.match(source, /beginCsrfRefresh/);
  assert.match(source, /\.then\(\(\) => beginCsrfRefresh\(\)\)/);
});

test("T8-03 PanelHead 去掉 v-html", () => {
  const source = read("homeos-store/frontend/src/features/admin/components/PanelHead.vue");
  assert.doesNotMatch(source, /v-html/);
  assert.match(source, /\{\{ desc \}\}/);
});

test("T8-07 ConfirmDialog 去掉 v-html 并剥离静态标签", () => {
  const source = read("homeos-store/frontend/src/shared/components/ConfirmDialog.vue");
  assert.doesNotMatch(source, /v-html=/);
  assert.match(source, /detailText/);
});

test("T8-05 DataTable.search 返回 Promise，reloadAll 可等待", () => {
  const source = read("homeos-store/frontend/src/features/admin/components/DataTable.vue");
  assert.match(source, /async function search\(\): Promise<void>/);
  assert.match(source, /await reload\(\)/);
});

test("T8-06 STORE_LOGIN_PATH 与注释一致地导出", () => {
  const source = read("homeos-store/frontend/src/router/admin-guard.ts");
  assert.match(source, /export const STORE_LOGIN_PATH/);
});

test("T8-09 支付确认按钮有 busy 守卫", () => {
  const source = read("homeos-store/frontend/src/features/storefront/components/PaymentDialog.vue");
  assert.match(source, /refreshing/);
  assert.match(source, /:disabled="refreshing"/);
});
