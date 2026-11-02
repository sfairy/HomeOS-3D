/**
 * @file agent-panel-helpers.internals.ts
 * @module frontend/src/features/settings/interact/composables
 */
/** 智能管家设置面板：纯辅助 / 常量 */
import { ref } from 'vue'
import { AGENT_PROVIDER_LABELS } from '@/shared/agent/utils/model-label.util'

/** 统计卡片色调（与 SettingsFlowStat.vue 的 FlowStatTone 保持对齐） */
export type FlowStatTone =
  | 'accent'
  | 'secondary'
  | 'emerald'
  | 'amber'
  | 'sky'
  | 'rose'
  | 'violet'

function mapFlowStatTone(cls: string): FlowStatTone {
  if (cls.includes('emerald') || cls.includes('green')) return 'emerald'
  if (cls.includes('amber') || cls.includes('yellow') || cls.includes('warn')) return 'amber'
  if (cls.includes('rose') || cls.includes('red') || cls.includes('danger')) return 'rose'
  if (cls.includes('violet') || cls.includes('indigo') || cls.includes('purple')) return 'violet'
  if (cls.includes('secondary') || cls.includes('slate') || cls.includes('muted')) return 'secondary'
  if (cls.includes('accent')) return 'accent'
  return 'sky'
}

/** GET 脱敏占位符（与后端 CONFIG_MASK_PLACEHOLDER 对齐） */
export const AGENT_SECRET_MASK = '••••••••'

/** 是否为脱敏占位（接口不会回传明文密钥） */
export function isAgentSecretMasked(val: unknown): boolean {
  const key = String(val ?? '').trim()
  return key === AGENT_SECRET_MASK || key === '********'
}

/** Agent Mock / 演示模式判定（设置页与单测共用） */
export function isAgentMockProvider(opts: {
  draftProvider?: string | null
  pingProvider?: string | null
  pingReady?: boolean | null
  apiKey?: string | null
  apiKeyConfigured?: boolean | null
}): boolean {
  if (String(opts.draftProvider || '').toLowerCase() === 'mock') return true
  if (String(opts.pingProvider || '').toLowerCase() === 'mock') return true
  const hasKey =
    opts.apiKeyConfigured === true ||
    (Boolean(String(opts.apiKey || '').trim()) && !isAgentSecretMasked(opts.apiKey))
  if (opts.pingReady === false && !hasKey) return true
  return false
}

/** 厂商展示名与对话面板顶栏共用一张表，避免同一家在两个页面叫不同名字 */
export const AGENT_PROVIDER_PRESETS = [
  {
    id: 'deepseek',
    label: AGENT_PROVIDER_LABELS.deepseek,
    apiBase: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
  },
  {
    id: 'doubao',
    label: AGENT_PROVIDER_LABELS.doubao,
    apiBase: 'https://ark.cn-beijing.volces.com/api/v3',
    model: '',
  },
  { id: 'minimax', label: AGENT_PROVIDER_LABELS.minimax, apiBase: 'https://api.minimax.chat/v1', model: '' },
  {
    id: 'qwen',
    label: AGENT_PROVIDER_LABELS.qwen,
    apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: '',
  },
  { id: 'moonshot', label: AGENT_PROVIDER_LABELS.moonshot, apiBase: 'https://api.moonshot.cn/v1', model: '' },
  { id: 'custom', label: AGENT_PROVIDER_LABELS.custom, apiBase: '', model: '' },
  { id: 'mock', label: '演示（无密钥）', apiBase: '', model: '' },
]

/**
 * 快捷指令：与主页对话面板共用同一份来源（`ui.agentQuickPrompts`，缺省用
 * `shared/agent/constants/agent-quick-prompts` 的内置清单）。
 *
 * 之前这里另有一份「打开客厅灯 / 现在家里温度多少 / 那把它关掉」的演示句子，
 * 导致同一个管家在设置页和主页给出两套入口、文案也不一致；现在设置页只调
 * `readAgentQuickPrompts()`，用户在设置里改完立即两边同时生效。
 * 多轮理解的引导改为面板上的文字提示，不再靠预设凑句子。
 */
export { readAgentQuickPrompts as AGENT_CHAT_QUICK_PROMPTS } from '@/shared/agent/utils/quick-prompts.util'

/**
 * 快捷指令子卡（存在 app config `ui` 分区）的未保存状态与回滚入口。
 *
 * 为什么用模块级状态而不是 props/emits：子卡在「对话」子页里，由面板统一注册
 * 设置页的离开确认（`useRegisterSettingsTabPending('agent', …)`）。如果子卡自己
 * 用同一个 tab id 再注册一次，两个 watch 会互相覆盖 pendingByTab，出现「明明改了
 * 却提示没有未保存」。让子卡只往这两个槽里写状态，注册只发生一次。
 */
export const agentQuickPromptsDirty = ref(false)
export const agentQuickPromptsRevert = ref<(() => void) | null>(null)

export function chatOutcomeLabel(outcome: string) {
  if (outcome === 'success') return '已执行'
  if (outcome === 'answer') return '已回复'
  if (outcome === 'blocked') return '已拦截'
  if (outcome === 'failed') return '失败'
  if (outcome === 'error') return '错误'
  return outcome
}

export function chatOutcomeTone(outcome?: string): FlowStatTone {
  if (outcome === 'success' || outcome === 'answer') return 'emerald'
  if (outcome === 'blocked') return 'amber'
  if (outcome === 'failed' || outcome === 'error') return 'rose'
  return 'sky'
}

export function toneFromAgentClass(cls: string): FlowStatTone {
  if (cls.includes('emerald')) return 'emerald'
  if (cls.includes('amber')) return 'amber'
  if (cls.includes('violet') || cls.includes('indigo') || cls.includes('purple')) return 'violet'
  if (cls.includes('rose') || cls.includes('danger')) return 'rose'
  if (cls.includes('accent')) return 'sky'
  if (cls.includes('secondary') || cls.includes('slate')) return 'secondary'
  return mapFlowStatTone(cls)
}
