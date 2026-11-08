/**
 * 灯光卡片的「自定义 3D 光效」编辑器（0.8.5 标准光影模式）。
 *
 * 轻量柔光模式不需要它：那套模式由区域光照统一给出范围。标准光影模式下每盏灯可以单独
 * 决定 3D 亮度上下限、色温上下限（或跟随户型灯具色温），以及设备没有回报时的默认姿态。
 * 控件只写 ``item.standardLightEffects``，渲染参数由
 * :func:`withInteractionLightEffects` 折算，面板与舞台因此共用同一份口径。
 *
 * 预览（``onPreview``）让舞台按某个键的极端值点灯一次，便于在真实户型里比对范围；
 * ``onRestore`` 结束预览、回到真实状态。两者都「尽力而为」：舞台拒绝或超时只更新状态行
 * 文本，不阻断编辑。
 */

import { standardLightEffectsDraft } from '@app/bridge/presets/light-effect-policy'

/** 舞台回报的灯具能力（决定显示范围编辑，还是色温兜底下拉）。 */
export interface StandardLightEffectsCapability {
  capabilitiesKnown?: boolean
  brightnessSupported?: boolean
  temperatureSupported?: boolean
  colorSupported?: boolean
}

/** 可供编辑的灯光条目（只声明本编辑器读写的字段）。 */
export interface StandardLightEffectsItem {
  entityId?: string
  temperatureFallback?: string
  standardLightEffects?: StandardLightEffectsDraft
  [key: string]: unknown
}

interface LightEffectRange {
  brightnessMin: number
  brightnessMax: number
  temperatureMin: number
  temperatureMax: number
}

interface LightEffectDefaults {
  brightness: number
  kelvin: number
}

export interface StandardLightEffectsDraft {
  enabled: boolean
  effectRange: LightEffectRange
  effectDefaults: LightEffectDefaults
  temperatureFallback: 'default' | 'floorplan'
}

export interface StandardLightEffectsEditorOptions {
  document: Document
  host: HTMLElement
  item: StandardLightEffectsItem
  /** 面板是否仍是当前编辑对象：重绘 / 关闭后旧回调一律自弃。 */
  isActive: () => boolean
  onChange: () => void
  onPreview: (kind: string) => Promise<unknown>
  onRestore: () => Promise<unknown>
}

export interface StandardLightEffectsEditorHandle {
  /** 能力签名变化时才重绘，避免打断正在输入的数字。 */
  refresh(state: StandardLightEffectsCapability): void
}

interface NumericField {
  label: string
  group: 'effectRange' | 'effectDefaults'
  key: string
  min: number
  max: number
  step: number
  /** 与 ``key`` 联动的另一端：最小不得高于最大，反之亦然。 */
  pairKey?: string
  previewKind?: string
}

const BRIGHTNESS_RANGE = { min: 0, max: 150, step: 1 },
  TEMPERATURE_RANGE = { min: 1000, max: 20000, step: 100 }

/** 亮度两键 + 色温两键的边界（键名 → 数字范围）。 */
const NUMERIC_FIELDS: Record<string, NumericField> = {
  brightnessMin: {
    label: '最暗亮度',
    group: 'effectRange',
    key: 'brightnessMin',
    ...BRIGHTNESS_RANGE,
    pairKey: 'brightnessMax',
    previewKind: 'brightnessMin',
  },
  brightnessMax: {
    label: '最亮亮度',
    group: 'effectRange',
    key: 'brightnessMax',
    ...BRIGHTNESS_RANGE,
    pairKey: 'brightnessMin',
    previewKind: 'brightnessMax',
  },
  temperatureMin: {
    label: '最暖色温（K）',
    group: 'effectRange',
    key: 'temperatureMin',
    ...TEMPERATURE_RANGE,
    pairKey: 'temperatureMax',
    previewKind: 'temperatureMin',
  },
  temperatureMax: {
    label: '最冷色温（K）',
    group: 'effectRange',
    key: 'temperatureMax',
    ...TEMPERATURE_RANGE,
    pairKey: 'temperatureMin',
    previewKind: 'temperatureMax',
  },
  brightness: {
    label: '开灯亮度',
    group: 'effectDefaults',
    key: 'brightness',
    ...BRIGHTNESS_RANGE,
    previewKind: 'defaults',
  },
  kelvin: {
    label: '开灯色温（K）',
    group: 'effectDefaults',
    key: 'kelvin',
    ...TEMPERATURE_RANGE,
    previewKind: 'defaults',
  },
}

const TOGGLE_NOTE = '仅用于标准光影。开关跟随真实灯，下面的数值只调整这组灯在3D里的显示效果。'
const GRID_NOTE = '亮度为0～150的画面强度，不是设备功率。彩光和白光模式继续优先跟随设备颜色。'
const UNBOUND_TEXT = '绑定灯或开关后可以编辑光效。'
const READING_TEXT = '正在读取灯具能力，确认后显示对应设置。'
const PREVIEW_RUNNING_TEXT = '正在模拟预览；点击“返回真实状态”结束预览。'
const PREVIEW_ENDED_TEXT = '已结束模拟预览。'
const PAIR_ERROR_TEXT = '请保持最小值不高于最大值，并使用范围内的数字。'

const valueErrorText = (field: NumericField) => `请输入 ${field.min}～${field.max} 之间的数字。`

/** 当前草稿的一份新副本：改完再写回条目，校验失败时原值与草稿都保持可读。 */
const readDraft = (item: StandardLightEffectsItem) =>
  standardLightEffectsDraft(item) as unknown as StandardLightEffectsDraft

/** 解析一次数字编辑：空串与非数字一律无效，无效时回落到改动前的值。 */
function parseNumericEdit(field: NumericField, raw: string, currentValue: number) {
  const value = raw === '' ? Number.NaN : Number(raw),
    invalid = !Number.isFinite(value) || value < field.min || value > field.max
  return { value: invalid ? currentValue : value, invalid }
}

/** 最小 / 最大这一对是否被越过：只有对端也是数字时才需要比较。 */
function isPairViolated(field: NumericField, pairedValue: unknown, value: number) {
  if (typeof pairedValue !== 'number') return false
  return field.key.endsWith('Min') ? value > pairedValue : value < pairedValue
}

/**
 * 渲染并维护一块光效编辑区。
 *
 * 句柄只暴露 ``refresh(state)``：面板每次重绘都会重建 DOM，这里按能力签名决定是否需要
 * 重建，避免每帧状态推送都把输入框清空。
 */
class StandardLightEffectsEditor implements StandardLightEffectsEditorHandle {
  private readonly document: Document
  private readonly host: HTMLElement
  private readonly item: StandardLightEffectsItem
  private readonly options: StandardLightEffectsEditorOptions
  private readonly isActive: () => boolean
  private capability: StandardLightEffectsCapability = {}
  private renderedSignature = ''
  private generation = 0

  constructor(options: StandardLightEffectsEditorOptions) {
    this.options = options
    this.document = options.document
    this.host = options.host
    this.item = options.item
    this.isActive = options.isActive
  }

  private create<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') {
    const node = this.document.createElement(tag)
    node.textContent = text
    node.className = className
    return node
  }

  private commit(next: StandardLightEffectsDraft) {
    this.item.standardLightEffects = next
    this.options.onChange()
  }

  /** 结束模拟预览：代次对不上（面板已重绘）时结果只丢弃。 */
  private async endPreview(status: HTMLElement | null) {
    const current = ++this.generation
    try {
      await this.options.onRestore()
      if (status && this.isActive() && current === this.generation) status.textContent = PREVIEW_ENDED_TEXT
    } catch (error) {
      if (status && this.isActive() && current === this.generation) status.textContent = (error as Error).message
    }
  }

  private createPreviewButton(parent: HTMLElement, status: HTMLElement, label: string, kind: string) {
    const button = this.create('button', label)
    button.type = 'button'
    button.setAttribute('aria-label', `预览${label}`)
    parent.append(button)
    button.addEventListener('click', async () => {
      if (!this.isActive()) return
      const current = ++this.generation
      button.disabled = true
      try {
        await this.options.onPreview(kind)
        if (this.isActive() && current === this.generation) status.textContent = PREVIEW_RUNNING_TEXT
      } catch (error) {
        if (this.isActive() && current === this.generation) status.textContent = (error as Error).message
      } finally {
        if (this.isActive() && button.isConnected) button.disabled = false
      }
    })
  }

  private createNumericOption(grid: HTMLElement, status: HTMLElement, field: NumericField) {
    const label = this.create('label', '', 'i3d-effect-option'),
      input = this.document.createElement('input'),
      initial = readDraft(this.item)[field.group] as unknown as Record<string, number>
    Object.assign(input, {
      type: 'number',
      min: String(field.min),
      max: String(field.max),
      step: String(field.step),
      value: String(initial[field.key]),
    })
    input.setAttribute('aria-label', field.label)
    label.append(this.create('span', field.label), input)
    grid.append(label)
    input.addEventListener('change', () => {
      if (!this.isActive()) return
      const next = readDraft(this.item),
        nextGroup = next[field.group] as unknown as Record<string, number>,
        parsed = parseNumericEdit(field, input.value.trim(), nextGroup[field.key]),
        paired = field.pairKey ? nextGroup[field.pairKey] : undefined
      if (parsed.invalid || isPairViolated(field, paired, parsed.value)) {
        input.value = String(nextGroup[field.key])
        status.textContent = field.pairKey ? PAIR_ERROR_TEXT : valueErrorText(field)
        return
      }
      nextGroup[field.key] = parsed.value
      status.textContent = ''
      this.commit(next)
    })
    field.previewKind && this.createPreviewButton(label, status, '预览', field.previewKind)
  }

  /** 不支持调色温时只能二选一：自定义色温 / 跟随户型灯具色温。 */
  private createTemperatureFallback(grid: HTMLElement, status: HTMLElement) {
    const label = this.create('label'),
      select = this.document.createElement('select'),
      draft = readDraft(this.item)
    select.setAttribute('aria-label', '光效色温来源')
    for (const [value, text] of [
      ['default', '自定义色温'],
      ['floorplan', '跟随户型灯具色温'],
    ] as const) {
      const option = this.create('option', text)
      option.value = value
      select.append(option)
    }
    select.value = draft.temperatureFallback
    label.append(this.create('span', '光效色温来源'), select)
    grid.append(label)
    select.addEventListener('change', () => {
      if (!this.isActive()) return
      this.commit({
        ...readDraft(this.item),
        temperatureFallback: select.value === 'floorplan' ? 'floorplan' : 'default',
      })
      status.textContent = ''
      this.render()
    })
    draft.temperatureFallback !== 'floorplan' && this.createNumericOption(grid, status, NUMERIC_FIELDS.kelvin)
  }

  private createToggle() {
    const draft = readDraft(this.item),
      supportsEffects = this.item.entityId?.startsWith('switch.') || this.capability.capabilitiesKnown === true,
      label = this.create('label', '', 'i3d-setting-toggle'),
      input = this.document.createElement('input')
    input.type = 'checkbox'
    input.checked = draft.enabled
    input.disabled = !this.item.entityId || !supportsEffects
    input.setAttribute('aria-label', '自定义3D光效')
    label.append(this.create('span', '自定义3D光效'), input)
    input.addEventListener('change', () => {
      if (!this.isActive()) return
      input.checked || void this.endPreview(null)
      this.commit({ ...readDraft(this.item), enabled: input.checked })
      this.render()
    })
    return label
  }

  private createFooter(status: HTMLElement) {
    const row = this.create('div', '', 'i3d-config-row'),
      restore = this.create('button', '返回真实状态'),
      reset = this.create('button', '恢复默认效果')
    restore.type = 'button'
    reset.type = 'button'
    restore.addEventListener('click', () => {
      if (this.isActive()) void this.endPreview(status)
    })
    reset.addEventListener('click', () => {
      if (!this.isActive()) return
      void this.endPreview(null)
      delete this.item.standardLightEffects
      this.options.onChange()
      this.render()
    })
    row.append(restore, reset)
    this.host.append(row)
  }

  private render() {
    ++this.generation
    this.host.replaceChildren()
    const draft = readDraft(this.item),
      supportsEffects = this.item.entityId?.startsWith('switch.') || this.capability.capabilitiesKnown === true
    this.host.append(this.createToggle(), this.create('p', TOGGLE_NOTE, 'i3d-note'))
    if (!this.item.entityId || !supportsEffects) {
      this.host.append(this.create('p', this.item.entityId ? READING_TEXT : UNBOUND_TEXT, 'i3d-note'))
      return
    }
    if (!draft.enabled) return
    const status = this.create('p', '', 'i3d-note'),
      grid = this.create('div', '', 'i3d-effect-grid')
    status.setAttribute('role', 'status')
    this.host.append(grid, status)
    if (this.capability.brightnessSupported) {
      this.createNumericOption(grid, status, NUMERIC_FIELDS.brightnessMin)
      this.createNumericOption(grid, status, NUMERIC_FIELDS.brightnessMax)
    } else {
      this.createNumericOption(grid, status, NUMERIC_FIELDS.brightness)
    }
    if (this.capability.temperatureSupported) {
      this.createNumericOption(grid, status, NUMERIC_FIELDS.temperatureMin)
      this.createNumericOption(grid, status, NUMERIC_FIELDS.temperatureMax)
    } else {
      this.createTemperatureFallback(grid, status)
    }
    this.host.append(this.create('p', GRID_NOTE, 'i3d-note'))
    this.createFooter(status)
  }

  refresh(state: StandardLightEffectsCapability): void {
    this.capability = state
    const signature = JSON.stringify([
      this.item.entityId,
      this.capability.capabilitiesKnown,
      this.capability.brightnessSupported,
      this.capability.temperatureSupported,
      this.capability.colorSupported,
    ])
    if (signature === this.renderedSignature) return
    this.renderedSignature = signature
    this.render()
  }
}

export function createStandardLightEffectsEditor(
  options: StandardLightEffectsEditorOptions,
): StandardLightEffectsEditorHandle {
  return new StandardLightEffectsEditor(options)
}
