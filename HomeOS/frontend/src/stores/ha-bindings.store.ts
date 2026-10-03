/**
 * @file ha-bindings.store.ts
 * @module frontend/src/stores
 * @brief HA 绑定切片：基于 layout.store.layoutConfig 的只读 computed 视图。
 *
 * 职责：
 * - 从 layoutConfig 派生 HA 实体绑定的只读视图（haConfig / statsSensors / dashboardFooter）
 * - 暴露常用快捷访问器（weatherEntityId / securityCamera），避免上层深读 layoutConfig
 *
 * 关键依赖：
 * - @/stores/layout.store：作为 layoutConfig 的真实数据源
 * - @/stores/ui/create-ha-bindings-state：computed 视图工厂
 *
 * 实现说明：
 * - 本 store 不持有独立 state，所有字段均为 layoutConfig 派生的 computed
 * - 上层既可直接用 useLayoutStore().layoutConfig.haConfig，也可通过本 store 获得类型收窄的只读视图
 */
import { defineStore } from 'pinia'
import { useLayoutStore } from '@/stores/layout.store'
import { createHaBindingsState } from '@/stores/ui/create-ha-bindings-state'

/** useHaBindingsStore：Pinia store 工厂，状态与动作见定义。 */
export const useHaBindingsStore = defineStore('haBindings', () => {
  const layout = useLayoutStore()
  return createHaBindingsState(layout.layoutConfig)
})
