/**
 * @file HA 实体绑定只读视图
 * @module stores/ui/create-ha-bindings-state
 * @description
 *  从 layoutConfig 派生的 HA 实体绑定只读 computed 视图。
 *  提供 haConfig、statsSensors、dashboardFooter 等聚合只读访问器，
 *  避免上层直接深读 layoutConfig，便于后续重构与类型收窄。
 *  依赖 Vue computed 与默认布局工厂 getFreshDefaultLayout。
 */
import { computed, type UnwrapNestedRefs } from 'vue'
import type { HaConfig, StatsSensorsConfig, UILayoutConfig } from '@/types/layout'
import { getFreshDefaultLayout } from '@/stores/defaults'

/** 统计传感器默认值工厂（每次返回全新对象，避免共享引用） */
const defaultStats = () => getFreshDefaultLayout().statsSensors

/**
 * HA 实体绑定只读视图（haConfig / statsSensors / dashboardFooter，ui.store 拆分模块）。
 *
 * 创建一组基于 layoutConfig 的 computed 属性，对外暴露 HA 配置、统计传感器
 * 与底部栏的只读视图。当 layoutConfig 字段变化时，computed 自动更新。
 *
 * @param layoutConfig 已解包的响应式布局配置对象
 * @returns 包含 haConfig / statsSensors / dashboardFooter / weatherEntityId / securityCamera 的只读视图
 */
export function createHaBindingsState(layoutConfig: UnwrapNestedRefs<UILayoutConfig>) {
  /** HA 整体配置（含天气、安防摄像头等绑定） */
  const haConfig = computed((): HaConfig => layoutConfig.haConfig)
  /** 统计传感器配置；缺失时回退默认值 */
  const statsSensors = computed(
    (): StatsSensorsConfig => layoutConfig.statsSensors || defaultStats(),
  )
  /** 仪表盘底部栏配置 */
  const dashboardFooter = computed(() => layoutConfig.dashboardFooter)

  /** 天气实体 entity_id（可能为空字符串） */
  const weatherEntityId = computed(() => layoutConfig.haConfig?.weatherEntityId || '')
  /** 安防摄像头实体 entity_id（可能为空字符串） */
  const securityCamera = computed(() => layoutConfig.haConfig?.securityCamera || '')

  return {
    haConfig,
    statsSensors,
    dashboardFooter,
    weatherEntityId,
    securityCamera,
  }
}