<!--
  @file DeviceOverviewPanel.vue
  @module 设备详情/概览面板
  @description 设备详情页的「概览」首屏：展示运行状态、电量、最近变更等 KPI 卡，以及实体属性高亮、
               相关功能实体、快捷入口与最近动态。底部嵌入 DeviceHealthScore 健康评分卡片。
               数据由 useDeviceOverview 组合式函数与 entities.store 提供；controllable 控制是否显示
               「控制设备」按钮，hasAttrs 控制属性区块显隐。通过 navigate/control/copy-id 事件与父级联动。
  @dependencies vue（computed）、@lucide/vue、@homeos/shared（getEntityDomain/resolveEntityArea）、
                entities.store、useDeviceOverview、DeviceHealthScore、各类属性格式化与状态标签工具。
-->
<template>
  <!-- DeviceOverviewPanel 设备概览面板：展示设备的基本信息和状态 -->
  <div class="device-overview">
    <div class="dev-metric-grid device-overview__kpi">
      <div class="dev-metric">
        <div
          :class="[
            'dev-metric__icon',
            unavailable ? 'dev-metric__icon--red' : 'dev-metric__icon--green',
          ]"
        >
          <component :is="unavailable ? WifiOff : Wifi" class="w-4 h-4" />
        </div>
        <div>
          <div
            :class="[
              'dev-metric__value',
              unavailable ? 'dev-metric__value--red' : 'dev-metric__value--green',
            ]"
          >
            {{ displayState }}
          </div>
          <div class="dev-metric__label">{{ '运行状态' }}</div>
        </div>
      </div>

      <div class="dev-metric">
        <div
          :class="[
            'dev-metric__icon',
            batteryTone === 'red'
              ? 'dev-metric__icon--red'
              : batteryTone === 'amber'
                ? 'dev-metric__icon--amber'
                : 'dev-metric__icon--green',
          ]"
        >
          <Battery class="w-4 h-4" />
        </div>
        <div>
          <div :class="['dev-metric__value', batteryTone && `dev-metric__value--${batteryTone}`]">
            {{ batteryDisplay }}
          </div>
          <div class="dev-metric__label">{{ '电量' }}</div>
        </div>
      </div>

      <div class="dev-metric">
        <div class="dev-metric__icon">
          <Clock class="w-4 h-4" />
        </div>
        <div>
          <div class="dev-metric__value">{{ lastChangedLabel }}</div>
          <div class="dev-metric__label">{{ '最后更新' }}</div>
        </div>
      </div>

      <div class="dev-metric">
        <div class="dev-metric__icon">
          <Activity class="w-4 h-4" />
        </div>
        <div>
          <div class="dev-metric__value">
            {{ usageLoading ? '…' : String(toggleCount7d) }}
          </div>
          <div class="dev-metric__label">{{ '近7天切换' }}</div>
        </div>
      </div>
    </div>

    <div class="device-overview__main">
      <div
        class="dev-card premium-glass-surface premium-glass-surface--elevated premium-backdrop device-overview__info"
      >
        <div class="dev-card__header">
          <div class="dev-card__title-row">
            <component :is="domainIcon" class="w-4 h-4 dov-icon-info" />
            <span class="dev-card__title">{{ '设备信息' }}</span>
            <span class="device-overview__domain-chip">{{ domainLabel }}</span>
          </div>
          <button
            type="button"
            class="dev-btn-refresh"
            :aria-label="'刷新状态'"
            :title="'刷新状态'"
            @click="refreshEntity"
          >
            <RefreshCw class="w-3 h-3" />
          </button>
        </div>

        <div class="device-overview__info-body">
          <div class="device-overview__info-main">
            <section class="device-overview__identity" aria-label="运行状态">
              <div class="device-overview__identity-top">
                <div class="device-overview__identity-hero">
                  <div
                    :class="[
                      'device-overview__identity-icon',
                      unavailable && 'device-overview__identity-icon--bad',
                    ]"
                  >
                    <component :is="domainIcon" class="w-5 h-5" />
                  </div>
                  <div class="device-overview__identity-copy">
                    <div
                      :class="[
                        'device-overview__identity-state',
                        unavailable && 'device-overview__identity-state--bad',
                      ]"
                    >
                      {{ displayState }}
                    </div>
                    <div class="device-overview__identity-tags">
                      <span v-if="deviceClass" class="device-overview__class-chip">{{
                        deviceClass
                      }}</span>
                      <span v-if="areaLabel" class="device-overview__class-chip">{{
                        areaLabel
                      }}</span>
                      <span v-if="controllable" class="device-overview__class-chip">{{
                        '可控制'
                      }}</span>
                    </div>
                  </div>
                </div>
                <p class="device-overview__identity-hint">{{ identityHint }}</p>
              </div>

              <div class="device-overview__identity-stats">
                <div class="device-overview__panel-label">{{ '运行概况' }}</div>
                <dl class="device-overview__identity-meta">
                  <div
                    v-for="row in identityMeta"
                    :key="row.key"
                    class="device-overview__meta-row"
                  >
                    <dt>{{ row.label }}</dt>
                    <dd>{{ row.value }}</dd>
                  </div>
                </dl>
              </div>
            </section>

            <section class="device-overview__detail" aria-label="基本信息">
              <div class="device-overview__detail-block">
                <div class="device-overview__detail-head">
                  <span class="device-overview__panel-label">{{ '基本信息' }}</span>
                </div>

                <div v-if="detailRows.length" class="device-overview__info-rows">
                  <div
                    v-for="row in detailRows"
                    :key="row.key"
                    class="device-overview__info-row"
                    :title="row.title || row.value"
                  >
                    <span class="device-overview__info-row-label">{{ row.label }}</span>
                    <span
                      :class="[
                        'device-overview__info-row-value',
                        row.mono && 'device-overview__info-row-value--mono',
                      ]"
                      >{{ row.display }}</span
                    >
                  </div>
                </div>
                <p class="device-overview__detail-tip">{{ '完整 ID 可悬停查看，或点底部「复制 ID」' }}</p>
              </div>

              <div v-if="highlightAttrs.length" class="device-overview__highlights">
                <div class="device-overview__highlights-title">
                  <Sparkles class="w-3 h-3 dov-icon-violet" />
                  <span>{{ '关键读数' }}</span>
                </div>
                <div class="device-overview__highlight-chips">
                  <div
                    v-for="item in highlightAttrs"
                    :key="item.key"
                    class="device-overview__highlight-chip"
                  >
                    <span class="device-overview__highlight-label">{{ item.label }}</span>
                    <span class="device-overview__highlight-value">{{ item.value }}</span>
                  </div>
                </div>
              </div>

              <div v-if="relatedEntities.length" class="device-overview__related">
                <div class="device-overview__detail-head">
                  <span class="device-overview__panel-label">{{ '相关功能' }}</span>
                  <span v-if="relatedEntitiesExtra > 0" class="device-overview__related-extra">{{
                    `还有 ${relatedEntitiesExtra} 个`
                  }}</span>
                </div>
                <div class="device-overview__related-list">
                  <router-link
                    v-for="rel in relatedEntities"
                    :key="rel.id"
                    :to="{ path: '/device', query: { id: rel.id } }"
                    class="device-overview__related-item"
                    :title="rel.id"
                  >
                    {{ rel.name }}
                  </router-link>
                </div>
              </div>
            </section>
          </div>
        </div>

        <div
          class="device-overview__actions"
          :style="{ '--dov-action-cols': controllable ? '3' : '2' }"
        >
          <button
            v-if="controllable"
            type="button"
            class="list-page__btn list-page__btn--primary"
            @click="$emit('control')"
          >
            {{ '控制设备' }}
          </button>
          <button type="button" class="list-page__btn" @click="$emit('copy-id')">
            {{ '复制 ID' }}
          </button>
          <router-link
            :to="{ path: '/events', query: { entity_id: entityId } }"
            class="list-page__link-btn"
          >
            {{ '事件历史' }}
          </router-link>
        </div>
      </div>

      <DeviceHealthScore :entity-id="entityId" class="device-overview__health" />
    </div>

    <div class="device-overview__footer">
      <div
        class="dev-card premium-glass-surface premium-glass-surface--elevated premium-backdrop device-overview__recent"
      >
        <div class="dev-card__header device-overview__recent-head">
          <div class="dev-card__title-row">
            <History class="w-4 h-4 dov-icon-info" />
            <span class="dev-card__title">{{ '最近动态' }}</span>
            <span v-if="recentPreview.length" class="device-overview__recent-count"
              >{{ recentPreview.length }} {{ '条' }}</span
            >
          </div>
          <button
            type="button"
            class="device-overview__link-btn"
            @click="$emit('navigate', 'history')"
          >
            {{ '查看全部' }}
          </button>
        </div>

        <div v-if="eventsLoading && !recentEvents.length" class="device-overview__recent-empty">
          <RefreshCw class="w-3.5 h-3.5 animate-spin opacity-50" />
          <span>{{ '加载中…' }}</span>
        </div>
        <div v-else-if="!recentPreview.length" class="device-overview__recent-empty">
          <span>{{ '近 7 天暂无状态变更' }}</span>
        </div>
        <ul v-else class="device-overview__recent-list">
          <li
            v-for="evt in recentPreview"
            :key="evt.id"
            class="device-overview__recent-item"
          >
            <span class="device-overview__recent-time">{{ formatListTime(evt.createdAt) }}</span>
            <span class="device-overview__recent-states">
              <code v-if="evt.oldState && !evt.attrText" class="device-overview__state-old">{{
                formatEventState(evt.oldState)
              }}</code>
              <span v-if="evt.oldState && !evt.attrText" class="device-overview__state-arrow"
                >→</span
              >
              <code class="device-overview__state-new">{{
                displayEventState({ ...evt, entityId })
              }}</code>
            </span>
          </li>
        </ul>
      </div>

      <div
        class="dev-card premium-glass-surface premium-glass-surface--elevated premium-backdrop device-overview__shortcuts"
      >
        <div class="dev-card__header">
          <div class="dev-card__title-row">
            <LayoutGrid class="w-4 h-4 dov-icon-violet" />
            <span class="dev-card__title">{{ '快捷入口' }}</span>
          </div>
        </div>
        <div class="device-overview__shortcut-grid">
          <button
            v-for="link in shortcutLinks"
            :key="link.id"
            type="button"
            class="device-overview__shortcut"
            @click="$emit('navigate', link.id)"
          >
            <component :is="link.icon" class="w-4 h-4" :class="link.iconClass" />
            <span class="device-overview__shortcut-label">{{ link.label }}</span>
            <span v-if="link.hint" class="device-overview__shortcut-hint">{{ link.hint }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 组件 Props
 * @property {string}  entityId             - 实体 ID（必填）
 * @property {boolean} visible              - 面板是否可见，默认 true
 * @property {boolean} controllable         - 是否可控，控制「控制设备」按钮显隐
 * @property {Array}   relatedEntities      - 相关功能实体列表 { id, name }
 * @property {number}  relatedEntitiesExtra - 额外相关实体数（超出展示部分，显示「还有 N 个」）
 * @property {boolean} hasAttrs             - 是否存在属性数据，控制属性区块显隐
 */
/**
 * 事件
 * @emits navigate  - 切换到指定子页签（'history' 等）
 * @emits control    - 打开设备控制面板
 * @emits copy-id    - 复制实体 ID
 */
import { formatRelativeFromNow } from '@/utils/format/locale-format.util'
import { computed } from 'vue'
import {
  Wifi,
  WifiOff,
  Battery,
  Clock,
  Activity,
  RefreshCw,
  Sparkles,
  History,
  LayoutGrid,
  BarChart3,
  LineChart,
  FileJson,
  Terminal,
  Link2,
  Lightbulb,
  Thermometer,
  Fan,
  Lock,
  Camera,
  Cpu,
} from '@lucide/vue'
import type { Component } from 'vue'
import { getEntityDomain, resolveEntityArea } from '@homeos/shared'
import { useEntitiesStore } from '@/stores/entities.store'
import { getDomainLabel } from '@/utils/device/domain-labels.util'
import { formatEntityAttrValue } from '@/utils/device/attr-format.util'
import { formatEntityAttrLabel } from '@/utils/device/entity-attr-labels.util'
import {
  displayClimateOperatingLabel,
  displayEntityStateLabel,
} from '@/constants/entity-state-labels'
import { displayEventState } from '@/utils/events/events-display.util'
import { formatAuditTimestamp, formatLocaleTime } from '@/utils/format/locale-format.util'
import { useDeviceOverview } from '@/composables/device/useDeviceOverview'
import DeviceHealthScore from '@/components/devices/DeviceHealthScore.vue'
import {
  HVAC_ACTION_LABELS,
  HVAC_MODE_LABELS,
} from '@/utils/device/attr-format.util'

const props = withDefaults(
  defineProps<{
    entityId: string
    visible?: boolean
    controllable?: boolean
    relatedEntities?: Array<{ id: string; name: string }>
    relatedEntitiesExtra?: number
    hasAttrs?: boolean
  }>(),
  {
    visible: true,
    controllable: false,
    relatedEntities: () => [],
    relatedEntitiesExtra: 0,
    hasAttrs: false,
  },
)

defineEmits<{
  navigate: [tab: string]
  control: []
  'copy-id': []
}>()

const entitiesStore = useEntitiesStore()
const visibleRef = computed(() => props.visible !== false)
const entityIdRef = computed(() => props.entityId)

const RECENT_PREVIEW_LIMIT = 4

const { usageLoading, eventsLoading, usageReport, recentEvents, recentTotal, refresh } =
  useDeviceOverview(entityIdRef, visibleRef)

/** 概览卡默认预览条数（与角标一致） */
const recentPreview = computed(() => recentEvents.value.slice(0, RECENT_PREVIEW_LIMIT))

const entity = computed(() => entitiesStore.entities[props.entityId] ?? null)
const domain = computed(() => getEntityDomain(props.entityId) || '')
const domainLabel = computed(() => getDomainLabel(domain.value))
const unavailable = computed(
  () => entity.value?.state === 'unavailable' || entity.value?.state === 'unknown',
)
const displayState = computed(() => {
  const state = entity.value?.state
  const d = domain.value
  if (d === 'climate' || d === 'water_heater') {
    return displayClimateOperatingLabel(
      state,
      entity.value?.attributes as Record<string, unknown> | undefined,
      HVAC_ACTION_LABELS,
      HVAC_MODE_LABELS,
    )
  }
  return displayEntityStateLabel(props.entityId, state)
})
const deviceClass = computed(() => {
  const dc = entity.value?.attributes?.device_class
  if (typeof dc !== 'string' || !dc.trim()) return ''
  return formatEntityAttrValue('device_class', dc).value
})

const batteryLevel = computed(() => {
  const v = entity.value?.attributes?.battery_level
  return typeof v === 'number' ? v : null
})

const batteryDisplay = computed(() => {
  if (batteryLevel.value != null) return `${batteryLevel.value}%`
  if (entity.value?.attributes?.battery) return '电池供电'
  return '—'
})

const batteryTone = computed((): 'green' | 'amber' | 'red' | null => {
  if (batteryLevel.value == null) return null
  if (batteryLevel.value <= 10) return 'red'
  if (batteryLevel.value <= 20) return 'amber'
  return 'green'
})

const toggleCount7d = computed(() => usageReport.value?.summary?.onCount ?? 0)

const DOMAIN_ICONS: Record<string, Component> = {
  light: Lightbulb,
  climate: Thermometer,
  fan: Fan,
  lock: Lock,
  camera: Camera,
}

const domainIcon = computed(() => DOMAIN_ICONS[domain.value] || Cpu)

function formatEventState(state: string) {
  return displayEntityStateLabel(props.entityId, state)
}

function formatListTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return formatLocaleTime(d, { hour: '2-digit', minute: '2-digit' })
  }
  return formatAuditTimestamp(iso)
}

const lastChangedLabel = computed(() => formatRelativeFromNow(entity.value?.last_changed))

const areaLabel = computed(() => {
  const area = resolveEntityArea(entity.value?.attributes)
  return area?.display || ''
})

const identityHint = computed(() => {
  if (unavailable.value) return '设备当前不可用，请检查连接或电源'
  if (domain.value === 'climate' || domain.value === 'water_heater') {
    const state = String(entity.value?.state || '').toLowerCase()
    const action = String(
      (entity.value?.attributes as Record<string, unknown> | undefined)?.hvac_action || '',
    ).toLowerCase()
    if (state && state !== 'off' && action === 'idle') {
      return '模式已开启；压缩机待机属间歇停机或未达持续制冷/制热条件'
    }
    if (state && state !== 'off' && (action === 'cooling' || action === 'heating')) {
      return '压缩机运转中，可在下方查看温度与风速'
    }
  }
  if (props.controllable) return '可直接下发控制，也可查看事件与用量'
  return '只读实体，状态由设备或集成自动上报'
})

const identityMeta = computed(() => {
  const rows = [
    { key: 'changed', label: '最近变更', value: lastChangedLabel.value },
    {
      key: 'toggle',
      label: '近7天切换',
      value: usageLoading.value ? '…' : `${toggleCount7d.value} 次`,
    },
    {
      key: 'events',
      label: '近期事件',
      value:
        eventsLoading.value && !recentPreview.value.length
          ? '…'
          : `${recentPreview.value.length} 条`,
    },
  ]
  // 无电量信息时不占位，避免底部被裁切成半行
  if (batteryDisplay.value !== '—') {
    rows.push({ key: 'battery', label: '电量', value: batteryDisplay.value })
  }
  return rows
})

/** 长 ID 中间省略，保留首尾便于辨认。 */
function shortenId(id: string, head = 12, tail = 8): string {
  if (id.length <= head + tail + 1) return id
  return `${id.slice(0, head)}…${id.slice(-tail)}`
}

/** 实体 ID：保留 domain，压缩 object_id。 */
function friendlyEntityId(entityId: string): string {
  const dot = entityId.indexOf('.')
  if (dot < 0) return shortenId(entityId)
  const domain = entityId.slice(0, dot)
  const objectId = entityId.slice(dot + 1)
  if (objectId.length <= 16) return entityId
  return `${domain}.${objectId.slice(0, 8)}…${objectId.slice(-6)}`
}

const detailRows = computed(() => {
  const attrs = entity.value?.attributes
  const rows: Array<{
    key: string
    label: string
    value: string
    display: string
    title?: string
    mono?: boolean
  }> = []

  const manufacturer = attrs?.manufacturer || attrs?.brand
  if (manufacturer) {
    const text = String(manufacturer)
    rows.push({ key: 'mfr', label: '品牌', value: text, display: text })
  }
  const model = attrs?.model
  if (model) {
    const text = String(model)
    rows.push({ key: 'model', label: '型号', value: text, display: text })
  }

  rows.push({
    key: 'entity',
    label: '实体标识',
    value: props.entityId,
    display: friendlyEntityId(props.entityId),
    title: props.entityId,
    mono: true,
  })

  const devId = attrs?.device_id
  if (typeof devId === 'string') {
    rows.push({
      key: 'device',
      label: '设备编号',
      value: devId,
      display: shortenId(devId, 10, 6),
      title: devId,
      mono: true,
    })
  }

  return rows
})

const HIGHLIGHT_KEYS_DEFAULT = [
  'brightness',
  'color_temp',
  'color_temp_kelvin',
  'current_temperature',
  'temperature',
  'humidity',
  'battery_level',
  'signal_strength',
  'rssi',
  'linkquality',
] as const

/** climate：温度 → 实际动作 → 风速；模式与顶部运行状态重复时跳过 */
const HIGHLIGHT_KEYS_CLIMATE = [
  'current_temperature',
  'temperature',
  'hvac_action',
  'fan_mode',
  'hvac_mode',
  'current_humidity',
  'humidity',
  'swing_mode',
] as const

/** 关键读数：按域消歧义（如 temperature=目标温度），避免「当前温度 / 温度」并列误导。 */
const highlightAttrs = computed(() => {
  const attrs = entity.value?.attributes as Record<string, unknown> | undefined
  if (!attrs) return []
  const d = domain.value
  const keys =
    d === 'climate' || d === 'water_heater' ? HIGHLIGHT_KEYS_CLIMATE : HIGHLIGHT_KEYS_DEFAULT
  const items: Array<{ key: string; label: string; value: string }> = []
  const seen = new Set<string>()
  const entityState = String(entity.value?.state || '').toLowerCase()

  for (const key of keys) {
    const raw = attrs[key]
    if (raw == null || raw === '') continue
    if (seen.has(key)) continue
    // state 已是设定模式时，不再重复占一格「运行模式」
    if (
      key === 'hvac_mode' &&
      (d === 'climate' || d === 'water_heater') &&
      String(raw).toLowerCase() === entityState
    ) {
      continue
    }
    seen.add(key)
    const formatted = formatEntityAttrValue(key, raw, attrs)
    items.push({
      key,
      label: formatEntityAttrLabel(key, { domain: d, attributes: attrs }).primary,
      value: formatted.chips?.length ? formatted.chips.join('、') : formatted.value,
    })
  }
  // climate 固定 4 格优先完整露出温度/动作/风速，避免半行裁切
  const limit = d === 'climate' || d === 'water_heater' ? 4 : 6
  return items.slice(0, limit)
})

const shortcutLinks = computed(() => {
  const links = [
    {
      id: 'history',
      label: '状态历史',
      icon: History,
      iconClass: 'dov-icon-info',
      hint: recentTotal.value ? `${recentTotal.value} 条` : undefined,
    },
    {
      id: 'refs',
      label: '功能引用',
      icon: Link2,
      iconClass: 'dov-icon-info',
      hint: undefined,
    },
    {
      id: 'calls',
      label: '调用记录',
      icon: Terminal,
      iconClass: 'dov-icon-info',
      hint: undefined,
    },
    {
      id: 'usage',
      label: '使用统计',
      icon: BarChart3,
      iconClass: 'dov-icon-violet',
      hint: toggleCount7d.value ? `${toggleCount7d.value} 次/7天` : undefined,
    },
    {
      id: 'analytics',
      label: '深度分析',
      icon: LineChart,
      iconClass: 'dov-icon-info',
      hint: undefined,
    },
  ]
  if (props.hasAttrs) {
    links.push({
      id: 'attrs',
      label: '实体属性',
      icon: FileJson,
      iconClass: 'dov-icon-warn',
      hint: undefined,
    })
  }
  return links
})

async function refreshEntity() {
  await entitiesStore.ensureEntity(props.entityId)
  await refresh()
}
</script>

<style src="./styles/DevicePanels.css"></style>
