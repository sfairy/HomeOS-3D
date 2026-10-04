<template>
  <!-- EntityMultiSelectTrigger 多选触发器：显示已选摘要和占位符，点击展开下拉 -->
  <div class="ems-trigger-row">
    <div
      :ref="triggerRef"
      :id="inputId || undefined"
      :class="[
        'ems-trigger',
        showDropdown && 'ems-trigger--open',
        selectedIds.length && 'ems-trigger--filled',
      ]"
      role="combobox"
      :aria-expanded="showDropdown"
      tabindex="0"
      @mousedown.prevent="openDropdown"
      @keydown.enter.prevent="openDropdown"
      @keydown.space.prevent="openDropdown"
      @keydown.escape.prevent="closeDropdown"
    >
      <div class="ems-trigger__body">
        <div v-if="selectedIds.length" class="ems-inline-chips">
          <span
            v-for="(id, idx) in selectedIds"
            :key="id"
            :class="['ems-inline-chip', `ems-inline-chip--tone-${idx % 5}`]"
            :title="id"
            @click.stop
          >
            <span class="ems-inline-chip__name">{{ displayName(id) }}</span>
            <button
              type="button"
              class="ems-inline-chip__remove"
              :aria-label="'移除 ' + displayName(id)"
              @click.stop="removeId(id)"
            >
              <X class="w-2.5 h-2.5" />
            </button>
          </span>
        </div>
        <span v-else class="ems-placeholder">{{ placeholderText }}</span>
      </div>
      <div class="ems-trigger__rail">
        <span v-if="selectedIds.length" class="ems-trigger__count">{{ countLabel }}</span>
        <span class="ems-chev-wrap" aria-hidden="true">
          <ChevronDown class="ems-chev" :class="{ 'ems-chev--open': showDropdown }" />
        </span>
      </div>
    </div>
    <button
      v-if="selectedIds.length"
      type="button"
      class="ems-clear"
      :aria-label="'清空全部'"
      @click="clearAll"
    >
      <X class="w-3 h-3" />
    </button>
  </div>
</template>

<script setup>
/**
 * EntityMultiSelectTrigger - 实体多选触发器组件
 * 功能特性：
 * - 显示已选实体摘要或占位文本
 * - 点击展开/收起下拉面板
 * - 支持禁用状态
 * - 支持清空按钮
 */
import { computed } from 'vue'
import { ChevronDown, X } from '@lucide/vue'

const props = defineProps({
  /** 触发器元素 ref 绑定回调（供父级定位使用） */
  triggerRef: { type: Function, required: true },
  /** 下拉面板是否展开 */
  showDropdown: { type: Boolean, required: true },
  /** 已选实体 ID 列表 */
  selectedIds: { type: Array, required: true },
  /** 占位文本 */
  placeholderText: { type: String, required: true },
  /** 根据实体 ID 解析展示名称的函数 */
  displayName: { type: Function, required: true },
  /** 展开下拉面板的回调 */
  openDropdown: { type: Function, required: true },
  /** 关闭下拉面板的回调 */
  closeDropdown: { type: Function, required: true },
  /** 移除指定实体的回调 */
  removeId: { type: Function, required: true },
  /** 清空全部已选实体的回调 */
  clearAll: { type: Function, required: true },
  /** 供外部 label 点击聚焦的 id（div 非 labelable，需配合手动 focus） */
  inputId: { type: String, default: '' },
})

/** 已选数量标签（仅在已选时展示数字） */
const countLabel = computed(() => {
  const n = props.selectedIds.length
  return n ? `${n}` : ''
})
</script>
