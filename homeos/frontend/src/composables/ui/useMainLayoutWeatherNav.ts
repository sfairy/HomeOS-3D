import { logger } from '@/utils/core/logger'
/**
 * @file useMainLayoutWeatherNav.ts
 * @module composables/ui
 * @description 主布局天气导航 composable：根据天气状态切换导航栏配色与主题。
 *
 * 职责：
 * - 读取 HA 天气实体状态，映射为天气主题；
 * - 根据天气主题计算导航栏 brand/glow/tint 配色方案；
 * - 生成响应式导航栏内联样式（CSS 变量 --nav-brand/--nav-glow/--nav-tint）；
 * - 提供浏览器全屏切换函数。
 *
 * 依赖：
 * - vue（computed/ref/watch）
 * - entities.store / layout.store（天气实体与布局配置）
 */
import { computed, ref, watch } from 'vue'
import { weatherVisualKey } from '@/constants/weather-labels'
import { domainIndexToArray } from '@/utils/entity/derived.util'
import type { useEntitiesStore } from '@/stores/entities.store'
import type { useLayoutStore } from '@/stores/layout.store'

/**
 * 主布局天气导航 composable。
 *
 * 调用场景：主布局组件初始化时调用，用于驱动导航栏天气配色。
 *
 * @param options.layoutStore UI 状态 store（天气配置）
 * @param options.entitiesStore 实体 store（读取天气实体状态）
 * @returns 全屏切换、导航配色与样式
 */
export function useMainLayoutWeatherNav(options: {
  layoutStore: ReturnType<typeof useLayoutStore>
  entitiesStore: ReturnType<typeof useEntitiesStore>
}) {
  const { layoutStore, entitiesStore } = options

  /**
   * 切换浏览器全屏模式。
   * 已全屏则退出，未全屏则请求进入；requestFullscreen 失败时静默忽略。
   */
  function toggleFullscreen() {
    const el = document.documentElement
    if (document.fullscreenElement) document.exitFullscreen?.()
    else el.requestFullscreen?.().catch((err) => logger.debug('进入全屏失败', err))
  }

  // 当前天气主题：从天气实体状态映射
  const weatherTheme = computed(() => {
    void entitiesStore.getDomainEpoch('weather')
    const weatherEid = layoutStore.layoutConfig.haConfig?.weatherEntityId
    let state = ''
    if (weatherEid) state = entitiesStore.getEntity(weatherEid)?.state || ''
    if (!state || state === 'unavailable' || state === 'unknown') {
      const weatherIds = domainIndexToArray(entitiesStore.domainEntityIndex.get('weather'))
      if (weatherIds.length) state = entitiesStore.getEntity(weatherIds[0])?.state || ''
    }
    const visual = weatherVisualKey(state || 'sunny')
    if (visual === 'clear-night') return 'night'
    return visual
  })

  // 各天气主题对应的导航配色（brand 主色 / glow 辉光 / tint 底色）
  const navColors = computed(() => {
    const map: Record<string, { brand: string; glow: string; tint: string }> = {
      sunny: {
        brand: 'rgba(255,191,36,0.18)',
        glow: 'rgba(255,191,36,0.12)',
        tint: 'rgba(251,191,36,0.06)',
      },
      cloudy: {
        brand: 'rgba(148,163,184,0.20)',
        glow: 'rgba(148,163,184,0.14)',
        tint: 'rgba(148,163,184,0.07)',
      },
      rainy: {
        brand: 'rgba(56,189,248,0.20)',
        glow: 'rgba(56,189,248,0.14)',
        tint: 'rgba(56,189,248,0.07)',
      },
      snowy: {
        brand: 'rgba(255,255,255,0.22)',
        glow: 'rgba(255,255,255,0.15)',
        tint: 'var(--premium-border-strong)',
      },
      lightning: {
        brand: 'rgba(168,85,247,0.24)',
        glow: 'rgba(168,85,247,0.18)',
        tint: 'rgba(168,85,247,0.09)',
      },
      fog: {
        brand: 'rgba(156,163,175,0.20)',
        glow: 'rgba(156,163,175,0.14)',
        tint: 'rgba(156,163,175,0.07)',
      },
      windy: {
        brand: 'rgba(34,211,238,0.18)',
        glow: 'rgba(34,211,238,0.12)',
        tint: 'rgba(34,211,238,0.06)',
      },
      night: {
        brand: 'rgba(129,140,248,0.22)',
        glow: 'rgba(129,140,248,0.15)',
        tint: 'rgba(129,140,248,0.08)',
      },
      drizzle: {
        brand: 'rgba(125,211,252,0.18)',
        glow: 'rgba(125,211,252,0.12)',
        tint: 'rgba(125,211,252,0.06)',
      },
      pouring: {
        brand: 'rgba(37,99,235,0.22)',
        glow: 'rgba(37,99,235,0.16)',
        tint: 'rgba(37,99,235,0.08)',
      },
      hail: {
        brand: 'rgba(186,230,253,0.22)',
        glow: 'rgba(186,230,253,0.15)',
        tint: 'rgba(186,230,253,0.07)',
      },
      sleet: {
        brand: 'rgba(165,180,210,0.22)',
        glow: 'rgba(165,180,210,0.14)',
        tint: 'rgba(165,180,210,0.07)',
      },
      haze: {
        brand: 'rgba(180,160,130,0.20)',
        glow: 'rgba(180,160,130,0.14)',
        tint: 'rgba(180,160,130,0.07)',
      },
      sandstorm: {
        brand: 'rgba(214,163,84,0.22)',
        glow: 'rgba(214,163,84,0.16)',
        tint: 'rgba(214,163,84,0.08)',
      },
      partlycloudy: {
        brand: 'rgba(148,163,184,0.18)',
        glow: 'rgba(148,163,184,0.12)',
        tint: 'rgba(148,163,184,0.06)',
      },
    }
    return map[weatherTheme.value] || map.sunny
  })
  // 导航栏内联样式（CSS 变量）：仅在实际变化时更新，避免无谓重渲染
  const navFrameStyle = ref<Record<string, string>>({})
  watch(
    navColors,
    (colors) => {
      const next = {
        '--nav-brand': colors.brand,
        '--nav-glow': colors.glow,
        '--nav-tint': colors.tint,
      }
      const cur = navFrameStyle.value
      // 三个变量都未变则跳过赋值，减少样式抖动
      if (
        cur['--nav-brand'] === next['--nav-brand'] &&
        cur['--nav-glow'] === next['--nav-glow'] &&
        cur['--nav-tint'] === next['--nav-tint']
      ) {
        return
      }
      navFrameStyle.value = next
    },
    { immediate: true },
  )

  return {
    toggleFullscreen,
    navColors,
    navFrameStyle,
  }
}