<!--
  联动绑定大类各子页（Hazards/场景/房间等）的顶部推荐与缺口洞察聚合组件。
  上半部分为 RecommendInsightCard：当存在 hazard-sensors 推荐组时展示「一键添加传感器
  绑定」推荐卡；下半部分为缺口卡片：列出当前绑定分区仍缺失的关键配置项并提供跳转。
  注意事项：当 recommendations 没有 hazard-sensors 组或 gapItems 为空时整个组件不渲染
  （v-if showRecommend || showGaps），不占据垂直空间。
-->
<template>
  <div v-if="showRecommend || showGaps" class="bindings-section-insights">
    <RecommendInsightCard
      v-if="showRecommend"
      :title="recommendations.title || '集成绑定推荐'"
      :meta="recommendations.meta"
      :summary="recommendations.summary"
      :actionable="recommendations.hasActionable"
      :show-apply="recommendations.groups?.some((g) => g.id === 'hazard-sensors')"
      apply-label="一键添加传感器绑定"
      :groups="recommendations.groups"
      :link-to="showLink ? recommendations.linkTo : ''"
      :link-label="recommendations.linkLabel"
      :visible="true"
      @apply="$emit('apply')"
      @chip-click="$emit('chip-click', $event)"
    />

    <SettingsCard v-if="showGaps" static extra-class="bind-gaps-card">
      <SettingsSectionHead
        eyebrow="完整性检查"
        :title="gapsTitle"
        :description="gapsDescription"
        :icon="AlertTriangle"
        icon-class="bind-gaps-card__icon"
        orb-class="bind-gaps-card__orb"
        bordered
      >
        <template #actions>
          <span class="bind-gaps__badge">{{ `${gapItems.length} 项` }}</span>
        </template>
      </SettingsSectionHead>
      <ul class="bind-gaps__list">
        <li v-for="gap in gapItems" :key="gap.id" class="bind-gaps__chip">
          <RouterLink v-if="gapNavTo(gap)" :to="gapNavTo(gap)" class="bind-gaps__link">{{
            gap.label
          }}</RouterLink>
          <span v-else>{{ gap.label }}</span>
        </li>
      </ul>
    </SettingsCard>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { AlertTriangle } from '@lucide/vue'
import RecommendInsightCard from '@/components/common/RecommendInsightCard.vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsSectionHead from '@/features/settings/shared/layout/SettingsSectionHead.vue'
import { isDeepLinkCurrent } from '@/shared/utils/registry/settings-route.util'

const route = useRoute()

const props = defineProps({
  section: { type: String, required: true },
  recommendations: { type: Object, default: () => ({}) },
  gapItems: { type: Array, default: () => [] },
  /** 概览上「打开绑定设置」链接可隐藏（已在本页） */
  showLink: { type: Boolean, default: false },
})

defineEmits(['apply', 'chip-click'])

// 是否展示传感器推荐卡片（仅当存在 hazard-sensors 推荐组时）
const showRecommend = computed(() => {
  const groups = props.recommendations?.groups || []
  return groups.some((g) => g.id === 'hazard-sensors' && g.chips?.length)
})

const showGaps = computed(() => (props.gapItems?.length || 0) > 0)

/** 缺口项若已指向当前绑定子页，改为纯文本（避免自链） */
function gapNavTo(gap) {
  const to = gap?.route
  if (!to || isDeepLinkCurrent(to, route)) return ''
  return to
}

// 缺口区块标题：概览用「绑定完整性检查」，子分区用「本域完整性检查」
const gapsTitle = computed(() =>
  props.section === 'overview' ? '绑定完整性检查' : '本域完整性检查',
)

const gapsDescription = computed(() =>
  props.section === 'overview'
    ? '以下项尚未配置，相关微件可能显示空状态'
    : '以下为本域尚未配置的项，相关微件可能显示空状态',
)
</script>

<style scoped src="./styles/SectionInsights.css"></style>
