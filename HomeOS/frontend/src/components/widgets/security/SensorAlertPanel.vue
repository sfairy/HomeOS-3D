<!--
  SensorAlertPanel.vue / components/widgets/security
  安全传感器告警面板：扫描 entitiesStore 中所有安全相关实体（烟感、水浸、
  燃气、门窗等），按关键词匹配分组展示实时正常/告警状态，用于浮动图层或安防 Hub。
  Props: embedded 嵌入态显示紧凑徽章 / zones 区域过滤数组
         / config 布局附加配置
  依赖：@homeos/shared buildHazardBindingMap 构建危害类型绑定映射；
        Pinia: useEntitiesStore 实时实体快照 + useLayoutStore；
        lucide: Activity / Flame / Droplets / Wind 四类图标；
        derived.util getEntityDisplayName 名称展示。
  注意：sensor.alert 状态来自绑定映射的关键词匹配；无 zone 过滤时展示全局总数。
-->
<template>
  <div :class="['sa-root', embedded && 'sa-root--embedded']">
    <div v-if="!embedded" class="sa-header">
      <div class="sa-header-left">
        <Activity class="w-3.5 h-3.5" :class="hasAlerts ? 'sa-icon-alert' : 'sa-icon-ok'" />
        <span class="sa-title">{{ '安全传感器' }}</span>
      </div>
      <div v-if="totalCount > 0" class="sa-header-right">
        <span v-if="alertCount > 0" class="sa-badge sa-badge--alert">{{
          `${alertCount} 告警`
        }}</span>
        <span v-else class="sa-badge sa-badge--ok">{{ `${totalCount} 正常` }}</span>
      </div>
    </div>

    <div v-if="embedded && totalCount > 0" class="sa-embed-meta">
      <span v-if="alertCount > 0" class="sa-badge sa-badge--alert">{{
        `${alertCount} 告警`
      }}</span>
      <span v-else class="sa-badge sa-badge--ok">{{ `${totalCount} 正常` }}</span>
    </div>

    <div class="sa-body">
      <VEmptyState
        v-if="totalCount === 0"
        compact
        tone="rose"
        icon="🛡"
        :title="'未发现安全传感器'"
      />

      <template v-else>
        <div v-for="group in sensorGroups" :key="group.type" class="sa-group">
          <div class="sa-group-header">
            <component :is="group.icon" :class="['w-3 h-3', group.iconColor]" />
            <span class="sa-group-name">{{ group.label }}</span>
            <span class="sa-group-count">{{ group.alertCount }}/{{ group.items.length }}</span>
          </div>

          <div v-for="sensor in group.items" :key="sensor.entity_id" class="sa-item">
            <div :class="['sa-dot', sensor.alert ? 'sa-dot--alert' : 'sa-dot--ok']" />
            <span class="sa-item-name" :title="sensor.entity_id">
              {{ sensor.name }}
              <span v-if="sensor.bound" class="sa-item-bound">{{ '绑定' }}</span>
            </span>
            <span
              :class="[
                'sa-item-state',
                sensor.alert ? 'sa-item-state--alert' : 'sa-item-state--ok',
              ]"
            >
              {{ sensor.alert ? '告警' : '正常' }}
            </span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 安全传感器告警面板（浮动图层版）
 *
 * 扫描 entitiesStore 中所有安全相关传感器，按关键词匹配分类展示实时状态。
 */
import { computed } from 'vue'
import { Activity, Flame, Droplets, Wind } from '@lucide/vue'
import { buildHazardBindingMap, getEntityLeaf } from '@homeos/shared'
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'
import { getEntityDisplayName } from '@/utils/entity/derived.util'

const props = defineProps({
  embedded: { type: Boolean, default: false },
  zones: { type: Array, default: () => [] },
  config: { type: Object, default: () => ({}) },
})

const es = useEntitiesStore()
const layoutStore = useLayoutStore()

const SMOKE_KEYS = ['smoke', '烟雾', 'smoke_detector', '烟感']
const GAS_KEYS = ['gas', 'methane', '燃气', '甲烷', '天然气']
const LEAK_KEYS = ['leak', 'moisture', '漏水', '水浸']
const CO_KEYS = ['co', 'carbon_monoxide', '一氧化碳']

function matchKeys(id: string, name: string, keys: string[]) {
  const lowerId = id.toLowerCase()
  const lowerName = (name || '').toLowerCase()
  return keys.some((k) => lowerId.includes(k) || lowerName.includes(k))
}

const allowedSensorIds = computed(() => {
  const zones = props.zones?.length ? props.zones : props.config?.zones || []
  if (!zones.length) return null
  const ids = new Set()
  for (const z of zones) {
    for (const s of z.sensors || []) ids.add(s)
  }
  return ids.size > 0 ? ids : null
})

const sensorGroups = computed(() => {
  void es.derivedEpoch
  void es.getDomainEpoch('binary_sensor')
  void es.getDomainEpoch('sensor')
  void layoutStore.layoutConfig.haConfig
  const entities = es.entities
  const bindingMap = buildHazardBindingMap(layoutStore.layoutConfig.haConfig || {})
  const groups = {
    smoke: {
      type: 'smoke',
      label: '烟感',
      icon: Flame,
      iconColor: 'sa-icon-smoke',
      items: [] as Array<{ entity_id: string; name: string; alert: boolean; bound: boolean }>,
    },
    gas: {
      type: 'gas',
      label: '燃气',
      icon: Wind,
      iconColor: 'sa-icon-gas',
      items: [] as Array<{ entity_id: string; name: string; alert: boolean; bound: boolean }>,
    },
    leak: {
      type: 'leak',
      label: '水浸',
      icon: Droplets,
      iconColor: 'sa-icon-leak',
      items: [] as Array<{ entity_id: string; name: string; alert: boolean; bound: boolean }>,
    },
    co: {
      type: 'co',
      label: 'CO',
      icon: Wind,
      iconColor: 'sa-icon-co',
      items: [] as Array<{ entity_id: string; name: string; alert: boolean; bound: boolean }>,
    },
  }
  const seen = new Set<string>()

  function pushItem(entityId: string, bound: boolean) {
    if (!entityId || seen.has(entityId)) return
    if (allowedSensorIds.value && !allowedSensorIds.value.has(entityId)) return
    seen.add(entityId)
    const entity = entities[entityId]
    if (!bound && (!entity || entity.state === 'unavailable')) return
    const id = entityId.toLowerCase()
    if (!id.startsWith('binary_sensor.') && !id.startsWith('sensor.')) return
    const name = entity
      ? getEntityDisplayName(entityId, entity)
      : getEntityLeaf(entityId)
    const boundKind = bindingMap.get(entityId)
    let group = null
    if (boundKind) {
      group = groups[boundKind === 'gas' ? 'gas' : boundKind]
    } else if (matchKeys(id, name, SMOKE_KEYS)) group = groups.smoke
    else if (matchKeys(id, name, GAS_KEYS)) group = groups.gas
    else if (matchKeys(id, name, LEAK_KEYS)) group = groups.leak
    else if (matchKeys(id, name, CO_KEYS)) group = groups.co
    if (!group) return
    const state = entity?.state
    const isAlert = state === 'on' || (state && state !== 'off' && parseFloat(String(state)) > 0)
    group.items.push({
      entity_id: entityId,
      name: name || entityId.split('.')[1] || entityId,
      alert: !!isAlert,
      bound: bound || !!boundKind,
    })
  }

  for (const entityId of bindingMap.keys()) pushItem(entityId, true)

  for (const [entityId, entity] of Object.entries(entities)) {
    if (!entity || entity.state === 'unavailable') continue
    pushItem(entityId, false)
  }

  return Object.values(groups)
    .filter((g) => g.items.length > 0)
    .map((g) => ({
      ...g,
      items: g.items.sort(
        (a, b) => Number(b.bound) - Number(a.bound) || a.name.localeCompare(b.name, 'zh-CN'),
      ),
      alertCount: g.items.filter((i) => i.alert).length,
    }))
})

const totalCount = computed(() => sensorGroups.value.reduce((s, g) => s + g.items.length, 0))
const alertCount = computed(() => sensorGroups.value.reduce((s, g) => s + g.alertCount, 0))
const hasAlerts = computed(() => alertCount.value > 0)
</script>

<style scoped src="./styles/SensorAlertPanel.css"></style>
