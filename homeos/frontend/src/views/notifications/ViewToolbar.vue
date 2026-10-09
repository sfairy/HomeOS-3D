<!--
组件：NotificationsViewToolbar.vue
所属模块：frontend / src / views / notifications
职责：通知中心筛选工具条。提供「分析窗口（小时数）」「消息级别」两个筛选下拉，
      以及「刷新数据」按钮；切换筛选时通过 update:* 事件通知父级并触发 reload。
关键依赖：
  - HosSelect：通用下拉选择组件（支持 number 模式）
  - Clock / Filter 图标来自 @lucide/vue
数据来源：父级页面透传的小时数、级别选项、当前级别与 loading 状态
-->
<script setup>
/**
 * 职责：渲染 views/ViewToolbar 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { Clock, Filter } from '@lucide/vue'

import HosSelect from '@/components/common/base/HosSelect.vue'
import ListPageQueryToolbar from '@/components/page-shell/ListPageQueryToolbar.vue'

// 入参：分析窗口小时数、小时选项、当前级别、级别筛选选项、loading 状态与小时格式化函数
defineProps({
  hours: { type: Number, required: true },

  hourOptions: { type: Array, required: true },

  activeLevel: { type: String, default: 'all' },

  levelFilters: { type: Array, required: true },

  loading: { type: Boolean, default: false },

  formatHourOption: { type: Function, required: true },
})

// 对外事件：更新分析窗口、更新当前级别、刷新数据
const emit = defineEmits(['update:hours', 'update:active-level', 'reload'])
</script>

<template>
  <ListPageQueryToolbar view-prefix="notifications-view">
        <label class="notifications-view__field notifications-view__field--hours">
          <span class="notifications-view__label">
            <Clock class="notifications-view__label-icon" aria-hidden="true" />

            {{ '分析窗口' }}
          </span>

          <HosSelect
            block
            variant="settings"
            trigger-class="list-page__input notifications-view__select"
            :value="hours"
            number
            @change="
              (value) => {
                emit('update:hours', value)
                emit('reload')
              }
            "
          >
            <option v-for="opt in hourOptions" :key="opt" :value="opt">
              {{ formatHourOption(opt) }}
            </option>
          </HosSelect>
        </label>

        <label class="notifications-view__field notifications-view__field--level">
          <span class="notifications-view__label">
            <Filter class="notifications-view__label-icon" aria-hidden="true" />

            {{ '消息级别' }}
          </span>

          <HosSelect
            block
            variant="settings"
            trigger-class="list-page__input notifications-view__select"
            :value="activeLevel"
            @change="emit('update:active-level', $event)"
          >
            <option v-for="row in levelFilters" :key="row.key" :value="row.key">
              {{ row.label }}
            </option>
          </HosSelect>
        </label>

        <div class="notifications-view__field notifications-view__field--action">
          <button
            type="button"
            class="list-page__btn list-page__btn--primary notifications-view__query-btn"
            :disabled="loading"
            @click="emit('reload')"
          >
            {{ loading ? '刷新中…' : '刷新数据' }}
          </button>
        </div>
  </ListPageQueryToolbar>
</template>
