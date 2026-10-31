<!--
  小部件引擎主面板（Section 级），负责左侧微件目录挑选、右侧面板实例排布
  （移动/删除/开关可见/打开配置/高度调节）、Hero 三页联动配置。顶部含四步流程条与
  实例/目录数量统计，使用弹出菜单操作各个实例行。
  注意事项：快捷按钮至少保留 1 个最多 4 个；高度编辑与配置编辑互斥（仅允许展开一行）。
-->
<script setup>
import { computed } from 'vue'
import { LayoutGrid, Monitor, Puzzle, Sidebar } from '@lucide/vue'
import SettingsCard from '@/components/common/settings-page-shell/SettingsCard.vue'
import SettingsCardIntro from '@/components/common/settings-page-shell/SettingsCardIntro.vue'
import SettingsFlowBand from '@/features/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/features/settings/shared/layout/SettingsFlowStat.vue'
import SettingsPopoutMenu from '@/features/settings/shared/layout/SettingsPopoutMenu.vue'
import WidgetPickerList from './WidgetPickerList.vue'
import WidgetPanelRow from './WidgetPanelRow.vue'
import { catalogTierClass } from '@/features/settings/display/composables/layout-panel-widgets.internals'

const showAddWidget = defineModel('showAddWidget', { type: Boolean, required: true })

const props = defineProps({
  sidebarWidgetGroups: { type: Array, required: true },
  dashboardWidgetGroups: { type: Array, required: true },
  rightPanelWidgets: { type: Array, required: true },
  widgetEditId: { type: [String, null], default: null },
  heightEditId: { type: [String, null], default: null },
  heightDraft: { type: Number, default: 0 },
  heightPreset: { type: Number, default: 0 },
  quickButtonOptions: { type: Array, required: true },
  maxQuickButtons: { type: Number, required: true },
  quickSelectedCount: { type: Number, required: true },
  quickButtonsFull: { type: Boolean, default: false },
  isQuickButtonOn: { type: Function, required: true },
  quickButtonOrder: { type: Function, required: true },
})

const emit = defineEmits([
  'add-widget',
  'open-config',
  'open-height',
  'move',
  'toggle-visible',
  'delete',
  'save-config',
  'reset-height',
  'save-height',
  'toggle-quick-button',
  'update-height-draft',
])

const widgetFlowSteps = [
  { label: '微件目录', meta: '侧边栏/面板级', icon: Puzzle, tone: 'in' },
  { label: '实例配置', meta: '参数与高度', icon: LayoutGrid, tone: 'mid' },
  { label: '右侧面板', meta: '排布顺序', icon: Sidebar, tone: 'exec' },
  { label: '大屏', meta: '大屏渲染', icon: Monitor, tone: 'out' },
]

const panelInstanceCount = computed(() => props.rightPanelWidgets.length)
const catalogCount = computed(
  () =>
    props.sidebarWidgetGroups.reduce((n, g) => n + g.items.length, 0) +
    props.dashboardWidgetGroups.reduce((n, g) => n + g.items.length, 0),
)
const widgetFlowSummary = computed(
  () => `目录 ${catalogCount.value} · 右侧面板 ${panelInstanceCount.value}`,
)
</script>

<template>
  <div class="settings-hub-section">
    <SettingsCard extra-class="overflow-visible settings-card--popout">
      <SettingsCardIntro
        :icon="Puzzle"
        icon-class="wh-icon-accent"
        orb-class="wh-orb-accent"
        :title="'面板微件引擎'"
        :description="'右侧面板微件实例与自定义沙盒'"
        bordered
      >
        <template #actions>
          <SettingsPopoutMenu v-model="showAddWidget" :width="256" :max-height="384">
            <template #trigger>
              <button type="button" class="settings-btn-accent">{{ '+ 实例新微件' }}</button>
            </template>
            <template
              v-for="group in sidebarWidgetGroups"
              :key="`sidebar-${group.catalogGroup}-${group.tier}`"
            >
              <div
                class="px-3 py-2 text-[12px] font-bold uppercase tracking-widest"
                :class="catalogTierClass(group.tier)"
              >
                {{ `侧边栏 · ${group.label}` }}
              </div>
              <WidgetPickerList
                :widgets="group.items"
                variant="sidebar"
                @select="
                  (type) => {
                    emit('add-widget', type)
                    showAddWidget = false
                  }
                "
              />
            </template>
            <template
              v-for="group in dashboardWidgetGroups"
              :key="`dashboard-${group.catalogGroup}-${group.tier}`"
            >
              <div
                class="px-3 py-2 text-[12px] font-bold uppercase tracking-widest"
                :class="catalogTierClass(group.tier, true)"
              >
                {{ `面板级 · ${group.label}` }}
              </div>
              <WidgetPickerList
                :widgets="group.items"
                variant="dashboard"
                @select="
                  (type) => {
                    emit('add-widget', type)
                    showAddWidget = false
                  }
                "
              />
            </template>
          </SettingsPopoutMenu>
        </template>
      </SettingsCardIntro>

      <SettingsFlowBand
        :steps="widgetFlowSteps"
        class="wh-flow-band mt-4"
        band-class="wh-flow-band__shell"
        collapsible
        default-collapsed
        toggle-label="微件流程"
        :collapsed-summary="widgetFlowSummary"
      >
        <template #stats>
          <SettingsFlowStat
            :label="'目录'"
            :value="catalogCount"
            tone="accent"
            val-tone="accent"
          />
          <SettingsFlowStat
            :label="'右侧面板'"
            :value="panelInstanceCount"
            tone="emerald"
            val-tone="emerald"
          />
        </template>
      </SettingsFlowBand>

      <div class="settings-widget-list mt-2.5">
        <div
          v-if="!rightPanelWidgets.length"
          class="settings-premium-empty settings-premium-empty--violet"
        >
          <Puzzle class="settings-premium-empty__icon" />
          <p class="settings-premium-empty__title">{{ '当前未排布任何面板微件' }}</p>
          <p class="settings-premium-empty__desc">
            {{ '点击下方按钮添加侧边栏或面板级部件，配置后请保存布局' }}
          </p>
          <div class="settings-premium-empty__actions">
            <button
              type="button"
              class="settings-premium-empty__btn settings-premium-empty__btn--accent"
              @click="showAddWidget = true"
            >
              {{ '+ 实例新微件' }}
            </button>
          </div>
        </div>
        <WidgetPanelRow
          v-for="(w, idx) in rightPanelWidgets"
          :key="w.id"
          :widget="w"
          :index="idx"
          :total="rightPanelWidgets.length"
          :widget-edit-id="widgetEditId"
          :height-edit-id="heightEditId"
          :height-draft="heightDraft"
          :height-preset="heightPreset"
          :quick-button-options="quickButtonOptions"
          :max-quick-buttons="maxQuickButtons"
          :quick-selected-count="quickSelectedCount"
          :quick-buttons-full="quickButtonsFull"
          :is-quick-button-on="isQuickButtonOn"
          :quick-button-order="quickButtonOrder"
          @open-config="emit('open-config', $event)"
          @open-height="emit('open-height', $event)"
          @move="(index, dir) => emit('move', index, dir)"
          @toggle-visible="emit('toggle-visible', $event)"
          @delete="emit('delete', $event)"
          @save-config="emit('save-config')"
          @reset-height="emit('reset-height')"
          @save-height="emit('save-height')"
          @toggle-quick-button="emit('toggle-quick-button', $event)"
          @update-height-draft="emit('update-height-draft', $event)"
        />
      </div>
    </SettingsCard>
  </div>
</template>

<style scoped src="../styles/layout-panels.css"></style>
