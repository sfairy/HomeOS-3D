/**
 * @file useAwaySimulationSettings.ts
 * @module composables/security
 * @description 离家模拟全局参数（AppConfig.security）读写 composable，供模拟 Tab 与设置页共用。
 *   - 加载时从 AppConfig.security 读取亮度、间隔、联动开关等参数并做范围钳制
 *   - 保存时按管理员权限校验、参数范围钳制、最小/最大间隔互换修正后 PATCH 到后端
 *   - 保存失败时区分配置冲突与其他错误，自动刷新配置避免脏数据
 * @dependencies vue, @/stores/auth.store, @/stores/chrome.store, ../../views/settings/system/composables/system-config.internals
 */
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useSystemConfig, patchSystemConfig, handleSystemConfigPatchError } from '@/composables/config/system-config-core.internals'
/** 将任意输入钳制到 [min, max] 范围内的整数；空串不走 Number('')===0 */
function clampAwaySimInt(value: unknown, min: number, max: number, fallback: number) {
  if (value === '' || value == null) return fallback
  if (typeof value === 'string' && value.trim() === '') return fallback
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

/**
 * 离家模拟参数默认值
 * - 亮度下限 40、亮度范围 50
 * - 间隔最小 8 秒、最大 25 秒
 * - 离家布防时不自动联动离家模拟
 */
const AWAY_SIM_SETTINGS_DEFAULTS = {
  awaySimBrightnessMin: 40,
  awaySimBrightnessRange: 50,
  awaySimIntervalMinMax: { min: 8, max: 25 },
  linkAwaySimOnArmAway: false,
} as const

const DEFAULTS = AWAY_SIM_SETTINGS_DEFAULTS

/** 离家模拟全局参数（AppConfig.security）读写，供模拟 Tab 与设置页共用逻辑 */
export function useAwaySimulationSettings() {
  const chrome = useChromeStore()
  const authStore = useAuthStore()
  const { load } = useSystemConfig()

  // 加载中标记
  const loading = ref(true)
  // 保存中标记
  const saving = ref(false)
  // 亮度下限（1-100）
  const brightnessMin = ref<number>(DEFAULTS.awaySimBrightnessMin)
  // 亮度变化范围（0-100）
  const brightnessRange = ref<number>(DEFAULTS.awaySimBrightnessRange)
  // 开关间隔最小值（秒，1-120）
  const intervalMin = ref<number>(DEFAULTS.awaySimIntervalMinMax.min)
  // 开关间隔最大值（秒，1-180）
  const intervalMax = ref<number>(DEFAULTS.awaySimIntervalMinMax.max)
  // 离家布防时是否自动启用离家模拟
  const linkOnArmAway = ref<boolean>(DEFAULTS.linkAwaySimOnArmAway)

  // 仅管理员可修改模拟参数
  const canEdit = computed(() => authStore.role === 'admin')

  /**
   * 从后端配置刷新参数
   * @param args.force 是否强制重新加载（绕过缓存）
   * @sideEffects 更新 loading/brightnessMin/brightnessRange/intervalMin/intervalMax/linkOnArmAway
   */
  async function refresh({ force = false }: { force?: boolean } = {}) {
    loading.value = true
    try {
      const cfg = await load({ force })
      const sec = (cfg?.security || {}) as Record<string, unknown>
      // 亮度下限范围 1-100
      brightnessMin.value = clampAwaySimInt(sec.awaySimBrightnessMin, 1, 100, DEFAULTS.awaySimBrightnessMin)
      // 亮度变化范围 0-100
      brightnessRange.value = clampAwaySimInt(
        sec.awaySimBrightnessRange,
        0,
        100,
        DEFAULTS.awaySimBrightnessRange,
      )
      // 间隔配置可能缺失，回退到默认
      const iv = (sec.awaySimIntervalMinMax || DEFAULTS.awaySimIntervalMinMax) as {
        min?: number
        max?: number
      }
      // 最小间隔 1-120 秒
      intervalMin.value = clampAwaySimInt(iv.min, 1, 120, DEFAULTS.awaySimIntervalMinMax.min)
      // 最大间隔 1-180 秒
      intervalMax.value = clampAwaySimInt(iv.max, 1, 180, DEFAULTS.awaySimIntervalMinMax.max)
      // 联动开关缺省为 false
      linkOnArmAway.value = !!sec.linkAwaySimOnArmAway
    } finally {
      loading.value = false
    }
  }

  /**
   * 保存模拟参数到后端
   * @returns 是否保存成功
   * @sideEffects 成功时更新本地 ref 与提示；失败时根据错误类型提示并可能强制刷新
   */
  async function save() {
    // 权限校验：仅管理员可保存
    if (!canEdit.value) {
      chrome.notify('需要管理员权限才能修改模拟参数', 'warning')
      return false
    }

    // 钳制间隔范围
    let ivMin = clampAwaySimInt(intervalMin.value, 1, 120, DEFAULTS.awaySimIntervalMinMax.min)
    let ivMax = clampAwaySimInt(intervalMax.value, 1, 180, DEFAULTS.awaySimIntervalMinMax.max)
    // 用户输入导致 min > max 时自动交换，避免后端校验失败
    if (ivMin > ivMax) [ivMin, ivMax] = [ivMax, ivMin]

    // 组装 PATCH payload，所有数值字段再次钳制确保安全
    const payload = {
      awaySimBrightnessMin: clampAwaySimInt(
        brightnessMin.value,
        1,
        100,
        DEFAULTS.awaySimBrightnessMin,
      ),
      awaySimBrightnessRange: clampAwaySimInt(
        brightnessRange.value,
        0,
        100,
        DEFAULTS.awaySimBrightnessRange,
      ),
      awaySimIntervalMinMax: { min: ivMin, max: ivMax },
      linkAwaySimOnArmAway: linkOnArmAway.value,
    }

    saving.value = true
    try {
      await patchSystemConfig({ security: payload })
      // 保存成功后同步本地 ref，确保 UI 与后端一致
      brightnessMin.value = payload.awaySimBrightnessMin
      brightnessRange.value = payload.awaySimBrightnessRange
      intervalMin.value = ivMin
      intervalMax.value = ivMax
      chrome.notify('模拟参数已保存', 'success')
      return true
    } catch (e) {
      // 配置冲突由 handleSystemConfigPatchError 统一处理（如版本号过期）
      if (await handleSystemConfigPatchError(e, chrome)) {
        // 冲突解决后强制刷新配置，避免脏数据
        await refresh({ force: true })
        return false
      }
      chrome.notify('保存模拟参数失败', 'error')
      return false
    } finally {
      saving.value = false
    }
  }

  // 挂载时自动加载一次配置
  onMounted(() => {
    void refresh()
  })

  return {
    loading,
    saving,
    brightnessMin,
    brightnessRange,
    intervalMin,
    intervalMax,
    linkOnArmAway,
    canEdit,
    refresh,
    save,
  }
}