/** - 提供指向 layoutStore.layoutConfig 的 shallowRef。 */
import { shallowRef, type ShallowRef } from 'vue'
import { useLayoutStore } from '@/stores/layout.store'
import type { UILayoutConfig } from '@/shared/types/layout'

/**
 * 设置页布局引用：`.value` 就是 store 里那个深 reactive 的 layoutConfig，嵌套读取天然响应。
 *
 * layoutConfig 只做原地修改（导入/撤销走 Object.assign），对象身份从不变化；
 * 因此不需要深 watch 去「同步」——那样每次改动都整树遍历一次，而回写同一对象也不会触发 shallowRef。
 *
 * @returns layoutStore - 布局域仓库；layoutConfig - 指向 store 布局配置的 shallowRef
 */
export function useLayoutConfigRef(): {
  layoutStore: ReturnType<typeof useLayoutStore>
  layoutConfig: ShallowRef<UILayoutConfig>
} {
  const layoutStore = useLayoutStore()
  return { layoutStore, layoutConfig: shallowRef(layoutStore.layoutConfig) }
}
