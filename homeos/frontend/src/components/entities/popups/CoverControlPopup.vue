/**
 * @file CoverControlPopup.vue
 * @module components/entities/popups
 * @brief 窗帘/盖板控制弹窗
 *
 * 职责：
 * - 基于 EntityPopupShell 渲染 cover 域控制面板（窗帘、卷帘、车库门等）
 * - 提供打开/关闭/停止操作，支持位置调节（current_position 滑动条）
 *
 * 依赖：
 * - vue（computed）、@lucide/vue（ArrowUpFromLine/Square/ArrowDownToLine）
 * - ./EntityPopupShell、./PopupHead
 * - @/composables/entity/useEntityPopupBase（defineEntityPopupProps/useEntityPopupBase/useEntityPopupHeader）
 * - @/composables/entity/useSliderCommit（位置滑动防抖提交）
 * - @/utils/ui/progress-bar.util（clampInRange）
 */
<template>
  <!-- CoverControlPopup 窗帘/盖板控制弹窗：控制窗帘、卷帘等 cover 实体 -->
  <EntityPopupShell
    :entity="liveEntity"
    :x-pct="xPct"
    :y-pct="yPct"
    :anchor-x="anchorX"
    :anchor-y="anchorY"
    :width="288"
    :height="296"
    accent="#a78bfa"
    accent-rgb="167, 139, 250"
    @close="$emit('close')"
  >
    <PopupHead :title="entityName" :icon="ArrowUpFromLine" :eyebrow="stateLabel">
      <template v-if="isMoving" #status>
        <span class="text-xs font-bold uppercase tracking-wide text-white/40">{{
          stateLabel
        }}</span>
        <span
          class="popup-status-dot popup-status-dot--pulse cvr-dot-on shadow-[0_0_6px_#60a5fa]"
        />
      </template>
    </PopupHead>

    <div v-if="hasPositionControl" class="position-control">
      <div class="position-display">
        <div
          class="absolute inset-0 transition-all duration-700 cvr-pos-gradient"
          :style="{ opacity: positionLocal / 100 }"
        />
        <div class="relative z-10 flex flex-col items-center">
          <ArrowUpFromLine class="w-8 h-8 text-white/20 mb-1" />
          <div class="flex items-baseline gap-1">
            <span class="text-2xl font-bold text-white tabular-nums">{{ positionLocal }}</span>
            <span class="text-xs font-bold cvr-percent-sign">%</span>
          </div>
          <span class="text-xs cvr-pos-label font-bold leading-normal">{{ '开合度' }}</span>
        </div>
      </div>
      <div class="slider-row">
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          :value="positionRange"
          class="cover-slider"
          data-no-swipe-close
          :style="positionTrackStyle"
          @input="onPositionInput"
          @change="onPositionChange"
          @mouseup="commitPosition"
          @touchend="commitPosition"
        />
      </div>
    </div>

    <div class="action-btns">
      <button class="action-btn" @click="handleAction('open_cover')">
        <ArrowUpFromLine class="w-6 h-6 mb-1" />
        <span class="text-xs font-black leading-normal">{{ '⬆ 打开' }}</span>
      </button>
      <button class="action-btn" @click="handleAction('stop_cover')">
        <Square class="w-5 h-5 mb-1 fill-current" />
        <span class="text-xs font-black leading-normal">{{ '⏸ 停止' }}</span>
      </button>
      <button class="action-btn" @click="handleAction('close_cover')">
        <ArrowDownToLine class="w-6 h-6 mb-1" />
        <span class="text-xs font-black leading-normal">{{ '⬇ 关闭' }}</span>
      </button>
    </div>
  </EntityPopupShell>
</template>

<script setup>
/**
 * 职责：实现 CoverControlPopup 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
/**
 * CoverControlPopup - 窗帘/盖板控制弹窗组件
 * 功能特性：
 * - 控制 cover 实体（窗帘、卷帘、车库门等）
 * - 支持打开、关闭、停止操作
 * - 支持位置调节（如有）
 * - 显示当前状态
 * - 弹出式面板
 */
import { computed } from 'vue'
import { ArrowUpFromLine, Square, ArrowDownToLine } from '@lucide/vue'
import EntityPopupShell from '@/components/entities/popups/EntityPopupShell.vue'
import PopupHead from '@/components/entities/popups/PopupHead.vue'
import {
  defineEntityPopupProps,
  useEntityPopupBase,
  useEntityPopupHeader,
} from '@/composables/entity/useEntityPopupBase'
import { useSliderCommit } from '@/composables/entity/useSliderCommit'
import { clampInRange } from '@/utils/ui/progress-bar.util'

const props = defineProps(defineEntityPopupProps())

defineEmits(['close'])

const { liveEntity, entityRef, entityName, callService } = useEntityPopupBase(props)
const { stateLabel } = useEntityPopupHeader(entityRef, {
  stateLabelDomain: 'cover',
})

const isMoving = computed(() => {
  const s = liveEntity.value?.state
  return s !== 'closed' && s !== 'open' && s != null
})

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
  track: () => ({
    min: 0,
    max: 100,
    step: 1,
    color: '#a78bfa',
    trackColor: 'rgba(255,255,255,0.1)',
  }),
})

const hasPositionControl = computed(
  () => (liveEntity.value?.attributes?.supported_features & 4) !== 0,
)

async function setPosition(pos) {
  await callService(
    'cover',
    'set_cover_position',
    liveEntity.value.entity_id,
    { position: pos },
    '设置窗帘位置失败',
  )
}

const COVER_ACTION_ERRORS = {
  open_cover: '窗帘打开操作失败',
  close_cover: '窗帘关闭操作失败',
  stop_cover: '窗帘停止操作失败',
}

async function handleAction(action) {
  await callService(
    'cover',
    action,
    liveEntity.value.entity_id,
    undefined,
    COVER_ACTION_ERRORS[action] || '窗帘打开操作失败',
  )
}
</script>

<style scoped src="./styles/CoverControlPopup.css"></style>
