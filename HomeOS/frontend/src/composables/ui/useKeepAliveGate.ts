/**
 * @file keep-alive 激活状态 Composable
 * @module composables/ui/useKeepAliveGate
 *
 * 职责：
 *  - 提供 keep-alive 包裹下的组件激活/失活状态。
 *  - 计算 teleportDisabled，用于 Teleport :disabled 绑定，避免失活时 Teleport 残留 DOM。
 *
 * 依赖：
 *  - vue 的 computed / onActivated / onDeactivated / onMounted / ref。
 */
import { computed, onActivated, onDeactivated, onMounted, ref } from 'vue'

/**
 * keep-alive 激活状态。
 *
 * Vue 在页面失活时不会移除 Teleport 到外部的 DOM，需配合 Teleport :disabled 使用，
 * 否则全屏遮罩会残留并挡住其它页面的点击（生活/联动 Tab 表现为「过一会点不动」）。
 *
 * @returns isActive - 当前是否激活；teleportDisabled - 是否禁用 Teleport（!isActive）
 */
export function useKeepAliveGate() {
  const isActive = ref(true)

  onMounted(() => {
    isActive.value = true
  })
  onActivated(() => {
    isActive.value = true
  })
  onDeactivated(() => {
    isActive.value = false
  })

  /** Teleport 禁用标志：失活时为 true，使 Teleport 内容回到原位避免残留 */
  const teleportDisabled = computed(() => !isActive.value)

  return { isActive, teleportDisabled }
}