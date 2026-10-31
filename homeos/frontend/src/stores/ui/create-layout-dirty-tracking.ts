/** - 只在「干净」时挂深 watch：脏了之后继续整树遍历纯属浪费 */
import { watch, type Ref } from 'vue'
import type { UILayoutConfig } from '@/shared/types/layout'

/**
 * 全局脏标记追踪：任何对 layoutConfig 的修改（含设置页 v-model）都会标记 layoutDirty。
 * 拖拽热点应写浅层 preview，松手再提交，避免本 watch 每帧扇出。
 *
 * 为什么不是「浅层 watch + 显式 markDirty」：layoutConfig 是深 reactive（设置页的 v-model
 * 直接改嵌套字段），浅层 watch 看不到这些改动，会静默丢掉用户的修改——比多几次遍历危险得多。
 * 实际开销来自「每次变更都重走一遍整棵布局树收集依赖」：所以这里只在脏标志还是 false 的
 * 时候才挂深 watch，第一次变更把它置 true 后立刻卸掉，保存 / 加载把标志复位时再挂回来。
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
  let stopDeep: (() => void) | null = null

  /** 卸掉深 watch（已脏 / 已停用时） */
  function disarm(): void {
    if (stopDeep === null) return
    stopDeep()
    stopDeep = null
  }

  /** 挂上深 watch（仅在干净状态下挂，保证「第一次变更」一定能被看到） */
  function arm(): void {
    if (stopDeep !== null) return
    stopDeep = watch(
      layoutConfig,
      () => {
        // 批量操作抑制期间跳过，避免误标脏
        if (isSuppressing()) return
        // 配置未加载完成跳过，避免初始默认值 / 服务端覆盖被误标脏
        if (!isConfigLoaded.value) return
        layoutDirty.value = true
        // 已经脏了，「下一次变更」不再需要整树遍历（设置页每敲一个字都走一遍太贵）
        disarm()
      },
      { deep: true },
    )
  }

  // dirty 复位（保存完成 / 加载完成 / 重置）后重新挂上。
  // 用 sync：复位与重挂之间若隔着一次 flush，同一 tick 内的后续改动会被漏掉。
  const stopReset = watch(
    layoutDirty,
    (dirty) => {
      if (dirty) disarm()
      else arm()
    },
    { flush: 'sync' },
  )

  arm()

  return {
    stopLayoutDirtyWatch: () => {
      disarm()
      stopReset()
    },
  }
}
