/**
 * 管家对话「删除会话」契约：删掉之后，关掉面板再打开**不能**又冒出来。
 *
 * 真实故障（2026-11-02 23:00）：点垃圾桶图标，对话确实清空了；但下次双击伴侣弹出
 * 对话框，刚才那段对话又回来了。原因有两层：
 *
 * 1. 面板停靠在信息栏时，`RightSidebar` 用 `v-if="agentOpen"` 包住插槽 —— 关面板就把
 *    对话组件**卸载**了，重新打开是一次全新挂载；
 * 2. 挂载时按「历史里最新的一条」兜底恢复（`storedSessions[0]`）。而「删除」只清了内存、
 *    把清空后的空会话当成未归档（`snapshot.length === 0` 直接 return），历史里最新那条
 *    仍然是刚被删的对话 —— 于是下次挂载原样恢复，删除等于没发生。
 *
 * 现在的口径：sessionStorage 里存一个**当前会话指针**，挂载只恢复指针指向的那一条；
 * 删除会把指针换成一个不在历史里的新 id，所以重新挂载一定是空白会话。
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

/** 最小 sessionStorage 替身：只需要 get / set / remove */
class FakeStorage {
  constructor() {
    this.map = new Map()
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null
  }
  setItem(key, value) {
    this.map.set(key, String(value))
  }
  removeItem(key) {
    this.map.delete(key)
  }
  clear() {
    this.map.clear()
  }
}

const storage = new FakeStorage()
globalThis.window = { sessionStorage: storage }

const history = await import(
  new URL('shared/agent/utils/chat-history.util.ts', FRONTEND_SRC).href
)

const read = (rel) => readFileSync(join(root, rel), 'utf8')
const PALETTE = 'homeos/frontend/src/components/widgets/agent/AgentChatPalette.vue'

function reset() {
  storage.clear()
}

test('快照只保留可回放的消息：流式中 / 空文本不入历史', () => {
  const session = history.buildAgentChatSession('s1', [
    { role: 'user', text: '开灯' },
    { role: 'assistant', text: '', streaming: true },
    { role: 'assistant', text: '   ' },
    { role: 'assistant', text: '已开灯', tools: 'light.turn_on', outcome: 'success' },
  ])
  assert.ok(session)
  assert.equal(session.id, 's1')
  assert.equal(session.title, '开灯')
  assert.equal(session.messages.length, 2)
  assert.equal(session.messages[1].tools, 'light.turn_on')
})

test('没有可保存内容时返回 null（空对话不写历史，也就不会污染恢复）', () => {
  assert.equal(history.buildAgentChatSession('s1', []), null)
  assert.equal(
    history.buildAgentChatSession('s1', [{ role: 'assistant', text: ' ', streaming: false }]),
    null,
  )
})

test('读历史：脏数据逐条丢弃，按更新时间倒序', () => {
  reset()
  storage.setItem(
    'homeos.agent.chat.history.v1',
    JSON.stringify([
      { id: '', title: 'x', messages: [{ role: 'user', text: 'a' }], updatedAt: 1 },
      { id: 'old', messages: [{ role: 'user', text: '更早' }], updatedAt: 100 },
      { id: 'new', messages: [{ role: 'user', text: '最新' }], updatedAt: 200 },
      { id: 'empty', messages: [], updatedAt: 300 },
      'not-an-object',
    ]),
  )
  const sessions = history.readAgentChatSessions()
  assert.deepEqual(sessions.map((item) => item.id), ['new', 'old'])
})

test('当前会话指针可往返；没有指针时返回空串', () => {
  reset()
  assert.equal(history.readAgentChatCurrentId(), '')
  history.writeAgentChatCurrentId('s-42')
  assert.equal(history.readAgentChatCurrentId(), 's-42')
})

test('新会话 id 不等于历史里的任何一条（删完再挂载才不会命中旧会话）', () => {
  reset()
  history.writeAgentChatSessions([
    { id: 'ui-agent-old', title: '旧对话', updatedAt: Date.now(), messages: [{ role: 'user', text: 'hi' }] },
  ])
  const fresh = history.newAgentChatSessionId()
  assert.notEqual(fresh, 'ui-agent-old')
  assert.equal(
    history.readAgentChatSessions().some((item) => item.id === fresh),
    false,
  )
})

test('挂载只恢复指针指向的会话，不再「拿历史里最新一条兜底」', () => {
  const source = read(PALETTE)
  // 回归护栏：这个兜底就是「删了又回来」的直接原因
  assert.doesNotMatch(source, /storedSessions\[0\]/)
  assert.match(source, /readAgentChatCurrentId\(\)/)
  assert.match(source, /storedSessions\.find\(\(item\) => item\.id === readAgentChatCurrentId\(\)\)/)
})

test('删除会话：历史里移除该条，并换成不在历史里的新 id', () => {
  const source = read(PALETTE)
  const start = source.indexOf('function deleteConversation()')
  assert.ok(start > 0, '缺少 deleteConversation')
  const body = source.slice(start, source.indexOf('\n}\n', start))
  // 只清内存不够：历史还在，下次挂载就会复原
  assert.match(body, /sessions\.value = sessions\.value\.filter\(\(item\) => item\.id !== removedId\)/)
  assert.match(body, /writeAgentChatSessions\(sessions\.value\)/)
  // 指针必须换新，否则关面板再打开仍会命中这条（如果只是内存清空）
  assert.match(body, /startFreshConversation\(\)/)
  // 垃圾桶按钮语义是「删除」，不再是「新对话」
  assert.match(source, /aria-label="删除对话"/)
  assert.match(source, /@click="deleteConversation"/)
})
