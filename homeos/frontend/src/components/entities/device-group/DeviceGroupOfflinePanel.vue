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
          <p class="dgm-offline-reason">{{ offlineReason(group.entityId) }}</p>
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
          <span class="dgm-audit-reason">{{ shortReason(group.entityId) }}</span>
        </div>
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
/** - 按「严重告警」「系统审计」两个分组展示离线设备（按设备聚合，一台一条） */
import { getEntityDomain } from '@homeos/shared'
import { getEntityDisplayName } from '@/shared/entity/utils/derived.util'
import type { OfflineDeviceGroup } from '@/shared/device/utils/group-offline.util'

/**
 * 组件 Props 定义
 * @property {Object|null} stats - 离线统计对象，critical（严重）/ others（次要）均为**设备**分组
 * @property {Function} getEntity - 由父组件传入的实体查询函数，根据 entity_id 返回实体对象
 * @property {Function} offlineIcon - 根据 entity_id 返回对应域的图标组件
 * @property {Function} offlineReason - 根据 entity_id 返回完整的离线原因描述
 * @property {Function} shortReason - 根据 entity_id 返回简短的离线原因（用于审计列表）
 * @property {Function} timeAgo - 根据 entity_id 返回离线时长的友好表达（如「5 分钟前」）
 */
defineProps({
  stats: { type: Object, default: null },
  getEntity: { type: Function, required: true },
  offlineIcon: { type: Function, required: true },
  offlineReason: { type: Function, required: true },
  shortReason: { type: Function, required: true },
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