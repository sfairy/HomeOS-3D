/**
 * 读取当前生效的智能管家快捷指令（`ui.agentQuickPrompts`）。
 *
 * 为什么单独一个 util 而不是直接写下组件里：
 * - 主页对话面板与「设置 → 智能管家 → 对话」两处都要渲染这排按钮，各自解析配置
 *   迟早会出现两套不同的兜底规则；
 * - 「字段缺省」与「显式清空」必须是两种行为：缺省回落到内置默认，`[]` 才是
 *   「用户不要快捷入口」。这条语义只在这里实现一次。
 *
 * 返回的数组里每一项都是纯数据，可以在 `computed` 里直接当快照用。
 */
import {
  AGENT_QUICK_PROMPTS,
  normalizeAgentQuickPrompts,
  type AgentQuickPrompt,
} from '@/shared/agent/constants/agent-quick-prompts'
import { configEpoch, getConfigSection } from '@/shared/utils/config/frontend-config'

/**
 * 当前生效的快捷指令。
 *
 * 内部读了一次 `configEpoch`：配置热更新（保存后 `reloadFrontendConfig`、
 * WS 推送配置变更）会递增它，在 `computed` / 模板里调用本函数即可自动重算，
 * 不需要额外订阅。
 */
export function readAgentQuickPrompts(): AgentQuickPrompt[] {
  void configEpoch.value
  const configured = normalizeAgentQuickPrompts(getConfigSection('ui')?.agentQuickPrompts)
  // 缺省（null）才用内置默认；用户显式存了空数组就是「关掉这排按钮」
  return configured ?? AGENT_QUICK_PROMPTS.map((item) => ({ ...item }))
}

/**
 * chips 的悬浮提示：提示语是可选的（用户自定义时常省略），别拼出「｜发送…」这种孤立分隔符。
 * 放在这里是因为主页面板与设置页共用同一套按钮。
 */
export function quickPromptTitle(item: AgentQuickPrompt): string {
  const sent = `发送「${item.prompt}」`
  return item.hint ? `${item.hint}｜${sent}` : sent
}

/** 读屏文案：有 hint 才补括号说明，否则读出来就是「全关所有灯（）」 */
export function quickPromptAria(item: AgentQuickPrompt): string {
  return item.hint ? `${item.label}（${item.hint}）` : item.label
}
