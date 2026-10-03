<!--
  组件文件：WidgetPanelRow.vue
  所属模块：frontend/src/views/settings/display/widgets
  组件职责：右侧面板微件列表的单行操作组件，展示微件名称/图标/描述与隐藏状态，提供
    上/下移、开关可见、打开配置、高度编辑、弹出（脱离面板到右侧栏）、删除等操作按钮。
    展开时内嵌对应类型的配置子面板（CustomHtml / QuickActions / HubTabsConfig /
    HeroSwiper / WeatherHub / HomeClimateChart 等）。
  主要 props / emits：
    - props widget：微件实例对象
    - props index / total：当前行序号与总行数（用于禁用首/末移动按钮）
    - props widgetEditId / heightEditId：当前编辑的实例 ID
    - props heightDraft / heightPreset / quickButtonOptions 等：高度与快捷按钮配置
    - emit open-builder / open-config / eject / open-height / move / toggle-visible /
      delete / save-config / cancel-config / set-hero-slide-type / move-hero-slide /
      reset-height / save-height / toggle-quick-button / update-height-draft：所有操作
  依赖关系：inject(WIDGET_PANEL_CONFIG_KEY) 读写 widgetConfig 上下文；
    引用 widgetHasConfigPanel / isHubTabsOnlyConfig / hubTabSetFor / widgetConfigBtnLabel /
    widgetConfigDescription 等内部工具函数判断展示内容。
  注意事项：高度编辑与配置编辑互斥，一次只允许展开一行；删除实例没有二次确认弹窗。
-->
<script setup>
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/WidgetPanelRow 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { computed, inject } from 'vue'
import {
  Code,
  Wrench,
  Trash2,
  Eye,
  EyeOff,
  Ruler,
  ChevronUp,
  ChevronDown,
} from '@lucide/vue'
import { getWidgetIcon, getWidgetName } from '@/utils/registry/widget-catalog'
import HeroSwiperConfigPanel from './HeroSwiperConfigPanel.vue'
import WeatherHubConfigPanel from './WeatherHubConfigPanel.vue'
import HomeClimateChartConfigPanel from './HomeClimateChartConfigPanel.vue'
import WidgetConfigCustomHtml from './WidgetConfigCustomHtml.vue'
import WidgetConfigQuickActions from './WidgetConfigQuickActions.vue'
import WidgetConfigForms from './WidgetConfigForms.vue'
import { isWeatherHubWidgetType } from '@/utils/registry/weather-hub-options'
import { widgetHasConfigPanel, isHubTabsOnlyConfig, hubTabSetFor, widgetConfigBtnLabel, widgetConfigDescription, WIDGET_PANEL_CONFIG_KEY } from '@/composables/settings/display/layout-panel-widgets.internals'

const widgetConfig = inject(WIDGET_PANEL_CONFIG_KEY)

const props = defineProps({
  widget: { type: Object, required: true },
  index: { type: Number, required: true },
  total: { type: Number, required: true },
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
  isCustomHtmlDraftDirty: { type: Boolean, default: false },
})

const emit = defineEmits([
  'open-builder',
  'open-config',
  'eject',
  'open-height',
  'move',
  'toggle-visible',
  'delete',
  'save-config',
  'cancel-config',
  'set-hero-slide-type',
  'move-hero-slide',
  'reset-height',
  'save-height',
  'toggle-quick-button',
  'update-height-draft',
])

const isEditing = computed(() => props.widgetEditId === props.widget.id)
const isHeightEditing = computed(() => props.heightEditId === props.widget.id)
const isExpanded = computed(() => isEditing.value || isHeightEditing.value)
const isHidden = computed(() => props.widget.visible === false)
const hubTabSet = computed(() => hubTabSetFor(props.widget.type))
const hasConfig = computed(
  () => props.widget.type === 'customHtml' || widgetHasConfigPanel(props.widget.type),
)

const subtitle = computed(() => {
  if (isHidden.value) return '侧栏中不可见'
  return widgetConfigDescription(props.widget.type)
})

const primaryLabel = computed(() => {
  if (isEditing.value) return '收起'
  if (props.widget.type === 'customHtml') return '配置代码'
  return widgetConfigBtnLabel(props.widget.type)
})

function hubTabsTitle(type) {
  if (type === 'smartAdvisor') return '智能顾问 Tab'
  if (type === 'scheduleHub') return '日程中心 Tab'
  return 'Hub Tab 配置'
}

function toggleConfig() {
  emit('open-config', props.widget)
}
</script>

<template>
  <div>
    <div
      :class="[
        'settings-widget-row',
        isExpanded && 'settings-widget-row--active',
        isHidden && 'settings-widget-row--hidden',
      ]"
    >
      <div class="widget-panel-row__identity">
        <div
          :class="[
            'widget-panel-row__orb',
            isExpanded && 'widget-panel-row__orb--active',
            isHidden && 'widget-panel-row__orb--hidden',
          ]"
        >
          <component :is="getWidgetIcon(widget.type)" class="w-4 h-4" />
        </div>
        <div class="widget-panel-row__meta">
          <div class="flex items-center gap-2 flex-wrap">
            <h3 class="widget-panel-row__name">{{ getWidgetName(widget.type) }}</h3>
            <span v-if="isHidden" class="widget-panel-row__badge">{{ '已隐藏' }}</span>
            <span
              v-if="widget.config?.cardHeight"
              class="widget-panel-row__badge widget-panel-row__badge--sky"
            >
              {{ `${widget.config.cardHeight}px` }}
            </span>
          </div>
          <p v-if="subtitle" class="widget-panel-row__sub">{{ subtitle }}</p>
        </div>
      </div>

      <div class="widget-panel-row__actions">
        <button
          v-if="hasConfig"
          type="button"
          :class="[
            'settings-btn-ghost text-xs',
            isEditing ? 'settings-btn-ghost--purple-active' : 'settings-btn-ghost--purple',
          ]"
          @click="toggleConfig"
        >
          {{ primaryLabel }}
        </button>
        <button
          v-if="widget.type === 'customHtml'"
          type="button"
          class="settings-btn-ghost settings-btn-ghost--purple text-xs"
          @click="emit('open-builder', widget.id)"
        >
          <Code class="w-3.5 h-3.5" />
          {{ '全屏编辑' }}
        </button>

        <div class="widget-panel-row__group">
          <button
            type="button"
            class="settings-list-btn"
            :disabled="index === 0"
            title="上移"
            aria-label="上移"
            @click="emit('move', index, -1)"
          >
            <ChevronUp class="w-4 h-4" />
          </button>
          <button
            type="button"
            class="settings-list-btn"
            :disabled="index === total - 1"
            title="下移"
            aria-label="下移"
            @click="emit('move', index, 1)"
          >
            <ChevronDown class="w-4 h-4" />
          </button>
          <button
            type="button"
            :class="[
              'settings-list-btn',
              isHeightEditing && 'settings-btn-ghost--sky-active',
            ]"
            :title="widget.config?.cardHeight ? `高度 ${widget.config.cardHeight}px` : '自定义高度'"
            @click="emit('open-height', widget)"
          >
            <Ruler class="w-4 h-4" />
          </button>
          <button
            type="button"
            class="settings-list-btn !p-2"
            :class="isHidden ? 'wpr-vis-off' : 'wpr-vis-on'"
            :title="isHidden ? '显示' : '隐藏'"
            :aria-label="isHidden ? '显示微件' : '隐藏微件'"
            @click="emit('toggle-visible', widget)"
          >
            <EyeOff v-if="isHidden" class="w-4 h-4" />
            <Eye v-else class="w-4 h-4" />
          </button>
        </div>

        <button
          v-if="!['mediaMini', 'customHtml'].includes(widget.type)"
          type="button"
          class="settings-btn-ghost settings-btn-ghost--amber text-xs"
          title="转为自定义代码"
          @click="emit('eject', widget, index)"
        >
          <Wrench class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          class="settings-list-btn settings-list-btn--danger !p-2"
          title="删除"
          aria-label="删除微件"
          @click="emit('delete', widget.id)"
        >
          <Trash2 class="w-4 h-4" />
        </button>
      </div>
    </div>

    <div v-if="isExpanded" class="settings-widget-config">
      <WidgetConfigCustomHtml
        v-if="isEditing && widget.type === 'customHtml'"
        :draft-dirty="isCustomHtmlDraftDirty"
        @save="emit('save-config')"
        @cancel="emit('cancel-config')"
        @open-builder="emit('open-builder', widget.id)"
      />

      <WidgetConfigQuickActions
        v-else-if="isEditing && widget.type === 'quickActions'"
        :quick-button-options="quickButtonOptions"
        :max-quick-buttons="maxQuickButtons"
        :quick-selected-count="quickSelectedCount"
        :quick-buttons-full="quickButtonsFull"
        :is-quick-button-on="isQuickButtonOn"
        :quick-button-order="quickButtonOrder"
        @save="emit('save-config')"
        @toggle-quick-button="(id) => emit('toggle-quick-button', id)"
      />

      <WidgetConfigForms
        v-else-if="isEditing && widget.type === 'switchGroup'"
        variant="switch"
        :tab-set="hubTabSet"
        @save="emit('save-config')"
      />

      <WidgetConfigForms
        v-else-if="isEditing && widget.type === 'mediaMini'"
        variant="mediaMini"
        :tab-set="hubTabSet"
        @save="emit('save-config')"
      />

      <div
        v-else-if="isEditing && widget.type === 'heroSwiper'"
        class="widget-config-shell widget-config-shell--flat widget-config-shell--purple"
      >
        <HeroSwiperConfigPanel
          embedded
          :slides="widgetConfig.heroSwiperSlides"
          @set-type="(idx, type) => emit('set-hero-slide-type', idx, type)"
          @move="(idx, dir) => emit('move-hero-slide', idx, dir)"
          @save="emit('save-config')"
        />
      </div>

      <div
        v-else-if="isEditing && isWeatherHubWidgetType(widget.type)"
        class="widget-config-shell widget-config-shell--flat widget-config-shell--sky"
      >
        <WeatherHubConfigPanel v-model="widgetConfig.weatherHub" embedded @save="emit('save-config')" />
      </div>

      <div
        v-else-if="isEditing && widget.type === 'homeClimateChart'"
        class="widget-config-shell widget-config-shell--flat widget-config-shell--emerald"
      >
        <HomeClimateChartConfigPanel
          v-model="widgetConfig.homeClimateChart"
          embedded
          @save="emit('save-config')"
        />
      </div>

      <WidgetConfigForms
        v-else-if="isEditing && widget.type === 'coverGroup'"
        variant="cover"
        @save="emit('save-config')"
      />

      <WidgetConfigForms
        v-else-if="isEditing && isHubTabsOnlyConfig(widget.type)"
        variant="hubTabs"
        :tab-set="hubTabSet"
        :title="hubTabsTitle(widget.type)"
        @save="emit('save-config')"
      />

      <WidgetConfigForms
        v-if="isHeightEditing"
        variant="height"
        :height-draft="heightDraft"
        :height-preset="heightPreset"
        :current-height="widget.config?.cardHeight"
        @save="emit('save-height')"
        @reset="emit('reset-height')"
        @update-height-draft="(v) => emit('update-height-draft', v)"
      />
    </div>
  </div>
</template>
<style src="../styles/layout-panels.css"></style>
