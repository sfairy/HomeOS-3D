/**
 * 执行轨迹展示工具：将轨迹步骤格式化为「名称 · 详情」文本。
 * 供 GeekAutomationBuilder 的选中轨迹详情与 GeekTraceRail 侧栏复用。
 */
export function formatTraceStep(step: unknown): string {
  if (!step || typeof step !== 'object') return String(step || '步骤')
  const s = step as Record<string, unknown>
  const name = s.step || s.name || s.action || s.type
  const detail = s.detail != null ? String(s.detail) : ''
  if (name && detail) return `${String(name)} · ${detail}`
  if (name) return String(name)
  if (s.message) return String(s.message)
  return '步骤'
}
