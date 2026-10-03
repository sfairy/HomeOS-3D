<!--
组件：EventsViewToolbar.vue
所属模块：frontend / src / views
职责：事件历史页顶部「查询工具栏」——回溯窗口、实体类型、实体筛选、查询按钮，
      以及活跃域/高频实体两个快速筛选下拉。
数据来源：所有选项由父级透传（domainFilterOptions / domainStatsPreview /
         topEntitiesPreview / entitySelectOptions 均来自后端聚合 + 实体缓存）。
Props：
  - hours / hourOptions：回溯窗口值与可选值列表。
  - entityFilter / domainFilter：当前实体/域筛选值。
  - domainFilterOptions / domainStatsPreview：域维度下拉选项与活跃域预览。
  - topEntitiesPreview / entitySelectOptions：高频实体预览与可搜索实体选项。
  - entityOptionsLoading：实体可搜索选项加载中标志。
  - loading：查询按钮加载态。
  - formatHourOption / formatCount / entityDisplayName：格式化与显示名函数。
Emits：
  - update:hours / update:domain-filter：窗口与域筛选 v-model 同步。
  - reload：触发重新查询。
  - entity-select-open / entity-select-search / entity-select：实体搜索打开、搜索、选中。
  - filter-by-entity：从高频实体快速筛选时抛出。
关键交互：
  - 改窗口或类型后立即触发 reload；
  - 高频实体下拉清空时回退为清除筛选，非空时直接触发 filter-by-entity。
-->
<script setup>
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/ViewToolbar 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { computed } from 'vue'
import { Activity, Clock, Flame, Search, Layers } from '@lucide/vue'
import HosSelect from '@/components/common/base/HosSelect.vue'
import SearchableSelect from '@/components/common/base/SearchableSelect.vue'
import { getDomainLabel } from '@/utils/device/domain-labels.util'
import './styles/events-toolbar.css'

const props = defineProps({
  hours: { type: Number, required: true },
  hourOptions: { type: Array, required: true },
  entityFilter: { type: String, default: '' },
  domainFilter: { type: String, default: '' },
  domainFilterOptions: { type: Array, required: true },
  domainStatsPreview: { type: Array, required: true },
  topEntitiesPreview: { type: Array, required: true },
  entitySelectOptions: { type: Array, required: true },
  entityOptionsLoading: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  formatHourOption: { type: Function, required: true },
  formatCount: { type: Function, required: true },
  entityDisplayName: { type: Function, required: true },
})

const emit = defineEmits([
  'update:hours',
  'update:domain-filter',
  'reload',
  'entity-select-open',
  'entity-select-search',
  'entity-select',
  'filter-by-entity',
])

// 活跃域下拉当前值：仅当当前 domainFilter 命中预览列表时回显，否则显示「全部活跃域」
const activeDomainValue = computed(() =>
  props.domainStatsPreview.some((row) => row.domain === props.domainFilter)
    ? props.domainFilter
    : '',
)

// 高频实体下拉当前值：仅当当前 entityFilter 命中预览列表时回显，否则显示「快速筛选」
const hotEntityValue = computed(() =>
  props.topEntitiesPreview.some((row) => row.entityId === props.entityFilter)
    ? props.entityFilter
    : '',
)

/** 活跃域下拉切换：空值视为清除筛选。 */
function onActiveDomainChange(value) {
  emit('update:domain-filter', value || '')
}

/** 高频实体下拉切换：清空走 entity-select('') 路径，选中走 filter-by-entity 路径。 */
function onHotEntityChange(value) {
  if (!value) {
    emit('entity-select', '')
    return
  }
  emit('filter-by-entity', value)
}
</script>

<template>
  <div class="events-view__toolbar">
    <div class="events-view__query-card">
      <div class="events-view__query-grid">
        <label class="events-view__field events-view__field--hours">
          <span class="events-view__label">
            <Clock class="events-view__label-icon" aria-hidden="true" />
            {{ '回溯窗口' }}
          </span>
          <HosSelect
            block
            variant="settings"
            trigger-class="list-page__input events-view__select"
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

        <label class="events-view__field events-view__field--domain">
          <span class="events-view__label">
            <Layers class="events-view__label-icon" aria-hidden="true" />
            {{ '实体类型' }}
          </span>
          <HosSelect
            block
            variant="settings"
            trigger-class="list-page__input events-view__select"
            :value="domainFilter"
            @change="emit('update:domain-filter', $event)"
          >
            <option value="">{{ '全部类型' }}</option>
            <option v-for="row in domainFilterOptions" :key="row.domain" :value="row.domain">
              {{ getDomainLabel(row.domain) }} · {{ formatCount(row.count) }}
            </option>
          </HosSelect>
        </label>

        <label class="events-view__field events-view__field--entity">
          <span class="events-view__label">
            <Search class="events-view__label-icon" aria-hidden="true" />
            {{ '实体筛选' }}
          </span>
          <SearchableSelect
            :model-value="entityFilter"
            select-only
            variant="list-page"
            class="events-view__entity-select"
            :options="entitySelectOptions"
            :loading="entityOptionsLoading"
            :placeholder="domainFilter ? `在 ${getDomainLabel(domainFilter)} 域内搜索…` : '搜索名称或 entity_id…'"
            :empty-text="'无匹配实体'"
            :clear-aria="'清除筛选'"
            :toggle-aria="'展开实体列表'"
            @open="emit('entity-select-open')"
            @search="emit('entity-select-search', $event)"
            @select="emit('entity-select', $event)"
          />
        </label>

        <div class="events-view__field events-view__field--action">
          <button
            type="button"
            class="list-page__btn list-page__btn--primary events-view__query-btn"
            :disabled="loading"
            @click="emit('reload')"
          >
            {{ loading ? '查询中…' : '查询' }}
          </button>
        </div>

        <label
          v-if="domainStatsPreview.length"
          class="events-view__field events-view__field--active-domain"
        >
          <span class="events-view__label">
            <Activity class="events-view__label-icon" aria-hidden="true" />
            {{ '活跃域' }}
          </span>
          <HosSelect
            block
            variant="settings"
            trigger-class="list-page__input events-view__select"
            :value="activeDomainValue"
            :title="'点击筛选域'"
            @change="onActiveDomainChange"
          >
            <option value="">{{ '全部活跃域' }}</option>
            <option v-for="row in domainStatsPreview" :key="row.domain" :value="row.domain">
              {{ getDomainLabel(row.domain) }} · {{ formatCount(row.count) }}
            </option>
          </HosSelect>
        </label>

        <label
          v-if="topEntitiesPreview.length"
          class="events-view__field events-view__field--hot-entity"
        >
          <span class="events-view__label">
            <Flame class="events-view__label-icon" aria-hidden="true" />
            {{ '高频实体' }}
          </span>
          <HosSelect
            block
            variant="settings"
            trigger-class="list-page__input events-view__select"
            :value="hotEntityValue"
            :title="'点击快速筛选'"
            @change="onHotEntityChange"
          >
            <option value="">{{ '快速筛选' }}</option>
            <option
              v-for="row in topEntitiesPreview"
              :key="row.entityId"
              :value="row.entityId"
              :title="row.entityId"
            >
              {{ entityDisplayName(row.entityId) }} · {{ formatCount(row.count) }}
            </option>
          </HosSelect>
        </label>
      </div>
    </div>
  </div>
</template>
