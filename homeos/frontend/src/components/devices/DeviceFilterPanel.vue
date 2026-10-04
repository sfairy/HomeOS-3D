<!--
  @file DeviceFilterPanel.vue
  @module 设备列表/筛选与排序面板
  @description 设备列表页的筛选侧栏组件：提供状态、房间、排序三项下拉筛选与"仅显示可控设备"开关，
               通过 v-model 双向绑定 DeviceFilterState。支持重置筛选与活动筛选数徽标。
               房间选项来自 useAreaOptions，并在房间选项变化时自动校正或清空失效的 room 值。
  @dependencies vue（computed/watch）、@lucide/vue、HosSelect、useAreaOptions
                （filterRoomOptions）、DeviceFilterState 类型。
-->
<template>
  <div
    class="device-filter dev-card premium-glass-surface premium-glass-surface--elevated premium-backdrop"
  >
    <div class="dev-card__header">
      <div class="dev-card__title-row">
        <SlidersHorizontal class="w-4 h-4 dfp-icon-info" />
        <span class="dev-card__title">{{ '筛选与排序' }}</span>
        <span v-if="activeFilterCount" class="device-filter__badge">{{ activeFilterCount }}</span>
      </div>
      <button
        type="button"
        class="dev-btn-refresh"
        :aria-label="'重置筛选'"
        :title="'重置筛选'"
        @click="resetFilter"
      >
        <RotateCcw class="w-3 h-3" />
      </button>
    </div>

    <!-- 筛选表单：状态/房间/排序三下拉 + 可控设备开关 -->
    <div class="device-filter__form">
      <label class="device-filter__field">
        <span class="device-filter__label">{{ '状态' }}</span>
        <HosSelect
          variant="settings"
          block
          trigger-class="device-filter__select"
          :value="modelValue.status"
          @change="onStatusChange"
        >
          <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </HosSelect>
      </label>

      <label class="device-filter__field">
        <span class="device-filter__label">{{ '房间' }}</span>
        <HosSelect
          variant="settings"
          block
          trigger-class="device-filter__select"
          :value="modelValue.room"
          @change="onRoomChange"
        >
          <option v-for="room in filterRoomOptions" :key="room.id || 'all'" :value="room.id">
            {{ room.name }}
          </option>
        </HosSelect>
      </label>

      <label class="device-filter__field">
        <span class="device-filter__label">{{ '排序' }}</span>
        <HosSelect
          variant="settings"
          block
          trigger-class="device-filter__select"
          :value="modelValue.sort"
          @change="onSortChange"
        >
          <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </HosSelect>
      </label>

      <label class="device-filter__check">
        <input
          type="checkbox"
          class="device-filter__checkbox"
          :checked="modelValue.controllableOnly"
          @change="onControllableChange"
        />
        <Settings2 class="w-3.5 h-3.5 dfp-icon-info-soft" />
        <span>{{ '仅显示可控设备' }}</span>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import HosSelect from '@/components/common/base/HosSelect.vue'
import { computed, watch } from 'vue'
import { SlidersHorizontal, RotateCcw, Settings2 } from '@lucide/vue'
import { useAreaOptions } from '@/composables/entity/useAreaOptions'
import type { DeviceFilterState } from '@/types/device'

// 默认筛选状态：全状态、无房间、名称升序、默认开启「仅显示可控设备」。
// 重置按钮将恢复到此状态。
const DEFAULT_FILTER: DeviceFilterState = {
  status: 'all',
  room: '',
  sort: 'name-asc',
  controllableOnly: true,
}

// v-model 绑定的筛选状态对象。
const props = defineProps<{
  modelValue: DeviceFilterState
}>()

// 筛选状态变化时触发，配合 v-model 实现双向绑定。
const emit = defineEmits<{
  'update:modelValue': [DeviceFilterState]
}>()

// 从 useAreaOptions 获取可用的房间（区域）选项列表。
const { filterRoomOptions } = useAreaOptions()

// 计算属性：仅保留有 id 的房间选项，过滤掉「全部」占位项。
const selectableRooms = computed(() => filterRoomOptions.value.filter((room) => room.id))

/**
 * 监听房间选项变化：当选项加载或变更后，校正当前 room 值。
 * - room 直接作为 area_id 使用；
 * - 若 room 不再存在于选项中则清空。
 * immediate: true 保证初始加载时即执行一次校正。
 */
watch(
  filterRoomOptions,
  () => {
    const room = props.modelValue.room
    if (!room) return
    const resolved = String(room || '').trim()
    if (resolved !== room) {
      patchFilter({ room: resolved })
      return
    }
    if (!selectableRooms.value.some((opt) => opt.id === room)) {
      patchFilter({ room: '' })
    }
  },
  { immediate: true },
)

// 状态下拉选项：全部/在线/离线/低电量（≤20%）。
const statusOptions: Array<{ value: DeviceFilterState['status']; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'online', label: '在线' },
  { value: 'offline', label: '离线' },
  { value: 'low-battery', label: '低电量 (≤20%)' },
]

// 排序下拉选项：名称升降序、状态优先、最近变更。
const sortOptions: Array<{ value: DeviceFilterState['sort']; label: string }> = [
  { value: 'name-asc', label: '名称 A → Z' },
  { value: 'name-desc', label: '名称 Z → A' },
  { value: 'status', label: '状态优先' },
  { value: 'last-changed', label: '最近变更' },
]

/**
 * 计算属性：当前激活的筛选项数量，用于标题栏徽标展示。
 * 注意 controllableOnly 默认开启，因此默认计数包含此项。
 */
const activeFilterCount = computed(() => {
  let count = 0
  if (props.modelValue.status !== 'all') count++
  if (props.modelValue.room) count++
  if (props.modelValue.sort !== 'name-asc') count++
  if (props.modelValue.controllableOnly) count++
  return count
})

/**
 * 局部更新筛选状态并触发 update:modelValue 事件。
 * @param patch 需要覆盖的字段子集
 */
function patchFilter(patch: Partial<DeviceFilterState>) {
  emit('update:modelValue', { ...props.modelValue, ...patch })
}

// 状态下拉变更回调。
function onStatusChange(value: DeviceFilterState['status']) {
  patchFilter({ status: value })
}

// 房间下拉变更回调。
function onRoomChange(value: string) {
  patchFilter({ room: value })
}

// 排序下拉变更回调。
function onSortChange(value: DeviceFilterState['sort']) {
  patchFilter({ sort: value })
}

// 可控设备开关变更回调：从 input.checked 读取布尔值。
function onControllableChange(e: Event) {
  patchFilter({ controllableOnly: (e.target as HTMLInputElement).checked })
}

// 重置筛选：发射一份 DEFAULT_FILTER 副本，避免引用共享。
function resetFilter() {
  emit('update:modelValue', { ...DEFAULT_FILTER })
}
</script>

<style scoped>
.dfp-icon-info {
  color: var(--set-info, #7dd3fc);
}
.dfp-icon-info-soft {
  color: color-mix(in srgb, var(--set-info, #7dd3fc) 80%, rgba(0, 0, 0, 0));
}
</style>
