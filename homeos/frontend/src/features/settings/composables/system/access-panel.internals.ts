/**
 * 设置 → 访问控制面板逻辑：设置锁（PIN）读写、PIN 清洗与强度评估、启用校验。
 * 直接读写 layoutStore.layoutConfig.settingsLock，随侧栏全局「保存全部」持久化
 * （与原 homeos 行为一致），不落任何后端接口。
 */
import { computed, ref } from 'vue'
import { useLayoutStore } from '@/stores/layout.store'
import { useChromeStore } from '@/stores/chrome.store'

/** PIN 允许的最小长度（与设置锁弹窗 / 后端口径一致） */
const PIN_MIN_LENGTH = 4
/** PIN 允许的最大长度 */
const PIN_MAX_LENGTH = 6

/** 常见弱口令黑名单：命中即判定为弱 PIN */
const COMMON_WEAK_PINS = new Set([
  '1234',
  '4321',
  '0123',
  '2580',
  '1230',
  '12345',
  '123456',
  '654321',
  '0852',
])

/** PIN 强度进度条 variant：过短/弱 → danger，可用 → warn，满 6 位 → success */
const PIN_STRENGTH_VARIANT = {
  weak: 'danger',
  ok: 'warn',
  strong: 'success',
} as const

/**
 * 访问控制面板逻辑（设置锁 + 访问 PIN）。
 * @returns 配置读写、PIN 清洗/强度计算与启用校验的状态与动作
 */
export function useAccessPanel() {
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()
  /** PIN 隐藏输入框引用，用于点圆点区域时聚焦 */
  const pinInputRef = ref<HTMLInputElement | null>(null)

  /** 设置锁是否启用 */
  const lockEnabled = computed(() => !!layoutStore.layoutConfig.settingsLock?.enabled)
  /** 当前 PIN（字符串形式，缺失回落到空串） */
  const pinValue = computed(() => String(layoutStore.layoutConfig.settingsLock?.pin || ''))
  /** 当前 PIN 长度 */
  const pinLength = computed(() => pinValue.value.length)

  /** 是否为弱 PIN：全相同数字 / 连续递增递减 / 常见弱口令 */
  const isWeakPin = computed(() => {
    const p = pinValue.value
    if (!p || p.length < PIN_MIN_LENGTH) return false
    // 全相同数字（如 0000、1111）
    if (/^(\d)\1+$/.test(p)) return true
    // 命中常见弱口令黑名单
    if (COMMON_WEAK_PINS.has(p)) return true
    // 连续递增或递减（如 1234、9876）
    let inc = true
    let dec = true
    for (let i = 1; i < p.length; i++) {
      if (p.charCodeAt(i) !== p.charCodeAt(i - 1) + 1) inc = false
      if (p.charCodeAt(i) !== p.charCodeAt(i - 1) - 1) dec = false
    }
    return inc || dec
  })

  /** PIN 强度百分比（长度 / 6，封顶 100） */
  const pinStrengthPercent = computed(() =>
    Math.min(100, (pinLength.value / PIN_MAX_LENGTH) * 100),
  )

  /** PIN 强度文案 */
  const pinStrengthLabel = computed(() => {
    if (pinLength.value === 0) return '未设置'
    if (pinLength.value < PIN_MIN_LENGTH) return '过短'
    if (isWeakPin.value) return '过于简单'
    if (pinLength.value < PIN_MAX_LENGTH) return '可用'
    return '强度良好'
  })

  /** PIN 强度进度条 variant */
  const pinStrengthVariant = computed(() => {
    if (pinLength.value < PIN_MIN_LENGTH || isWeakPin.value) return PIN_STRENGTH_VARIANT.weak
    if (pinLength.value < PIN_MAX_LENGTH) return PIN_STRENGTH_VARIANT.ok
    return PIN_STRENGTH_VARIANT.strong
  })

  /** 是否满足开启条件：PIN 长度落在 4–6（弱 PIN 仅提示，不硬拦） */
  const canEnableLock = computed(
    () => pinLength.value >= PIN_MIN_LENGTH && pinLength.value <= PIN_MAX_LENGTH,
  )

  /** 未满足开启条件时的提示文案（满足则为空串） */
  const pinRequirementHint = computed(() =>
    canEnableLock.value ? '' : '请先设置 4–6 位数字 PIN，再开启设置锁',
  )

  /** 确保 settingsLock 存在（持久化配置可能缺该字段） */
  function ensureLock() {
    if (!layoutStore.layoutConfig.settingsLock) {
      layoutStore.layoutConfig.settingsLock = { enabled: false, pin: '' }
    }
    return layoutStore.layoutConfig.settingsLock
  }

  /** 切换设置锁；开启前要求 PIN 合法，避免「启用即无人可解锁」 */
  function toggleSettingsLock() {
    const lock = ensureLock()
    if (!lock.enabled && !canEnableLock.value) {
      chrome.notify('请先设置 4–6 位访问 PIN 再开启设置锁', 'warning')
      return
    }
    lock.enabled = !lock.enabled
    layoutStore.layoutDirty = true
  }

  /**
   * PIN 输入清洗：仅保留数字、截断到 6 位并写回配置。
   * 同时把输入框 DOM 值同步为清洗结果，避免输入非数字时残留脏字符。
   * @param e input 事件
   */
  function sanitizePin(e: Event) {
    const el = e.target as HTMLInputElement | null
    const val = String(el?.value || '')
      .replace(/\D/g, '')
      .slice(0, PIN_MAX_LENGTH)
    const lock = ensureLock()
    if (lock.pin !== val) {
      lock.pin = val
      layoutStore.layoutDirty = true
    }
    // 用户输入含非法字符时，DOM 与 store 会不一致，此处强制回写
    if (el && el.value !== val) el.value = val
  }

  /** 聚焦 PIN 隐藏输入框 */
  function focusPinInput() {
    pinInputRef.value?.focus()
  }

  return {
    layoutStore,
    pinInputRef,
    lockEnabled,
    pinValue,
    pinLength,
    isWeakPin,
    pinStrengthPercent,
    pinStrengthLabel,
    pinStrengthVariant,
    canEnableLock,
    pinRequirementHint,
    toggleSettingsLock,
    sanitizePin,
    focusPinInput,
  }
}
