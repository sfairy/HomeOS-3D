/** 设备域中文标签工具 */
import { ENTITY_DOMAIN_LABELS } from '@/shared/constants/entity-domain-meta'

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

/**
 * 设备域 → 中文标签（列表/详情/分析页共用）。
 *
 * **必须惰性合并**（首次调用时才拼表），不能在模块顶层直接 `{...ENTITY_DOMAIN_LABELS, ...}`：
 * 构建产物里本模块与 entity-domain-meta 可能落进互相 import 的 chunk 环，环内被 import 的
 * const 在来源 chunk 体执行前是 `undefined`，对象展开**不报错**、只会把整张表静默变成空表
 * （症状：设备/事件页的域标签全退化成英文 domain id，且没有任何控制台报错，极难定位）。
 * 改成首次使用时合并，求值时机就推到「所有模块都已初始化」之后，与 chunk 分组无关。
 */
let domainLabelsCache: Record<string, string> | null = null

function domainLabels(): Record<string, string> {
  return (domainLabelsCache ??= { ...ENTITY_DOMAIN_LABELS, ...DEVICE_DOMAIN_EXTRA })
}

export function getDomainLabel(domain: string): string {
  if (!domain) return ''
  return domainLabels()[domain] ?? domain
}

/** 从中文标签反查域 id（点击图表筛选用） */
export function resolveDomainId(labelOrId: string): string {
  if (domainLabels()[labelOrId]) return labelOrId
  const entry = Object.entries(domainLabels()).find(([, label]) => label === labelOrId)
  return entry?.[0] ?? labelOrId
}
