/**
 * @file 楼层部件增删改行为
 * @module stores/ui/create-floor-widget-actions
 * @description
 *  楼层热点部件（FloorWidget）与浮动部件（FloatingWidget）的增删改操作。
 *  - addWidget: 新增或同 ID 覆盖位置，同时将锚点约定强制为 'icon'
 *  - updateWidget: 合并更新；位置变更时同步锚点约定
 *  - removeWidget / replaceWidgetId: 删除 / 替换 ID
 *  - add/update/removeFloatingWidget: 浮动部件的对应操作
 *  所有修改操作均通过 pushEditHistory 推入撤销栈，并标记 layoutDirty。
 *  依赖 Vue ref 与布局配置类型。
 */
import type { Ref } from 'vue'
import type { FloorConfig, FloorWidget, FloatingWidget, UILayoutConfig } from '@/types/layout'

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
 * 楼层热点 / 浮动部件增删改（layout 拆分模块）。
 *
 * 封装部件级别所有写操作，确保每次修改都正确推送历史与标记脏数据。
 * 锚点约定（hotspotAnchorConvention）在位置类变更时统一强制为 'icon'，
 * 保持视觉锚点与图标位置一致。
 *
 * @param deps 依赖注入参数
 * @returns 热点部件与浮动部件的增删改函数集合
 */
export function createFloorWidgetActions(deps: FloorWidgetActionsDeps) {
  const { layoutConfig, layoutDirty, pushEditHistory } = deps

  /** 获取当前激活楼层配置；未找到时返回 undefined */
  function activeFloor(): FloorConfig | undefined {
    return layoutConfig.floors.find((f) => f.id === layoutConfig.activeFloorId)
  }

  /**
   * 新增热点部件；若同 ID 已存在则仅更新位置并强制锚点为 'icon'。
   * @param widget 部件对象
   */
  function addWidget(widget: FloorWidget): void {
    const floor = activeFloor()
    if (!floor) return
    const existing = floor.widgets.find((w) => w.id === widget.id)
    pushEditHistory(true, true)
    layoutConfig.hotspotAnchorConvention = 'icon'
    if (existing) {
      existing.xPct = widget.xPct
      existing.yPct = widget.yPct
      existing.hotspotAnchor = 'icon'
    } else {
      floor.widgets.push(widget)
    }
    layoutDirty.value = true
  }

  /**
   * 合并更新指定热点部件。位置类字段变更时同步锚点为 'icon'。
   * @param id 部件 ID
   * @param updates 部分字段更新
   */
  function updateWidget(id: string, updates: Partial<FloorWidget>): void {
    pushEditHistory()
    const floor = activeFloor()
    if (!floor) return
    const idx = floor.widgets.findIndex((w) => w.id === id)
    if (idx === -1) return
    const merged = { ...floor.widgets[idx], ...updates }
    // 位置变更需同步锚点约定，避免锚点漂移
    if ('xPct' in updates || 'yPct' in updates) {
      merged.hotspotAnchor = 'icon'
      layoutConfig.hotspotAnchorConvention = 'icon'
    }
    floor.widgets[idx] = merged
    layoutDirty.value = true
  }

  /**
   * 按 ID 删除热点部件。
   * @param id 部件 ID
   */
  function removeWidget(id: string): void {
    pushEditHistory(true)
    const floor = activeFloor()
    if (!floor) return
    floor.widgets = floor.widgets.filter((w) => w.id !== id)
    layoutDirty.value = true
  }

  /**
   * 替换热点部件的 ID（如实体绑定变更后需更新引用）。
   * @param oldId 旧 ID
   * @param newId 新 ID
   */
  function replaceWidgetId(oldId: string, newId: string): void {
    pushEditHistory(true)
    const floor = activeFloor()
    if (!floor) return
    const idx = floor.widgets.findIndex((w) => w.id === oldId)
    if (idx === -1) return
    floor.widgets[idx] = { ...floor.widgets[idx], id: newId }
    layoutDirty.value = true
  }

  /**
   * 向指定楼层添加浮动部件。
   * @param widget 浮动部件对象
   * @param floorId 楼层 ID，默认当前激活楼层
   */
  function addFloatingWidget(
    widget: FloatingWidget,
    floorId: string = layoutConfig.activeFloorId,
  ): void {
    const floor = layoutConfig.floors.find((f) => f.id === floorId)
    if (!floor) return
    floor.floatingWidgets = floor.floatingWidgets || []
    floor.floatingWidgets.push(widget)
    layoutDirty.value = true
  }

  /**
   * 合并更新指定浮动部件。
   * @param id 部件 ID
   * @param updates 部分字段更新
   * @param floorId 楼层 ID，默认当前激活楼层
   */
  function updateFloatingWidget(
    id: string,
    updates: Partial<FloatingWidget>,
    floorId: string = layoutConfig.activeFloorId,
  ): void {
    const floor = layoutConfig.floors.find((f) => f.id === floorId)
    if (!floor?.floatingWidgets) return
    const idx = floor.floatingWidgets.findIndex((w) => w.id === id)
    if (idx === -1) return
    floor.floatingWidgets[idx] = { ...floor.floatingWidgets[idx], ...updates }
    layoutDirty.value = true
  }

  /**
   * 按 ID 删除浮动部件。
   * @param id 部件 ID
   * @param floorId 楼层 ID，默认当前激活楼层
   */
  function removeFloatingWidget(id: string, floorId: string = layoutConfig.activeFloorId): void {
    const floor = layoutConfig.floors.find((f) => f.id === floorId)
    if (!floor?.floatingWidgets) return
    floor.floatingWidgets = floor.floatingWidgets.filter((w) => w.id !== id)
    layoutDirty.value = true
  }

  return {
    addWidget,
    updateWidget,
    removeWidget,
    replaceWidgetId,
    addFloatingWidget,
    updateFloatingWidget,
    removeFloatingWidget,
  }
}