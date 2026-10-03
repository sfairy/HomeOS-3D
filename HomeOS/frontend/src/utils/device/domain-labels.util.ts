/**
 * 设备域中文标签工具
 *
 * 职责：
 * - 在 @/constants/entity-domain-meta 收录的核心域基础上，补充设备页扩展域
 *   （notify / sun / zone / group / timer / ... 等）的中文标签。
 * - 提供域 → 中文标签查询与「中文标签 → 域 id」反查工具，供设备列表 / 详情 /
 *   分析页与图表筛选共用。
 *
 * 依赖：@/constants/entity-domain-meta 的 ENTITY_DOMAIN_LABELS。
 *
 * 注意：domain key（light / switch / cover ...）为 HA 标识符，不翻译；
 *   仅面向用户的标签 value 使用简体中文。
 */
import { ENTITY_DOMAIN_LABELS } from '@/constants/entity-domain-meta'

/** 设备页补充域（集成/扩展域，entity-domain-meta 未收录） */
const DEVICE_DOMAIN_EXTRA: Record<string, string> = {
  notify: '通知',
  sun: '太阳',
  zone: '区域',
  group: '组',
  timer: '计时器',
  calendar: '日历',
  text: '文本',
  image: '图片',
  todo: '待办',
  tts: '语音',
  conversation: '对话',
  lawn_mower: '割草机',
  stt: '语音识别',
  template: '模板',
  counter: '计数器',
  datetime: '日期时间',
  tag: '标签',
  persistent_notification: '持久通知',
}

/** 设备域 → 中文标签（列表/详情/分析页共用） */
const DOMAIN_LABELS: Record<string, string> = {
  ...ENTITY_DOMAIN_LABELS,
  ...DEVICE_DOMAIN_EXTRA,
}

/** getDomainLabel：函数，按签名入参返回处理结果。 */
export function getDomainLabel(domain: string): string {
  if (!domain) return ''
  return DOMAIN_LABELS[domain] ?? domain
}

/** 从中文标签反查域 id（点击图表筛选用） */
export function resolveDomainId(labelOrId: string): string {
  if (DOMAIN_LABELS[labelOrId]) return labelOrId
  const entry = Object.entries(DOMAIN_LABELS).find(([, label]) => label === labelOrId)
  return entry?.[0] ?? labelOrId
}
