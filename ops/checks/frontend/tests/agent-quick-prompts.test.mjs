import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

const PROMPTS = 'homeos/frontend/src/shared/agent/constants/agent-quick-prompts.ts'
const RESOLVER = 'homeos/frontend/src/shared/agent/utils/quick-prompts.util.ts'
const PALETTE = 'homeos/frontend/src/components/widgets/agent/AgentChatPalette.vue'
const PANEL_CSS = 'homeos/frontend/src/components/widgets/agent/styles/agent-chat-panel.css'
const EDITOR = 'homeos/frontend/src/features/settings/interact/SettingsAgentQuickPromptsSection.vue'
const BACKEND_DEFAULTS = 'homeos/backend/src/domains/app_config/defaults.py'
const BACKEND_UI_VALIDATE = 'homeos/backend/src/domains/app_config/validate/sections_ui.py'
const SHARED_SECTIONS = 'packages/shared/src/config/sections.ts'

/** 面板最窄 280px、两侧 12px 内边距 → chip 文案折合超过 6 个汉字宽就会挤成第三行 */
const MAX_LABEL_WIDTH = 12

/** 文案显示宽度：汉字 / 全角标点算 2，数字字母算 1 */
function displayWidth(text) {
  let width = 0
  for (const char of text) {
    width += /[\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60]/.test(char) ? 2 : 1
  }
  return width
}

/** 从常量文件里抽出 { label, prompt } 清单（该文件是纯数据，正则足够稳） */
function quickPrompts() {
  const source = read(PROMPTS)
  const pattern = /label:\s*'([^']+)',\s*prompt:\s*'([^']+)',\s*hint:\s*'([^']+)'/g
  return [...source.matchAll(pattern)].map((match) => ({
    label: match[1],
    prompt: match[2],
    hint: match[3],
  }))
}

test('快捷指令覆盖智能家居各支柱，且标签短到能挤进窄栏', () => {
  const prompts = quickPrompts()
  assert.ok(prompts.length >= 6, `预设过少：${prompts.length}`)
  for (const { label, prompt, hint } of prompts) {
    assert.ok(label.trim().length > 0, '标签不能为空')
    assert.ok(
      displayWidth(label) <= MAX_LABEL_WIDTH,
      `「${label}」折合宽度 ${displayWidth(label)} 超过 ${MAX_LABEL_WIDTH}，窄栏会被挤到第三行`,
    )
    // 标签只是按钮文案，真正发出去的是完整指令：两者都要有内容
    assert.ok(displayWidth(prompt) > displayWidth(label) || prompt.length >= label.length, `「${label}」的完整指令缺失`)
    assert.ok(hint.trim().length > 0, `「${label}」缺少无障碍说明`)
  }
})

test('快捷指令标签与指令都不重复', () => {
  const prompts = quickPrompts()
  assert.equal(new Set(prompts.map((item) => item.label)).size, prompts.length)
  assert.equal(new Set(prompts.map((item) => item.prompt)).size, prompts.length)
})

test('面板从配置解析快捷指令，点击发送完整指令而不是短标签', () => {
  const source = read(PALETTE)
  assert.match(source, /import \{[^}]*readAgentQuickPrompts[^}]*\} from '@\/shared\/agent\/utils\/quick-prompts\.util'/)
  assert.match(source, /@click="send\(q\.prompt\)"/)
  assert.match(source, /\{\{ q\.label \}\}/)
  // 用户清空清单后整行不渲染，别留一条只有内边距的空壳
  assert.match(source, /v-if="quickPrompts\.length" class="acp-chips"/)
})

test('设置页与主页共用同一份来源，不再维护第二套文案', () => {
  const helpers = read('homeos/frontend/src/features/settings/interact/composables/agent-panel-helpers.internals.ts')
  // 只转发解析函数，不另起数组
  assert.match(
    helpers,
    /export \{ readAgentQuickPrompts as AGENT_CHAT_QUICK_PROMPTS \} from '@\/shared\/agent\/utils\/quick-prompts\.util'/,
  )
  assert.doesNotMatch(helpers, /AGENT_CHAT_QUICK_PROMPTS\s*=\s*\[/)

  const panel = read('homeos/frontend/src/features/settings/interact/SettingsAgentPanel.vue')
  assert.match(panel, /\{\{ prompt\.label \}\}/)
  assert.match(panel, /sendQuickPrompt\(prompt\.prompt\)/)
})

test('快捷指令写进 ui 配置段：后端默认 + 校验 + 共享类型', () => {
  const defaults = read(BACKEND_DEFAULTS)
  assert.match(defaults, /"agentQuickPrompts": _default_agent_quick_prompts\(\)/)

  const validator = read(BACKEND_UI_VALIDATE)
  assert.match(validator, /if "agentQuickPrompts" in payload:/)
  assert.match(validator, /def _validate_agent_quick_prompts\(/)
  // 空数组必须是合法值（= 关闭快捷入口），不能被当成「未配置」拦下来
  assert.match(validator, /if not isinstance\(payload, list\)/)

  const shared = read(SHARED_SECTIONS)
  assert.match(shared, /SharedAgentQuickPromptConfig/)
  assert.match(shared, /agentQuickPrompts\?: SharedAgentQuickPromptConfig\[\]/)
})

test('字段缺省用内置默认，显式空数组才是关闭', () => {
  // 「不是数组」才回到 null（= 未配置），空数组原样返回空清单
  const constants = read(PROMPTS)
  assert.match(constants, /if \(!Array\.isArray\(raw\)\) return null/)
  assert.match(constants, /if \(out\.length >= AGENT_QUICK_PROMPT_LIMITS\.maxItems\) break/)

  const resolver = read(RESOLVER)
  assert.match(resolver, /return configured \?\? AGENT_QUICK_PROMPTS/)
  // 配置热更新后要重算，否则保存完面板还是旧按钮
  assert.match(resolver, /void configEpoch\.value/)
})

test('设置页提供可编辑的快捷指令卡，并写回 ui.agentQuickPrompts', () => {
  const editor = read(EDITOR)
  assert.match(editor, /patchSystemConfig\(\{ ui: \{ agentQuickPrompts: rows \} \}\)/)
  assert.match(editor, /await reloadFrontendConfig\(\)/)
  assert.match(editor, /AGENT_QUICK_PROMPT_LIMITS\.maxItems/)
  // 上限与后端同值：12 条，文案 12 字 / 指令 120 字 / 说明 60 字
  const constants = read(PROMPTS)
  assert.match(constants, /maxItems: 12/)
  assert.match(constants, /label: 12/)
  assert.match(constants, /prompt: 120/)
  assert.match(constants, /hint: 60/)
})

test('高级参数面板不会把对象数组渲染成 [object Object]', () => {
  const util = read('homeos/frontend/src/composables/config/system-config-edit.util.ts')
  // ui.agentQuickPrompts 有自己的编辑卡；若哪天进了字段白名单，通用表单必须跳过它
  assert.match(util, /if \(!isEditableFieldValue\(fieldKey, value\)\) continue/)
  assert.match(util, /function isObjectArrayList\(value: unknown\): boolean/)
})

test('快捷指令一行挤不下时换行，不再横向滚动裁掉后面的指令', () => {
  const css = read(PANEL_CSS)
  const block = css.slice(css.indexOf('.acp-chips {'), css.indexOf('.acp-chip {'))
  assert.match(block, /flex-wrap:\s*wrap/)
  assert.doesNotMatch(block, /overflow-x:\s*(auto|scroll|hidden)/)
})
