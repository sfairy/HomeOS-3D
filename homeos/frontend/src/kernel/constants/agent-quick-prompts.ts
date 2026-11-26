/**
 * 智能管家快捷指令预设（对话面板底部 chips）
 *
 * 设计口径：
 * - 一条只覆盖一个智能家居支柱：灯光 / 温控 / 窗帘 / 家庭模式 / 全屋感知 / 能耗，
 *   让用户从面板上就能看出管家「能管什么」，而不是只看到几句闲聊。
 * - `label` 是按钮上的短文案（折合不超过 6 个汉字宽，数字按半宽算），保证 300px 窄栏里
 *   一行放下三条、两行放完全部；`prompt` 才是真正发给管家的完整指令，按钮 `title` 上悬浮可见，
 *   避免短标签丢信息。
 * - `prompt` 全部按后端快路径（`runtime/fast_path.py`）与工具 schema 的既有说法书写，
 *   点了就有确定结果：全关灯 / 设温度 / 窗帘半开 / 家庭模式 / 全屋状态 / 用电统计。
 *
 * 这份常量只是**内置默认**。真正生效的清单来自 `ui.agentQuickPrompts`（见
 * `shared/agent/utils/quick-prompts.util.ts`）：用户在设置里改过就用配置，
 * 没配过（字段缺省）才回落到这里。
 */

/** 单条快捷指令：短标签 + 完整指令 */
export type AgentQuickPrompt = {
  /** 按钮文案（短，保证不换行、不撑破窄栏） */
  label: string
  /** 点击后真正发送的指令 */
  prompt: string
  /** 无障碍补充说明（读屏用，说明这条指令管的是什么） */
  hint: string
}

/**
 * 快捷指令的规模上限，与后端 `AGENT_QUICK_PROMPT_*` 同值。
 *
 * 前端也判一次：配置可能经导入 / 手改接口绕过设置页，超长文案或几十条指令会把这排
 * 按钮从「快捷入口」变成半屏清单，必须在渲染前收敛掉。
 */
export const AGENT_QUICK_PROMPT_LIMITS = {
  /** 条数上限：一行三条、四行封顶 */
  maxItems: 12,
  /** 按钮文案上限（字） */
  label: 12,
  /** 完整指令上限（字） */
  prompt: 120,
  /** 悬浮提示上限（字） */
  hint: 60,
} as const

/** 面板底部展示的默认快捷指令，顺序即从左到右、从上到下的展示顺序 */
export const AGENT_QUICK_PROMPTS: readonly AgentQuickPrompt[] = [
  { label: '全关所有灯', prompt: '把家里所有开着的灯都关掉', hint: '灯光：一键关闭全屋照明' },
  { label: '空调调到25度', prompt: '把客厅空调调到25度', hint: '温控：设定客厅空调温度' },
  { label: '窗帘开一半', prompt: '把客厅窗帘打开一半', hint: '窗帘：按比例开合' },
  { label: '开启睡眠模式', prompt: '切换到睡眠模式', hint: '家庭模式：一键切换全屋场景' },
  { label: '家里什么状态', prompt: '家里现在什么状态', hint: '全屋感知：灯、温湿度、安防概览' },
  { label: '今天耗电多少', prompt: '今天用了多少电', hint: '能耗：今日用电统计' },
] as const

/** 按字数上限裁剪并去掉首尾空白；空串按「没填」处理 */
function clipText(value: unknown, max: number): string {
  return String(value ?? '')
    .trim()
    .slice(0, max)
}

/**
 * 把一条配置项归一成可渲染的快捷指令；不可用时返回 null。
 *
 * 允许字符串简写（`"今天用了多少电"`）：手改配置或导入时只写一句指令最省事，
 * 此时按钮文案直接用指令本身。
 */
function normalizeItem(raw: unknown): AgentQuickPrompt | null {
  if (typeof raw === 'string') {
    const prompt = clipText(raw, AGENT_QUICK_PROMPT_LIMITS.prompt)
    return prompt ? { label: prompt, prompt, hint: '' } : null
  }
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const prompt = clipText(record.prompt, AGENT_QUICK_PROMPT_LIMITS.prompt)
  if (!prompt) return null
  const label = clipText(record.label, AGENT_QUICK_PROMPT_LIMITS.label) || prompt
  return { label, prompt, hint: clipText(record.hint, AGENT_QUICK_PROMPT_LIMITS.hint) }
}

/**
 * 归一化 `ui.agentQuickPrompts`。
 *
 * @param raw 配置里的原始值（可能缺省、可能是脏数据）
 * @returns 数组 = 用户显式配置（可能是空数组，语义是「不要快捷入口」）；
 *          null = 字段缺省 / 不是数组，调用方应回落到内置默认。
 */
export function normalizeAgentQuickPrompts(raw: unknown): AgentQuickPrompt[] | null {
  if (!Array.isArray(raw)) return null
  const seen = new Set<string>()
  const out: AgentQuickPrompt[] = []
  for (const entry of raw) {
    const item = normalizeItem(entry)
    // 同一条指令重复出现没有意义，保留第一条（人工编辑配置时很常见）
    if (!item || seen.has(item.prompt)) continue
    seen.add(item.prompt)
    out.push(item)
    if (out.length >= AGENT_QUICK_PROMPT_LIMITS.maxItems) break
  }
  return out
}
