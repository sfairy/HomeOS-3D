<!--
组件：PanelHeaderSection.vue
所属模块：frontend / src / views / settings / display / floating
职责：浮动组件面板头部。展示当前楼层与组件数概览、流程概览、拖拽锁定开关、添加组件菜单、
      多楼层 Tab 切换，并提供跳转到生活账户/环境健康/安防场景等业务配置的链接。
关键依赖：
  - SettingsSectionHead / SettingsFlowBand / SettingsFlowStat：头部与流程概览
  - SettingsPopoutMenu + FloatingWidgetPickerMenu：添加组件菜单
  - SETTINGS_ROUTES：业务配置跳转
数据来源：父级透传的楼层列表、当前楼层、组件数、锁定态与目录分组
-->
<script setup>
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/PanelHeaderSection 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { computed } from 'vue'
import { Grip, Layers, Layout, Lock, MapPin, Monitor, Unlock, Plus } from '@lucide/vue'
import SettingsSectionHead from '@/views/settings/shared/layout/SettingsSectionHead.vue'
import SettingsFlowBand from '@/views/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/views/settings/shared/layout/SettingsFlowStat.vue'
import SettingsPopoutMenu from '@/views/settings/shared/layout/SettingsPopoutMenu.vue'
import FloatingWidgetPickerMenu from './FloatingWidgetPickerMenu.vue'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import './styles/floating.css'

// 双向绑定：是否展开「添加组件」菜单
const showAddFloating = defineModel('showAddFloating', { type: Boolean, required: true })

// 入参：当前楼层名、本层组件数、拖拽锁定态、是否多楼层、楼层列表、激活楼层 id、目录分组、计数函数
const props = defineProps({
  currentFloorName: { type: String, required: true },
  widgetCount: { type: Number, required: true },
  isAfhLocked: { type: Boolean, required: true },
  showMultiFloorTabs: { type: Boolean, required: true },
  floors: { type: Array, required: true },
  effectiveFloorId: { type: String, required: true },
  floatingCatalogGroups: { type: Array, required: true },
  floatingWidgetCount: { type: Function, required: true },
})

// 对外事件：切换拖拽锁定、选择楼层、添加组件
const emit = defineEmits(['toggle-afh-lock', 'select-floor', 'add-widget'])

// 全项目浮动组件总数（累加各楼层）
const totalWidgetCount = computed(() =>
  props.floors.reduce((sum, f) => sum + props.floatingWidgetCount(f.id), 0),
)

// 楼层摘要文案：单楼层仅显示当前，多楼层显示总数
const floorSummary = computed(() => {
  const n = props.floors.length
  if (n <= 1) return `当前编辑 ${props.currentFloorName}`
  return `${props.currentFloorName} · 共 ${n} 个楼层 · 全项目 ${totalWidgetCount.value} 个组件`
})

// 浮动流程折叠态摘要文案：楼层 · 本层数 · 锁定状态
const floatingFlowSummary = computed(() => {
  const lock = props.isAfhLocked ? '拖拽锁定' : '拖拽解锁'
  return `${props.currentFloorName} · ${props.widgetCount} 个本层 · ${lock}`
})

// 选中组件类型后向上抛出并关闭菜单
function onSelectWidget(type) {
  emit('add-widget', type)
  showAddFloating.value = false
}

// 浮动流程步骤：楼层选择 → 组件配置 → 坐标布局 → 大屏渲染
const floatingFlowSteps = computed(() => [
  { label: '楼层选择', meta: props.currentFloorName, icon: MapPin, tone: 'in' },
  { label: '组件配置', meta: `${props.widgetCount} 个本层`, icon: Layers, tone: 'mid' },
  { label: '坐标布局', meta: props.isAfhLocked ? '已锁定' : '可拖拽', icon: Layout, tone: 'exec' },
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
          :label="'本层组件'"
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
        <span class="settings-note-callout__label">{{ '分层配置' }}</span>
        <span>{{
          '每层独立维护组件与坐标；解锁后可在户型图拖拽，保存布局后写入对应楼层。'
        }}</span>
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
      <RouterLink :to="SETTINGS_ROUTES.smartServices()" class="fp-cross-links__item">{{
        '智能服务'
      }}</RouterLink>
      <RouterLink :to="SETTINGS_ROUTES.family()" class="fp-cross-links__item">{{
        '儿童模式'
      }}</RouterLink>
    </div>

    <div v-if="showMultiFloorTabs" class="afh-floor-tabs fp-floor-tabs">
      <button
        v-for="(f, fi) in floors"
        :key="f.id"
        type="button"
        :class="[
          'afh-floor-tab',
          `afh-floor-tab--${['mint', 'sky', 'violet', 'amber', 'rose', 'cyan'][fi % 6]}`,
          f.id === effectiveFloorId ? 'afh-floor-tab--active' : '',
        ]"
        @click="emit('select-floor', f.id)"
      >
        <span>{{ f.name }}</span>
        <span class="afh-floor-tab__count">{{ floatingWidgetCount(f.id) }}</span>
      </button>
    </div>
  </div>
</template>
