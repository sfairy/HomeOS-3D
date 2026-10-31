/**
 * @file agent-panel-helpers.internals.ts
 * @module frontend/src/features/settings/interact/composables
 */
/** 智能管家设置面板：纯辅助 / 常量 */

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

export const AGENT_PROVIDER_PRESETS = [
  { id: 'deepseek', label: 'DeepSeek', apiBase: 'https://api.deepseek.com', model: 'deepseek-v4-flash' },
  { id: 'doubao', label: '豆包', apiBase: 'https://ark.cn-beijing.volces.com/api/v3', model: '' },
  { id: 'minimax', label: 'MiniMax', apiBase: 'https://api.minimax.chat/v1', model: '' },
  { id: 'qwen', label: '通义千问', apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: '' },
  { id: 'moonshot', label: 'Moonshot', apiBase: 'https://api.moonshot.cn/v1', model: '' },
  { id: 'custom', label: '自定义', apiBase: '', model: '' },
  { id: 'mock', label: '演示（无密钥）', apiBase: '', model: '' },
]

export const AGENT_CHAT_QUICK_PROMPTS = ['打开客厅灯', '现在家里温度多少', '那把它关掉']

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
