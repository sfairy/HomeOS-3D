/**
 * @file 悬浮组件增删改行为
 * @module stores/ui/create-floor-widget-actions
 * @description
 *  顶层浮动部件（FloatingWidget）的增删改操作（原 2D 楼层热点 CRUD 已随楼层模型移除）。
 *  - addFloatingWidget / updateFloatingWidget / removeFloatingWidget
 *  所有修改操作均标记 layoutDirty；调用方按需推送编辑历史。
 *  依赖 Vue ref 与布局配置类型。
 */
import type { Ref } from 'vue'
import type { FloatingWidget, UILayoutConfig } from '@/types/layout'

/** createFloorWidgetActions 的依赖注入参数 */
interface FloorWidgetActionsDeps {
  /** 布局配置 */
  layoutConfig: UILayoutConfig
  /** 脏标志 ref */
  layoutDirty: Ref<boolean>
  /** 推送编辑历史的回调 */
  pushEditHistory: (immediate?: boolean, force?: boolean) => void
}

/**
 * 顶层浮动部件增删改（layout 拆分模块）。
 *
 * @param deps 依赖注入参数
 * @returns 浮动部件的增删改函数集合
 */
export function createFloorWidgetActions(deps: FloorWidgetActionsDeps) {
  const { layoutConfig, layoutDirty } = deps

  /** 确保顶层浮动部件数组存在 */
  function ensureFloatingWidgets(): FloatingWidget[] {
    if (!Array.isArray(layoutConfig.floatingWidgets)) {
      layoutConfig.floatingWidgets = []
    }
    return layoutConfig.floatingWidgets
  }

  /**
   * 新增浮动部件。
   * @param widget 浮动部件对象
   */
  function addFloatingWidget(widget: FloatingWidget): void {
    ensureFloatingWidgets().push(widget)
    layoutDirty.value = true
  }

  /**
   * 合并更新指定浮动部件。
   * @param id 部件 ID
   * @param updates 部分字段更新
   */
  function updateFloatingWidget(id: string, updates: Partial<FloatingWidget>): void {
    const widgets = ensureFloatingWidgets()
    const idx = widgets.findIndex((w) => w.id === id)
    if (idx === -1) return
    widgets[idx] = { ...widgets[idx], ...updates }
    layoutDirty.value = true
  }

  /**
   * 按 ID 删除浮动部件。
   * @param id 部件 ID
   */
  function removeFloatingWidget(id: string): void {
    layoutConfig.floatingWidgets = ensureFloatingWidgets().filter((w) => w.id !== id)
    layoutDirty.value = true
  }

  return {
    addFloatingWidget,
    updateFloatingWidget,
    removeFloatingWidget,
  }
}
