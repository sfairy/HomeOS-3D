/**
 * @file 主布局儿童模式 Composable
 * @module composables/ui/useMainLayoutChildMode
 *
 * 职责：
 *  - 拉取并轮询儿童模式状态（白名单时段、媒体配额、override 状态等）。
 *  - 计算儿童模式状态栏文案与是否可由当前用户临时解除。
 *  - 监听 WS 推送的儿童模式事件实时刷新状态。
 *  - 触发每日建议语音播报（按配置时段，每天一次）。
 *
 * 依赖：
 *  - vue 的 computed / onMounted / onUnmounted / ref。
 *  - core/error-message 的 getApiErrorMessage。
 *  - api/system 的 fetchChildMode / overrideChildMode。
 *  - api/advisor 的 speakDailyAdvisor。
 *  - config/frontend-config 的 getConfigSection。
 *  - core/logger 的 logger。
 *  - auth.store / entities.store / chrome.store。
 */

import { computed, onMounted, onUnmounted, ref } from 'vue'
import { getApiErrorMessage } from '@/utils/core/error-message'
import {
  CHILD_MODE_OVERRIDE_STATUS,
  CHILD_MODE_OVERRIDE_TOAST,
} from '@/utils/care/child-mode-copy'
import { fetchChildMode, overrideChildMode } from '@/services/api/system'
import { logger } from '@/utils/core/logger'
import { schedulePoll } from '@/utils/core/poll-scheduler'
import type { useAuthStore } from '@/stores/auth.store'
import type { useEntitiesStore } from '@/stores/entities.store'
import type { useChromeStore } from '@/stores/chrome.store'

/**
 * 主布局儿童模式管理。
 *
 * 调用场景：主布局壳层初始化时调用，提供儿童模式状态栏数据与临时解除操作。
 *
 * @param options - 依赖的 store 实例（authStore / entitiesStore / chrome）
 * @returns childModeStatus - 儿童模式状态；showChildModeBar - 是否显示状态栏；childModeBarText - 状态栏文案；canChildOverride - 当前用户是否可临时解除；childModeOverride - 临时解除 30 分钟
 */
export function useMainLayoutChildMode(options: {
  authStore: ReturnType<typeof useAuthStore>
  entitiesStore: ReturnType<typeof useEntitiesStore>
  chrome: ReturnType<typeof useChromeStore>
}) {
  const { authStore, entitiesStore, chrome } = options
  /** 儿童模式状态（来自后端，含白名单时段/配额/override 等字段） */
  const childModeStatus = ref<Record<string, unknown> | null>(null)
  /** 儿童模式状态轮询任务取消函数（注册到全局调度器） */
  let childModeCancel: (() => void) | null = null
  /** WS 儿童模式事件解绑函数 */
  let offChildModeWs: (() => void) | null = null

  /** 当前用户是否可临时解除儿童模式（仅 admin / adult） */
  const canChildOverride = computed(() => ['admin', 'adult'].includes(authStore.role))
  /** 是否显示儿童模式状态栏（仅启用时显示） */
  const showChildModeBar = computed(() => childModeStatus.value?.enabled === true)

  /** 儿童模式状态栏文案：白名单时段 + 媒体配额 + override/时段状态 */
  const childModeBarText = computed(() => {
    const s = childModeStatus.value
    if (!s?.enabled) return ''
    const parts = ['儿童模式已启用']
    // 有媒体配额限制时追加用量信息
    if (Number(s.dailyMediaLimitMin) > 0) {
      parts.push(
        '媒体 {used}/{limit} 分钟'
          .replace('{used}', String(s.mediaUsedMin))
          .replace('{limit}', String(s.dailyMediaLimitMin)),
      )
    }
    // override 中或白名单模式处于允许时段外时追加状态提示
    if (s.overrideActive) parts.push(CHILD_MODE_OVERRIDE_STATUS)
    else if (Array.isArray(s.deviceWhitelist) && s.deviceWhitelist.length > 0)
      parts.push(s.inAllowedWindow ? '允许时段中' : '非允许时段')
    return parts.join(' · ')
  })

  function applyChildModeStatus(data: Record<string, unknown> | null) {
    childModeStatus.value = data
    authStore.setChildModeGate(data)
  }

  /** 拉取儿童模式状态：未认证时清空，失败时记录日志并清空 */
  async function refreshChildMode() {
    if (!authStore.isAuthenticated) {
      applyChildModeStatus(null)
      return
    }
    try {
      const { data } = await fetchChildMode()
      applyChildModeStatus((data as Record<string, unknown>) || null)
    } catch (e) {
      logger.debug('儿童模式状态加载失败', e)
      applyChildModeStatus(null)
    }
  }

  /**
   * 临时解除儿童模式 30 分钟：成功后刷新状态并通知，失败时提示需要家长权限
   */
  async function childModeOverride() {
    try {
      const { data } = await overrideChildMode(30)
      applyChildModeStatus((data as Record<string, unknown>) || null)
      chrome.notify(CHILD_MODE_OVERRIDE_TOAST, 'success')
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '需要家长权限'), 'error')
    }
  }

  onMounted(() => {
    // 初始拉取 + 每 60 秒经全局调度器轮询（页面隐藏时自动暂停，恢复可见时立即刷新）
    refreshChildMode()
    childModeCancel = schedulePoll('child-mode:status', () => {
      void refreshChildMode()
    }, 60_000)
    // 监听 WS 儿童模式事件实时刷新
    offChildModeWs = entitiesStore.onChildModeEvent(() => {
      refreshChildMode()
    })
  })

  onUnmounted(() => {
    if (childModeCancel) childModeCancel()
    if (offChildModeWs) offChildModeWs()
  })

  return {
    childModeStatus,
    showChildModeBar,
    childModeBarText,
    canChildOverride,
    childModeOverride,
  }
}