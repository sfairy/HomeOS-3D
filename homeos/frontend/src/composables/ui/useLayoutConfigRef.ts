/**
 * @file 布局配置引用 Composable
 * @module composables/ui/useLayoutConfigRef
 *
 * 职责：
 *  - 提供与 layoutStore.layoutConfig 保持深同步的 shallowRef。
 *  - 统一替代各面板重复的 watch(() => layoutStore.layoutConfig, ..., { deep: true })。
 *
 * 依赖：
 *  - vue 的 shallowRef / watch / ShallowRef 类型。
 *  - layout.store 的 useLayoutStore。
 *  - layout 类型的 UILayoutConfig。
 */
import { shallowRef, watch, type ShallowRef } from 'vue'
import { useLayoutStore } from '@/stores/layout.store'
import type { UILayoutConfig } from '@/types/layout'

/**
 * 设置页布局引用：与 layoutStore.layoutConfig 保持深同步的 shallowRef。
 * 统一替代各面板重复的 watch(() => layoutStore.layoutConfig, ..., { deep: true })。
 *
 * 调用场景：设置页面板需要响应式访问布局配置但避免重复 watch 的场景。
 *
 * @returns layoutStore - 布局域仓库；layoutConfig - 与 store 深同步的 shallowRef
 */
export function useLayoutConfigRef(): {
  layoutStore: ReturnType<typeof useLayoutStore>
  layoutConfig: ShallowRef<UILayoutConfig>
} {
  const layoutStore = useLayoutStore()
  // shallowRef 避免对大对象进行深层响应式转换，仅在外部赋值时触发更新
  const layoutConfig = shallowRef(layoutStore.layoutConfig)

  // 深度监听 store 中的 layoutConfig，变更时整体替换 shallowRef 的 value
  watch(
    () => layoutStore.layoutConfig,
    (config) => {
      layoutConfig.value = config
    },
    { deep: true },
  )

  return { layoutStore, layoutConfig }
}
