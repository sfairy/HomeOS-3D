/**
 * 灯光控制弹窗组合式函数模块。
 *
 * 职责：
 * - 提供灯光弹窗所需的实时实体、能力属性（色温/RGB 支持、Kelvin 范围）；
 * - 亮度、色温、颜色（RGB/HS）滑块与色盘交互，并通过 HA service 下发；
 * - 颜色空间转换（HSL/RGB/Hex 互转）、过渡时间控制；
 * - 通过 useSliderCommit 统一处理拖拽本地值与提交，避免拖拽期间被外部更新打断。
 *
 * 依赖：vue ref/computed/watch/onMounted、useLiveEntity、useEntityPopupHeader、
 * useHaEntityService、useSliderCommit、entity-cold-fetch、progress-bar 工具。
 */
import { ref, computed, watch, onMounted } from 'vue'
import { useLiveEntity } from '@/composables/entity/useLiveEntity'
import { useEntityPopupHeader } from '@/composables/entity/useEntityPopupBase'
import { useHaEntityService } from '@/composables/entity/useHaEntityService'
import { useSliderCommit } from '@/composables/entity/useSliderCommit'
import { fetchEntityById } from '@/utils/entity/cold-fetch.util'
import {
  sliderTrackStyle,
  colorTempSliderTrackStyle,
  kelvinToMireds,
  clampKelvinForDevice,
  resolveKelvinBounds,
  resolveEntityColorTempKelvinForUi,
  resolveColorTempStep,
} from '@/utils/ui/progress-bar.util'

/** 灯光能力相关 attributes key（用于刷新能力属性时只 pick 这些字段） */
const CAPABILITY_ATTR_KEYS = [
  'supported_color_modes',
  'min_color_temp_kelvin',
  'max_color_temp_kelvin',
  'min_mireds',
  'max_mireds',
  'min_mired',
  'max_mired',
]

/**
 * 从灯光 attributes 中提取能力字段（仅保留 CAPABILITY_ATTR_KEYS 列出的字段）。
 * @param attributes HA 灯光 attributes
 * @returns 仅包含能力字段的对象
 */
function pickLightCapabilityAttrs(attributes: Record<string, unknown> | undefined) {
  if (!attributes) return {}
  const picked: Record<string, unknown> = {}
  for (const key of CAPABILITY_ATTR_KEYS) {
    if (attributes[key] != null) picked[key] = attributes[key]
  }
  return picked
}

/** 预设颜色调色板（HEX 字符串） */
const COLOR_PRESETS = [
  '#FFFFFF',
  '#FFEAA7',
  '#FDCB6E',
  '#F39C12',
  '#E17055',
  '#FF6B6B',
  '#D63031',
  '#E84393',
  '#FD79A8',
  '#A29BFE',
  '#6C5CE7',
  '#0984E3',
  '#74B9FF',
  '#00CEC9',
  '#55EFC4',
  '#00B894',
  '#636E72',
  '#2D3436',
]

/**
 * HSL → RGB 转换（HA 灯光使用 hs_color: [hue(0-360), sat(0-100)]）。
 * @param h 色相 0-360
 * @param s 饱和度 0-100
 * @returns {r,g,b} 0-255 整数
 */
function hslToRgb(h: number, s: number) {
  const c = s / 100
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = 1 - c
  let r = 0,
    g = 0,
    b = 0
  if (h < 60) {
    r = c
    g = x
  } else if (h < 120) {
    r = x
    g = c
  } else if (h < 180) {
    g = c
    b = x
  } else if (h < 240) {
    g = x
    b = c
  } else if (h < 300) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  }
}

/**
 * RGB → HS 转换（输出 HA 灯光使用的 hs_color 格式）。
 * @param r 0-255
 * @param g 0-255
 * @param b 0-255
 * @returns {h: 0-360, s: 0-100}
 */
function rgbToHs(r: number, g: number, b: number) {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0,
    s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
    else if (max === g) h = ((b - r) / d + 2) * 60
    else h = ((r - g) / d + 4) * 60
  }
  return { h: Math.round(h), s: Math.round(s * 100) }
}

/**
 * HEX 字符串 → RGB 转换。
 * @param hex 形如 #RRGGBB 的字符串
 * @returns {r,g,b} 0-255
 */
function hexToRgb(hex: string) {
  const clean = hex.replace('#', '')
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  }
}
/**
 * 灯光控制弹窗组合式函数。
 *
 * 调用场景：LightControlPopup 组件 setup 中调用，提供开关、亮度、色温、
 * 颜色色盘/预设、过渡时间等控制能力。
 *
 * @param props 组件 props，需提供 entity.entity_id
 * @returns 灯光弹窗所需的全部响应式状态与控制方法
 */
export function useLightControlPopup(props: { entity?: { entity_id?: string } | null }) {
  const { callService } = useHaEntityService()
  // 能力属性（supported_color_modes/Kelvin 范围等），需通过 REST 刷新获取完整值
  const capabilityAttrs = ref<Record<string, unknown>>({})
  const liveEntity = useLiveEntity(
    () => props.entity?.entity_id,
    () => props.entity,
  )

  /**
   * 通过 REST 刷新灯光能力属性（WS 推送可能不含 min/max_color_temp_kelvin 等字段）。
   * 仅在返回的 entity_id 匹配时更新 capabilityAttrs，避免切换实体时回写旧值。
   */
  async function refreshLightCapabilities() {
    const entityId = props.entity?.entity_id ?? liveEntity.value?.entity_id
    if (!entityId) return
    const fresh = await fetchEntityById(entityId, { refresh: true })
    if (fresh?.entity_id === entityId && fresh) {
      capabilityAttrs.value = pickLightCapabilityAttrs(fresh.attributes as Record<string, unknown>)
    }
  }

  onMounted(refreshLightCapabilities)
  // 实体切换时清空能力属性并重新刷新
  watch(
    () => props.entity?.entity_id ?? liveEntity.value?.entity_id,
    () => {
      capabilityAttrs.value = {}
      refreshLightCapabilities()
    },
  )

  // 合并实时 attributes 与能力 attributes（能力字段优先，覆盖 WS 不完整值）
  const lightAttrs = computed(() => ({
    ...(liveEntity.value?.attributes ?? {}),
    ...capabilityAttrs.value,
  }))
  const entityRef = computed(() => liveEntity.value)
  const { entityName } = useEntityPopupHeader(entityRef)
  // 是否点亮
  const isOn = computed(() => liveEntity.value?.state === 'on')

  // 是否支持 RGB/HS/XY/RGBW/RGBWW 颜色模式
  const hasRgb = computed(() => {
    const modes = lightAttrs.value?.supported_color_modes as string[] | undefined
    return modes?.some(
      (m) => m === 'rgb' || m === 'hs' || m === 'xy' || m === 'rgbw' || m === 'rgbww',
    )
  })

  // 是否支持色温（color_temp 模式）
  const hasColorTemp = computed(() => {
    const modes = lightAttrs.value?.supported_color_modes as string[] | undefined
    return modes?.some((m) => m.includes('color_temp'))
  })

  // 弹窗高度：RGB 模式最高（含色盘），色温模式中等，纯亮度最低
  const popupHeight = computed(() => (hasRgb.value ? 460 : hasColorTemp.value ? 320 : 260))

  // 亮度百分比：brightness(0-255) → 0-100，关灯时为 1（避免滑块完全归零）
  const brightnessPct = computed(() => {
    const e = liveEntity.value
    const b = e?.attributes?.brightness
    if (b != null) return Math.round((Number(b) / 255) * 100)
    return e?.state === 'on' ? 100 : 1
  })

  // 是否使用 Kelvin API（部分灯具支持 color_temp_kelvin 而非 mireds）
  const usesKelvinApi = computed(() => {
    const attrs = lightAttrs.value
    return attrs.min_color_temp_kelvin != null || attrs.max_color_temp_kelvin != null
  })

  // 设备 Kelvin 范围、步长、当前 UI 色温值
  const deviceKelvinBounds = computed(() => resolveKelvinBounds(lightAttrs.value))
  const minKelvin = computed(() => deviceKelvinBounds.value.min)
  const maxKelvin = computed(() => deviceKelvinBounds.value.max)
  const colorTempStep = computed(() => resolveColorTempStep(minKelvin.value, maxKelvin.value))
  const colorTempVal = computed(() => resolveEntityColorTempKelvinForUi(lightAttrs.value))

  // 色温滑块：拖拽本地值与提交解耦，释放时调用 setColorTemp
  const {
    localValue: colorTempLocal,
    rangeValue: colorTempRange,
    trackStyle: colorTempTrackStyle,
    onInput: onColorTempInput,
    onChange: onColorTempChange,
    commit: commitColorTemp,
  } = useSliderCommit(colorTempVal, {
    onCommit: (val: number) => setColorTemp(val),
    track: () => ({ min: minKelvin.value, max: maxKelvin.value, step: colorTempStep.value }),
    buildTrackStyle: (
      value: number,
      { min, max, step }: { min: number; max: number; step: number },
    ) => colorTempSliderTrackStyle(value, min, max, 'rgba(255,255,255,0.1)', step),
  })

  // 亮度滑块：amber 变体，释放时调用 setBrightness
  const {
    localValue: brightnessLocal,
    rangeValue: brightnessRange,
    trackStyle: brightnessTrackStyle,
    onInput: onBrightnessInput,
    onChange: onBrightnessChange,
    commit: commitBrightness,
  } = useSliderCommit(brightnessPct, {
    onCommit: (val: number) => setBrightness(val),
    track: () => ({
      min: 1,
      max: 100,
      step: 1,
      variant: 'amber',
      trackColor: 'rgba(255,255,255,0.1)',
    }),
  })

  // 过渡时间（秒）、色盘 DOM 引用、色盘坐标（hueX 0-100，satY 0-100 自上而下）
  const transitionTime = ref(0)
  const paletteRef = ref<HTMLElement | null>(null)
  const hueX = ref(50)
  const satY = ref(50)

  // 过渡时间滑块轨道样式（0-10 秒，步长 0.5）
  const transitionTrackStyle = computed(() =>
    sliderTrackStyle({
      value: transitionTime.value,
      min: 0,
      max: 10,
      step: 0.5,
      color: 'rgba(255,255,255,0.58)',
      colorEnd: 'rgba(255,255,255,0.55)',
      trackColor: 'rgba(255,255,255,0.06)',
    }),
  )
  /**
   * 根据实体 hs_color 或 rgb_color 同步色盘坐标。
   * 优先使用 hs_color，其次将 rgb_color 转为 HS 后映射到色盘。
   */
  function syncColorPickerFromEntity() {
    const e = liveEntity.value
    const hs = e?.attributes?.hs_color as number[] | undefined
    if (hs && hs.length >= 2) {
      // hue 0-360 → 0-100，sat 0-100 → 0-100（自上而下取反）
      hueX.value = Math.round(hs[0] / 3.6)
      satY.value = 100 - hs[1]
      return
    }
    const rgb = e?.attributes?.rgb_color as number[] | undefined
    if (rgb && rgb.length >= 3) {
      const converted = rgbToHs(rgb[0], rgb[1], rgb[2])
      hueX.value = Math.round(converted.h / 3.6)
      satY.value = 100 - converted.s
    }
  }

  onMounted(syncColorPickerFromEntity)
  watch(() => liveEntity.value?.entity_id, syncColorPickerFromEntity)
  // 实体上报 transition 时同步本地过渡时间
  watch(
    () => liveEntity.value?.attributes?.transition,
    (val) => {
      if (val != null && !Number.isNaN(Number(val))) transitionTime.value = Number(val)
    },
    { immediate: true },
  )

  // 当前 RGB 颜色：优先 rgb_color，其次 hs_color 转换，缺省暖黄
  const rgbColor = computed(() => {
    const rgb = liveEntity.value?.attributes?.rgb_color as number[] | undefined
    if (rgb && rgb.length >= 3) return { r: rgb[0], g: rgb[1], b: rgb[2] }
    const hs = liveEntity.value?.attributes?.hs_color as number[] | undefined
    if (hs && hs.length >= 2) return hslToRgb(hs[0], hs[1])
    return { r: 255, g: 200, b: 100 }
  })

  // HEX 颜色字符串（大写，无 # 前缀）
  const hexColor = computed(() => {
    const { r, g, b } = rgbColor.value
    return [r, g, b]
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  })

  /**
   * 色盘按下时启动拖拽：注册 mousemove/touchmove/mouseup/touchend 监听，
   * 释放时提交颜色。
   * @param e 鼠标或触摸事件
   */
  function startPickColor(e: MouseEvent | TouchEvent) {
    const rect = paletteRef.value?.getBoundingClientRect()
    if (!rect) return
    updateFromEvent(e, rect)
    const move = (ev: MouseEvent | TouchEvent) => updateFromEvent(ev, rect)
    const up = (ev: MouseEvent | TouchEvent) => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      window.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', up)
      if (ev) updateFromEvent(ev, rect)
      commitPickerColor()
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    window.addEventListener('touchmove', move)
    window.addEventListener('touchend', up)
  }

  /**
   * 根据事件坐标更新色盘 hueX/satY（clamp 到 0-100）。
   * @param e 鼠标或触摸事件
   * @param rect 色盘 boundingClientRect
   */
  function updateFromEvent(e: MouseEvent | TouchEvent, rect: DOMRect) {
    const point = 'touches' in e ? e.touches[0] : e
    const x = Math.max(0, Math.min(100, ((point.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(0, Math.min(100, ((point.clientY - rect.top) / rect.height) * 100))
    hueX.value = Math.round(x)
    satY.value = Math.round(y)
  }

  /**
   * 色盘键盘操作：左/右调整色相，上/下调整饱和度，Shift 加速，操作即提交。
   * 使色盘满足键盘可用性（role=slider + 方向键）。
   * @param e 键盘事件
   */
  function handlePaletteKeydown(e: KeyboardEvent) {
    const step = e.shiftKey ? 10 : 2
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault()
        hueX.value = Math.max(0, hueX.value - step)
        commitPickerColor()
        break
      case 'ArrowRight':
        e.preventDefault()
        hueX.value = Math.min(100, hueX.value + step)
        commitPickerColor()
        break
      case 'ArrowUp':
        e.preventDefault()
        satY.value = Math.max(0, satY.value - step)
        commitPickerColor()
        break
      case 'ArrowDown':
        e.preventDefault()
        satY.value = Math.min(100, satY.value + step)
        commitPickerColor()
        break
    }
  }

  /** 提交色盘当前颜色（hueX/satY → RGB → HA service） */
  function commitPickerColor() {
    const h = Math.round(hueX.value * 3.6)
    const s = 100 - satY.value
    applyRgbColor(hslToRgb(h, s))
  }

  /**
   * 下发 RGB 颜色到 HA light.turn_on。
   * @param param0 RGB 对象
   */
  async function applyRgbColor({ r, g, b }: { r: number; g: number; b: number }) {
    const entityId = liveEntity.value?.entity_id
    if (!entityId) return
    await callService('light', 'turn_on', entityId, { rgb_color: [r, g, b] }, '设置颜色失败')
  }

  /**
   * 应用预设颜色：更新色盘坐标并立即下发 RGB。
   * @param hex HEX 字符串
   */
  function applyPresetColor(hex: string) {
    const { r, g, b } = hexToRgb(hex)
    const hs = rgbToHs(r, g, b)
    hueX.value = Math.round(hs.h / 3.6)
    satY.value = 100 - hs.s
    applyRgbColor({ r, g, b })
  }

  /** 切换灯光开关 */
  async function togglePower() {
    const entityId = liveEntity.value?.entity_id
    if (!entityId) return
    const svc = isOn.value ? 'turn_off' : 'turn_on'
    await callService('light', svc, entityId, undefined, '开关失败')
  }

  /**
   * 设置亮度百分比。
   * @param val 0-100
   */
  async function setBrightness(val: number) {
    const entityId = liveEntity.value?.entity_id
    if (!entityId) return
    await callService('light', 'turn_on', entityId, { brightness_pct: val }, '亮度设置失败')
  }
  /**
   * 构建色温 service data：支持 Kelvin API 的设备用 color_temp_kelvin，
   * 否则转换为 mireds（color_temp）并 clamp 到设备范围。
   * @param kelvin Kelvin 色温值
   * @returns service payload
   */
  function buildColorTempServiceData(kelvin: number) {
    const attrs = lightAttrs.value
    const k = clampKelvinForDevice(kelvin, attrs) ?? kelvin
    if (usesKelvinApi.value) return { color_temp_kelvin: k }
    const minM = Number(readAttrNumber(attrs, 'min_mireds', 'min_mired') ?? 153)
    const maxM = Number(readAttrNumber(attrs, 'max_mireds', 'max_mired') ?? 500)
    const mireds = Math.max(minM, Math.min(maxM, kelvinToMireds(Number(k)) ?? minM))
    return { color_temp: mireds }
  }

  /**
   * 从 attributes 中按候选 key 顺序读取第一个有效数值。
   * @param attrs 属性对象
   * @param keys 候选 key 列表
   * @returns 第一个有效数值或 null
   */
  function readAttrNumber(attrs: Record<string, unknown>, ...keys: string[]) {
    for (const key of keys) {
      if (attrs[key] == null) continue
      const n = Number(attrs[key])
      if (Number.isFinite(n)) return n
    }
    return null
  }

  /**
   * 设置色温（Kelvin）。
   * @param val Kelvin 色温值
   */
  async function setColorTemp(val: number) {
    const entityId = liveEntity.value?.entity_id
    if (!entityId) return
    await callService('light', 'turn_on', entityId, buildColorTempServiceData(val), '色温设置失败')
  }

  /** 应用过渡时间到灯光 */
  async function applyTransition() {
    const entityId = liveEntity.value?.entity_id
    if (!entityId) return
    await callService(
      'light',
      'turn_on',
      entityId,
      { transition: transitionTime.value },
      '过渡设置失败',
    )
  }

  return {
    liveEntity,
    entityName,
    isOn,
    popupHeight,
    hasRgb,
    hasColorTemp,
    minKelvin,
    maxKelvin,
    colorTempStep,
    colorTempLocal,
    colorTempRange,
    colorTempTrackStyle,
    onColorTempInput,
    onColorTempChange,
    commitColorTemp,
    brightnessLocal,
    brightnessRange,
    brightnessTrackStyle,
    onBrightnessInput,
    onBrightnessChange,
    commitBrightness,
    transitionTime,
    transitionTrackStyle,
    paletteRef,
    hueX,
    satY,
    rgbColor,
    hexColor,
    colorPresets: COLOR_PRESETS,
    startPickColor,
    handlePaletteKeydown,
    applyPresetColor,
    togglePower,
    applyTransition,
  }
}