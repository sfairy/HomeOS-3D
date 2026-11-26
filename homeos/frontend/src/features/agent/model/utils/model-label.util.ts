/**
 * 管家顶栏「当前是谁在回话」的展示口径（纯函数，无副作用）。
 *
 * 这个标签必须和设置页「当前生效」同源：只认 `/agent/ping` 回来的 provider + model，
 * 也就是后端**真正在用**的那套配置。早先这里写死 `DeepSeek-V3`，用户把模型换成
 * `deepseek-v4-flash` 之后界面还在报一个后端根本没在用的型号，属于自说自话。
 *
 * 未探测到 / 探测失败时如实说「未连接」，不要拿一个好看的默认值糊过去。
 */

/** provider id → 人读名；与设置页 `AGENT_PROVIDER_PRESETS` 的 id 一一对应 */
export const AGENT_PROVIDER_LABELS: Record<string, string> = {
  deepseek: 'DeepSeek',
  doubao: '豆包',
  minimax: 'MiniMax',
  qwen: '通义千问',
  moonshot: 'Moonshot',
  openai: 'OpenAI',
  custom: '自定义',
}

/** `/agent/ping` 里本模块用到的字段（结构化声明，避免 shared 反向依赖 services） */
interface AgentModelSource {
  ok?: boolean
  provider?: string
  model?: string
  ready?: boolean
}

/** 厂商展示名；未登记的 id 原样返回，不猜厂商 */
export function agentProviderLabel(provider?: string | null): string {
  const raw = String(provider || '').trim()
  if (!raw) return ''
  return AGENT_PROVIDER_LABELS[raw.toLowerCase()] || raw
}

/**
 * 顶栏第二行的文案。
 *
 * @param ping `/agent/ping` 结果；为 `null` 表示还没探测过
 * @returns 后台设置里的模型名；退化成厂商名 / 状态词，绝不写死型号
 */
export function agentModelLabel(ping?: AgentModelSource | null): string {
  if (!ping) return ''
  const provider = String(ping.provider || '').trim()
  const model = String(ping.model || '').trim()
  const id = provider.toLowerCase()
  // 探测请求本身失败时面板塞的是占位值 provider='unknown'，不能当模型名显示
  if (ping.ok === false || id === 'unknown') return '未连接'
  // 演示模式没有真实模型，model 天然是空串
  if (id === 'mock') return '演示模式'
  if (id === 'unavailable') return '未配置模型'
  // model 才是「设置里填的那个值」；没填就退回厂商名
  return model || agentProviderLabel(provider) || provider
}
