<!--
组件：SecurityOverviewSidebar.vue
所属模块：frontend / src / views / security
职责：安防总览侧栏。提供「传感器 / 审计日志」双 Tab，传感器 Tab 支持搜索、
      按类型/区域分组、告警/危险绑定筛选与视口自适应分页；审计 Tab 嵌入 AuditLogPanel。
关键依赖：
  - useAdaptiveViewportPagination：根据视口高度动态计算每页条数的分页 composable
  - SecurityAuditLogPanel：嵌入式审计日志面板
  - VEmptyState / Activity / Bell / Search 图标
数据来源：父级透传的传感器列表、分组、筛选选项、审计事件与 liveZones
-->
<template>
  <section class="sov-sidebar glass-shine">
    <div class="sov-sidebar__tabs" role="tablist">
      <button
        type="button"
        role="tab"
        :class="['sov-sidebar__tab', activeTab === 'sensors' && 'sov-sidebar__tab--on']"
        :aria-selected="activeTab === 'sensors'"
        @click="activeTab = 'sensors'"
      >
        <Activity class="w-3.5 h-3.5" />
        <span>{{ '传感器' }}</span>
        <span class="sov-sidebar__badge">{{ listSensors.length }}</span>
      </button>
      <button
        type="button"
        role="tab"
        :class="['sov-sidebar__tab', activeTab === 'audit' && 'sov-sidebar__tab--on']"
        :aria-selected="activeTab === 'audit'"
        @click="activeTab = 'audit'"
      >
        <Bell class="w-3.5 h-3.5" />
        <span>{{ '审计日志' }}</span>
        <span class="sov-sidebar__badge">{{ displayedSecEvents.length }}</span>
      </button>
    </div>

    <div v-show="activeTab === 'sensors'" class="sov-sidebar__pane" role="tabpanel">
      <div class="sov-sensor-toolbar">
        <label class="sov-sensor-search">
          <Search class="sov-sensor-search__icon" />
          <input
            v-model="sensorQuery"
            type="search"
            class="sov-sensor-search__input"
            :placeholder="'搜索传感器…'"
            autocomplete="off"
          />
        </label>

        <div v-if="liveZones.length" class="sov-sensor-group-mode">
          <button
            type="button"
            :class="['sov-pill', groupMode === 'type' && 'sov-pill--on']"
            @click="groupMode = 'type'"
          >
            {{ '按类型' }}
          </button>
          <button
            type="button"
            :class="['sov-pill', groupMode === 'zone' && 'sov-pill--on']"
            @click="groupMode = 'zone'"
          >
            {{ '按区域' }}
          </button>
        </div>

        <div class="sov-sensor-filters">
          <button
            type="button"
            :class="['sov-pill', alertsOnly && 'sov-pill--on sov-pill--danger']"
            @click="alertsOnly = !alertsOnly"
          >
            {{ '告警' }}
          </button>
          <button
            v-if="boundSensorCount > 0"
            type="button"
            :class="['sov-pill', boundOnly && 'sov-pill--on']"
            @click="boundOnly = !boundOnly"
          >
            {{ '危险绑定' }}
          </button>
          <button
            v-for="f in sensorFilters"
            :key="f.key"
            type="button"
            :class="['sov-pill', sensorFilter === f.key && 'sov-pill--on']"
            @click="$emit('toggle-sensor-filter', f.key)"
          >
            {{ f.label }}
            <em>{{ f.count }}</em>
          </button>
        </div>
      </div>

      <div ref="sensorViewportRef" class="sov-sensor-scroll sov-sensor-scroll--paged">
        <div
          v-if="flatSensors[0]"
          ref="sensorRowMeasureRef"
          class="sov-sensor-row-measure"
          aria-hidden="true"
        >
          <div class="sov-sensor-card">
            <div class="sov-sensor-card__icon">
              <component :is="flatSensors[0].iconComp" class="w-4 h-4" />
            </div>
            <div class="sov-sensor-card__body">
              <span class="sov-sensor-card__name">{{ flatSensors[0].name }}</span>
              <span class="sov-sensor-card__state">{{ sensorStateLabel(flatSensors[0]) }}</span>
            </div>
            <span class="sov-sensor-card__dot is-ok" />
          </div>
        </div>

        <VEmptyState
          v-if="displayGroups.length === 0"
          icon=""
          compact
          tone="rose"
          :title="sensorQuery ? '无匹配结果' : '无匹配传感器'"
        />

        <ul v-else class="sov-sensor-list sov-sensor-list--paged">
          <li
            v-for="s in pagedSensors"
            :key="s.entity_id"
            :class="[
              'sov-sensor-card',
              s.alert && 'sov-sensor-card--alert',
              s.offline && 'sov-sensor-card--offline',
            ]"
            :title="s.entity_id"
          >
            <div :class="['sov-sensor-card__icon', s.alert && 'sov-sensor-card__icon--alert']">
              <component :is="s.iconComp" :class="['w-4 h-4', s.iconColor]" />
            </div>
            <div class="sov-sensor-card__body">
              <span class="sov-sensor-card__name">{{ s.name }}</span>
              <span class="sov-sensor-card__meta">
                <span class="sov-sensor-card__group">{{ s._groupLabel }}</span>
                <span class="sov-sensor-card__state">{{ sensorStateLabel(s) }}</span>
              </span>
            </div>
            <span
              :class="[
                'sov-sensor-card__dot',
                s.offline ? 'is-offline' : s.alert ? 'is-alert' : 'is-ok',
              ]"
            />
          </li>
        </ul>
      </div>

      <footer v-if="sensorTotalPages > 1" class="sov-sensor-pager">
        <button
          type="button"
          class="list-page__btn"
          :disabled="!sensorCanPrev"
          @click="sensorPrevPage"
        >
          {{ '上一页' }}
        </button>
        <span class="list-page__muted">
          {{ sensorPageLabel }}（共 {{ flatSensors.length }} 条）
        </span>
        <button
          type="button"
          class="list-page__btn"
          :disabled="!sensorCanNext"
          @click="sensorNextPage"
        >
          {{ '下一页' }}
        </button>
      </footer>
    </div>

    <div
      v-show="activeTab === 'audit'"
      class="sov-sidebar__pane sov-sidebar__pane--audit"
      role="tabpanel"
    >
      <SecurityAuditLogPanel
        v-model:sec-event-filter="secEventFilter"
        class="sov-audit-embed"
        embedded
        :displayed-sec-events="displayedSecEvents"
        :sec-audit-loading="secAuditLoading"
        :sec-audit-error="secAuditError"
        :sec-event-filters="secEventFilters"
        :sec-event-icon-map="secEventIconMap"
        @refresh="$emit('refresh-audit')"
      />
    </div>
  </section>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Activity, Bell, Search } from '@lucide/vue'
import VEmptyState from '@/components/common/base/VEmptyState.vue'
import SecurityAuditLogPanel from '@/views/security/AuditLogPanel.vue'
import { useAdaptiveViewportPagination } from '@/composables/ui/hub-viewport.internals'

// 入参：传感器列表/分组、筛选选项、危险绑定数、liveZones、审计事件、加载/错误态
const props = defineProps({
  listSensors: { type: Array, default: () => [] },
  groupedListSensors: { type: Array, default: () => [] },
  sensorFilters: { type: Array, default: () => [] },
  sensorFilter: { type: String, default: 'all' },
  boundSensorCount: { type: Number, default: 0 },
  liveZones: { type: Array, default: () => [] },
  displayedSecEvents: { type: Array, default: () => [] },
  secAuditLoading: Boolean,
  secAuditError: { type: String, default: '' },
  secEventFilters: { type: Array, default: () => [] },
  secEventIconMap: { type: Object, default: () => ({}) },
})

// 对外事件：切换传感器筛选、刷新审计日志
defineEmits(['toggle-sensor-filter', 'refresh-audit'])

// 双向绑定：仅看告警 / 仅看已绑定 / 事件筛选维度
const alertsOnly = defineModel('alertsOnly', { type: Boolean, default: false })
const boundOnly = defineModel('boundOnly', { type: Boolean, default: false })
const secEventFilter = defineModel('secEventFilter', { type: String, default: 'all' })

// 当前激活的 Tab：sensors 传感器 / audit 审计日志
const activeTab = ref('sensors')
// 传感器搜索关键字（按名称或 entity_id 模糊匹配）
const sensorQuery = ref('')
// 分组模式：type 按类型 / zone 按区域
const groupMode = ref('type')

// 当存在区域时，默认按区域分组，便于查看分区下的传感器
watch(
  () => props.liveZones.length,
  (n) => {
    if (n > 0) groupMode.value = 'zone'
  },
  { immediate: true },
)

watch(secEventFilter, (f) => {
  // 指挥栏「查看详情」、危险/误报筛选、区域筛选：切到审计日志，否则用户看不到效果
  if (typeof f !== 'string' || f === 'all') return
  if (
    f === 'linkage' ||
    f === 'hazard' ||
    f === 'false_alarm_feedback' ||
    f.startsWith('zone:')
  ) {
    activeTab.value = 'audit'
  }
})

/** 指挥栏 / 筛选 chip 切换类型时，从审计日志回到传感器列表 */
watch(
  () => props.sensorFilter,
  () => {
    activeTab.value = 'sensors'
  },
)

// 按区域重新分组传感器：未分区传感器归入「未分区」组；无区域时回退到原分组
const zoneGroupedSensors = computed(() => {
  if (!props.liveZones.length) return props.groupedListSensors
  const assigned = new Set()
  const groups = []
  for (const zone of props.liveZones) {
    const items = props.listSensors.filter((s) => zone.sensors?.includes(s.entity_id))
    items.forEach((s) => assigned.add(s.entity_id))
    if (items.length) {
      groups.push({ type: `zone:${zone.id}`, label: zone.name, items })
    }
  }
  const unassigned = props.listSensors.filter((s) => !assigned.has(s.entity_id))
  if (unassigned.length) {
    groups.push({ type: '__unassigned__', label: '未分区', items: unassigned })
  }
  return groups.length ? groups : props.groupedListSensors
})

// 当前分组模式对应的分组来源：按区域用 zoneGroupedSensors，否则用原 groupedListSensors
const baseGroups = computed(() =>
  groupMode.value === 'zone' ? zoneGroupedSensors.value : props.groupedListSensors,
)

// 在基础分组上叠加搜索过滤，剔除无匹配项的空分组
const displayGroups = computed(() => {
  const q = sensorQuery.value.trim().toLowerCase()
  if (!q) return baseGroups.value
  return baseGroups.value
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (s) => s.name?.toLowerCase().includes(q) || s.entity_id?.toLowerCase().includes(q),
      ),
    }))
    .filter((g) => g.items.length > 0)
})

// 将分组摊平为带 _groupLabel 的传感器列表，便于分页切片与卡片渲染
const flatSensors = computed(() =>
  displayGroups.value.flatMap((g) =>
    g.items.map((s) => ({
      ...s,
      _groupType: g.type,
      _groupLabel: g.label,
    })),
  ),
)

// 视口与行高测量节点，供自适应分页 composable 计算每页容量
const sensorViewportRef = ref(null)
const sensorRowMeasureRef = ref(null)
const sensorCount = computed(() => flatSensors.value.length)
// 仅在传感器 Tab 且有数据时启用分页
const sensorPagingEnabled = computed(() => activeTab.value === 'sensors' && sensorCount.value > 0)

// 复用自适应视口分页 composable：根据视口高度动态调整每页条数
const {
  totalPages: sensorTotalPages,
  canPrev: sensorCanPrev,
  canNext: sensorCanNext,
  pageLabel: sensorPageLabel,
  prevPage: sensorPrevPage,
  nextPage: sensorNextPage,
  resetPage: sensorResetPage,
  sliceItems: sliceSensors,
} = useAdaptiveViewportPagination({
  viewportRef: sensorViewportRef,
  rowMeasureRef: sensorRowMeasureRef,
  itemCount: sensorCount,
  gap: 6,
  minPerPage: 1,
  enabled: sensorPagingEnabled,
})

// 当前页对应的传感器切片
const pagedSensors = computed(() => sliceSensors(flatSensors.value))

// 搜索/分组/筛选变化时回到第一页
watch([sensorQuery, groupMode, () => props.sensorFilter, alertsOnly, boundOnly], () => {
  sensorResetPage()
})

// 传感器状态文案：离线 / 告警 / 正常
function sensorStateLabel(s) {
  if (s.offline) return '离线'
  if (s.alert) return '告警'
  return '正常'
}
</script>

<style scoped src="./styles/OverviewSidebar.css"></style>
