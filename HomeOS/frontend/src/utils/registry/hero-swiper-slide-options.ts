/**
 * Hero Swiper 幻灯片选项与序列化
 *
 * 职责：
 * - 转发 hero-swiper-slide-registry 的幻灯片分组、类型选项、Tab 选项等查询能力。
 * - 维护默认三槽配置（天气 / 开关组 / 系统时间线）与槽位数常量。
 * - 提供幻灯片克隆、配置序列化等工具。
 *
 * 依赖：@/utils/registry/hero-swiper-slide-registry。
 *
 * 注意：slide type key（weatherForecast / switchGroup / systemTimeline ...）为配置 key，
 *   不翻译。
 */
import {
  HERO_SWIPER_SLIDE_GROUPS,
  HERO_SWIPER_SLIDE_TYPE_OPTIONS,
  defaultHeroSlideConfig,
  normalizeHeroSlideType,
  isValidHeroSlideType,
  getHeroSwiperPresetOptions,
} from '@/utils/registry/hero-swiper-slide-registry'

export {
  HERO_SWIPER_SLIDE_GROUPS,
  HERO_SWIPER_SLIDE_TYPE_OPTIONS,
  getHeroSwiperPresetOptions,
}

type HeroSwiperSlideType = string

/** 默认幻灯片槽位数（hero-slide-1 / 2 / 3） */
const HERO_SWIPER_SLOT_COUNT = 3

/** 默认幻灯片配置：天气 / 开关组 / 系统时间线 */
export const HERO_SWIPER_DEFAULT_SLIDES: Array<{
  id: string
  type: HeroSwiperSlideType
  config?: Record<string, unknown>
}> = [
  { id: 'hero-slide-1', type: 'weatherForecast' },
  {
    id: 'hero-slide-2',
    type: 'switchGroup',
    config: { defaultTab: 'features' },
  },
  { id: 'hero-slide-3', type: 'systemTimeline' },
]

function normalizeSlide(raw: Record<string, unknown>, index: number) {
  let type = normalizeHeroSlideType(
    String(raw.type || HERO_SWIPER_DEFAULT_SLIDES[index]?.type || 'weatherForecast'),
  )
  if (!isValidHeroSlideType(type)) {
    type = HERO_SWIPER_DEFAULT_SLIDES[index]?.type || 'weatherForecast'
  }
  const base = defaultHeroSlideConfig(type)
  const rawConfig = (raw.config as Record<string, unknown>) || {}
  const config = { ...base, ...rawConfig }
  delete config.embedded
  delete config.compact
  return {
    id: String(raw.id || `hero-slide-${index + 1}`),
    type,
    config,
  }
}

/** getHeroSwiperSlides：函数，按签名入参返回处理结果。 */
export function getHeroSwiperSlides(config?: { slides?: unknown[] }) {
  const source =
    Array.isArray(config?.slides) && config.slides.length
      ? config.slides
      : HERO_SWIPER_DEFAULT_SLIDES
  const normalized = source
    .slice(0, HERO_SWIPER_SLOT_COUNT)
    .map((s, i) => normalizeSlide((s || {}) as Record<string, unknown>, i))
  while (normalized.length < HERO_SWIPER_SLOT_COUNT) {
    const i = normalized.length
    normalized.push(normalizeSlide(HERO_SWIPER_DEFAULT_SLIDES[i] as Record<string, unknown>, i))
  }
  return normalized
}

/** cloneHeroSwiperSlides：函数，按签名入参返回处理结果。 */
export function cloneHeroSwiperSlides(config?: { slides?: unknown[] }) {
  return getHeroSwiperSlides(config).map((s) => ({
    id: s.id,
    type: s.type,
    config: { ...s.config },
  }))
}

/** serializeHeroSwiperSlides：函数，按签名入参返回处理结果。 */
export function serializeHeroSwiperSlides(
  slides: Array<{ id: string; type: string; config?: Record<string, unknown> }>,
) {
  return getHeroSwiperSlides({ slides }).map((s, i) => ({
    id: s.id || `hero-slide-${i + 1}`,
    type: s.type,
    ...(Object.keys(s.config || {}).length ? { config: s.config } : {}),
  }))
}
