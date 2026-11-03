/**
 * 管家对话「思考中」只出现一条的契约。
 *
 * 两处对话（仪表板悬浮面板 / 设置页调试面板）都是：send() 先 push 一条空流式气泡占位，
 * 再用独立的「处理中 / 思考中」气泡承载等首 token 的阶段。若空流式气泡照样渲染，
 * 用户会同时看到「空气泡 + 思考中」两条，像是多问了一次。
 *
 * 这类失效不会编译报错，只是视觉上多一条，所以把不变量钉在测试里：
 *   - 渲染循环必须跳过「streaming 且没有内容」的气泡
 *   - 「思考中」的显示条件必须落在「有内容」而不是「存在流式气泡」上
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (relativePath) =>
  readFileSync(fileURLToPath(new URL('../../../../' + relativePath, import.meta.url)), 'utf8')

const palette = read('homeos/frontend/src/components/widgets/agent/AgentChatPalette.vue')
const settingsPanel = read('homeos/frontend/src/features/settings/interact/SettingsAgentPanel.vue')

/** 取 `<template v-for` … 渲染行开头的一段，供断言 v-if 守卫 */
function vforHeader(source, marker) {
  const start = source.indexOf(marker)
  assert.ok(start > 0, `找不到渲染循环：${marker}`)
  return source.slice(start, start + 400)
}

test('悬浮面板：空流式气泡不渲染，交给「处理中」气泡占位', () => {
  assert.match(palette, /function bubbleHasContent\(message: ChatMessage\): boolean \{[\s\S]{0,160}message\.text\.trim\(\) \|\| message\.tools/)
  const header = vforHeader(palette, '<template v-for="(m, i) in messages"')
  assert.match(header, /v-if="m\.role === 'user' \|\| !m\.streaming \|\| bubbleHasContent\(m\)"/)
})

test('悬浮面板：showTyping 依据「气泡是否有内容」，不再只看「存在流式气泡」', () => {
  const start = palette.indexOf('const showTyping = computed(')
  assert.ok(start > 0, '找不到 showTyping')
  const block = palette.slice(start, start + 260)
  assert.match(block, /message\.streaming && bubbleHasContent\(message\)/)
  assert.equal(
    /message\.streaming && message\.text\.trim\(\)/.test(block),
    false,
    '回到只判断 text.trim() 会让工具轨迹先到、正文未到时空气泡又和「处理中」并存',
  )
})

test('设置页调试面板：空流式气泡同样不渲染', () => {
  // 气泡已拆成独立组件（SettingsAgentChatBubble），渲染循环仍在面板里：
  // 先用 v-for 找到循环起点，再到组件内部确认「空流式气泡」被 v-if 挡掉。
  const header = vforHeader(settingsPanel, '<SettingsAgentChatBubble\n              v-for="(m, i) in chatLog"')
  assert.match(header, /:message="m"/)

  const bubble = read('homeos/frontend/src/features/settings/interact/SettingsAgentChatBubble.vue')
  assert.match(
    bubble,
    /v-if="message\.role === 'user' \|\| !message\.streaming \|\| message\.text\.trim\(\)"/,
    '流式气泡在正文为空时也不能渲染，否则会和「思考中」并成两条',
  )

  const typingStart = settingsPanel.indexOf('const showChatTyping = computed(')
  assert.ok(typingStart > 0, '找不到 showChatTyping')
  const typingBlock = settingsPanel.slice(typingStart, typingStart + 220)
  assert.match(
    typingBlock,
    /m\.streaming && m\.text\.trim\(\)/,
    '「思考中」要跟着「气泡是否有内容」走',
  )
})
