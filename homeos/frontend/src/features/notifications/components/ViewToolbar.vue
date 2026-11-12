<!--
  通知中心筛选工具条。提供「分析窗口（小时数）」「消息级别」两个筛选下拉，
  以及「刷新数据」按钮；切换筛选时通过 update:* 事件通知父级并触发 reload。
-->
<script setup>
import { Clock, Filter } from '@lucide/vue'

import HosSelect from '@/components/common/base/HosSelect.vue'
import ListPageQueryToolbar from '@/components/list-page-shell/ListPageQueryToolbar.vue'

defineProps({
  hours: { type: Number, required: true },

  hourOptions: { type: Array, required: true },

  activeLevel: { type: String, default: 'all' },

  levelFilters: { type: Array, required: true },

  loading: { type: Boolean, default: false },

  formatHourOption: { type: Function, required: true },
})

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
