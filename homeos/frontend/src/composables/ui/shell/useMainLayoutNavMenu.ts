/** - 根据布局配置构建导航菜单项； */
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { isNavTabRouteActive } from '@/shared/utils/layout/nav-tabs.util'
import {
  buildMainLayoutNavMenu,
  capBarItemsForViewport,
} from '@/shared/utils/ui/main-layout-nav.util'
import type { useLayoutStore } from '@/stores/layout.store'
import { useLicenseFeatureAccess } from '@/router/license-gate'
import { useExclusiveDropdown } from '@/composables/ui/popup/useExclusiveDropdown'

/**
 * 主布局导航菜单 composable。
 *
 * 调用场景：主布局组件初始化时调用，返回菜单项与下拉展开状态。
 *
 * @param options.layoutStore UI 状态 store（读取布局配置）
 * @param options.route 当前路由对象（用于高亮判断与切换收起）
 * @returns 菜单项列表与展开/高亮状态
 */
export function useMainLayoutNavMenu(options: {
  layoutStore: ReturnType<typeof useLayoutStore>
  route: RouteLocationNormalizedLoaded
}) {
  const { layoutStore, route } = options

  // 功能码门禁明细（响应式 ref）：导航项按它显隐，拿到新授权后自动重建菜单
  const licenseFeatureAccess = useLicenseFeatureAccess()

  const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1366)

  function onViewportResize() {
    viewportWidth.value = window.innerWidth
  }

  onMounted(() => {
    window.addEventListener('resize', onViewportResize, { passive: true })
  })
  onUnmounted(() => {
    window.removeEventListener('resize', onViewportResize)
  })

  // 导航构建选项：功能码门禁只影响界面显隐（后端仍是权威执行点）。
  const navOptions = computed(() => ({
    featureAccess: licenseFeatureAccess.value,
  }))
  // 导航菜单整体（shallowRef：整体替换而非深层响应，避免高频 diff）
  const navMenu = shallowRef(
    capBarItemsForViewport(
      buildMainLayoutNavMenu(layoutStore.layoutConfig, navOptions.value),
      viewportWidth.value,
    ),
  )
  // 顶栏直接显示的菜单项
  const menuItems = computed(() => navMenu.value.barItems)
  // 顶栏“更多”下拉中的菜单项
  const dropdownMenuItems = computed(() => navMenu.value.dropdownItems)
  // 桌面端“更多”下拉是否展开
  const navMoreOpen = ref(false)
  useExclusiveDropdown(navMoreOpen)
  // “更多”下拉中是否有当前路由对应的活跃项（用于高亮“更多”按钮）
  const navMoreActive = computed(() =>
    dropdownMenuItems.value.some((item) => isNavTabRouteActive(item.path, route.path)),
  )

  function rebuildNavMenu() {
    navMenu.value = capBarItemsForViewport(
      buildMainLayoutNavMenu(layoutStore.layoutConfig, navOptions.value),
      viewportWidth.value,
    )
  }

  // 监听布局配置中影响菜单的字段变化：任一变化即整体重建菜单（deep 监听数组/对象）
  watch(
    () => ({
      order: layoutStore.layoutConfig.navTabOrder,
      visibility: layoutStore.layoutConfig.navTabVisibility,
      placement: layoutStore.layoutConfig.navTabPlacement,
      embeds: layoutStore.layoutConfig.customEmbeds,
      moviePilot: layoutStore.layoutConfig.moviePilotUrl,
      featureAccess: navOptions.value.featureAccess,
      width: viewportWidth.value,
    }),
    () => {
      rebuildNavMenu()
    },
    { deep: true },
  )
  // 路由切换时收起“更多”下拉，避免离开当前页后下拉残留
  watch(
    () => route.path,
    () => {
      navMoreOpen.value = false
    },
  )

  return {
    menuItems,
    dropdownMenuItems,
    navMoreOpen,
    navMoreActive,
  }
}
