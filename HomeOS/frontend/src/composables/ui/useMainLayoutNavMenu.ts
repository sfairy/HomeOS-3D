/**
 * @file useMainLayoutNavMenu.ts
 * @module composables/ui
 * @description 主布局导航菜单 composable。
 *
 * 职责：
 * - 根据布局配置与当前用户身份（访客/非访客）构建导航菜单项；
 * - 提供桌面端顶栏菜单、下拉“更多”菜单；
 * - 窄屏/平板把溢出 Tab 收到「更多」，避免隐式横向滚动；
 * - 监听布局配置变化（顺序/可见性/位置/嵌入/影视库等）自动重建菜单；
 * - 监听路由变化，切换页面时自动收起“更多”下拉。
 *
 * 依赖：
 * - vue（computed/ref/shallowRef/watch/onMounted/onUnmounted）
 * - vue-router（RouteLocationNormalizedLoaded 类型）
 * - nav-tabs.util / main-layout-nav.util（菜单构建工具）
 * - layout.store / auth.store（布局配置与访客身份）
 */
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { isNavTabRouteActive } from '@/utils/layout/nav-tabs.util'
import {
  buildMainLayoutNavMenu,
  capBarItemsForViewport,
} from '@/utils/ui/main-layout-nav.util'
import type { useLayoutStore } from '@/stores/layout.store'
import type { useAuthStore } from '@/stores/auth.store'
import { useExclusiveDropdown } from '@/composables/ui/useExclusiveDropdown'

/**
 * 主布局导航菜单 composable。
 *
 * 调用场景：主布局组件初始化时调用，返回菜单项与下拉展开状态。
 *
 * @param options.layoutStore UI 状态 store（读取布局配置）
 * @param options.authStore 鉴权 store（判断是否访客，访客不显示嵌入项）
 * @param options.route 当前路由对象（用于高亮判断与切换收起）
 * @returns 菜单项列表与展开/高亮状态
 */
export function useMainLayoutNavMenu(options: {
  layoutStore: ReturnType<typeof useLayoutStore>
  authStore: ReturnType<typeof useAuthStore>
  route: RouteLocationNormalizedLoaded
}) {
  const { layoutStore, authStore, route } = options

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

  // 导航构建选项：访客不包含嵌入项（embeds），保护内部资源
  const navOptions = computed(() => ({ includeEmbeds: !authStore.isGuest() }))
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
      includeEmbeds: navOptions.value.includeEmbeds,
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
