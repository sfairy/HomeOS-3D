/**
 * @file create-layout-core-state.ts
 * @module frontend/src/stores/ui
 * @brief 布局核心响应式状态（layoutConfig / dirty / profile 加载旗标）；由 layout.store 持有。
 *
 * 职责：
 * - 持有 layoutConfig 主状态（reactive，深 watch 触发 dirty）
 * - 维护 layoutDirty / profile 加载旗标（loading / loaded / error）
 * - 提供 setSuppressDirtyTracking：批量操作期间临时抑制 dirty 跟踪
 * - 初始化时按平板性能模式应用默认值
 *
 * 活跃设备弹窗实体的 WS pin 改由 chrome.entityControlEntityId /
 * chrome.activeMediaEntityId 提供（见 useEntityWsSubscriptionSync），不再使用
 * 从未写入的 activeFloorplanPopupId。
 *
 * 关键依赖：
 * - @/stores/defaults：getDefaultLayout 提供默认布局（深拷贝为初始值）
 * - @/stores/ui/create-layout-state：readStoredProfileId 读取本地存储方案 ID
 * - @/stores/ui/create-layout-dirty-tracking：dirty watch 跟踪
 * - @/utils/perf/tablet-default-perf.util：平板性能模式
 * - @/utils/core/clone-plain.util：深拷贝
 */
import { ref, reactive } from 'vue'
import type { UILayoutConfig } from '@/types/layout'
import { getDefaultLayout } from '@/stores/defaults'
import { readStoredProfileId } from '@/stores/ui/create-layout-state'
import { createLayoutDirtyTracking } from '@/stores/ui/create-layout-dirty-tracking'
import { applyTabletDefaultPerformanceMode } from '@/utils/perf/tablet-default-perf.util'
import { clonePlain } from '@/utils/core/clone-plain.util'

/**
 * 创建布局核心响应式状态切片
 * @returns layoutConfig / layoutDirty / activeProfileId / 各种加载旗标 / setSuppressDirtyTracking
 */
export function createLayoutCoreState() {
  // 脏标志：任何对 layoutConfig 的修改都会触发 dirty watch 标记 true
  const layoutDirty = ref(false)
  // 布局配置主状态（reactive 深响应，由 dirty watch 跟踪）
  const layoutConfig = reactive<UILayoutConfig>(clonePlain(getDefaultLayout()))
  // 应用平板默认性能模式（如调低渲染模式、关闭玻璃效果等）
  applyTabletDefaultPerformanceMode(layoutConfig)

  // 当前激活方案 ID（从 localStorage 读取，默认 'default'）
  const activeProfileId = ref(readStoredProfileId())
  // 方案列表加载中标志
  const isProfilesLoading = ref(false)
  // 方案列表加载失败文案
  const profilesLoadError = ref('')
  // 当前方案配置是否已加载完成（dirty watch 需等加载完成后才生效）
  const isConfigLoaded = ref(false)
  // 当前方案配置是否正在加载
  const isConfigLoading = ref(false)

  // dirty 跟踪抑制标志（楼层切换 / 批量覆盖等场景临时关闭，避免误标脏）
  let suppressDirtyTracking = false
  /** 设置 dirty 跟踪抑制开关；批量操作期间调用 true，结束后 nextTick 内调用 false */
  function setSuppressDirtyTracking(v: boolean) {
    suppressDirtyTracking = v
  }

  // 注册 dirty 跟踪 watch：深 watch layoutConfig，未抑制且配置已加载时标记 dirty
  createLayoutDirtyTracking({
    layoutConfig,
    layoutDirty,
    isConfigLoaded,
    isSuppressing: () => suppressDirtyTracking,
  })

  /**
   * 认证变更（登出 / 401）时重置核心布局状态：
   * 配置回默认布局、清除加载/脏标志与激活方案，避免沿用上一个用户的方案与编辑态。
   */
  function resetCoreState(): void {
    isConfigLoading.value = false
    isConfigLoaded.value = false
    layoutDirty.value = false
    isProfilesLoading.value = false
    profilesLoadError.value = ''
    activeProfileId.value = 'default'
    Object.assign(layoutConfig, clonePlain(getDefaultLayout()))
    applyTabletDefaultPerformanceMode(layoutConfig)
  }

  return {
    layoutConfig,
    layoutDirty,
    activeProfileId,
    isProfilesLoading,
    profilesLoadError,
    isConfigLoaded,
    isConfigLoading,
    setSuppressDirtyTracking,
    resetCoreState,
  }
}
