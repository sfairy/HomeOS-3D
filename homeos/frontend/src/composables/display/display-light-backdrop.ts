/**
 * 展示页「开关灯背景图」状态（主工程）。
 *
 * 背景图 URL 存在 homeos 布局配置（`layoutConfig.lightOn/OffBackgroundUrl`），灯光状态来自
 * 实体 store。判定与原 `DashboardView.isAnyLightOn` 一致：
 *  1. `layoutConfig.favoriteEntities.light` 非空 → 只看这几盏收藏灯是否亮；
 *  2. 否则回退 `entitiesStore.lightCount > 0`。
 *
 * 消费方有两处，按是否有主布局壳区分：
 *  - 总览首页 `dashboard`（主布局壳内）：MainLayout 把该图铺在**页面布局区域**
 *    （导航 + 户型图 + 侧边栏 + 底部信息栏），随缩放壳层等比缩放；
 *  - 独立整屏大屏 `display` / `homeos`（无壳）：App.vue 以 fixed 层铺满整个视口。
 * 其它 homeos 管理页保持原样，不启用该背景层。
 */
import { computed, type ComputedRef } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'

const DEFAULT_LIGHT_ON_URL = '/backgrounds/light_on.png'
const DEFAULT_LIGHT_OFF_URL = '/backgrounds/light_off.png'

export interface DisplayLightBackdropState {
  /** 是否任意（或收藏的）灯处于开启状态。 */
  on: boolean
  /** 当前应铺的整页背景图 URL。 */
  url: string
}

/**
 * 响应式计算展示页整页背景图状态。
 *
 * @returns 含 `on`（是否亮灯）与 `url`（背景图地址）的只读 computed。
 */
export function useDisplayLightBackdropState(): ComputedRef<DisplayLightBackdropState> {
  const layoutStore = useLayoutStore()
  const entitiesStore = useEntitiesStore()

  return computed<DisplayLightBackdropState>(() => {
    const config = layoutStore.layoutConfig
    const favorites = config.favoriteEntities?.light || []
    const isAnyLightOn =
      favorites.length > 0
        ? favorites.some((entityId) => entitiesStore.getEntity(entityId)?.state === 'on')
        : Number(entitiesStore.lightCount || 0) > 0
    return {
      on: isAnyLightOn,
      url: isAnyLightOn
        ? String(config.lightOnBackgroundUrl || DEFAULT_LIGHT_ON_URL)
        : String(config.lightOffBackgroundUrl || DEFAULT_LIGHT_OFF_URL),
    }
  })
}
