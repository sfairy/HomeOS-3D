<!--
  组件文件：WidgetSettings.vue
  所属模块：frontend/src/components/dashboard
  组件职责：仪表板编辑模式下的部件参数设置抽屉。PremiumPageHeader 展示标题/副标题/关闭按钮，
    PremiumAccordion 手风琴分 6+ 个区块：基础信息（实体 ID EntityInput / 部件类型分组下拉 /
    显示标签）、覆盖图层（叠加图路径/透明度/旋转/缩放）、位置与尺寸（X/Y/宽/高/网格对齐）、
    显示逻辑（按家庭模式/按用户角色/按时段）、自定义状态（状态徽章/颜色/触发值）、
    高级（自定义 CSS class / z-index / 可见于断点）；末尾删除按钮带二次确认。
  主要 props / emits：
    - props.widgetId：目标部件 ID；props.widget：部件对象（缺失时从 store 拉取）。
    - emit update：部件字段回写（{ id, [key]: value } 或 _entityId/_autoType 特殊字段）；
      emit remove：二次确认后触发删除；emit close：关闭设置抽屉。
  依赖关系：Pinia useLayoutStore/useChromeStore/useEntitiesStore；PremiumPageHeader/PremiumAccordion 组件；
    EntityInput 实体选择器；HosSelect 域下拉；@lucide/vue Settings2/FileText/Image/X 等图标。
-->
<template>
  <div v-if="widget" class="ws-root" :style="{ width: `${widgetWidth}px` }">
    <PremiumPageHeader
      :title="'部件设置'"
      :subtitle="widget.label || widget.id || '—'"
      :icon="Settings2"
      closable
      @close="$emit('close')"
    />

    <div class="ws-body">
      <PremiumAccordion v-model="openSection" default-open="basic">
        <PremiumAccordionItem id="basic" :label="'基础信息'" :icon="FileText" icon-tone="blue">
          <div class="ws-field">
            <span class="ws-field-key">{{ '实体 ID' }}</span>
            <EntityInput
              :model-value="widget.id"
              @update:model-value="onEntityIdChange"
              :placeholder="'选择或输入 HA 实体'"
              input-class="ws-input"
            />
          </div>
          <div class="ws-field">
            <span class="ws-field-key">{{ '部件类型' }}</span>
            <div class="ws-type-row">
              <HosSelect
                variant="widget"
                block
                class="flex-1 min-w-0"
                :value="widget.type"
                @change="onTypeChange($event)"
              >
                <optgroup :label="'控件类'">
                  <option value="ToggleWidget">{{ '开关 / 灯光' }}</option>
                  <option value="BadgeWidget">{{ '徽章 / 传感器' }}</option>
                </optgroup>
                <optgroup :label="'环境设备'">
                  <option value="ClimateWidget">{{ '空调' }}</option>
                  <option value="FanWidget">{{ '风扇' }}</option>
                  <option value="WaterHeaterWidget">{{ '燃气热水器' }}</option>
                  <option value="CoverWidget">{{ '窗帘 / 卷帘' }}</option>
                  <option value="HumidifierWidget">{{ '加湿器' }}</option>
                  <option value="FreshAirWidget">{{ '全热交换器' }}</option>
                  <option value="AirPurifierWidget">{{ '空气净化器' }}</option>
                </optgroup>
                <optgroup :label="'厨卫电器'">
                  <option value="WaterPurifierWidget">{{ '净水机' }}</option>
                  <option value="DispenserWidget">{{ '管线机' }}</option>
                  <option value="FridgeWidget">{{ '冰箱' }}</option>
                  <option value="WashingMachineWidget">{{ '洗衣机' }}</option>
                  <option value="RangeHoodWidget">{{ '吸油烟机' }}</option>
                  <option value="GasStoveWidget">{{ '燃气灶' }}</option>
                </optgroup>
                <optgroup :label="'传感器'">
                  <option value="MotionSensorWidget">{{ '人体传感器' }}</option>
                  <option value="LeakSensorWidget">{{ '浸水传感器' }}</option>
                  <option value="GasSensorWidget">{{ '燃气传感器' }}</option>
                  <option value="SmokeSensorWidget">{{ '烟雾传感器' }}</option>
                  <option value="CoSensorWidget">{{ '一氧化碳传感器' }}</option>
                  <option value="EnvironmentSensorWidget">{{ '环境传感器' }}</option>
                </optgroup>
                <optgroup :label="'智能设备'">
                  <option value="MediaWidget">{{ '多媒体' }}</option>
                  <option value="LockWidget">{{ '门锁' }}</option>
                  <option value="VacuumWidget">{{ '扫地机器人' }}</option>
                  <option value="CameraWidget">{{ '摄像头' }}</option>
                </optgroup>
                <optgroup :label="'安全与联动'">
                  <option value="AlarmWidget">{{ '安防面板' }}</option>
                  <option value="SceneWidget">{{ '场景 / 脚本' }}</option>
                  <option value="SirenWidget">{{ '警报器' }}</option>
                </optgroup>
                <optgroup :label="'阀门与遥控'">
                  <option value="ValveWidget">{{ '水阀 / 气阀' }}</option>
                  <option value="RemoteWidget">{{ '遥控器' }}</option>
                </optgroup>
              </HosSelect>
              <span class="ws-type-badge">{{ typeLabel }}</span>
            </div>
          </div>
          <div class="ws-field">
            <span class="ws-field-key">{{ '显示标签' }}</span>
            <input
              type="text"
              :value="widget.label"
              @input="updateWidget('label', $event.target.value)"
              :placeholder="'留空则使用实体名称'"
              class="ws-input"
            />
          </div>
        </PremiumAccordionItem>

        <PremiumAccordionItem
          id="overlay"
          :label="'覆盖图层'"
          :icon="Image"
          icon-tone="violet"
          :badge="widget.overlayImage ? '已配置' : ''"
        >
          <div class="ws-field">
            <span class="ws-field-key">{{ '图片路径' }}</span>
            <div class="ws-input-row">
              <input
                type="text"
                :value="widget.overlayImage || ''"
                @input="updateWidget('overlayImage', $event.target.value || null)"
                :placeholder="'例：/floorplans/ac-on.png'"
                class="ws-input ws-input--mono"
              />
              <button
                v-if="widget.overlayImage"
                type="button"
                :aria-label="'清除'"
                @click="updateWidget('overlayImage', null)"
                class="ws-btn-icon ws-btn-icon--danger"
                :title="'清除'"
              >
                <X class="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                :aria-label="'从素材库选择'"
                @click="openAssetPicker('floorplan')"
                class="ws-btn-icon ws-btn-icon--accent"
                :title="'从素材库选择'"
              >
                <Search class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div v-if="widget.overlayImage" class="ws-image-preview">
            <img :src="widget.overlayImage" class="ws-preview-img" alt="" />
            <span class="ws-preview-label">{{ widget.overlayImage }}</span>
          </div>
        </PremiumAccordionItem>

        <PremiumAccordionItem
          id="style"
          :label="'热区样式'"
          :icon="SlidersHorizontal"
          icon-tone="cyan"
          :meta="`${iconScaleDisplay}% · ${iconRotateDisplay}°`"
        >
          <div class="ws-field ws-field--slider">
            <div class="ws-slider-label">
              <span class="ws-field-key">{{ '图标缩放' }}</span>
              <span class="ws-slider-val">{{ iconScaleDisplay }}%</span>
            </div>
            <div class="ws-slider-row">
              <input
                type="range"
                min="30"
                max="300"
                step="5"
                :value="iconScaleDisplay"
                @input="onIconScaleSlider($event.target.value)"
                :style="sliderStyle"
              />
              <input
                type="number"
                min="30"
                max="300"
                step="5"
                :value="iconScaleDraft"
                class="ws-input-num"
                @focus="iconScaleFocused = true"
                @input="iconScaleDraft = $event.target.value"
                @change="commitIconScale"
                @blur="commitIconScale"
              />
            </div>
          </div>
          <div class="ws-field ws-field--slider">
            <div class="ws-slider-label">
              <span class="ws-field-key">{{ '图标旋转' }}</span>
              <span class="ws-slider-val ws-slider-val--purple">{{ iconRotateDisplay }}°</span>
            </div>
            <div class="ws-slider-row">
              <input
                type="range"
                min="0"
                max="360"
                step="0.1"
                :value="iconRotateDisplay"
                @input="onIconRotateSlider($event.target.value)"
                :style="rotateStyle"
              />
              <input
                type="number"
                min="0"
                max="360"
                step="0.1"
                :value="iconRotateDraft"
                class="ws-input-num"
                @focus="iconRotateFocused = true"
                @input="iconRotateDraft = $event.target.value"
                @change="commitIconRotate"
                @blur="commitIconRotate"
              />
            </div>
          </div>
        </PremiumAccordionItem>

        <PremiumAccordionItem
          id="states"
          :label="'状态映射'"
          :icon="Layers"
          icon-tone="amber"
          :badge="hasStates ? `${Object.keys(widget.stateIcons || {}).length} 项` : ''"
        >
          <div v-if="stateNames.length" class="ws-hint">
            <span>{{ `推荐状态：${recommendedStateHint}` }}</span>
            <button
              v-if="!hasStates"
              type="button"
              @click="initDefaultStates"
              class="ws-hint-action"
            >
              {{ '一键初始化' }}
            </button>
          </div>
          <p class="ws-hint ws-hint--case">
            {{
              '状态键须与 Home Assistant 原始 state 大小写完全一致（所见即所得），勿手动改写大小写。'
            }}
          </p>
          <div class="ws-state-list" v-if="hasStates">
            <div
              v-for="(icon, state) in widget.stateIcons || {}"
              :key="state"
              class="ws-state-card"
              :style="stateCardStyle(state)"
            >
              <div class="ws-state-card-head">
                <div class="ws-state-chip-wrap">
                  <span class="ws-state-chip" :style="stateChipStyle(state)">{{
                    stateDisplayName(state)
                  }}</span>
                  <span class="ws-state-raw" :title="state">{{ state }}</span>
                </div>
                <button
                  type="button"
                  :aria-label="'移除'"
                  @click="removeState(state)"
                  class="ws-state-del"
                  :title="'移除'"
                >
                  <X class="w-3.5 h-3.5" />
                </button>
              </div>
              <div class="ws-state-card-row">
                <span class="ws-state-card-key">{{ '显示名' }}</span>
                <input
                  type="text"
                  class="ws-input ws-state-label-input"
                  :value="stateDisplayName(state)"
                  :placeholder="defaultLabelFor(state)"
                  @input="updateStateLabel(state, $event.target.value)"
                />
              </div>
              <div class="ws-state-card-row">
                <span class="ws-state-card-key">{{ '图标' }}</span>
                <div class="ws-state-input-box" @click="openAssetPicker('icon', state)">
                  <span class="ws-state-path" :class="{ empty: !icon }">{{
                    icon || '点击选择图标...'
                  }}</span>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="ws-state-empty">{{ '点击上方按钮初始化或手动添加状态' }}</div>
          <div class="ws-add-row">
            <button type="button" @click="showAddState = !showAddState" class="ws-btn-add">
              {{ '+ 添加状态' }}
            </button>
          </div>
          <div v-if="showAddState" class="ws-add-panel">
            <div class="ws-field">
              <span class="ws-field-key">{{ '状态名' }}</span>
              <HosSelect variant="widget" block v-model="newStateName">
                <option value="" disabled>{{ '选择状态...' }}</option>
                <optgroup v-if="addStateOptions.typeOptions.length" :label="'本类型推荐'">
                  <option
                    v-for="state in addStateOptions.typeOptions"
                    :key="'t-' + state"
                    :value="state"
                  >
                    {{ formatStateLabel(state) }}
                  </option>
                </optgroup>
                <optgroup v-if="addStateOptions.deviceOptions.length" :label="'设备实报状态'">
                  <option
                    v-for="state in addStateOptions.deviceOptions"
                    :key="'d-' + state"
                    :value="state"
                  >
                    {{ formatStateLabel(state) }}
                  </option>
                </optgroup>
                <optgroup v-if="addStateOptions.commonOptions.length" :label="'通用状态'">
                  <option
                    v-for="state in addStateOptions.commonOptions"
                    :key="'c-' + state"
                    :value="state"
                  >
                    {{ formatStateLabel(state) }}
                  </option>
                </optgroup>
                <option value="__custom__">{{ '自定义状态值...' }}</option>
              </HosSelect>
              <input
                v-if="newStateName === '__custom__'"
                v-model="customStateName"
                type="text"
                class="ws-input mt-2"
                :placeholder="'原样输入 HA 状态值，如 on / home / 23.5（保留大小写）'"
              />
            </div>
            <div class="ws-add-pick" @click="openAssetPicker('icon', 'NEW_STATE_PENDING')">
              <span :class="{ empty: !newStateIcon }">{{ newStateIcon || '点击选择图标...' }}</span>
              <Search class="w-3.5 h-3.5 shrink-0 opacity-40" />
            </div>
            <div class="ws-add-actions">
              <button type="button" @click="cancelAddState" class="ws-btn-cancel">
                {{ '取消' }}
              </button>
              <button
                type="button"
                @click="addState"
                class="ws-btn-confirm"
                :disabled="!canAddState"
              >
                {{ '确认添加' }}
              </button>
            </div>
          </div>
        </PremiumAccordionItem>

        <PremiumAccordionItem
          id="position"
          :label="'位置坐标'"
          :icon="Crosshair"
          icon-tone="green"
          :meta="`${widget.xPct}% · ${widget.yPct}%`"
        >
          <p class="ws-coords-hint">{{ '拖动画布上的热点可实时更新坐标，也可在此微调' }}</p>
          <div class="ws-coords">
            <div class="ws-field">
              <span class="ws-field-key">{{ 'X (%)' }}</span>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                :value="xPctDraft"
                class="ws-input"
                @focus="xPctFocused = true"
                @input="xPctDraft = $event.target.value"
                @change="commitCoord('xPct')"
                @blur="commitCoord('xPct')"
              />
            </div>
            <div class="ws-field">
              <span class="ws-field-key">{{ 'Y (%)' }}</span>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                :value="yPctDraft"
                class="ws-input"
                @focus="yPctFocused = true"
                @input="yPctDraft = $event.target.value"
                @change="commitCoord('yPct')"
                @blur="commitCoord('yPct')"
              />
            </div>
          </div>
        </PremiumAccordionItem>
      </PremiumAccordion>

      <div class="ws-danger">
        <button type="button" @click="confirmRemove" class="ws-btn-danger">
          <Trash2 class="w-4 h-4" />
          {{ '删除此部件' }}
        </button>
      </div>
    </div>

    <AssetPickerModal
      :is-open="showAssetPicker"
      :type="assetPickerType"
      @close="showAssetPicker = false"
      @select="onAssetSelect"
    />
  </div>
</template>

<script setup>
/**
 * WidgetSettings.vue
 *
 * 所属模块：dashboard（户型图部件设置面板）
 * 职责：编辑模式下选中热点后显示在右侧，用于调整部件参数。五个配置区块采用
 *      手风琴收叠（默认展开「基础信息」，同时仅允许一项展开）：
 *      1) 基础信息：实体 ID、部件类型、显示标签
 *      2) 覆盖图层：图片路径（可从素材库选择）
 *      3) 热区样式：图标缩放（30-300%）、图标旋转（0-360°）
 *      4) 状态映射：状态显示名 + 状态图标 + 一键初始化推荐状态
 *      5) 位置坐标：X/Y 百分比（与画布拖动实时同步）
 * 依赖：vue、@lucide/vue、premium（Accordion/PageHeader）、AssetPickerModal、EntityInput、
 *      useLayoutStore/useChromeStore/useEntitiesStore、useEntityType、useWidgetPlacement、
 *      entity-state-labels/entity-state-meta、color.util、widget-type-labels、progress-bar.util。
 */
import HosSelect from '@/components/common/base/HosSelect.vue'
import { ref, computed, watch } from 'vue'
import {
  Settings2,
  X,
  FileText,
  Image,
  SlidersHorizontal,
  Layers,
  Crosshair,
  Search,
  Trash2,
} from '@lucide/vue'
import {
  PremiumAccordion,
  PremiumAccordionItem,
  PremiumPageHeader,
} from '@/components/common/premium'
import AssetPickerModal from '@/components/common/AssetPickerModal.vue'
import EntityInput from '@/components/common/EntityInput.vue'
import { useLayoutStore } from '@/stores/layout.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useEntitiesStore } from '@/stores/entities.store'
import {
  buildAddStateOptions,
  extractEntityStateCandidates,
  formatStateLabel,
  mergeSuggestedStates,
  getDefaultStateIcons,
} from '@/composables/entity/useEntityType'
import { resolveWidgetType } from '@/composables/widget/useWidgetPlacement'
import {
  buildDefaultStateLabels,
  entityStateLabel,
  resolveWidgetStateLabel,
} from '@/constants/entity-state-labels'
import { entityStateColor } from '@/constants/entity-state-meta'
import { hexToRgba } from '@/utils/ui/color.util'
import { widgetTypeLabel } from '@/constants/widget-type-labels'
import '@/assets/styles/widget-settings.css'
import { snapToSliderStep } from '@/utils/ui/progress-bar.util'

/**
 * 组件 Props
 * @property {string} widgetId - 当前部件 id
 * @property {object} widget   - 部件配置对象（含 id/type/label/stateIcons/stateLabels/overlayImage/iconScale/iconRotate/xPct/yPct 等）
 */
const props = defineProps({
  widgetId: { type: String, required: true },
  widget: { type: Object, default: null },
})

/**
 * 组件事件
 * - update：部件字段更新（payload 为 { id, [key]: value } 或 { id, _entityId, _autoType }）
 * - remove：删除部件（经二次确认后触发）
 * - close：关闭设置面板
 */
const emit = defineEmits(['update', 'remove', 'close'])
const layoutStore = useLayoutStore()
const chrome = useChromeStore()
const entitiesStore = useEntitiesStore()

/** 手风琴：默认展开基础信息，同时仅一项展开 */
const openSection = ref('basic')

watch(
  () => props.widgetId,
  () => {
    openSection.value = 'basic'
    showAddState.value = false
  },
)

const showAddState = ref(false)
const newStateName = ref('')
const customStateName = ref('')
const newStateIcon = ref('')

const showAssetPicker = ref(false)
const assetPickerType = ref('floorplan')
const assetPickerTarget = ref(null)

const widgetWidth = computed(() => layoutStore.layoutConfig?.rightPanelWidth || 260)
const typeLabel = computed(() => widgetTypeLabel(props.widget?.type))
const boundEntity = computed(() => {
  const eid = props.widget?.id
  return eid ? entitiesStore.entities[eid] : null
})

const stateNames = computed(() => mergeSuggestedStates(props.widget?.type, boundEntity.value))
const recommendedStateHint = computed(() =>
  stateNames.value.map((s) => formatStateLabel(s)).join(' · '),
)
const hasStates = computed(() => {
  const icons = props.widget?.stateIcons
  return icons && Object.keys(icons).length > 0
})

const entityStateCandidates = computed(() =>
  extractEntityStateCandidates(boundEntity.value, {
    excludeFanSpeed: props.widget?.type === 'ClimateWidget',
  }),
)

const addStateOptions = computed(() => {
  const existing = Object.keys(props.widget?.stateIcons || {})
  return buildAddStateOptions(props.widget?.type, existing, entityStateCandidates.value)
})

const resolvedNewStateName = computed(() => {
  if (newStateName.value === '__custom__') return customStateName.value.trim()
  return newStateName.value
})

const canAddState = computed(() => {
  const name = resolvedNewStateName.value
  if (!name || !newStateIcon.value) return false
  if (props.widget?.stateIcons?.[name] != null) return false
  return true
})

function defaultLabelFor(state) {
  return entityStateLabel(state) || state
}

function stateDisplayName(state) {
  return resolveWidgetStateLabel(state, props.widget?.stateLabels)
}

function stateAccentColor(state) {
  return entityStateColor(state) || '#94A3B8'
}

function stateCardStyle(state) {
  const c = stateAccentColor(state)
  return {
    '--state-accent': c,
    background: `linear-gradient(135deg, ${hexToRgba(c, 0.16)} 0%, rgba(255,255,255,0.03) 55%)`,
    borderColor: hexToRgba(c, 0.35),
    boxShadow: `inset 3px 0 0 ${c}, 0 0 0 1px ${hexToRgba(c, 0.08)}`,
  }
}

function stateChipStyle(state) {
  const c = stateAccentColor(state)
  return {
    color: c,
    background: hexToRgba(c, 0.14),
    borderColor: hexToRgba(c, 0.4),
  }
}

function updateStateLabel(state, value) {
  const next = { ...(props.widget?.stateLabels || {}) }
  const trimmed = String(value ?? '').trim()
  next[state] = trimmed || defaultLabelFor(state)
  updateWidget('stateLabels', next)
}

function pickDefaultStateName() {
  const opts = addStateOptions.value
  if (!opts) {
    newStateName.value = '__custom__'
    customStateName.value = ''
    return
  }
  const { typeOptions = [], deviceOptions = [], commonOptions = [] } = opts
  const first = typeOptions[0] || deviceOptions[0] || commonOptions[0]
  newStateName.value = first || '__custom__'
  customStateName.value = ''
}

watch(showAddState, (open) => {
  if (open) pickDefaultStateName()
})

watch(
  () => props.widget?.type,
  () => {
    if (showAddState.value) pickDefaultStateName()
  },
)

const ICON_SCALE_MIN = 30
const ICON_SCALE_MAX = 300
const ICON_SCALE_FALLBACK = 100
const ICON_ROTATE_MIN = 0
const ICON_ROTATE_MAX = 360
const ICON_ROTATE_FALLBACK = 0

const iconScaleDraft = ref(String(ICON_SCALE_FALLBACK))
const iconRotateDraft = ref(String(ICON_ROTATE_FALLBACK))
const iconScaleFocused = ref(false)
const iconRotateFocused = ref(false)

function resolveIconScale(raw) {
  const n = Number(raw)
  return Number.isFinite(n) ? n : ICON_SCALE_FALLBACK
}

function resolveIconRotate(raw) {
  const n = Number(raw)
  return Number.isFinite(n) ? n : ICON_ROTATE_FALLBACK
}

const iconScaleDisplay = computed(() => resolveIconScale(props.widget?.iconScale))
const iconRotateDisplay = computed(() => resolveIconRotate(props.widget?.iconRotate))

watch(
  () => props.widget?.iconScale,
  (v) => {
    if (!iconScaleFocused.value) iconScaleDraft.value = String(resolveIconScale(v))
  },
  { immediate: true },
)

watch(
  () => props.widget?.iconRotate,
  (v) => {
    if (!iconRotateFocused.value) iconRotateDraft.value = String(resolveIconRotate(v))
  },
  { immediate: true },
)

/**
 * 进度填充通过全局滑块系统的 --progress-pct 变量驱动（见 main.css）。
 * 组件级 input 无 class，会命中全局 range 兜底样式，故必须使用其约定变量，
 * 否则填充会被全局默认值（50%）覆盖、与数值错位。
 */
const sliderStyle = computed(() => {
  const v = snapToSliderStep(iconScaleDisplay.value, ICON_SCALE_MIN, ICON_SCALE_MAX, 5)
  const pct = ((v - ICON_SCALE_MIN) / (ICON_SCALE_MAX - ICON_SCALE_MIN)) * 100
  return { '--progress-pct': `${pct}%` }
})

const rotateStyle = computed(() => {
  const v = snapToSliderStep(iconRotateDisplay.value, ICON_ROTATE_MIN, ICON_ROTATE_MAX, 0.1)
  const pct = (v / ICON_ROTATE_MAX) * 100
  return {
    '--progress-pct': `${pct}%`,
    '--track-fill-from': '#BF5AF2',
    '--track-fill-to': '#BF5AF2',
  }
})

function onIconScaleSlider(raw) {
  const n = parseInt(String(raw), 10)
  if (!Number.isFinite(n)) return
  const next = Math.max(ICON_SCALE_MIN, Math.min(ICON_SCALE_MAX, n))
  updateWidget('iconScale', next)
  if (!iconScaleFocused.value) iconScaleDraft.value = String(next)
}

function commitIconScale() {
  iconScaleFocused.value = false
  const n = parseInt(String(iconScaleDraft.value).trim(), 10)
  const next = Number.isFinite(n)
    ? Math.max(ICON_SCALE_MIN, Math.min(ICON_SCALE_MAX, n))
    : iconScaleDisplay.value
  updateWidget('iconScale', next)
  iconScaleDraft.value = String(next)
}

function onIconRotateSlider(raw) {
  const n = parseFloat(String(raw))
  if (!Number.isFinite(n)) return
  const next = Math.max(ICON_ROTATE_MIN, Math.min(ICON_ROTATE_MAX, n))
  updateWidget('iconRotate', next)
  if (!iconRotateFocused.value) iconRotateDraft.value = String(next)
}

function commitIconRotate() {
  iconRotateFocused.value = false
  const n = parseFloat(String(iconRotateDraft.value).trim())
  const next = Number.isFinite(n)
    ? Math.max(ICON_ROTATE_MIN, Math.min(ICON_ROTATE_MAX, n))
    : iconRotateDisplay.value
  updateWidget('iconRotate', next)
  iconRotateDraft.value = String(next)
}

async function confirmRemove() {
  const ok = await chrome.confirm('确定删除此热点部件？', '删除部件', {
    type: 'danger',
    confirmText: '删除',
  })
  if (ok) emit('remove')
}

function updateWidget(key, value) {
  emit('update', { id: props.widgetId, [key]: value })
}

const xPctDraft = ref('')
const yPctDraft = ref('')
const xPctFocused = ref(false)
const yPctFocused = ref(false)

watch(
  () => props.widget?.xPct,
  (v) => {
    if (!xPctFocused.value) xPctDraft.value = v == null || Number.isNaN(Number(v)) ? '' : String(v)
  },
  { immediate: true },
)

watch(
  () => props.widget?.yPct,
  (v) => {
    if (!yPctFocused.value) yPctDraft.value = v == null || Number.isNaN(Number(v)) ? '' : String(v)
  },
  { immediate: true },
)

/** 坐标输入：清空时恢复原值，避免 NaN / 误写成 0 */
function commitCoord(key) {
  const isX = key === 'xPct'
  if (isX) xPctFocused.value = false
  else yPctFocused.value = false
  const draft = isX ? xPctDraft : yPctDraft
  const raw = String(draft.value).trim()
  const prev = props.widget?.[key]
  if (raw === '') {
    draft.value = prev == null || Number.isNaN(Number(prev)) ? '' : String(prev)
    return
  }
  const n = parseFloat(raw)
  if (!Number.isFinite(n)) {
    draft.value = prev == null || Number.isNaN(Number(prev)) ? '' : String(prev)
    return
  }
  const next = Math.max(0, Math.min(100, n))
  updateWidget(key, next)
  draft.value = String(next)
}

function onEntityIdChange(newEntityId) {
  const trimmed = (newEntityId || '').trim()
  // 清空仅由 EntityInput 本地态处理；部件 ID 在选中新实体前保持不变
  if (!trimmed) return
  if (trimmed === props.widget?.id) return
  const newType = resolveWidgetType(trimmed, entitiesStore.entities)
  emit('update', { id: props.widgetId, _entityId: trimmed, _autoType: newType })
}

function onTypeChange(newType) {
  if (newType === props.widget?.type) return
  updateWidget('type', newType)
  const states = mergeSuggestedStates(newType, boundEntity.value)
  if (states.length > 0) {
    const defaults = getDefaultStateIcons(newType, props.widget?.id, entitiesStore.entities)
    const init = {}
    for (const s of states) init[s] = defaults[s] || ''
    updateWidget('stateIcons', init)
    updateWidget('stateLabels', buildDefaultStateLabels(states, props.widget?.stateLabels))
  } else {
    updateWidget('stateIcons', {})
    updateWidget('stateLabels', {})
  }
}

function initDefaultStates() {
  const states = mergeSuggestedStates(props.widget?.type, boundEntity.value)
  if (!states.length) return
  const defaults = getDefaultStateIcons(props.widget?.type, props.widget?.id, entitiesStore.entities)
  const init = {}
  for (const s of states) init[s] = props.widget?.stateIcons?.[s] || defaults[s] || ''
  updateWidget('stateIcons', init)
  updateWidget('stateLabels', buildDefaultStateLabels(states, props.widget?.stateLabels))
}

function openAssetPicker(type, targetState = null) {
  assetPickerType.value = type
  assetPickerTarget.value = targetState
  showAssetPicker.value = true
}

function onAssetSelect(value) {
  if (assetPickerType.value === 'icon') {
    if (assetPickerTarget.value === 'NEW_STATE_PENDING') {
      newStateIcon.value = value
    } else if (assetPickerTarget.value) {
      const stateIcons = { ...(props.widget.stateIcons || {}) }
      stateIcons[assetPickerTarget.value] = value
      updateWidget('stateIcons', stateIcons)
    }
  } else if (assetPickerType.value === 'floorplan') {
    updateWidget('overlayImage', value)
  }
  showAssetPicker.value = false
  assetPickerTarget.value = null
}

function removeState(state) {
  const newStateIcons = { ...(props.widget.stateIcons || {}) }
  delete newStateIcons[state]
  updateWidget('stateIcons', newStateIcons)
  const newStateLabels = { ...(props.widget.stateLabels || {}) }
  delete newStateLabels[state]
  updateWidget('stateLabels', newStateLabels)
}

function cancelAddState() {
  showAddState.value = false
  newStateName.value = ''
  customStateName.value = ''
  newStateIcon.value = ''
}

function addState() {
  const name = resolvedNewStateName.value
  if (!canAddState.value) return
  const newStateIcons = { ...(props.widget.stateIcons || {}) }
  newStateIcons[name] = newStateIcon.value
  updateWidget('stateIcons', newStateIcons)
  const newStateLabels = { ...(props.widget.stateLabels || {}) }
  if (!newStateLabels[name]?.trim()) {
    newStateLabels[name] = defaultLabelFor(name)
    updateWidget('stateLabels', newStateLabels)
  }
  cancelAddState()
}
</script>
