/**
 * 极客自动化设备能力模型
 *
 * 职责：
 * - 定义米家式意图 + HA domain.service 落地的能力模型（GeekCapability）。
 * - 比简单 services 列表多：分组、设备类过滤、参数 schema、常用标记。
 * - 提供按实体解析能力、能力分组、常用能力定义等工具。
 *
 * 依赖：
 * - @homeos/shared 的 getEntityDomain。
 * - @/utils/registry/widget-catalog 的 DOMAIN_SERVICES 与 servicesForDomainBuilder。
 *
 * 注意：
 * - 能力 key 与 service 名为 HA 标识符，不翻译。
 * - 参数 `input`（number / text / select）为控件类型标识符，不翻译。
 * - 仅面向用户的能力名 / 参数 label 使用简体中文。
 */
import { getEntityDomain } from '@homeos/shared'
import { DOMAIN_SERVICES, servicesForDomainBuilder } from '@/utils/registry/widget-catalog'

/** GeekCapParamDef：类型定义，字段语义见声明。 */
export type GeekCapParamDef = {
  key: string
  label: string
  input: 'number' | 'text' | 'select'
  min?: number
  max?: number
  step?: number
  options?: { value: string; label: string }[]
  defaultValue?: string | number
  required?: boolean
  /** 可选：仅在高级里展示 */
  advanced?: boolean
}

type GeekCapabilityDef = {
  /** domain.service 或 domain.service#variant */
  id: string
  domain: string
  service: string
  label: string
  /** 米家式能力分组 */
  group: string
  /** 短意图：打开 / 调亮 / 设温… */
  intent: string
  /** 限制 HA device_class；空=该域通用 */
  deviceClasses?: string[]
  params?: GeekCapParamDef[]
  popular?: boolean
}

function domainOf(entityId: string | null | undefined): string {
  return getEntityDomain(String(entityId || ''))
}

const SERVICE_LABELS: Record<string, string> = {
  turn_on: '打开',
  turn_off: '关闭',
  toggle: '切换',
  open_cover: '打开',
  close_cover: '关闭',
  stop_cover: '停止',
  set_cover_position: '设置位置',
  set_temperature: '设置温度',
  set_hvac_mode: '设置模式',
  media_play: '播放',
  media_pause: '暂停',
  volume_set: '设置音量',
  lock: '上锁',
  unlock: '解锁',
  start: '开始',
  pause: '暂停',
  return_to_base: '回充',
  set_percentage: '设置百分比',
  set_humidity: '设置湿度',
  set_value: '设值',
  select_option: '选择选项',
}

const DOMAIN_LABELS: Record<string, string> = {
  light: '灯光',
  switch: '开关',
  cover: '窗帘',
  climate: '空调',
  fan: '风扇',
  scene: '场景',
  script: '脚本',
}

function svcLabel(service: string) {
  return SERVICE_LABELS[service] || service
}

function domLabel(domain: string) {
  return DOMAIN_LABELS[domain] || domain
}

const HVAC_MODES = [
  { value: 'off', label: '关闭' },
  { value: 'heat', label: '制热' },
  { value: 'cool', label: '制冷' },
  { value: 'heat_cool', label: '自动' },
  { value: 'fan_only', label: '送风' },
  { value: 'dry', label: '除湿' },
]

/** 能力目录：按域声明；未声明的域回退 DOMAIN_SERVICES */
const GEEK_CAPABILITY_CATALOG: GeekCapabilityDef[] = [
  // —— 灯光 ——
  {
    id: 'light.turn_on',
    domain: 'light',
    service: 'turn_on',
    label: '打开灯光',
    group: '开关',
    intent: '打开',
    popular: true,
    params: [
      { key: 'brightness_pct', label: '亮度 %', input: 'number', min: 1, max: 100, step: 1, defaultValue: 100 },
      { key: 'transition', label: '渐变秒', input: 'number', min: 0, max: 60, step: 0.5, defaultValue: 0, advanced: true },
      { key: 'color_temp', label: '色温 K', input: 'number', min: 2000, max: 6500, step: 50, advanced: true },
      { key: 'effect', label: '灯效', input: 'text', defaultValue: '', advanced: true },
    ],
  },
  {
    id: 'light.turn_off',
    domain: 'light',
    service: 'turn_off',
    label: '关闭灯光',
    group: '开关',
    intent: '关闭',
    popular: true,
    params: [
      { key: 'transition', label: '渐变秒', input: 'number', min: 0, max: 60, step: 0.5, defaultValue: 0, advanced: true },
    ],
  },
  {
    id: 'light.toggle',
    domain: 'light',
    service: 'toggle',
    label: '切换灯光',
    group: '开关',
    intent: '切换',
  },
  // —— 开关 ——
  {
    id: 'switch.turn_on',
    domain: 'switch',
    service: 'turn_on',
    label: '打开开关',
    group: '开关',
    intent: '打开',
    popular: true,
  },
  {
    id: 'switch.turn_off',
    domain: 'switch',
    service: 'turn_off',
    label: '关闭开关',
    group: '开关',
    intent: '关闭',
    popular: true,
  },
  {
    id: 'switch.toggle',
    domain: 'switch',
    service: 'toggle',
    label: '切换开关',
    group: '开关',
    intent: '切换',
  },
  // —— 窗帘（按 device_class 区分位置能力）——
  {
    id: 'cover.open_cover',
    domain: 'cover',
    service: 'open_cover',
    label: '打开窗帘',
    group: '开合',
    intent: '打开',
    popular: true,
  },
  {
    id: 'cover.close_cover',
    domain: 'cover',
    service: 'close_cover',
    label: '关闭窗帘',
    group: '开合',
    intent: '关闭',
    popular: true,
  },
  {
    id: 'cover.stop_cover',
    domain: 'cover',
    service: 'stop_cover',
    label: '停止窗帘',
    group: '开合',
    intent: '停止',
  },
  {
    id: 'cover.set_cover_position',
    domain: 'cover',
    service: 'set_cover_position',
    label: '设置窗帘位置',
    group: '位置',
    intent: '设位置',
    deviceClasses: ['curtain', 'shade', 'blind', 'shutter', 'window', 'awning', 'gate'],
    params: [
      { key: 'position', label: '位置 %', input: 'number', min: 0, max: 100, step: 1, defaultValue: 50, required: true },
    ],
  },
  {
    id: 'cover.open_cover#garage',
    domain: 'cover',
    service: 'open_cover',
    label: '打开车库门',
    group: '开合',
    intent: '打开',
    deviceClasses: ['garage', 'gate'],
  },
  {
    id: 'cover.close_cover#garage',
    domain: 'cover',
    service: 'close_cover',
    label: '关闭车库门',
    group: '开合',
    intent: '关闭',
    deviceClasses: ['garage', 'gate'],
  },
  // —— 空调 ——
  {
    id: 'climate.set_temperature',
    domain: 'climate',
    service: 'set_temperature',
    label: '设置温度',
    group: '温度',
    intent: '设温',
    popular: true,
    params: [
      { key: 'temperature', label: '温度 °C', input: 'number', min: 5, max: 35, step: 0.5, defaultValue: 22, required: true },
    ],
  },
  {
    id: 'climate.set_hvac_mode',
    domain: 'climate',
    service: 'set_hvac_mode',
    label: '设置空调模式',
    group: '模式',
    intent: '设模式',
    popular: true,
    params: [
      { key: 'hvac_mode', label: '模式', input: 'select', options: HVAC_MODES, defaultValue: 'heat', required: true },
    ],
  },
  {
    id: 'climate.turn_on',
    domain: 'climate',
    service: 'turn_on',
    label: '打开空调',
    group: '开关',
    intent: '打开',
  },
  {
    id: 'climate.turn_off',
    domain: 'climate',
    service: 'turn_off',
    label: '关闭空调',
    group: '开关',
    intent: '关闭',
  },
  // —— 风扇 ——
  {
    id: 'fan.turn_on',
    domain: 'fan',
    service: 'turn_on',
    label: '打开风扇',
    group: '开关',
    intent: '打开',
    popular: true,
  },
  {
    id: 'fan.turn_off',
    domain: 'fan',
    service: 'turn_off',
    label: '关闭风扇',
    group: '开关',
    intent: '关闭',
    popular: true,
  },
  {
    id: 'fan.set_percentage',
    domain: 'fan',
    service: 'set_percentage',
    label: '设置风速',
    group: '风速',
    intent: '设风速',
    params: [
      { key: 'percentage', label: '风速 %', input: 'number', min: 0, max: 100, step: 1, defaultValue: 50, required: true },
    ],
  },
  // —— 门锁 ——
  {
    id: 'lock.lock',
    domain: 'lock',
    service: 'lock',
    label: '上锁',
    group: '锁控',
    intent: '上锁',
    popular: true,
  },
  {
    id: 'lock.unlock',
    domain: 'lock',
    service: 'unlock',
    label: '解锁',
    group: '锁控',
    intent: '解锁',
    popular: true,
  },
  // —— 媒体 ——
  {
    id: 'media_player.media_play',
    domain: 'media_player',
    service: 'media_play',
    label: '播放',
    group: '播放',
    intent: '播放',
    popular: true,
  },
  {
    id: 'media_player.media_pause',
    domain: 'media_player',
    service: 'media_pause',
    label: '暂停',
    group: '播放',
    intent: '暂停',
  },
  {
    id: 'media_player.volume_set',
    domain: 'media_player',
    service: 'volume_set',
    label: '设置音量',
    group: '音量',
    intent: '设音量',
    params: [
      {
        key: 'volume_level',
        label: '音量 0–1',
        input: 'number',
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.4,
        required: true,
      },
    ],
  },
  // —— 扫地机 ——
  {
    id: 'vacuum.start',
    domain: 'vacuum',
    service: 'start',
    label: '开始清扫',
    group: '清扫',
    intent: '开始',
    popular: true,
  },
  {
    id: 'vacuum.return_to_base',
    domain: 'vacuum',
    service: 'return_to_base',
    label: '回充',
    group: '清扫',
    intent: '回充',
    popular: true,
  },
  {
    id: 'vacuum.pause',
    domain: 'vacuum',
    service: 'pause',
    label: '暂停清扫',
    group: '清扫',
    intent: '暂停',
  },
  // —— 加湿器 ——
  {
    id: 'humidifier.turn_on',
    domain: 'humidifier',
    service: 'turn_on',
    label: '打开加湿器',
    group: '开关',
    intent: '打开',
  },
  {
    id: 'humidifier.set_humidity',
    domain: 'humidifier',
    service: 'set_humidity',
    label: '设置湿度',
    group: '湿度',
    intent: '设湿度',
    params: [
      { key: 'humidity', label: '湿度 %', input: 'number', min: 0, max: 100, step: 1, defaultValue: 50, required: true },
    ],
  },
  // —— 报警 ——
  {
    id: 'alarm_control_panel.alarm_arm_home',
    domain: 'alarm_control_panel',
    service: 'alarm_arm_home',
    label: '在家布防',
    group: '布防',
    intent: '在家布防',
    params: [{ key: 'code', label: '密码（可选）', input: 'text', defaultValue: '' }],
  },
  {
    id: 'alarm_control_panel.alarm_arm_away',
    domain: 'alarm_control_panel',
    service: 'alarm_arm_away',
    label: '离家布防',
    group: '布防',
    intent: '离家布防',
    params: [{ key: 'code', label: '密码（可选）', input: 'text', defaultValue: '' }],
  },
  {
    id: 'alarm_control_panel.alarm_disarm',
    domain: 'alarm_control_panel',
    service: 'alarm_disarm',
    label: '撤防',
    group: '布防',
    intent: '撤防',
    params: [{ key: 'code', label: '密码（可选）', input: 'text', defaultValue: '' }],
  },
  // —— 输入 ——
  {
    id: 'input_boolean.turn_on',
    domain: 'input_boolean',
    service: 'turn_on',
    label: '打开布尔',
    group: '开关',
    intent: '打开',
  },
  {
    id: 'input_boolean.turn_off',
    domain: 'input_boolean',
    service: 'turn_off',
    label: '关闭布尔',
    group: '开关',
    intent: '关闭',
  },
  {
    id: 'input_number.set_value',
    domain: 'input_number',
    service: 'set_value',
    label: '设置数值',
    group: '数值',
    intent: '设值',
    params: [{ key: 'value', label: '数值', input: 'number', step: 1, defaultValue: 0, required: true }],
  },
  {
    id: 'input_select.select_option',
    domain: 'input_select',
    service: 'select_option',
    label: '选择选项',
    group: '选项',
    intent: '选选项',
    params: [{ key: 'option', label: '选项', input: 'text', defaultValue: '', required: true }],
  },
  // —— 场景 / 脚本 ——
  {
    id: 'scene.turn_on',
    domain: 'scene',
    service: 'turn_on',
    label: '执行场景',
    group: '场景',
    intent: '执行',
    popular: true,
  },
  {
    id: 'script.turn_on',
    domain: 'script',
    service: 'turn_on',
    label: '运行脚本',
    group: '脚本',
    intent: '运行',
    popular: true,
  },
]

/** GeekCapability：类型定义，字段语义见声明。 */
export type GeekCapability = {
  id: string
  label: string
  domain: string
  service: string
  group?: string
  intent?: string
  params?: GeekCapParamDef[]
  popular?: boolean
}

function fallbackCaps(domain: string): GeekCapability[] {
  return servicesForDomainBuilder(domain).map((service) => ({
    id: `${domain}.${service}`,
    label: svcLabel(service),
    domain,
    service,
    group: '通用',
    intent: svcLabel(service),
  }))
}

/** 按实体解析能力（可传 attributes.device_class） */
export function resolveCapabilitiesForEntity(
  entityId: string | null | undefined,
  attrs?: Record<string, unknown> | null,
): GeekCapability[] {
  const domain = domainOf(entityId)
  if (!domain) return []
  const deviceClass = String(attrs?.device_class || '')
    .trim()
    .toLowerCase()
  let fromCatalog = GEEK_CAPABILITY_CATALOG.filter((d) => {
    if (d.domain !== domain) return false
    if (!d.deviceClasses?.length) return true
    // 有 device_class 限定时：未知 class 先不展示专属能力，避免车库/窗帘文案重复
    if (!deviceClass) return false
    return d.deviceClasses.map((c) => c.toLowerCase()).includes(deviceClass)
  })
  if (deviceClass) {
    const specificServices = new Set(
      fromCatalog.filter((d) => d.deviceClasses?.length).map((d) => d.service),
    )
    fromCatalog = fromCatalog.filter((d) => {
      if (d.deviceClasses?.length) return true
      return !specificServices.has(d.service)
    })
  }
  if (fromCatalog.length) {
    return fromCatalog.map((d) => ({
      id: d.id,
      label: d.label,
      domain: d.domain,
      service: d.service,
      group: d.group,
      intent: d.intent,
      params: d.params,
      popular: d.popular,
    }))
  }
  return fallbackCaps(domain).map((c) => {
    const def = GEEK_CAPABILITY_CATALOG.find((d) => d.domain === c.domain && d.service === c.service)
    return def
      ? {
          id: def.id,
          label: def.label,
          domain: def.domain,
          service: def.service,
          group: def.group,
          intent: def.intent,
          params: def.params,
          popular: def.popular,
        }
      : c
  })
}

/** groupCapabilities：函数，按签名入参返回处理结果。 */
export function groupCapabilities(caps: GeekCapability[]): { group: string; items: GeekCapability[] }[] {
  const map = new Map<string, GeekCapability[]>()
  for (const c of caps) {
    const g = c.group || '通用'
    const list = map.get(g)
    if (list) list.push(c)
    else map.set(g, [c])
  }
  return [...map.entries()].map(([group, items]) => ({ group, items }))
}

function findCapabilityDef(domain: string, service: string): GeekCapabilityDef | null {
  return GEEK_CAPABILITY_CATALOG.find((d) => d.domain === domain && d.service === service) || null
}

/** paramsForCapabilityDef：函数，按签名入参返回处理结果。 */
export function paramsForCapabilityDef(domain: string, service: string): GeekCapParamDef[] {
  return findCapabilityDef(domain, service)?.params || []
}

/** popularCapabilityDefs：函数，按签名入参返回处理结果。 */
export function popularCapabilityDefs(): GeekCapability[] {
  const marked = GEEK_CAPABILITY_CATALOG.filter((d) => d.popular)
  if (marked.length) {
    return marked.map((d) => ({
      id: d.id,
      label: `${domLabel(d.domain)} · ${d.intent || d.label}`,
      domain: d.domain,
      service: d.service,
      group: d.group,
      intent: d.intent,
      params: d.params,
      popular: true,
    }))
  }
  const domains = ['light', 'switch', 'cover', 'climate', 'fan', 'scene', 'script']
  const out: GeekCapability[] = []
  for (const domain of domains) {
    for (const service of DOMAIN_SERVICES[domain] || []) {
      if (!['turn_on', 'turn_off', 'toggle', 'open_cover', 'close_cover'].includes(service)) continue
      out.push({
        id: `${domain}.${service}`,
        label: `${domLabel(domain)} · ${svcLabel(service)}`,
        domain,
        service,
        group: '常用',
        intent: svcLabel(service),
      })
    }
  }
  return out
}

