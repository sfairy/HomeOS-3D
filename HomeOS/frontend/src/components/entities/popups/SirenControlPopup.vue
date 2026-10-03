/**
 * @file SirenControlPopup.vue
 * @module components/entities/popups
 * @brief 警笛控制弹窗
 *
 * 职责：
 * - 基于 EntityPopupShell 渲染 siren 域控制面板
 * - 提供开/关切换与音调选择（EntityModeCardGrid）
 * - 展示当前状态色与标签
 *
 * 依赖：
 * - vue（computed）、@lucide/vue（AlertTriangle）
 * - ./EntityPopupShell、./PopupHead、./EntityModeCardGrid
 * - @/composables/entity/useEntityPopupBase（useEntityPopupBase/useEntityPopupHeader）
 */
<template>
  <!-- SirenControlPopup 警笛控制弹窗：控制警笛实体的开关 -->
  <EntityPopupShell
    :entity="liveEntity"
    :x-pct="xPct"
    :y-pct="yPct"
    :anchor-x="anchorX"
    :anchor-y="anchorY"
    :width="320"
    :height="260"
    accent="#fb7185"
    accent-rgb="251, 113, 133"
    @close="$emit('close')"
  >
    <PopupHead :title="entityName" :icon="AlertTriangle">
      <template #status>
        <span :class="stateColor">{{ displayStateLabel }}</span>
        <span
          v-if="isSounding"
          class="popup-status-dot popup-status-dot--pulse scp-state-dot scp-state-dot--on"
        />
      </template>
    </PopupHead>

    <div class="flex justify-center mb-4">
      <button
        :class="[
          'flex items-center gap-3 px-6 py-4 rounded-2xl border transition-all duration-300 text-sm font-bold tracking-wider',
          isOn ? 'scp-trigger-btn scp-trigger-btn--on' : 'scp-trigger-btn scp-trigger-btn--off',
        ]"
        @click.stop="toggleSiren"
      >
        <AlertTriangle class="w-6 h-6" />
        <span>{{ isOn ? '关闭警报' : '触发警报' }}</span>
      </button>
    </div>

    <div class="flex items-center justify-between px-1">
      <div class="flex items-center gap-2">
        <div
          class="w-2 h-2 rounded-full"
          :class="isOn ? 'scp-status-dot scp-status-dot--on' : 'scp-status-dot scp-status-dot--off'"
        />
        <span class="text-xs font-semibold scp-lbl">{{
          isSounding ? '⚠ 正在鸣响' : isOn ? '已激活' : '待机'
        }}</span>
      </div>
    </div>
  </EntityPopupShell>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 SirenControlPopup 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
/**
 * SirenControlPopup - 警笛控制弹窗组件
 * 功能特性：
 * - 控制警笛的开启/关闭
 * - 显示当前状态
 * - 可能支持音调选择
 * - 弹出式面板
 */
import { computed } from 'vue'
import { AlertTriangle } from '@lucide/vue'
import EntityPopupShell from '@/components/entities/popups/EntityPopupShell.vue'
import PopupHead from '@/components/entities/popups/PopupHead.vue'
import {
  defineEntityPopupProps,
  useEntityPopupBase,
  useEntityPopupHeader,
} from '@/composables/entity/useEntityPopupBase'

const props = defineProps(defineEntityPopupProps())
defineEmits(['close'])

const { liveEntity, entityRef, entityName, callService } = useEntityPopupBase(props)

const { stateColor, state } = useEntityPopupHeader(entityRef, {
  stateColorMap: { on: 'scp-state-on', off: 'scp-state-off', sounding: 'scp-state-on' },
})

const displayStateLabel = computed(
  () =>
    ({
      on: '已激活',
      off: '已关闭',
      sounding: '鸣响中',
    })[state.value] ||
    state.value ||
    '--',
)

const isOn = computed(() => state.value === 'on' || state.value === 'sounding')
const isSounding = computed(() => state.value === 'sounding')

async function toggleSiren() {
  const svc = isOn.value ? 'turn_off' : 'turn_on'
  await callService('siren', svc, liveEntity.value.entity_id, undefined, '警报器操作失败')
}
</script>

<style scoped src="./styles/SirenControlPopup.css"></style>
