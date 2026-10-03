<!--
  组件文件：RecommendInsightCard.vue
  所属模块：frontend/src/components/common
  组件职责：智能推荐洞察卡片组件。头部 orb 发光图标 + 系统分析标题 + 元信息（近 7 天等）+ 刷新按钮；
    Info 摘要文案；中部分组芯片 groups：「域统计类」variant=domain 且 meta 可解析为百分比时渲染进度条
    带 share 数字，「实体类」渲染友好名 + 实体徽标；横幅 banners 渲染可点击操作；
    底部：已在当前深链页时隐藏跳转 linkTo，否则展示 RouterLink 查看详情 + 一键应用推荐按钮。
  主要 props / emits：
    - props.title/meta/summary：标题/元信息/摘要；
      props.loading/loadingText/actionable/showApply/applyLabel：加载态与可操作配置；
      props.linkTo/linkLabel：查看详情深链；props.groups/banners/visible：芯片/横幅/整体显隐。
    - emits：refresh（刷新按钮点击）/ apply（一键应用）/ chip-click（点击芯片，payload chip）/
      banner-action（横幅操作，payload banner 项）。
  依赖关系：Pinia useEntitiesStore（实体友好名查询）；vue-router RouterLink + useRoute（判断是否已在目标页）；
    @lucide/vue Sparkles/Loader2/RefreshCw/ArrowRight/Info；
    utils：entity/derived.util getEntityDisplayName、registry/settings-route.util isDeepLinkCurrent。
-->
<script setup>
/**
 * @file RecommendInsightCard.vue（内部实现说明）
 * @module common/RecommendInsightCard
 * @description 智能推荐洞察卡片
 *  职责：
 *    - 展示系统分析标题、元信息、摘要与可操作入口（刷新/查看详情/一键应用）；
 *    - 渲染横幅（banner）与分组芯片（chip）；
 *    - 区分「实体类」「域统计类」芯片：前者展示中文友好名，后者渲染百分比与进度条；
 *    - 已在目标深链页时隐藏跳转，避免「点了没反应」。
 *  依赖：vue computed，vue-router，@lucide/vue 图标，
 *    entities.store（实体友好名查询），utils/entity/derived.util，utils/registry/settings-route.util。
 */
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Sparkles, Loader2, RefreshCw, ArrowRight, Info } from '@lucide/vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import { isDeepLinkCurrent } from '@/utils/registry/settings-route.util'

const entitiesStore = useEntitiesStore()
const route = useRoute()

const props = defineProps({
  /** 推荐卡片标题 */
  title: { type: String, default: '智能推荐' },
  /** 标题下方的元信息（如「近 7 天」） */
  meta: { type: String, default: '' },
  /** 摘要文案，展示在 Info 图标旁 */
  summary: { type: String, default: '' },
  /** 是否处于加载中（展示旋转图标与 loadingText） */
  loading: { type: Boolean, default: false },
  /** 加载态文案 */
  loadingText: { type: String, default: '正在分析…' },
  /** 是否可操作（影响根节点样式） */
  actionable: { type: Boolean, default: false },
  /** 是否展示「一键应用推荐」按钮 */
  showApply: { type: Boolean, default: false },
  /** 「一键应用」按钮文案 */
  applyLabel: { type: String, default: '一键应用推荐' },
  /** 「查看详情」深链目标路由 */
  linkTo: { type: String, default: '' },
  /** 「查看详情」按钮文案 */
  linkLabel: { type: String, default: '' },
  /** 分组芯片列表，每项含 id/label/chips */
  groups: { type: Array, default: () => [] },
  /** 横幅列表，每项含 id/label/actionLabel/actionTo */
  banners: { type: Array, default: () => [] },
  /** 是否可见（false 时整体不渲染） */
  visible: { type: Boolean, default: true },
})

const emit = defineEmits(['refresh', 'apply', 'chip-click', 'banner-action'])

/** 已在目标页时隐藏深链，避免「点了没反应」 */
const navLinkTo = computed(() =>
  props.linkTo && !isDeepLinkCurrent(props.linkTo, route) ? props.linkTo : '',
)

/**
 * 解析芯片 meta 中的百分比数值
 * @param {string} meta 形如 "42.5%" 的字符串
 * @returns {number|null} 解析得到的数值，无法匹配返回 null
 */
function chipSharePercent(meta) {
  if (!meta) return null
  const match = String(meta).match(/^(\d+(?:\.\d+)?)%$/)
  return match ? Number(match[1]) : null
}

/**
 * 判断是否为「域统计类」芯片
 * 仅当 variant 为 domain 且 meta 可解析为百分比时为真，此类芯片渲染为进度卡片
 * @param {Object} chip 芯片对象
 * @returns {boolean}
 */
function isDomainStatChip(chip) {
  return chip.variant === 'domain' && chipSharePercent(chip.meta) != null
}

/**
 * 解析芯片展示名
 * 实体类芯片优先展示中文友好名（friendly_name），无则回退原标签
 * @param {Object} chip 芯片对象
 * @returns {string}
 */
function resolveChipName(chip) {
  const entityId = chip?.variant === 'entity' ? chip?.payload?.entityId : null
  if (entityId) {
    return getEntityDisplayName(String(entityId), entitiesStore.getEntity(String(entityId))) || chip.label
  }
  return chip.label
}
</script>

<template>
  <article v-if="visible" class="rec-insight" :class="actionable && 'rec-insight--actionable'">
    <header class="rec-insight__head">
      <div class="rec-insight__head-main">
        <div class="rec-insight__orb" aria-hidden="true">
          <Sparkles class="rec-insight__orb-icon" />
        </div>
        <div class="rec-insight__head-copy">
          <p class="rec-insight__eyebrow">{{ '系统分析' }}</p>
          <h3 class="rec-insight__title">{{ title }}</h3>
          <p v-if="meta" class="rec-insight__meta">{{ meta }}</p>
        </div>
      </div>

      <div class="rec-insight__actions">
        <button
          type="button"
          class="rec-insight__refresh"
          :disabled="loading"
          :aria-label="'刷新推荐'"
          @click="emit('refresh')"
        >
          <RefreshCw class="rec-insight__refresh-icon" :class="loading && 'rec-insight__refresh-icon--spin'" />
        </button>
        <RouterLink v-if="navLinkTo" :to="navLinkTo" class="rec-insight__link">
          <span>{{ linkLabel || '查看详情' }}</span>
          <ArrowRight class="rec-insight__link-arrow" aria-hidden="true" />
        </RouterLink>
        <button
          v-if="showApply && !loading"
          type="button"
          class="rec-insight__apply rec-insight__apply--head"
          @click="emit('apply')"
        >
          <Sparkles class="rec-insight__apply-icon" aria-hidden="true" />
          <span>{{ applyLabel }}</span>
          <ArrowRight class="rec-insight__apply-arrow" aria-hidden="true" />
        </button>
      </div>
    </header>

    <div v-if="loading" class="rec-insight__loading">
      <Loader2 class="rec-insight__loading-icon" />
      <span>{{ loadingText }}</span>
    </div>

    <template v-else>
      <div v-if="summary" class="rec-insight__summary-box">
        <Info class="rec-insight__summary-icon" aria-hidden="true" />
        <p class="rec-insight__summary">{{ summary }}</p>
      </div>

      <div v-for="banner in banners" :key="banner.id" class="rec-insight__banner">
        <p class="rec-insight__banner-text">{{ banner.label }}</p>
        <RouterLink
          v-if="banner.actionLabel && banner.actionTo && !isDeepLinkCurrent(banner.actionTo, route)"
          :to="banner.actionTo"
          class="rec-insight__banner-action"
        >
          <span>{{ banner.actionLabel }}</span>
          <ArrowRight class="rec-insight__banner-arrow" aria-hidden="true" />
        </RouterLink>
        <button
          v-else-if="banner.actionLabel && !(banner.actionTo && isDeepLinkCurrent(banner.actionTo, route))"
          type="button"
          class="rec-insight__banner-action"
          @click="emit('banner-action', banner)"
        >
          <span>{{ banner.actionLabel }}</span>
          <ArrowRight class="rec-insight__banner-arrow" aria-hidden="true" />
        </button>
      </div>

      <div v-for="group in groups" :key="group.id" class="rec-insight__group">
        <span class="rec-insight__group-label">{{ group.label }}</span>

        <div v-if="group.chips.some(isDomainStatChip)" class="rec-insight__stat-grid">
          <button
            v-for="chip in group.chips.filter(isDomainStatChip)"
            :key="chip.id"
            type="button"
            class="rec-insight__stat-card"
            :title="chip.title || chip.label"
            @click="emit('chip-click', chip)"
          >
            <div class="rec-insight__stat-top">
              <span
                class="list-page__domain rec-insight__stat-domain"
                :data-domain="chip.payload?.domain || chip.label"
              >
                {{ chip.label }}
              </span>
              <span class="rec-insight__stat-pct">{{ chip.meta }}</span>
            </div>
            <span
              class="rec-insight__stat-bar"
              role="presentation"
              :style="{ '--rec-stat-pct': `${chipSharePercent(chip.meta)}%` }"
            />
          </button>
        </div>

        <div v-if="group.chips.some((c) => !isDomainStatChip(c))" class="rec-insight__chips">
          <RouterLink
            v-for="chip in group.chips.filter(
              (c) => c.route && !isDeepLinkCurrent(c.route, route) && !isDomainStatChip(c),
            )"
            :key="chip.id"
            :to="chip.route"
            class="rec-insight__chip rec-insight__chip--link"
            :title="chip.title || chip.label"
          >
            <span class="rec-insight__chip-name">{{ resolveChipName(chip) }}</span>
            <span v-if="chip.meta" class="rec-insight__chip-meta">{{ chip.meta }}</span>
          </RouterLink>
          <button
            v-for="chip in group.chips.filter(
              (c) => (!c.route || isDeepLinkCurrent(c.route, route)) && !isDomainStatChip(c),
            )"
            :key="chip.id"
            type="button"
            :class="['rec-insight__chip', chip.variant === 'entity' && 'rec-insight__chip--entity']"
            :title="chip.title || chip.label"
            @click="emit('chip-click', chip)"
          >
            <span class="rec-insight__chip-name">{{ resolveChipName(chip) }}</span>
            <span v-if="chip.meta" class="rec-insight__chip-meta">{{ chip.meta }}</span>
          </button>
        </div>
      </div>

    </template>
  </article>
</template>

<style scoped>
@import './styles/recommend-insight-card.css';
</style>
