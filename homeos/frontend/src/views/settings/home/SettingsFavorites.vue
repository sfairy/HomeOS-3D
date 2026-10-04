<!--
组件：SettingsFavorites.vue
所属模块：frontend / src / views / settings / home
职责：收藏实体面板入口。按 domain 分类展示收藏设备卡片，支持配置进度、推荐纳入、
      过滤（全部/已配置/待配置），点击卡片打开实体选择弹窗。页头提供保存/取消。
关键依赖：
  - SettingsPageShell / SettingsCard / SettingsPendingSaveAction：页面骨架与保存条
  - SettingsFlowBand / SettingsFlowStat：流程概览与统计
  - RecommendInsightCard：推荐设备卡片
  - EntityPickModal（异步）：实体选择弹窗
  - useFavoritesHub：分类视图、推荐、过滤等派生
数据来源：useFavoritesHub() 返回的 categoryViews / recommendations / 过滤选项
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="favorites"
    icon-key="star"
    accent="var(--module-accent-energy-sub)"
    layout="single"
    compact
    page-class="favorites-hub"
    body-class="favorites-hub__body"
  >
    <template #actions>
      <router-link :to="devicesFavoritesLink" class="settings-btn-ghost">
        {{ '在设备列表查看' }}
      </router-link>
    </template>

    <SettingsCard static>
      <SettingsFlowBand
        :steps="favFlowSteps"
        class="fav-flow-band"
        band-class="fav-flow-band__shell"
        collapsible
        default-collapsed
        toggle-label="流程概览"
        :collapsed-summary="favFlowSummary"
      >
        <template #stats>
          <SettingsFlowStat
            :label="'已配置设备'"
            :value="totalFavoriteCount"
            tone="violet"
            val-tone="violet"
          />
          <SettingsFlowStat
            :label="'已覆盖分类'"
            :value="`${configuredCategoryCount}/${categoryViews.length}`"
            tone="sky"
            val-tone="sky"
          />
        </template>
      </SettingsFlowBand>

      <div class="fav-progress">
        <div class="fav-progress__head">
          <span class="fav-progress__label">{{ '分类配置进度' }}</span>
          <span class="fav-progress__pct">{{
            `${configuredCategoryCount} / ${categoryViews.length}`
          }}</span>
        </div>
        <div class="fav-progress__track">
          <div class="fav-progress__fill" :style="{ width: `${completionPct}%` }" />
        </div>
      </div>
    </SettingsCard>

    <RecommendInsightCard
      v-if="recommendations.hasActionable"
      :title="recommendations.title || '常用设备推荐'"
      :summary="recommendations.summary"
      :actionable="recommendations.hasActionable"
      show-apply
      apply-label="全部纳入"
      :groups="recommendations.groups"
      @apply="applyAllRecommendations"
      @chip-click="applyRecommendationChip"
    />

    <SettingsCard static>
      <div class="fav-filter-row">
        <div class="fav-filter-pills">
          <button
            v-for="opt in filterOptions"
            :key="opt.id"
            type="button"
            :class="['fav-filter-pill', filter === opt.id && 'fav-filter-pill--active']"
            @click="filter = opt.id"
          >
            {{ opt.label }}
            <span v-if="opt.count != null" class="opacity-60">({{ opt.count }})</span>
          </button>
        </div>
        <span class="fav-total-badge">{{ `${totalFavoriteCount} 个设备` }}</span>
      </div>

      <div class="settings-category-grid">
        <button
          v-for="cat in filteredCategories"
          :key="cat.id"
          type="button"
          :class="['fav-category-card', cat.configured && 'fav-category-card--configured']"
          @click="openFavoriteEditor(cat.id, cat.label)"
        >
          <div class="fav-category-card__body">
            <div class="fav-category-card__head">
              <div :class="['fav-category-card__orb', cat.orbClass]">
                <component :is="cat.icon" :class="['w-5 h-5', cat.color]" />
              </div>
              <div class="fav-category-card__info">
                <h3 class="fav-category-card__label">{{ cat.label }}</h3>
                <p class="fav-category-card__desc">{{ cat.description }}</p>
              </div>
              <div class="fav-category-card__badges">
                <span
                  v-if="cat.liveCount > 0"
                  :class="[
                    'fav-category-card__live',
                    (cat.id === 'battery' || cat.id === 'offline' || cat.id === 'lock') &&
                      'fav-category-card__live--warn',
                  ]"
                >
                  {{ `${cat.liveCount} ${cat.liveLabel}` }}
                </span>
                <span v-if="cat.configured" class="fav-category-card__count">{{ cat.count }}</span>
              </div>
            </div>
            <div class="fav-category-card__preview">
              <span v-for="name in cat.previewNames" :key="name" class="fav-category-card__chip">{{
                name
              }}</span>
              <span v-if="!cat.configured" class="fav-category-card__empty-hint">{{
                '尚未配置 — 点击添加设备'
              }}</span>
              <span
                v-else-if="cat.count > cat.previewNames.length"
                class="fav-category-card__empty-hint"
              >
                {{ `+${cat.count - cat.previewNames.length} 更多` }}
              </span>
            </div>
          </div>
          <div class="fav-category-card__footer">
            <span class="fav-category-card__action">{{
              cat.configured ? '编辑设备' : '开始配置'
            }}</span>
            <ChevronRight class="w-4 h-4 fav-category-card__chevron" />
          </div>
        </button>
      </div>
    </SettingsCard>

    <EntityPickModal
      v-if="favModalOpen"
      :key="favDomain"
      :is-open="favModalOpen"
      :domain="favDomain"
      :domain-label="favLabel"
      @close="favModalOpen = false"
    />

  </SettingsPageShell>
</template>

<script setup>
import { ref, computed } from 'vue'
import SettingsPageShell from '@/components/common/page-shell/SettingsPageShell.vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsFlowBand from '@/views/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/views/settings/shared/layout/SettingsFlowStat.vue'
import RecommendInsightCard from '@/components/common/RecommendInsightCard.vue'
import { useFavoritesHub } from '@/composables/settings/hub-ui.internals'
import { ChevronRight, Layers, Monitor, Star, Zap } from '@lucide/vue'
import { defineAsyncComponent } from 'vue'
import { DEVICES_ROUTES } from '@/utils/device/devices-route.util'

// 设备列表「收藏」入口链接
const devicesFavoritesLink = DEVICES_ROUTES.favorites()

// 实体选择弹窗（懒加载）
const EntityPickModal = defineAsyncComponent(
  () => import('@/components/entities/EntityPickModal.vue'),
)


// 入参：当前激活的 Tab id
defineProps({ activeTab: { type: String, default: 'favorites' } })

const {
  filter,
  categoryViews,
  filteredCategories,
  totalFavoriteCount,
  configuredCategoryCount,
  completionPct,
  recommendations,
  applyRecommendationChip,
  applyAllRecommendations,
} = useFavoritesHub()

// 收藏流程步骤：实体域 → 收藏绑定 → 大屏 → 时间线
const favFlowSteps = [
  { label: '实体域', meta: '按 domain 分类', icon: Layers, tone: 'in' },
  { label: '收藏绑定', meta: '快捷设备', icon: Star, tone: 'mid' },
  { label: '大屏', meta: '快捷弹窗', icon: Monitor, tone: 'exec' },
  { label: '时间线', meta: '收藏入口', icon: Zap, tone: 'out' },
]

// 流程折叠态摘要：设备数 + 已配置分类数
const favFlowSummary = computed(
  () =>
    `${totalFavoriteCount.value} 设备 · ${configuredCategoryCount.value}/${categoryViews.value.length} 分类`,
)

// 实体选择弹窗开关与当前编辑 domain/label
const favModalOpen = ref(false)
const favDomain = ref('')
const favLabel = ref('')

// 过滤选项：全部 / 已配置 / 待配置
const filterOptions = computed(() => [
  { id: 'all', label: '全部', count: categoryViews.value.length },
  { id: 'configured', label: '已配置', count: configuredCategoryCount.value },
  {
    id: 'empty',
    label: '待配置',
    count: categoryViews.value.length - configuredCategoryCount.value,
  },
])

// 打开实体选择弹窗：记录 domain 与展示名
function openFavoriteEditor(domain, label) {
  favDomain.value = domain
  favLabel.value = label
  favModalOpen.value = true
}
</script>
<style src="./styles/favorites-hub.css"></style>
