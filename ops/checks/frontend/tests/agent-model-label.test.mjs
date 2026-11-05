/**
 * 管家顶栏的模型标签契约：**必须**是后台设置里那个模型，不能是写死的型号。
 *
 * 真实故障（2026-11-02）：用户把设置页模型改成 `deepseek-v4-flash`，对话面板顶栏
 * 却一直显示 `DeepSeek-V3` —— 那是一个硬编码兜底值，后端从来没在用。界面在报一个
 * 不存在的型号，比不显示更糟。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const FRONTEND_SRC = new URL('../../../../homeos/frontend/src/', import.meta.url)
const root = resolve(import.meta.dirname, '../../../..')

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      return { url: new URL(specifier.slice(2), FRONTEND_SRC).href, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})

const { agentModelLabel, agentProviderLabel, AGENT_PROVIDER_LABELS } = await import(
  new URL('shared/agent/utils/model-label.util.ts', FRONTEND_SRC).href
)

const read = (rel) => readFileSync(join(root, rel), 'utf8')
const PALETTE = 'homeos/frontend/src/components/widgets/agent/AgentChatPalette.vue'

test('展示后台实际在用的模型名，而不是写死的型号', () => {
  // 这台机器上真实保存的配置：provider=deepseek / model=deepseek-v4-flash
  assert.equal(agentModelLabel({ ok: true, provider: 'deepseek', model: 'deepseek-v4-flash' }), 'deepseek-v4-flash')
  // 换一家、换型号都跟着变，不需要改代码
  assert.equal(agentModelLabel({ ok: true, provider: 'doubao', model: 'ep-20260101-abc' }), 'ep-20260101-abc')
})

test('没有模型名时退回厂商人读名，不退回某个具体型号', () => {
  assert.equal(agentModelLabel({ ok: true, provider: 'doubao', model: '' }), '豆包')
  assert.equal(agentModelLabel({ ok: true, provider: 'qwen' }), '通义千问')
  // 未登记的 id 原样显示，不臆造厂商名
  assert.equal(agentModelLabel({ ok: true, provider: 'acme', model: '' }), 'acme')
})

test('未就绪 / 未连接如实说，不拿模型名糊过去', () => {
  assert.equal(agentModelLabel({ ok: true, provider: 'mock', model: '' }), '演示模式')
  assert.equal(agentModelLabel({ ok: true, provider: 'unavailable', model: '' }), '未配置模型')
  // 探测请求失败时面板塞的是 provider='unknown'，不能当模型名渲染
  assert.equal(agentModelLabel({ ok: false, provider: 'unknown', ready: false }), '未连接')
  // 还没探测过
  assert.equal(agentModelLabel(null), '')
})

test('厂商人名册非空且 id → 人读名可逆（设置页与顶栏共用一张表）', () => {
  for (const [id, label] of Object.entries(AGENT_PROVIDER_LABELS)) {
    assert.equal(agentProviderLabel(id), label)
    assert.ok(label.trim().length > 0, `${id} 的人读名为空`)
  }
  // 大小写不敏感：后端可能哪天改回大写
  assert.equal(agentProviderLabel('DeepSeek'), 'DeepSeek')
})

test('对话面板顶栏不再写死型号，走 ping 的 provider + model', () => {
  const source = read(PALETTE)
  assert.match(source, /import \{ agentModelLabel \} from '@\/shared\/agent\/utils\/model-label\.util'/)
  assert.match(source, /return agentModelLabel\(ping\.value\)/)
  // 回归护栏：任何具体型号名都不该出现在面板源码里
  for (const forbidden of ['DeepSeek-V3', 'deepseek-v4', 'GPT-4', 'gpt-4']) {
    assert.ok(!source.includes(forbidden), `面板仍写死了型号「${forbidden}」`)
  }
})

test('设置页厂商名与顶栏共用 model-label.util，不再各维护一份', () => {
  const helpers = read('homeos/frontend/src/features/settings/interact/composables/agent-panel-helpers.internals.ts')
  assert.match(helpers, /import \{ AGENT_PROVIDER_LABELS \} from '@\/shared\/agent\/utils\/model-label\.util'/)
  assert.match(helpers, /label: AGENT_PROVIDER_LABELS\.deepseek/)
  // 预设里的中英文名不能再写第二遍
  assert.doesNotMatch(helpers, /label: 'DeepSeek'/)
  assert.doesNotMatch(helpers, /label: '通义千问'/)
})

/**
 * 真实故障（2026-11-02 22:50）：后台明明配好并已就绪（日志 `LLM提供商已就绪:deepseek`），
 * 面板顶栏却一直「未连接」、状态点还是绿的。原因是面板**带着 open=true 挂载**时
 * `watch(props.open)` 不触发，`refreshAgentStatus()` 从没跑过 —— ping 恒为 null，
 * 文案落到兜底「未连接」，而色调的默认分支是绿。
 */
test('面板以 open=true 挂载时也要探测一次，否则顶栏永远「未连接」', () => {
  const source = read(PALETTE)
  const watcher = source.slice(
    source.indexOf('watch(\n  () => props.open'),
    source.indexOf('// 悬浮伴侣长按说话后留下的消息'),
  )
  assert.match(watcher, /void refreshAgentStatus\(\)/)
  // 没有 immediate 时，首次挂载即打开的面板不会进入回调
  assert.match(watcher, /\{ immediate: true \}/)
})

test('没拿到探测结果时状态点不能先亮绿灯（否则和「未连接」自相矛盾）', () => {
  const source = read(PALETTE)
  const start = source.indexOf('const headerTone = computed(')
  const tone = source.slice(start, source.indexOf('/**', start + 10))
  const unprobed = tone.indexOf("if (!ping.value) return 'sky'")
  const healthy = tone.indexOf("return 'emerald'")
  assert.ok(unprobed > 0, '缺少「未探测」分支：此时不该落到绿灯')
  assert.ok(healthy > unprobed, '绿灯必须排在「未探测」之后')
  // 探测中/未探测共用蓝色，别再引用 pinging 做第二个条件（会漏掉「探测失败后清空」的路径）
  assert.doesNotMatch(tone, /pinging\.value && !ping\.value/)
})
