<!--
组件：PanelHeaderSection.vue
所属模块：frontend / src / views / settings / display / floating
职责：浮动组件面板头部。展示组件数概览、流程概览、拖拽锁定开关、添加组件菜单，
      并提供跳转到生活账户/环境健康/安防场景等业务配置的链接。
关键依赖：
  - SettingsSectionHead / SettingsFlowBand / SettingsFlowStat：头部与流程概览
  - SettingsPopoutMenu + FloatingWidgetPickerMenu：添加组件菜单
  - SETTINGS_ROUTES：业务配置跳转
数据来源：父级透传的组件数、锁定态与目录分组
-->
<script setup>
/**
 * 职责：渲染 views/PanelHeaderSection 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { computed } from 'vue'
import { Grip, Layers, Layout, Lock, Monitor, Unlock, Plus } from '@lucide/vue'
import SettingsSectionHead from '@/views/settings/shared/layout/SettingsSectionHead.vue'
import SettingsFlowBand from '@/views/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/views/settings/shared/layout/SettingsFlowStat.vue'
import SettingsPopoutMenu from '@/views/settings/shared/layout/SettingsPopoutMenu.vue'
import FloatingWidgetPickerMenu from './FloatingWidgetPickerMenu.vue'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import './styles/floating.css'

// 双向绑定：是否展开「添加组件」菜单
const showAddFloating = defineModel('showAddFloating', { type: Boolean, required: true })

// 入参：组件数、拖拽锁定态、目录分组
const props = defineProps({
  widgetCount: { type: Number, required: true },
  isAfhLocked: { type: Boolean, required: true },
  floatingCatalogGroups: { type: Array, required: true },
})

// 对外事件：切换拖拽锁定、添加组件
const emit = defineEmits(['toggle-afh-lock', 'add-widget'])

// 概述文案：组件总数为 0 时给出引导
const floorSummary = computed(() =>
  props.widgetCount > 0
    ? `共 ${props.widgetCount} 个浮动组件 · 单层平面`
    : '尚未配置浮动组件 · 点击「添加组件」开始',
)

// 浮动流程折叠态摘要文案：组件数 · 锁定状态
const floatingFlowSummary = computed(() => {
  const lock = props.isAfhLocked ? '拖拽锁定' : '拖拽解锁'
  return `${props.widgetCount} 个组件 · ${lock}`
})

// 选中组件类型后向上抛出并关闭菜单
function onSelectWidget(type) {
  emit('add-widget', type)
  showAddFloating.value = false
}

// 浮动流程步骤：组件配置 → 坐标布局 → 大屏渲染
const floatingFlowSteps = computed(() => [
  { label: '组件配置', meta: `${props.widgetCount} 个组件`, icon: Layers, tone: 'in' },
  { label: '坐标布局', meta: props.isAfhLocked ? '已锁定' : '可拖拽', icon: Layout, tone: 'mid' },
  { label: '大屏渲染', meta: '浮动层', icon: Monitor, tone: 'out' },
])
</script>

<template>
  <div class="fp-overview">
    <SettingsSectionHead
      :icon="Grip"
      icon-class="fp-overview-head__icon"
      orb-class="fp-overview-head__orb"
      title="浮动组件工作区"
      :description="floorSummary"
      bordered
    >
      <template #actions>
        <div class="fp-overview-actions">
          <button
            type="button"
            :class="['fp-overview-actions__lock', isAfhLocked ? 'fp-lock-btn' : 'fp-unlock-btn']"
            @click="emit('toggle-afh-lock')"
          >
            <Lock v-if="isAfhLocked" class="w-3.5 h-3.5" />
            <Unlock v-else class="w-3.5 h-3.5" />
            <span>{{ isAfhLocked ? '解锁拖拽' : '锁定拖拽' }}</span>
          </button>
          <SettingsPopoutMenu v-model="showAddFloating" :width="224" :max-height="320">
            <template #trigger>
              <button type="button" class="settings-btn-accent fp-overview-actions__add">
                <Plus class="w-3.5 h-3.5" />
                {{ '添加组件' }}
              </button>
            </template>
            <FloatingWidgetPickerMenu :groups="floatingCatalogGroups" @select="onSelectWidget" />
          </SettingsPopoutMenu>
        </div>
      </template>
    </SettingsSectionHead>

    <SettingsFlowBand
      :steps="floatingFlowSteps"
      class="fp-flow-band mt-4"
      band-class="fp-flow-band__shell"
      collapsible
      default-collapsed
      toggle-label="浮动流程"
      :collapsed-summary="floatingFlowSummary"
    >
      <template #stats>
        <SettingsFlowStat
          :label="'组件总数'"
          :value="widgetCount"
          tone="accent"
          val-tone="accent"
        />
        <SettingsFlowStat
          :label="'户型图拖拽'"
          :value="isAfhLocked ? '锁定' : '解锁'"
          :tone="isAfhLocked ? 'amber' : 'emerald'"
          :val-tone="isAfhLocked ? 'amber' : 'emerald'"
        />
      </template>
    </SettingsFlowBand>

    <div class="fp-insight-row">
      <p class="settings-note-callout settings-note-callout--sky fp-insight">
        <span class="settings-note-callout__label">{{ '统一平面' }}</span>
        <span>{{ '解锁后可在户型图拖拽，保存布局后写入配置。' }}</span>
      </p>
    </div>

    <div class="fp-cross-links">
      <span class="fp-cross-links__label">{{ '业务配置' }}</span>
      <RouterLink :to="SETTINGS_ROUTES.lifeAccounts()" class="fp-cross-links__item">{{
        '生活账户'
      }}</RouterLink>
      <RouterLink :to="SETTINGS_ROUTES.envHealth()" class="fp-cross-links__item">{{
        '环境与健康'
      }}</RouterLink>
      <RouterLink :to="SETTINGS_ROUTES.securityModes()" class="fp-cross-links__item">{{
        '安防场景'
      }}</RouterLink>
      <RouterLink to="/security" class="fp-cross-links__item">{{ '安防区域' }}</RouterLink>
      <RouterLink :to="SETTINGS_ROUTES.family()" class="fp-cross-links__item">{{
        '儿童模式'
      }}</RouterLink>
    </div>
  </div>
</template>
