<template>
  <!-- 仅在 stats 存在时渲染（stats 由父组件通过 useDeviceGroupOffline 计算） -->
  <template v-if="stats">
    <!-- 严重告警区：展示严重离线设备卡片网格 -->
    <div v-if="stats.critical.length > 0" class="dgm-section">
      <div class="dgm-section-head">
        <h3 class="dgm-section-title dgm-section-title--danger">{{ '严重告警' }}</h3>
        <span class="dgm-section-count">{{ stats.critical.length }}</span>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div v-for="eid in stats.critical" :key="eid" class="dgm-offline-card">
          <!-- 顶部行：实体域标签与告警脉冲点 -->
          <div class="dgm-offline-top">
            <span class="dgm-offline-domain">{{ getEntityDomain(eid) }}</span>
            <div class="dgm-offline-glow-dot" />
          </div>
          <div class="dgm-offline-icon-wrap">
            <component :is="offlineIcon(eid)" class="w-6 h-6 dgm-icon-danger" />
          </div>
          <h3 class="dgm-offline-name">{{ getEntityDisplayName(eid, getEntity(eid)) }}</h3>
          <p class="dgm-offline-reason">{{ offlineReason(eid) }}</p>
          <!-- 底部行：离线时长与「离线」徽标 -->
          <div class="dgm-offline-foot">
            <span class="dgm-offline-time">{{ timeAgo(eid) }}</span>
            <span class="dgm-offline-badge">{{ '离线' }}</span>
          </div>
        </div>
      </div>
    </div>
    <!-- 系统审计区：次要连接问题列表，可由用户展开/收起 -->
    <div v-if="stats.others.length > 0 && showAudit" class="dgm-section dgm-audit-section">
      <div class="dgm-audit-list">
        <div v-for="eid in stats.others" :key="eid" class="dgm-audit-item">
          <div class="dgm-audit-icon">
            <component :is="offlineIcon(eid)" class="w-4 h-4 dgm-icon-audit" />
          </div>
          <div class="dgm-audit-text">
            <span class="dgm-audit-name">{{ getEntityDisplayName(eid, getEntity(eid)) }}</span>
            <span class="dgm-audit-id">{{ eid }}</span>
          </div>
          <span class="dgm-audit-reason">{{ shortReason(eid) }}</span>
        </div>
      </div>
    </div>
  </template>
</template>

<script setup>
/**
 * @file DeviceGroupOfflinePanel.vue
 * @module components/entities/device-group
 * @description 设备群组离线状态面板
 *
 * 职责：
 * - 按「严重告警」「系统审计」两个分组展示离线设备
 * - 严重告警：以卡片网格形式展示，含域标签、脉冲告警点、离线原因与时长
 * - 系统审计：以紧凑列表形式展示次要连接问题，可由父组件控制展开/收起
 *
 * 依赖：
 * - @homeos/shared 的 getEntityDomain 用于从 entity_id 解析域
 * - @/utils/entity/derived.util 的 getEntityDisplayName 用于渲染友好名称
 * - 父组件通过 props 传入 stats、各类回调函数（offlineIcon/offlineReason/shortReason/timeAgo/getEntity）
 *
 * 使用场景：
 * - DeviceGroupModal 在 domain === 'offline' 时渲染此面板
 */
import { getEntityDomain } from '@homeos/shared'
import { getEntityDisplayName } from '@/utils/entity/derived.util'

/**
 * 组件 Props 定义
 * @property {Object|null} stats - 离线统计对象，包含 critical（严重）与 others（次要）两个 entity_id 数组
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
 * 双向绑定：是否展开「系统审计」分组
 * 通过 defineModel 与父组件 v-model:show-audit 同步状态
 * @type {import('vue').ModelRef<boolean>}
 */
const showAudit = defineModel('showAudit', { type: Boolean, default: true })
</script>

<style scoped>
.dgm-icon-danger {
  color: var(--set-danger, #fda4af);
}
.dgm-icon-audit {
  color: var(--set-text-tertiary);
}
</style>