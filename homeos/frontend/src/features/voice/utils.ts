import { getConfigSection } from '@/kernel/config/frontend-config'
import { getDefaultDailyAdvisorTtsDaytime, getDefaultDailyAdvisorTtsEvening } from '@/kernel/constants/index'
import { getEntityDisplayName } from '@/domain/entity/utils/derived'

/**
 * edge-tts 神经音色清单（中文为主，附少量英文）。
 *
 * 只列「长期稳定」的神经音色：微软会不定期下线旧音色，列表太长反而让用户选到
 * 已经不可用的名字。`value` 是直接塞进 SSML `<voice name>` 的完整音色名。
 */
interface EdgeVoiceOption {
  /** SSML 音色名 */
  value: string
  /** 展示名 */
  label: string
  /** 性别/风格提示 */
  hint: string
}

/** 中文神经音色（大陆普通话为主，含少量方言与港台） */
const EDGE_VOICES_ZH: EdgeVoiceOption[] = [
  { value: 'zh-CN-XiaoxiaoNeural', label: '晓晓', hint: '女声 · 温暖亲和（默认）' },
  { value: 'zh-CN-XiaoyiNeural', label: '晓伊', hint: '女声 · 活泼' },
  { value: 'zh-CN-YunxiNeural', label: '云希', hint: '男声 · 阳光' },
  { value: 'zh-CN-YunjianNeural', label: '云健', hint: '男声 · 沉稳' },
  { value: 'zh-CN-YunyangNeural', label: '云扬', hint: '男声 · 新闻播报' },
  { value: 'zh-CN-YunxiaNeural', label: '云夏', hint: '男童声' },
  { value: 'zh-CN-liaoning-XiaobeiNeural', label: '晓北', hint: '女声 · 东北话' },
  { value: 'zh-CN-shaanxi-XiaoniNeural', label: '晓妮', hint: '女声 · 陕西话' },
  { value: 'zh-HK-HiuMaanNeural', label: '曉曼', hint: '女声 · 粤语' },
  { value: 'zh-TW-HsiaoChenNeural', label: '曉臻', hint: '女声 · 台湾国语' },
]

/** 英文神经音色（双语家庭 / 英文界面时可用） */
const EDGE_VOICES_EN: EdgeVoiceOption[] = [
  { value: 'en-US-AriaNeural', label: 'Aria', hint: 'Female · US' },
  { value: 'en-US-GuyNeural', label: 'Guy', hint: 'Male · US' },
  { value: 'en-GB-SoniaNeural', label: 'Sonia', hint: 'Female · UK' },
]

/** 全部音色（下拉框按分组渲染用） */
const EDGE_VOICES: EdgeVoiceOption[] = [...EDGE_VOICES_ZH, ...EDGE_VOICES_EN]

/** OpenAI 兼容引擎的常用音色 */
const OPENAI_VOICES: EdgeVoiceOption[] = [
  { value: 'alloy', label: 'alloy', hint: '中性' },
  { value: 'echo', label: 'echo', hint: '男声' },
  { value: 'fable', label: 'fable', hint: '英式' },
  { value: 'onyx', label: 'onyx', hint: '低沉男声' },
  { value: 'nova', label: 'nova', hint: '明亮女声' },
  { value: 'shimmer', label: 'shimmer', hint: '柔和女声' },
]

/** 按引擎取音色清单 */
export function voicesForEngine(engine: string | undefined): EdgeVoiceOption[] {
  return engine === 'openai' ? OPENAI_VOICES : EDGE_VOICES
}

/** 当前音色不在清单里时（例如手填了自定义音色）补一个选项，避免下拉框显示空白 */
export function withCurrentVoice(list: EdgeVoiceOption[], current: string): EdgeVoiceOption[] {
  const name = String(current || '').trim()
  if (!name || list.some((item) => item.value === name)) return list
  return [{ value: name, label: name, hint: '自定义' }, ...list]
}

/** TTS 播报音箱解析工具 */

/** 实体表最小形状：entity_id → { state? } */
type EntityMap = Record<string, { state?: string } | undefined>

/**
 * 列出当前可用的 HA media_player 实体 id。
 *
 * @param entities 实体表（来自 entity store）
 * @returns 过滤掉 unavailable 后按中文 locale 排序的 entity_id 数组
 */
function listAvailableMediaPlayerIds(entities: EntityMap): string[] {
  return Object.keys(entities)
    .filter((id) => id.startsWith('media_player.') && entities[id]?.state !== 'unavailable')
    .sort((a, b) => a.localeCompare(b, 'zh'))
}

/**
 * 从公开配置读取已配置的播报音箱。
 *
 * @returns voice.ttsMediaPlayerIds 配置项映射并去空后的数组；未配置或格式错误时返回空数组
 */
function getConfiguredTtsMediaPlayerIds(): string[] {
  const voiceConfig = getConfigSection('voice') as Record<string, unknown>
  const rawIds = voiceConfig?.ttsMediaPlayerIds
  if (Array.isArray(rawIds) && rawIds.length) {
    return rawIds.map((id) => String(id).trim()).filter(Boolean)
  }
  return []
}

/**
 * 解析 TTS 播报音箱列表：优先返回已配置项；未配置且允许回退时取首个可用 media_player。
 *
 * @param entities 实体表（用于紧急回退查找可用音箱）
 * @param options.emergencyFallback 未配置时是否回退到第一个可用 media_player
 * @returns 播报目标 entity_id 数组（可能为空）
 */
export function resolveTtsMediaPlayerIds(entities?: EntityMap, options?: { emergencyFallback?: boolean }): string[] {
  const configured = getConfiguredTtsMediaPlayerIds()
  if (configured.length) return configured
  if (!options?.emergencyFallback || !entities) return []
  const fallback = listAvailableMediaPlayerIds(entities)
  return fallback.length ? [fallback[0]] : []
}

/** 语音播报风格与每日顾问 TTS 配置工具 */

/** 内置告警播报风格（用户选风格，后台仍存模板字符串） */
function getBuiltinSpeechStyles() {
  return [
    { id: 'default', label: '系统默认', template: '' },
    { id: 'short', label: '简短提醒', template: '请注意，{{name}}' },
    { id: 'detail', label: '朗读详情', template: '{{message}}' },
    { id: 'zone', label: '区域告警', template: '{{zones}} 检测到 {{name}}' },
    { id: 'custom', label: '自定义', template: null },
  ]
}

/** 各内置规则适用的风格 */
const BUILTIN_STYLE_FOR_KEY: Record<string, string[]> = {
  securityZone: ['default', 'short', 'zone', 'custom'],
  securityAnomaly: ['default', 'detail', 'short', 'custom'],
  safetySmoke: ['default', 'short', 'custom'],
  safetyGas: ['default', 'short', 'custom'],
  safetyWater: ['default', 'short', 'custom'],
  securityEmergency: ['default', 'short', 'custom'],
  presenceLeft: ['default', 'custom'],
  energyAnomaly: ['default', 'short', 'custom'],
  energyBudget: ['default', 'detail', 'custom'],
  waterAnomaly: ['default', 'detail', 'custom'],
  envMoldRisk: ['default', 'detail', 'custom'],
  notificationDanger: ['default', 'detail', 'custom'],
  notificationWarn: ['default', 'detail', 'custom'],
}

/** 试听/预览用的示例数据 */
export function getAlertPreviewSamples() {
  const fallbackZones = '客厅'
  return {
    securityZone: {
      name: '客厅人体传感器',
      zones: fallbackZones,
      entity_id: 'binary_sensor.living_motion',
      message: '',
    },
    securityAnomaly: {
      name: '玄关',
      message: '检测到长时间滞留',
      entity_id: 'binary_sensor.entrance',
    },
    safetySmoke: { name: '厨房烟雾传感器', entity_id: 'binary_sensor.kitchen_smoke' },
    safetyGas: { name: '厨房燃气传感器', entity_id: 'binary_sensor.kitchen_gas' },
    safetyWater: { name: '卫生间漏水传感器', entity_id: 'binary_sensor.bath_water' },
    securityEmergency: { name: '紧急按钮', message: 'SOS 已触发' },
    presenceLeft: { name: '全屋', message: '所有家人已离家' },
    energyAnomaly: { name: '客厅空调', entity_id: 'climate.living' },
    energyBudget: { name: '本月用电', message: '预计超出预算 15%' },
    waterAnomaly: { name: '厨房水阀', message: '持续用水超过 30 分钟' },
    envMoldRisk: { name: '主卧', room: '主卧', message: '湿度偏高，请注意通风' },
    notificationDanger: { name: '系统', message: '燃气浓度异常，请立即检查', level: 'danger' },
    notificationWarn: { name: '系统', message: '设备离线提醒', level: 'warn' },
  }
}

/** 系统默认播报（与后端 speakForRule 一致，用于预览） */
export function getBuiltinDefaultSpeech() {
  return {
    securityZone: '安防告警：客厅人体传感器 触发了 客厅',
    securityAnomaly: '检测到长时间滞留',
    safetySmoke: '烟雾告警：厨房烟雾传感器 检测到烟雾，请立即检查',
    safetyGas: '燃气泄漏告警：厨房燃气传感器，请立即通风并检查燃气阀',
    safetyWater: '漏水告警：卫生间漏水传感器，水阀已尝试自动关闭',
    securityEmergency: '紧急求助已触发：SOS，请立即处理',
    presenceLeft: '所有家人已离家，安防已自动布防',
    energyAnomaly: '能源告警：客厅空调 当前功耗异常，请检查',
    energyBudget: '能源预算告警：预计超出预算 15%',
    waterAnomaly: '用水告警：持续用水超过 30 分钟',
    envMoldRisk: '主卧霉菌风险偏高：湿度偏高，请注意通风',
    notificationDanger: '燃气浓度异常，请立即检查',
    notificationWarn: '设备离线提醒',
  }
}

export function getCustomAlertSpeechModes() {
  return [
    { id: 'trigger', label: '设备触发', desc: '例：客厅门磁 已触发', template: '{{name}} 已触发' },
    {
      id: 'state_change',
      label: '状态变化',
      desc: '例：客厅门磁 状态变为 打开',
      template: '{{name}} 状态变为 {{state}}',
    },
    { id: 'state_on', label: '已打开', desc: '例：客厅灯 已打开', template: '{{name}} 已打开' },
    { id: 'state_off', label: '已关闭', desc: '例：客厅灯 已关闭', template: '{{name}} 已关闭' },
    { id: 'notify_read', label: '朗读通知', desc: '直接播报通知正文', template: '{{message}}' },
    { id: 'fixed', label: '固定话术', desc: '播报你写的固定文字', template: '' },
  ]
}

export function getEntityStateOptions() {
  return [
    { value: 'on', label: '开启 (on)' },
    { value: 'off', label: '关闭 (off)' },
    { value: 'open', label: '打开 (open)' },
    { value: 'closed', label: '关闭 (closed)' },
    { value: 'unlocked', label: '解锁 (unlocked)' },
    { value: 'locked', label: '上锁 (locked)' },
    { value: 'detected', label: '检测到 (detected)' },
    { value: 'clear', label: '恢复 (clear)' },
    { value: '', label: '任意状态变化' },
  ]
}

export function getEntityTtsVarChips() {
  return [
    { key: 'name', label: '设备名' },
    { key: 'state', label: '当前状态' },
    { key: 'old_state', label: '上一状态' },
    { key: 'entity_id', label: '实体 ID' },
  ]
}

export function previewVarsForEntity(
  entityId: string,
  entitiesStore: { entities?: Record<string, { state?: string } | undefined> } | null | undefined,
) {
  const entity = entitiesStore?.entities?.[entityId]
  const name = getEntityDisplayName(entityId, entity) || entityId || '示例设备'
  return {
    name,
    friendly_name: name,
    entity_id: entityId || 'binary_sensor.demo',
    state: entity?.state || 'on',
    old_state: 'off',
  }
}

export function getDailyAdvisorDayPresets() {
  return [
    {
      id: 'default',
      label: '检测到 (detected)',
      desc: '节能贴士',
      template: getDefaultDailyAdvisorTtsDaytime(),
    },
    { id: 'welcome', label: '简短问候', desc: '欢迎回家', template: '欢迎回家，祝您有美好的一天' },
    { id: 'custom', label: '自定义', desc: '自己编写', template: null },
  ]
}

export function getDailyAdvisorEveningPresets() {
  return [
    {
      id: 'default',
      label: '自己编写',
      desc: '自定义',
      template: getDefaultDailyAdvisorTtsEvening(),
    },
    { id: 'goodnight', label: '晚间问候', desc: '简短祝福', template: '晚上好，祝您晚安' },
    { id: 'custom', label: '自定义', desc: '自己编写', template: null },
  ]
}

export function getAlertHubSections() {
  return [
    { id: 'inbox', label: '应用内规则', icon: 'inbox' },
    { id: 'voice', label: '语音播报', icon: 'volume' },
    { id: 'dnd', label: '免打扰', icon: 'moon' },
    { id: 'earthquake', label: '地震预警', icon: 'alert' },
  ]
}

export function applyTemplatePreview(template: unknown, vars: Record<string, unknown> = {}) {
  const raw = String(template || '').trim()
  if (!raw) return ''
  const fallbackRoom = '客厅'
  return raw
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
      const v = vars[key]
      if (v == null || v === '') {
        const fallbacks: Record<string, string> = {
          name: '设备',
          entity_id: 'entity.demo',
          message: '告警详情',
          zones: fallbackRoom,
          state: 'on',
          hour: String(new Date().getHours()),
          level: 'warn',
          room: fallbackRoom,
        }
        return fallbacks[key] ?? ''
      }
      return String(v)
    })
    .trim()
}

export function detectBuiltinStyle(_key: string, template: unknown) {
  const tpl = String(template || '').trim()
  if (!tpl) return 'default'
  for (const style of getBuiltinSpeechStyles()) {
    if (style.template && style.template === tpl) return style.id
  }
  return 'custom'
}

export function builtinStyleTemplate(styleId: string, customText: unknown) {
  const style = getBuiltinSpeechStyles().find((s) => s.id === styleId)
  if (!style || styleId === 'default') return ''
  if (styleId === 'custom') return String(customText || '').trim()
  return style.template || ''
}

export function stylesForAlertKey(key: string) {
  const allowed = BUILTIN_STYLE_FOR_KEY[key] || ['default', 'short', 'custom']
  return getBuiltinSpeechStyles().filter((s) => allowed.includes(s.id))
}

export function detectCustomSpeechMode(template: unknown) {
  const tpl = String(template || '').trim()
  const hit = getCustomAlertSpeechModes().find((m) => m.template && m.template === tpl)
  if (hit) return { mode: hit.id, fixedText: '' }
  if (!tpl) return { mode: 'trigger', fixedText: '' }
  return { mode: 'fixed', fixedText: tpl }
}

export function composeCustomAlertTemplate(mode: string, fixedText: unknown) {
  if (mode === 'fixed') return String(fixedText || '').trim() || '请注意'
  const hit = getCustomAlertSpeechModes().find((m) => m.id === mode)
  return hit?.template || '{{name}} 已触发'
}

export function detectDailyPreset(period: string, text: unknown) {
  const presets = period === 'evening' ? getDailyAdvisorEveningPresets() : getDailyAdvisorDayPresets()
  const tpl = String(text || '').trim()
  if (!tpl) return 'default'
  const hit = presets.find((p) => p.template && p.template === tpl)
  return hit?.id || 'custom'
}

export function dailyPresetTemplate(presetId: string, period: string, customText: unknown) {
  if (presetId === 'custom') return String(customText || '').trim()
  if (presetId === 'default') return ''
  const presets = period === 'evening' ? getDailyAdvisorEveningPresets() : getDailyAdvisorDayPresets()
  const hit = presets.find((p) => p.id === presetId)
  return hit?.template || ''
}

export function previewDailyAdvisor(period: string, text: unknown) {
  const raw = String(text || '').trim()
  const fallback = period === 'evening' ? getDefaultDailyAdvisorTtsEvening() : getDefaultDailyAdvisorTtsDaytime()
  return applyTemplatePreview(raw || fallback, { hour: new Date().getHours() })
}
