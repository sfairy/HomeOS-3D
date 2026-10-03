/**
 * @file create-layout-dirty-tracking.ts
 * @module frontend/src/stores/ui
 * @brief layoutConfig 深 watch 脏标记（从 layout 拆出，便于拖拽 suppress / 后续浅层坐标缓冲）。
 *
 * 职责：
 * - 深 watch layoutConfig，任何修改（含设置页 v-model）都标记 layoutDirty=true
 * - 抑制场景：isSuppressing() 返回 true 时跳过（楼层切换 / 批量覆盖等临时关闭）
 * - 加载未完成跳过：isConfigLoaded=false 时跳过，避免初始默认值被误标脏
 *
 * 关键依赖：
 * - vue watch / Ref 类型
 * - @/types/layout：UILayoutConfig
 *
 * 实现说明：
 * - 拖拽热点应写浅层 preview，松手再提交，避免本 watch 每帧扇出
 * - 返回 stopLayoutDirtyWatch 用于卸载场景（单例 store 通常不调用）
 */
import { watch, type Ref } from 'vue'
import type { UILayoutConfig } from '@/types/layout'

/**
 * 全局脏标记追踪：任何对 layoutConfig 的修改（含设置页 v-model）都会标记 layoutDirty。
 * 拖拽热点应写浅层 preview，松手再提交，避免本 watch 每帧扇出。
 *
 * @param opts.layoutConfig 布局配置对象（深 watch 目标）
 * @param opts.layoutDirty 脏标志 ref
 * @param opts.isConfigLoaded 配置是否已加载 ref（未加载完成时不标记脏）
 * @param opts.isSuppressing 是否抑制 dirty 跟踪的回调（楼层切换 / 批量覆盖时返回 true）
 * @returns stopLayoutDirtyWatch：停止 watch 的函数
 */
export function createLayoutDirtyTracking(opts: {
  layoutConfig: UILayoutConfig
  layoutDirty: Ref<boolean>
  isConfigLoaded: Ref<boolean>
  isSuppressing: () => boolean
}) {
  const { layoutConfig, layoutDirty, isConfigLoaded, isSuppressing } = opts

  // 深 watch：捕获所有层级的字段变更（widgets / floatingWidgets / haConfig 等）
  const stop = watch(
    layoutConfig,
    () => {
      // 批量操作抑制期间跳过，避免误标脏
      if (isSuppressing()) return
      // 配置未加载完成跳过，避免初始默认值 / 服务端覆盖被误标脏
      if (!isConfigLoaded.value) return
      layoutDirty.value = true
    },
    { deep: true },
  )

  return { stopLayoutDirtyWatch: stop }
}
