<!--
  SwitchGroupPanel.vue / components/widgets/device
  开关分组面板：按房间/区域聚合 switch 域设备，分组「全开/全关」快捷按钮
  与单开关独立切换，支持 isPending 切换在途态视觉反馈。
  Props: 无显式入参，由外层 DOM 注入；按 entitiesStore 推断分组
  依赖：composables: useWidgetDeviceGroups('switch.') 自动分组
                      + useTogglePending 在途态
                      + useDeviceGroupRoomLabels 房名本地化；
        Pinia: useEntitiesStore 实时实体快照；
        notifyError 开关失败 toast；
        lucide: Power / PowerOff / Zap 图标。
  注意：分组名缺省时 fallback 为 uncategorized 键 labelForGroupKey。
-->
<template>
  <div class="sg-root">
    <div class="sg-header">
      <div class="sg-header-left">
        <Zap :class="['w-3.5 h-3.5', anyOn ? 'sg-icon-active' : 'sg-icon-idle']" />
        <span class="sg-title">{{ '开关组' }}</span>
      </div>
      <div class="sg-header-right">
        <span v-if="anyOn" class="sg-badge sg-badge--on">{{ `${onCount}/${totalCount} 开启` }}</span>
        <span v-else class="sg-badge sg-badge--off">{{ '全部关闭' }}</span>
      </div>
    </div>

    <div class="sg-body">
      <VEmptyState
        v-if="groups.length === 0"
        compact
        tone="neutral"
        icon="⚡"
        :title="'未发现开关/插座设备'"
      />

      <template v-else>
        <div class="sg-global">
          <button
            type="button"
            class="sg-global-btn sg-global-btn--on"
            @click="batchAction('turn_on')"
          >
            <Power class="w-3.5 h-3.5" />
            <span>{{ '全部开启' }}</span>
          </button>
          <button
            type="button"
            class="sg-global-btn sg-global-btn--off"
            @click="batchAction('turn_off')"
          >
            <PowerOff class="w-3.5 h-3.5" />
            <span>{{ '全部关闭' }}</span>
          </button>
        </div>

        <div v-for="group in groups" :key="group.key" class="sg-group">
          <div class="sg-group-header">
            <div class="sg-group-label-wrap">
              <span class="sg-group-label">{{ group.label }}</span>
              <span
                :class="['sg-group-count', group.onCount > 0 && 'sg-group-count--active']"
              >
                {{ `${group.onCount}/${group.switches.length}` }}
              </span>
            </div>
            <div class="sg-group-actions">
              <button
                type="button"
                class="sg-group-btn"
                @click="batchAction('turn_on', group.switches)"
              >
                {{ '开' }}
              </button>
              <button
                type="button"
                class="sg-group-btn"
                @click="batchAction('turn_off', group.switches)"
              >
                {{ '关' }}
              </button>
            </div>
          </div>

          <div class="sg-group-list">
            <div
              v-for="sw in group.switches"
              :key="sw.entity_id"
              :class="[
                'sg-item',
                sw.isOn && 'sg-item--on',
                isPending(sw.entity_id) && 'sg-item--pending',
              ]"
            >
              <div class="sg-item-info">
                <div :class="['sg-item-glyph', sw.isOn && 'sg-item-glyph--on']">
                  <Zap class="sg-item-glyph-icon" />
                </div>
                <div class="sg-item-detail">
                  <span class="sg-item-name">{{ sw.name }}</span>
                  <span v-if="sw.power !== null" class="sg-item-power">{{ sw.power }} W</span>
                </div>
              </div>
              <button
                type="button"
                :class="['sg-toggle', sw.isOn ? 'sg-toggle--on' : 'sg-toggle--off']"
                :aria-label="sw.isOn ? `关闭 ${sw.name}` : `开启 ${sw.name}`"
                @click="toggleSwitch(sw)"
              >
                <span class="sg-toggle-dot" />
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
/**
 * 智能开关/排插分组控制面板
 *
 * 功能：
 * 1. 按房间自动分组 switch.* 实体
 * 2. 全局一键全开/全关
 * 3. 分组批量操作
 * 4. 单个开关切换（原生 iOS 风格 toggle）
 * 5. 关联功率显示
 *
 * 从 entitiesStore 扫描所有 switch.* 实体
 */
import { computed } from 'vue'
import { Power, PowerOff, Zap } from '@lucide/vue'

import { useEntitiesStore } from '@/stores/entities.store'
import { useWidgetDeviceGroups } from '@/composables/entity/useWidgetDeviceGroups'
import { useTogglePending } from '@/composables/entity/useTogglePending'

import {
  inferDeviceGroupRoom,
  useDeviceGroupRoomLabels,
} from '@/composables/entity/useDeviceGroupRooms'
import { notifyError } from '@/services/notify'
import { getEntityDisplayName } from '@/utils/entity/derived.util'

const es = useEntitiesStore()
const { isPending, withPending } = useTogglePending()
const { labelForGroupKey } = useDeviceGroupRoomLabels()
const otherRoomLabel = computed(() => labelForGroupKey('other'))
const inferRoom = (entityId, name) => inferDeviceGroupRoom(entityId, name, 'other')

/** O(1) 关联功率：优先精确 entity_id，避免全表 includes 扫描 */
function findPower(baseId) {
  const candidates = [
    `sensor.${baseId}_power`,
    `sensor.${baseId}_electric_power`,
    `sensor.${baseId}_energy`,
  ]
  for (const key of candidates) {
    const entity = es.entities[key]
    if (!entity || entity.state === 'unavailable') continue
    const v = parseFloat(entity.state)
    if (!Number.isNaN(v)) return Math.round(v)
  }
  return null
}

function isOutletSwitch(entityId, entity) {
  const name = getEntityDisplayName(entityId, entity).toLowerCase()
  if (name.includes('灯') && !name.includes('插座') && !name.includes('排插')) return false
  return true
}

function buildSwitch(entityId) {
  const entity = es.entities[entityId]
  if (!entity || entity.state === 'unavailable') return null
  if (!isOutletSwitch(entityId, entity)) return null
  const baseId = entityId.slice(7) // 'switch.'.length
  return {
    entity_id: entityId,
    name: getEntityDisplayName(entityId, entity),
    isOn: entity.state === 'on',
    power: findPower(baseId),
  }
}

const { groups: rawGroups } = useWidgetDeviceGroups('switch.', inferRoom)

const groups = computed(() => {
  void es.getDomainEpoch('switch')
  const otherLabel = otherRoomLabel.value
  const built = rawGroups.value
    .map((g) => {
      const switches = g.entityIds.map(buildSwitch).filter(Boolean)
      const on = switches.reduce((n, s) => n + (s.isOn ? 1 : 0), 0)
      const roomKey = g.key || g.label
      return {
        key: g.configured ? `cfg:${g.label}` : roomKey,
        label: g.configured ? g.label : labelForGroupKey(g.label),
        configured: g.configured,
        switches,
        onCount: on,
      }
    })
    .filter((g) => g.switches.length > 0)

  return built.sort((a, b) => {
    if (a.configured !== b.configured) return a.configured ? -1 : 1
    if (a.label === otherLabel) return 1
    if (b.label === otherLabel) return -1
    return 0
  })
})

const totalCount = computed(() => groups.value.reduce((n, g) => n + g.switches.length, 0))
const onCount = computed(() => groups.value.reduce((n, g) => n + g.onCount, 0))
const anyOn = computed(() => onCount.value > 0)
const allSwitches = computed(() => groups.value.flatMap((g) => g.switches))


async function batchAction(action, targets) {
  const list = targets || allSwitches.value
  await Promise.all(
    list.map(async (sw) => {
      try {
        await es.callService('switch', action, sw.entity_id)
      } catch (e) {
        notifyError(e, '开关批量控制')
      }
    }),
  )
}

async function toggleSwitch(sw) {
  const action = sw.isOn ? 'turn_off' : 'turn_on'
  await withPending(sw.entity_id, async () => {
    try {
      await es.callService('switch', action, sw.entity_id)
    } catch (e) {
      notifyError(e, '开关控制')
    }
  })
}
</script>

<style scoped src="./styles/SwitchGroupPanel.css"></style>
