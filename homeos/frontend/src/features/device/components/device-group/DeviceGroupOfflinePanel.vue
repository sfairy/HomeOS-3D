<template>
  <!-- 仅在 stats 存在时渲染（stats 由父组件通过 useDeviceGroupOffline 计算） -->
  <!-- critical / others 都是**设备**分组（`OfflineDeviceGroup`），一台设备一条； -->
  <!-- `entityIds` 保留该设备下的全部离线实体，供「另有 N 个实体」明细与 tooltip 使用。 -->
  <template v-if="stats">
    <div v-if="stats.critical.length > 0" class="dgm-section">
      <div class="dgm-section-head">
        <h3 class="dgm-section-title dgm-section-title--danger">{{ '严重告警' }}</h3>
        <span class="dgm-section-count">{{ stats.critical.length }}</span>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div v-for="group in stats.critical" :key="group.deviceKey" class="dgm-offline-card">
          <div class="dgm-offline-top">
            <span class="dgm-offline-domain">{{ getEntityDomain(group.entityId) }}</span>
            <div class="dgm-offline-glow-dot" />
          </div>
          <div class="dgm-offline-icon-wrap">
            <component :is="offlineIcon(group.entityId)" class="w-6 h-6 dgm-icon-danger" />
          </div>
          <h3 class="dgm-offline-name">{{ getEntityDisplayName(group.entityId, getEntity(group.entityId)) }}</h3>
          <!-- 「可能原因」限定措辞：这段文案只按 domain 查表，没有任何诊断证据。
               直接写成结论时，路由器的软件开关也会显示「电源故障？」，把人引去查电源。 -->
          <p class="dgm-offline-reason">可能原因：{{ offlineReason(group.entityId) }}</p>
          <div class="dgm-offline-foot">
            <span class="dgm-offline-time">{{ timeAgo(group.entityId) }}</span>
            <span class="dgm-offline-badge">{{ '离线' }}</span>
          </div>
        </div>
      </div>
    </div>
    <div v-if="stats.others.length > 0 && showAudit" class="dgm-section dgm-audit-section">
      <div class="dgm-audit-list">
        <div v-for="group in stats.others" :key="group.deviceKey" class="dgm-audit-item">
          <div class="dgm-audit-icon">
            <component :is="offlineIcon(group.entityId)" class="w-4 h-4 dgm-icon-audit" />
          </div>
          <div class="dgm-audit-text">
            <span class="dgm-audit-name">{{ getEntityDisplayName(group.entityId, getEntity(group.entityId)) }}</span>
            <span class="dgm-audit-id">{{ auditSubtitle(group) }}</span>
          </div>
          <!-- 集成名：设备掉线时唯一可操作的线索 —— 指向「去 HA 里看哪个集成」。
               没有它，用户只能逐条去 HA 里翻实体找归属。 -->
          <span v-if="integration(group.entityId)" class="dgm-audit-platform" :title="`集成：${integration(group.entityId)}`">
            {{ integration(group.entityId) }}
          </span>
          <!-- 故障性质：按该设备**全部实体**的状态算出，区分「整台离线」与「部分失效」。 -->
          <span class="dgm-audit-state" :data-tone="offlineState(group.entityIds).tone">
            {{ offlineState(group.entityIds).label }}
          </span>
          <span class="dgm-audit-reason">{{ timeAgo(group.entityId) }}</span>
        </div>
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
/** - 按「严重告警」「系统审计」两个分组展示离线设备（按设备聚合，一台一条） */
import { getEntityDomain } from '@homeos/shared'
import { getEntityDisplayName } from '@/domain/entity/model/utils/derived.util'
import type { OfflineDeviceGroup } from '@/domain/entity/model/utils/group-offline.util'

/**
 * 组件 Props 定义
 * @property {Object|null} stats - 离线统计对象，critical（严重）/ others（次要）均为**设备**分组
 * @property {Function} getEntity - 由父组件传入的实体查询函数，根据 entity_id 返回实体对象
 * @property {Function} offlineIcon - 根据 entity_id 返回对应域的图标组件
 * @property {Function} offlineReason - 根据 entity_id 返回「可能原因」文案（启发式提示，非诊断结论）
 * @property {Function} offlineState - 按设备实体集合返回故障性质 { label, tone }
 * @property {Function} integration - 返回实体所属集成名（platform）
 * @property {Function} timeAgo - 根据 entity_id 返回离线时长（last_changed 的相对时间）
 */
defineProps({
  stats: { type: Object, default: null },
  getEntity: { type: Function, required: true },
  offlineIcon: { type: Function, required: true },
  offlineReason: { type: Function, required: true },
  offlineState: { type: Function, required: true },
  integration: { type: Function, required: true },
  timeAgo: { type: Function, required: true },
})

/**
 * 审计行的副标题：一台设备多个实体时写出代表实体 id 与总数。
 *
 * 只写代表实体 id 会让人以为「这台就一个实体离线」；把总数写出来，
 * 排查时才知道还有几条要看。
 */
function auditSubtitle(group: OfflineDeviceGroup): string {
  if (group.entityIds.length <= 1) return group.entityId
  return `${group.entityId} 等 ${group.entityIds.length} 个实体`
}

/**
 * 通过 defineModel 与父组件 v-model:show-audit 同步状态
 * @type {import('vue').ModelRef<boolean>}
 */
const showAudit = defineModel('showAudit', { type: Boolean, default: true })
</script>

<style scoped>
.dgm-icon-danger {
  color: var(--hos-color-danger-text);
}
.dgm-icon-audit {
  color: var(--hos-fg-3);
}
</style>