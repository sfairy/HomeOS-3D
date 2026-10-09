<!--
组件：HazardBindingStatusPanel.vue
所属模块：frontend / src / views / settings / connect / bindings
职责：安全绑定实体状态面板。展示已绑定探测器/阀门/排风实体的当前状态（告警/离线/正常），
      并确保相关实体可见以获取实时状态。
关键依赖：
  - useHazardBindingStatus：派生状态行与告警/离线计数
  - useEnsureVisibleEntities：确保实体在可见集合中以获取状态
数据来源：父级透传的各 hazard 实体 id 列表 + composable 派生
-->
<template>
  <section v-if="rows.length" class="hazard-status-panel">
    <header class="hazard-status-panel__head">
      <span class="hazard-status-panel__title">{{ '绑定实体状态' }}</span>
      <span v-if="alertCount" class="hazard-status-panel__badge hazard-status-panel__badge--alert">
        {{ `${alertCount} 告警` }}
      </span>
      <span
        v-else-if="offlineCount"
        class="hazard-status-panel__badge hazard-status-panel__badge--offline"
      >
        {{ `${offlineCount} 离线` }}
      </span>
      <span v-else class="hazard-status-panel__badge hazard-status-panel__badge--ok">{{
        '全部正常'
      }}</span>
    </header>
    <ul class="hazard-status-panel__list">
      <li
        v-for="row in rows"
        :key="`${row.kind}-${row.entityId}`"
        :class="['hazard-status-row', `hazard-status-row--${row.status}`]"
      >
        <span class="hazard-status-row__kind">{{ row.kindLabel }}</span>
        <span class="hazard-status-row__name" :title="row.entityId">{{ row.name }}</span>
        <span :class="['hazard-status-row__state', `hazard-status-row__state--${row.status}`]">
          {{ row.statusLabel }}
        </span>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useEnsureVisibleEntities } from '@/composables/entity/useEnsureVisibleEntities'
import { useHazardBindingStatus } from '@/composables/security/useHazardBindingStatus'

// 入参：各 hazard 探测器/阀门/排风实体 id 列表
const props = defineProps({
  hazardSmokeEntityIds: { type: Array, default: () => [] },
  hazardGasEntityIds: { type: Array, default: () => [] },
  hazardLeakEntityIds: { type: Array, default: () => [] },
  hazardGasValveEntityId: { type: String, default: '' },
  hazardWaterValveEntityId: { type: String, default: '' },
  hazardExhaustFanEntityIds: { type: String, default: '' },
})

// 聚合为 hazard 配置对象，供 composable 派生状态
const config = computed(() => ({
  hazardSmokeEntityIds: props.hazardSmokeEntityIds,
  hazardGasEntityIds: props.hazardGasEntityIds,
  hazardLeakEntityIds: props.hazardLeakEntityIds,
  hazardGasValveEntityId: props.hazardGasValveEntityId,
  hazardWaterValveEntityId: props.hazardWaterValveEntityId,
  hazardExhaustFanEntityIds: props.hazardExhaustFanEntityIds,
}))

const { rows, alertCount, offlineCount, watchedIds } = useHazardBindingStatus(config)
// 确保被监听实体在可见集合中，以便获取实时状态
useEnsureVisibleEntities(watchedIds)
</script>

<style scoped src="./styles/HazardBindingStatusPanel.css"></style>
