<!--
  LifeIndices.vue
  天启气象站生活指数面板：实况条 + 今日关注 + 分组指数卡片。
-->
<template>
  <div class="life-indices" :class="{ 'life-indices--embedded': embedded }">
    <header class="life-indices__head" :class="{ 'life-indices__head--embedded': embedded }">
      <div>
        <h3 class="life-indices__title">{{ '生活指数' }}</h3>
        <p class="life-indices__sub">
          {{
            hasWeather
              ? availableCount
                ? `天启气象站 · 已接入 ${availableCount} 项`
                : '已绑定天气，等待生活指数实体'
              : '请先在设置中绑定 weather.* 实体'
          }}
        </p>
      </div>
      <RouterLink v-if="!hasWeather" :to="SETTINGS_ROUTES.bindings()" class="life-indices__link">
        {{ '配置天气' }}
      </RouterLink>
      <div v-else-if="availableCount" class="life-indices__tone-pills" aria-label="指数语气统计">
        <span class="life-indices__pill is-ok"
          ><em>{{ '适宜' }}</em
          ><strong>{{ toneCounts.ok }}</strong></span
        >
        <span class="life-indices__pill is-caution"
          ><em>{{ '注意' }}</em
          ><strong>{{ toneCounts.caution }}</strong></span
        >
        <span class="life-indices__pill is-warn"
          ><em>{{ '警示' }}</em
          ><strong>{{ toneCounts.warn }}</strong></span
        >
      </div>
    </header>

    <VEmptyState
      v-if="!hasWeather"
      compact
      tone="sky"
      icon="☁"
      :title="'未检测到天气数据'"
    >
      <template #action>
        <RouterLink :to="SETTINGS_ROUTES.bindings()" class="v-empty__link">{{
          '配置天气实体'
        }}</RouterLink>
      </template>
    </VEmptyState>

    <VEmptyState
      v-else-if="!availableCount"
      compact
      tone="sky"
      icon="◎"
      :title="'暂无生活指数'"
      :description="'确认 HA 已启用 tianqi 生活指数传感器（如 sensor.beijing_clothing）'"
    />

    <template v-else>
      <section v-if="warning?.active" class="life-indices__alert" role="status">
        <div class="life-indices__alert-icon" aria-hidden="true">
          <AlertTriangle class="w-4 h-4" />
        </div>
        <div class="life-indices__alert-body">
          <strong>{{ warning.title }}</strong>
          <p v-if="warning.details.length">{{ warning.details[0] }}</p>
        </div>
      </section>

      <section v-if="liveStrip.length" class="life-indices__live" aria-label="室外实况">
        <div
          v-for="(m, idx) in liveStrip"
          :key="m.key"
          class="life-indices__live-chip"
          :class="`is-tone-${idx % 4}`"
        >
          <span>{{ m.label }}</span>
          <strong
            >{{ m.value }}<em v-if="m.unit">{{ m.unit }}</em></strong
          >
        </div>
      </section>

      <section v-if="spotlight.length" class="life-indices__spotlight">
        <article
          v-for="(item, idx) in spotlight"
          :key="item.entityId"
          class="life-indices__spot"
          :class="[`is-${item.tone}`, idx === 0 && 'life-indices__spot--hero']"
          :title="item.description || item.friendlyName"
        >
          <div class="life-indices__spot-top">
            <span class="life-indices__spot-icon" aria-hidden="true">
              <component :is="iconFor(item.suffix)" class="w-4 h-4" />
            </span>
            <span class="life-indices__spot-label">{{ item.label }}</span>
          </div>
          <strong class="life-indices__spot-state">{{ item.state }}</strong>
          <p v-if="item.description" class="life-indices__spot-desc">{{ item.description }}</p>
        </article>
      </section>

      <section v-if="attentionIndices.length" class="life-indices__attention">
        <header class="life-indices__group-head">
          <span class="life-indices__group-title">
            <Sparkles class="w-3.5 h-3.5" aria-hidden="true" />
            {{ '今日关注' }}
          </span>
          <em>{{ attentionIndices.length }}</em>
        </header>
        <div class="life-indices__attention-list">
          <article
            v-for="item in attentionIndices"
            :key="item.entityId"
            class="life-indices__attention-item"
            :class="`is-${item.tone}`"
            :title="item.description || item.friendlyName"
          >
            <span class="life-indices__attention-icon" aria-hidden="true">
              <component :is="iconFor(item.suffix)" class="w-3.5 h-3.5" />
            </span>
            <div class="life-indices__attention-copy">
              <strong>{{ item.label }}</strong>
              <span>{{ item.state }}</span>
            </div>
            <p v-if="item.description" class="life-indices__attention-desc">{{ item.description }}</p>
          </article>
        </div>
      </section>

      <div class="life-indices__groups">
        <section v-for="group in groupedPrimary" :key="group.id" class="life-indices__group">
          <header class="life-indices__group-head">
            <span class="life-indices__group-title">
              <component :is="group.icon" class="w-3.5 h-3.5" aria-hidden="true" />
              {{ group.label }}
            </span>
            <em>{{ group.items.length }}</em>
          </header>
          <div class="life-indices__grid">
            <article
              v-for="item in group.items"
              :key="item.entityId"
              class="life-indices__card"
              :class="`is-${item.tone}`"
              :title="item.description || item.friendlyName"
            >
              <div class="life-indices__card-top">
                <span class="life-indices__card-icon" aria-hidden="true">
                  <component :is="iconFor(item.suffix)" class="w-3.5 h-3.5" />
                </span>
                <span class="life-indices__card-label">{{ item.label }}</span>
              </div>
              <strong class="life-indices__card-state">{{ item.state }}</strong>
              <p v-if="item.description" class="life-indices__card-desc">{{ item.description }}</p>
            </article>
          </div>
        </section>
      </div>

      <section v-if="optionalIndices.length" class="life-indices__group life-indices__group--more">
        <header class="life-indices__group-head">
          <span class="life-indices__group-title">
            <MoreHorizontal class="w-3.5 h-3.5" aria-hidden="true" />
            {{ '更多指数' }}
          </span>
          <em>{{ optionalIndices.length }}</em>
        </header>
        <div class="life-indices__grid life-indices__grid--compact">
          <article
            v-for="item in optionalIndices"
            :key="item.entityId"
            class="life-indices__card life-indices__card--compact"
            :class="`is-${item.tone}`"
            :title="item.description || item.friendlyName"
          >
            <div class="life-indices__card-top">
              <span class="life-indices__card-icon" aria-hidden="true">
                <component :is="iconFor(item.suffix)" class="w-3 h-3" />
              </span>
              <span class="life-indices__card-label">{{ item.label }}</span>
            </div>
            <strong class="life-indices__card-state">{{ item.state }}</strong>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * @file LifeIndices.vue
 * @module widgets/weather
 * @description 生活指数部件：展示当日生活指数（穿衣/紫外线/运动/洗车/钓鱼等），
 *              按类别分组展示并支持跳转设置；通过 useLifeIndices 拉取数据。
 * @dependencies
 *  - vue: computed/Component 响应式与组件类型
 *  - vue-router: RouterLink 路由跳转
 *  - @lucide/vue: 多种生活指数图标
 *  - @/components/common/base/VEmptyState.vue: 空态组件
 *  - @/composables/life/useLifeIndices: 生活指数数据 composable
 *  - @/utils/weather/life-indices.util: 生活指数定义与分组标签
 *  - @/utils/registry/settings-route.util: 设置页路由常量
 */
import { computed, type Component } from 'vue'
import { RouterLink } from 'vue-router'
import {
  AlertTriangle,
  Beer,
  Car,
  CloudSun,
  Fish,
  Footprints,
  HeartPulse,
  Home,
  Leaf,
  MoreHorizontal,
  Plane,
  Shirt,
  ShoppingBag,
  Sparkles,
  Sun,
  SunMedium,
  Thermometer,
  Umbrella,
  Wind,
  Glasses,
  Smile,
  Waves,
  TrafficCone,
  Flower2,
  Droplets,
  Activity,
} from '@lucide/vue'
import VEmptyState from '@/components/common/base/VEmptyState.vue'
import { useLifeIndices } from '@/composables/life/useLifeIndices'
import {
  lifeIndexGroupLabel,
  type LifeIndexDef,
  type LifeIndexItem,
} from '@/utils/weather/life-indices.util'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'

const props = defineProps({
  config: { type: Object, default: () => ({}) },
  panelVisible: { type: Boolean, default: true },
  embedded: { type: Boolean, default: false },
})

const weatherOverride = computed(() => String(props.config?.weatherEntityId || '').trim())
const {
  hasWeather,
  availableCount,
  primaryIndices,
  optionalIndices,
  attentionIndices,
  liveMetrics,
  warning,
  headline,
} = useLifeIndices(weatherOverride)

const GROUP_ORDER = ['home', 'out', 'health', 'leisure'] as const

const GROUP_ICONS: Record<(typeof GROUP_ORDER)[number], Component> = {
  home: Home,
  out: Footprints,
  health: HeartPulse,
  leisure: Smile,
}

const INDEX_ICONS: Record<string, Component> = {
  clothing: Shirt,
  uv: Sun,
  cold: Thermometer,
  car_wash: Car,
  sport: Activity,
  comfort: CloudSun,
  air_conditioner: Wind,
  allergy: Flower2,
  sunscreen: SunMedium,
  umbrella: Umbrella,
  drying: Shirt,
  morning_exercise: Footprints,
  travel: Plane,
  heatstroke: Thermometer,
  road_condition: TrafficCone,
  shopping: ShoppingBag,
  beer: Beer,
  boating: Waves,
  sunglasses: Glasses,
  wind_chill: Wind,
  kite_flying: Wind,
  fishing: Fish,
  nightlife: Sparkles,
  mood: Smile,
  dating: HeartPulse,
  hairstyle: Sparkles,
  makeup: Sparkles,
  traffic: Car,
  dryness: Droplets,
  pollution_diffusion: Leaf,
}

const SPOTLIGHT_SUFFIXES = ['clothing', 'comfort', 'umbrella', 'uv', 'sport', 'travel'] as const

function iconFor(suffix: string): Component {
  return INDEX_ICONS[suffix] || Leaf
}

const toneCounts = computed(() => {
  const all = [...primaryIndices.value, ...optionalIndices.value]
  let ok = 0
  let caution = 0
  let warn = 0
  for (const item of all) {
    if (item.tone === 'ok') ok += 1
    else if (item.tone === 'caution') caution += 1
    else if (item.tone === 'warn') warn += 1
  }
  return { ok, caution, warn }
})

const liveStrip = computed(() => {
  if (!props.panelVisible) return []
  const prefer = ['weather', 'temperature', 'humidity', 'aqi', 'pm25', 'wind_speed', 'precipitation']
  const map = new Map(liveMetrics.value.map((m) => [m.key, m]))
  const ordered = prefer.map((k) => map.get(k)).filter(Boolean) as typeof liveMetrics.value
  const rest = liveMetrics.value.filter((m) => !prefer.includes(m.key))
  return [...ordered, ...rest].slice(0, 6)
})

const spotlight = computed(() => {
  if (!props.panelVisible) return []
  const bySuffix = new Map(primaryIndices.value.map((i) => [i.suffix, i]))
  const picked: LifeIndexItem[] = []
  for (const suffix of SPOTLIGHT_SUFFIXES) {
    const item = bySuffix.get(suffix)
    if (!item || item.state === '—') continue
    picked.push(item)
    if (picked.length >= 3) break
  }
  if (!picked.length && headline.value) {
    const fallback = primaryIndices.value.find((i) => i.label === headline.value?.label)
    if (fallback) picked.push(fallback)
  }
  return picked
})

const spotlightIds = computed(() => new Set(spotlight.value.map((i) => i.entityId)))

const groupedPrimary = computed(() => {
  if (!props.panelVisible) return []
  const map = new Map<LifeIndexDef['group'], LifeIndexItem[]>()
  for (const item of primaryIndices.value) {
    if (spotlightIds.value.has(item.entityId)) continue
    const list = map.get(item.group) || []
    list.push(item)
    map.set(item.group, list)
  }
  return GROUP_ORDER.filter((id) => (map.get(id)?.length || 0) > 0).map((id) => ({
    id,
    label: lifeIndexGroupLabel(id),
    icon: GROUP_ICONS[id],
    items: map.get(id) || [],
  }))
})
</script>

<style scoped src="./styles/LifeIndices.css"></style>
