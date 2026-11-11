import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

test('StudioView 增加未保存路由离开确认', () => {
  const source = read('homeos/frontend/src/studio/entries/StudioView.vue')
  assert.match(source, /onBeforeRouteLeave/)
  assert.match(source, /未保存的修改/)
})

test('渲染循环在 sceneRootNode 置空后不再 setupSceneShadows', () => {
  const source = read('homeos/frontend/src/studio/app/3d-studio/authoring/studio-app/render/studio-render-loop.ts')
  assert.match(source, /settleLightTransitions/)
  assert.match(source, /!appCtx\.sceneRootNode \|\| !appCtx\.threeScene/)
})

test('stage 的 message 监听随 pagehide 摘除', () => {
  const source = read('homeos/frontend/src/studio/runtime/core/stage.ts')
  assert.match(source, /removeEventListener\(["']message["'], handleHostMessage\)/)
})

test('聊天历史不再用长期 localStorage', () => {
  // 历史持久化已抽到 chat-history.util.ts；面板只调它，不再自己碰 storage
  const source = read('homeos/frontend/src/shared/agent/utils/chat-history.util.ts')
  assert.match(source, /sessionStorage/)
  assert.doesNotMatch(source, /localStorage/)
  const palette = read('homeos/frontend/src/components/widgets/agent/AgentChatPalette.vue')
  assert.doesNotMatch(palette, /localStorage/)
  assert.match(palette, /readAgentChatSessions/)
})

test('reconnect 4s 兜底 timer 纳入统一清理', () => {
  const source = read('homeos/frontend/src/stores/entities/ws/ws-bind-lifecycle.ts')
  assert.match(source, /reconnectTimer/)
  assert.match(source, /clearTimeout\(reconnectTimer\)/)
})

test('forceReset 不再复用清 cookie 前的 in-flight Promise', () => {
  const source = read('homeos/frontend/src/services/api/client.ts')
  assert.match(source, /beginCsrfRefresh/)
  assert.match(source, /\.then\(\(\) => beginCsrfRefresh\(\)\)/)
})

test('PanelHead 去掉 v-html', () => {
  const source = read('homeos-store/frontend/src/features/admin/components/PanelHead.vue')
  assert.doesNotMatch(source, /v-html/)
  assert.match(source, /\{\{ desc \}\}/)
})

test('ConfirmDialog 去掉 v-html 并剥离静态标签', () => {
  const source = read('homeos-store/frontend/src/shared/components/ConfirmDialog.vue')
  assert.doesNotMatch(source, /v-html=/)
  assert.match(source, /detailText/)
})

test('DataTable.search 返回 Promise，reloadAll 可等待', () => {
  const source = read('homeos-store/frontend/src/features/admin/components/DataTable.vue')
  assert.match(source, /async function search\(\): Promise<void>/)
  assert.match(source, /await reload\(\)/)
})

test('STORE_LOGIN_PATH 与注释一致地导出', () => {
  const source = read('homeos-store/frontend/src/router/admin-guard.ts')
  assert.match(source, /export const STORE_LOGIN_PATH/)
})

test('支付确认按钮有 busy 守卫', () => {
  const source = read('homeos-store/frontend/src/features/storefront/components/PaymentDialog.vue')
  assert.match(source, /refreshing/)
  assert.match(source, /:disabled="refreshing"/)
})
