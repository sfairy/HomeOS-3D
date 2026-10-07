/**
 * @file floating-hub-context.ts
 * @module floorplan/floating-hub
 *
 * 浮动控制中心（AFH - Always Floating Hub）上下文定义
 *
 * 职责：
 * - 定义 FloatingHub 父组件向各子部件（Clock/Entity/Metric/Panel）注入的依赖契约
 * - 通过 provide/inject 解耦父组件与子部件，避免 prop drilling
 * - 集中暴露 UI Store、启用部件列表、拖拽状态、实体查询工具等共享能力
 *
 * 依赖：
 * - vue：ComputedRef / Ref / InjectionKey 类型
 * - @/stores/layout.store：布局域状态（含布局配置 floatingWidgets）
 * - @/types/layout：FloatingWidget 部件类型定义
 */
import type { ComputedRef, InjectionKey, Ref } from 'vue'
import type { useLayoutStore } from '@/stores/layout.store'
import type { FloatingWidget } from '@/types/layout'

/**
 * 浮动控制中心上下文契约
 *
 * 由 FloatingHub.vue 通过 `provide(FloatingHubContextKey, context)` 提供，
 * 各子部件通过 `inject(FloatingHubContextKey)` 获取共享能力，
 * 避免在每个子部件重复实例化 Store / 计算属性。
 */
export interface FloatingHubContext {
  /** 布局域 Store，用于读取布局配置（如 isAfhLocked 编辑模式锁） */
  layoutStore: ReturnType<typeof useLayoutStore>
  /** 当前楼层启用的浮动部件列表（已过滤隐藏项） */
  enabledWidgets: ComputedRef<FloatingWidget[]>
  /** 当前正在拖拽的部件 ID，未拖拽时为 null */
  draggingId: Ref<string | null>
  /** 当前时间字符串（HH:mm），供时钟部件展示 */
  nowTime: ComputedRef<string>
  /**
   * 开始拖拽部件
   * @param widget - 被拖拽的部件
   * @param event - 触发的鼠标或触摸事件
   */
  onDragStart: (widget: FloatingWidget, event: MouseEvent | TouchEvent) => void
  /**
   * 部件点击回调（实体部件点击后通常打开详情弹窗）
   * @param widget - 被点击的部件
   */
  onWidgetClick: (widget: FloatingWidget) => void
  /**
   * 根据部件配置返回主题名（用于 afh-theme-* 样式类）
   * @param widget - 部件实例
   * @returns 主题字符串
   */
  getWidgetTheme: (widget: FloatingWidget) => string
  /**
   * 计算部件内联样式（含位置坐标）
   * @param widget - 部件实例
   * @returns CSS 属性键值对象
   */
  getWidgetStyle: (widget: FloatingWidget) => Record<string, string>
  /**
   * 读取实体当前展示状态文本
   * @param eid - 实体 ID（entity_id）
   * @returns 状态字符串
   */
  entityState: (eid: string) => string
  /**
   * 读取实体单位标签
   * @param eid - 实体 ID
   * @returns 单位字符串（如 ℃、%）
   */
  unitLabel: (eid: string) => string
  /**
   * 读取实体友好名称（friendly_name）
   * @param eid - 实体 ID
   * @returns 友好名称
   */
  friendlyName: (eid: string) => string
  /**
   * 按关键字从实体属性中提取传感器数值
   * @param eid - 实体 ID
   * @param keywords - 属性键关键字（单值或数组，按序匹配）
   * @returns 数值字符串
   */
  sensorValue: (eid: string, keywords: string | string[]) => string
  /**
   * 读取室外 AQI（约定实体 sensor.{城市名}_aqi；可绑定覆盖）
   * @param eid - 可选绑定实体 ID；留空则按天气实体前缀或 *_aqi 自动发现
   * @returns AQI 数值字符串
   */
  aqiValue: (eid: string) => string
  /**
   * 根据 AQI 数值返回等级样式类名
   * @param val - AQI 数值字符串
   * @returns 等级类名（如 good / moderate / unhealthy）
   */
  aqiLevel: (val: string) => string
  /**
   * 根据电池电量返回颜色样式类名
   * @param val - 电量数值字符串
   * @returns 颜色类名
   */
  batteryColor: (val: string) => string
  /**
   * 判断实体是否属于燃气类
   * @param eid - 实体 ID
   * @returns 是 / 否
   */
  isGasEntity: (eid: string) => boolean
  /**
   * 判断实体是否属于水表 / 水务类
   * @param eid - 实体 ID
   * @returns 是 / 否
   */
  isWaterEntity: (eid: string) => boolean
  /**
   * 判断实体是否属于通讯 / 网络类
   * @param eid - 实体 ID
   * @returns 是 / 否
   */
  isCommEntity: (eid: string) => boolean
  /**
   * 判断实体是否属于公用事业类（电 / 气 / 水 / 通讯）
   * @param eid - 实体 ID
   * @returns 是 / 否
   */
  isUtilityEntity: (eid: string) => boolean
  /**
   * 判断部件类型是否属于浮动面板类型（securityPanel / climateHub 等）
   * @param type - 部件类型字符串
   * @returns 是 / 否
   */
  isFloatingPanelType: (type: string) => boolean
}

/**
 * 浮动控制中心上下文注入键
 *
 * Symbol.for 在 HMR 重载时保持同一实例，避免 inject 失败
 */
export const FloatingHubContextKey: InjectionKey<FloatingHubContext> =
  Symbol.for('homeos:floating-hub')