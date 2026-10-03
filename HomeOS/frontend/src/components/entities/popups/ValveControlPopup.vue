/**
 * @file ValveControlPopup.vue
 * @module components/entities/popups
 * @brief 阀门控制弹窗
 *
 * 职责：
 * - 基于 EntityPopupShell 渲染 valve 域控制面板
 * - 提供开/关模式切换（EntityModeCardGrid）与开度位置调节
 * - 展示当前状态标签与色
 *
 * 依赖：
 * - vue（computed）、@lucide/vue（ArrowUpFromLine/ArrowDownToLine）
 * - ./EntityPopupShell、./PopupHead、./EntityModeCardGrid
 * - @/composables/entity/useEntityPopupBase、useSliderCommit
 * - @/utils/ui/progress-bar.util（clampInRange）、@/stores/chrome.store
 */
<template>
  <!-- ValveControlPopup 阀门控制弹窗：控制阀门实体的开关 -->
  <EntityPopupShell
    :entity="liveEntity"
    :x-pct="xPct"
    :y-pct="yPct"
    :anchor-x="anchorX"
    :anchor-y="anchorY"
    :width="320"
    :height="340"
    accent="#2dd4bf"
    accent-rgb="45,212,191"
    @close="$emit('close')"
  >
    <PopupHead :title="entityName" :icon="ArrowUpFromLine">
      <template #status>
        <span :class="isOpen ? 'vlp-state-on' : 'vlp-state-off'">{{ stateLabel }}</span>
        <span
          v-if="isOpening"
          class="popup-status-dot popup-status-dot--pulse vlp-state-dot vlp-state-dot--on"
        />
      </template>
    </PopupHead>

    <EntityModeCardGrid :modes="valveModes" @select="callService" />

    <div v-if="hasPosition" class="flex flex-col items-center gap-3 mb-4">
      <div class="flex items-baseline gap-1">
        <span class="text-2xl font-bold text-white tabular-nums">{{ positionLocal }}</span>
        <span class="text-xs font-bold vlp-lbl">%</span>
      </div>
      <div class="w-full px-3">
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          :value="positionRange"
          class="temp-slider"
          data-no-swipe-close
          :style="positionTrackStyle"
          @input="onPositionInput"
          @change="onPositionChange"
          @mouseup="commitPosition"
          @touchend="commitPosition"
        />
      </div>
    </div>

    <div class="flex items-center justify-between px-1">
      <div class="flex items-center gap-2">
        <div
          class="w-2 h-2 rounded-full"
          :class="isOpen ? 'vlp-status-dot--on' : 'vlp-status-dot--off'"
        />
        <span class="text-xs font-semibold vlp-lbl">{{
          isOpen ? '阀门已开启' : '阀门已关闭'
        }}</span>
      </div>
    </div>
  </EntityPopupShell>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 ValveControlPopup 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
/**
 * ValveControlPopup - 阀门控制弹窗组件
 * 功能特性：
 * - 控制阀门的开启/关闭
 * - 显示当前状态
 * - 可能支持开度调节
 * - 弹出式面板
 */
import { computed } from 'vue'
import { ArrowUpFromLine, ArrowDownToLine } from '@lucide/vue'
import EntityPopupShell from '@/components/entities/popups/EntityPopupShell.vue'
import PopupHead from '@/components/entities/popups/PopupHead.vue'
import EntityModeCardGrid from '@/components/entities/popups/EntityModeCardGrid.vue'
import { useChromeStore } from '@/stores/chrome.store'
import {
  defineEntityPopupProps,
  useEntityPopupBase,
  useEntityPopupHeader,
} from '@/composables/entity/useEntityPopupBase'
import { useSliderCommit } from '@/composables/entity/useSliderCommit'
import { clampInRange } from '@/utils/ui/progress-bar.util'

const props = defineProps(defineEntityPopupProps())
defineEmits(['close'])

const { liveEntity, entityRef, entityName, callService: haCall } = useEntityPopupBase(props)
const { stateLabel, state } = useEntityPopupHeader(entityRef, {
  stateLabelDomain: 'valve',
})

const isOpen = computed(() => state.value === 'open')
const isOpening = computed(() => state.value === 'opening')
const isClosing = computed(() => state.value === 'closing')
const hasPosition = computed(() => liveEntity.value?.attributes?.current_position != null)
const positionSource = computed(() =>
  clampInRange(liveEntity.value?.attributes?.current_position ?? 50, 0, 100, 50),
)

const {
  localValue: positionLocal,
  rangeValue: positionRange,
  trackStyle: positionTrackStyle,
  onInput: onPositionInput,
  onChange: onPositionChange,
  commit: commitPosition,
} = useSliderCommit(positionSource, {
  parse: (v) => parseInt(v, 10),
  onCommit: (pos) => setPosition(pos),
  track: () => ({ min: 0, max: 100, step: 1, variant: 'teal' }),
})

const valveModes = computed(() => [
  {
    key: 'open_valve',
    label: '打开',
    icon: ArrowUpFromLine,
    iconClass: 'vlp-ic-open',
    active: isOpen.value,
  },
  {
    key: 'close_valve',
    label: '关闭',
    icon: ArrowDownToLine,
    iconClass: 'vlp-ic-closed',
    active: !isOpen.value && !isOpening.value && !isClosing.value,
  },
])

const chrome = useChromeStore()

async function callService(svc) {
  // 阀门多为水/燃气总阀，开与关均为高危操作（误开可能漏水/漏气，误关可能断供），二次确认
  const isOpenAction = svc === 'open_valve'
  const ok = await chrome.confirm(
    isOpenAction
      ? `确定打开「${entityName.value}」？若此前因泄漏联动关闭，请先确认现场安全。`
      : `确定关闭「${entityName.value}」？关闭后对应水路/气路将断开供应。`,
    isOpenAction ? '开阀确认' : '关阀确认',
    { type: 'danger', confirmText: isOpenAction ? '确认打开' : '确认关闭' },
  )
  if (!ok) return
  await haCall('valve', svc, liveEntity.value.entity_id, undefined, '阀门操作失败')
}
async function setPosition(val) {
  await haCall(
    'valve',
    'set_position',
    liveEntity.value.entity_id,
    { position: val },
    '阀门位置设置失败',
  )
}
</script>

<style src="./styles/PopupAccents.css"></style>
<style scoped>
:deep(.popup-shell) {
  --accent: #2dd4bf;
  --accent-rgb: 45, 212, 191;
}
</style>
