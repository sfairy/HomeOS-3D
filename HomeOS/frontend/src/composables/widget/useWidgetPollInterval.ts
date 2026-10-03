/**
 * Widget 轮询间隔解析工具。
 *
 * 所属模块：widget/composables
 * 职责：根据前端配置解析特定 widget 的轮询间隔，优先级为：
 *      widgetPollIntervals[name] ?? defaultWidgetPollMs ?? fallback。
 * 依赖：
 *   - @/utils/config/frontend-config（前端配置读取）
 */
import { getFrontendConfig } from '@/utils/config/frontend-config'

/**
 * 获取指定 widget 的轮询间隔（毫秒）。
 *
 * @param {string} widgetKey  widget 唯一标识（对应配置内 widgetPollIntervals 的 key）
 * @param {number} [fallbackMs=60000]  无任何配置时的兜底间隔
 * @returns 解析后的轮询间隔，单位毫秒
 */
export function getWidgetPollInterval(widgetKey: string, fallbackMs = 60000) {
  const cfg = getFrontendConfig()
  // 配置未就绪时直接返回兜底值
  if (!cfg) return fallbackMs
  // 优先级 1：widgetPollIntervals[widgetKey] 中的自定义值
  const custom = cfg.widgetPollIntervals?.[widgetKey]
  if (typeof custom === 'number' && custom > 0) return custom
  // 优先级 2：全局默认 defaultWidgetPollMs
  if (typeof cfg.defaultWidgetPollMs === 'number' && cfg.defaultWidgetPollMs > 0) {
    return cfg.defaultWidgetPollMs
  }
  // 优先级 3：函数入参兜底
  return fallbackMs
}