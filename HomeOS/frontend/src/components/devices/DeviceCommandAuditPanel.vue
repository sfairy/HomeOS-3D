<!--
  @file DeviceCommandAuditPanel.vue
  @module 设备详情/调用记录面板
  @description 设备详情页的"调用记录"子面板：展示对该实体发起的服务调用历史（时间、用户、服务、结果、说明）。
               仅管理员可查看；支持分页与刷新。数据由 useDeviceCommandAudit 组合式函数提供，
               组件本身仅负责展示与分页交互。
  @dependencies vue（computed/withDefaults）、@lucide/vue、useDeviceCommandAudit。
-->
<template>
  <div class="device-detail-tab device-calls-tab">
    <div
      v-if="isAdmin && !loading && logs.length"
      class="dev-metric-grid device-detail-tab__metrics device-detail-tab__metrics--3"
    >
      <div class="dev-metric">
        <div class="dev-metric__icon"><ScrollText class="w-4 h-4" /></div>
        <div>
          <div class="dev-metric__value">{{ total }}</div>
          <div class="dev-metric__label">{{ '调用总数' }}</div>
        </div>
      </div>
      <div class="dev-metric">
        <div class="dev-metric__icon dev-metric__icon--green"><CheckCircle2 class="w-4 h-4" /></div>
        <div>
          <div class="dev-metric__value">{{ successCount }}</div>
          <div class="dev-metric__label">{{ '本页成功' }}</div>
        </div>
      </div>
      <div class="dev-metric">
        <div class="dev-metric__icon dev-metric__icon--red"><XCircle class="w-4 h-4" /></div>
        <div>
          <div class="dev-metric__value">{{ failCount }}</div>
          <div class="dev-metric__label">{{ '本页失败' }}</div>
        </div>
      </div>
    </div>

    <div
      class="dev-card premium-glass-surface premium-glass-surface--elevated premium-backdrop device-detail-tab__card device-calls-panel"
    >
      <div class="dev-card__header">
        <div class="dev-card__title-row">
          <Terminal class="w-4 h-4 dca-icon-info" />
          <span class="dev-card__title">{{ '调用记录' }}</span>
          <span v-if="isAdmin && total > 0" class="device-calls-panel__count">{{ total }} 条</span>
        </div>
        <div class="device-calls-panel__actions">
          <button
            v-if="isAdmin"
            type="button"
            class="dev-btn-refresh"
            :disabled="loading"
            :aria-label="'刷新'"
            :title="'刷新'"
            @click="refresh()"
          >
            <RefreshCw :class="['w-3 h-3', loading && 'animate-spin']" />
          </button>
        </div>
      </div>

      <p class="device-calls-panel__hint">
        {{ '经 /services/call 对该实体发起的控制命令（谁调用了什么服务、成功与否）' }}
      </p>

      <!-- 非管理员：无权限提示 -->
      <div v-if="!isAdmin" class="dev-state-block device-detail-tab__fallback">
        <ShieldAlert class="w-4 h-4 opacity-50" />
        <span>{{ '仅管理员可查看实体调用记录' }}</span>
      </div>

      <!-- 加载中（且无缓存数据）：展示加载动画 -->
      <div v-else-if="loading && !logs.length" class="dev-state-block device-detail-tab__fallback">
        <RefreshCw class="w-4 h-4 animate-spin" />
        <span>{{ '加载调用记录…' }}</span>
      </div>

      <!-- 加载出错：展示错误信息与重试按钮 -->
      <div
        v-else-if="error"
        class="dev-state-block dev-state-block--error device-detail-tab__fallback"
      >
        <AlertCircle class="w-4 h-4" />
        <span>{{ error }}</span>
        <button type="button" class="dev-range__btn" @click="refresh()">{{ '重试' }}</button>
      </div>

      <!-- 空数据：无调用记录提示 -->
      <div v-else-if="!logs.length" class="dev-state-block device-detail-tab__fallback">
        <Terminal class="w-4 h-4 opacity-40" />
        <span>{{ '暂无对该实体的服务调用记录' }}</span>
      </div>

      <!-- 数据表格区：调用记录表 + 分页器 -->
      <div v-else class="device-calls-panel__body">
        <div class="device-calls-panel__table-wrap">
          <table class="device-calls-panel__table">
            <thead>
              <tr>
                <th>{{ '时间' }}</th>
                <th>{{ '用户' }}</th>
                <th>{{ '服务' }}</th>
                <th>{{ '结果' }}</th>
                <th>{{ '说明' }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, idx) in logs" :key="row.id || `${row.createdAt}-${idx}`">
                <td class="device-calls-panel__time">{{ formatAuditTime(row.createdAt) }}</td>
                <td>
                  <span class="device-calls-panel__user">{{ row.username || '—' }}</span>
                  <span v-if="row.role" class="device-calls-panel__role">{{ row.role }}</span>
                </td>
                <td class="device-calls-panel__service">
                  <code>{{ row.domain }}.{{ row.service }}</code>
                </td>
                <td>
                  <span
                    :class="[
                      'device-calls-panel__badge',
                      row.success
                        ? 'device-calls-panel__badge--ok'
                        : 'device-calls-panel__badge--fail',
                    ]"
                  >
                    {{ row.success ? '成功' : '失败' }}
                  </span>
                </td>
                <td class="device-calls-panel__error" :title="row.error || ''">
                  {{ row.error || '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 分页器：仅多页时展示上一页/下一页与当前页码 -->
        <footer v-if="totalPages > 1" class="device-calls-panel__pager">
          <button
            type="button"
            class="dev-range__btn"
            :disabled="loading || page <= 1"
            @click="goPage(page - 1)"
          >
            {{ '上一页' }}
          </button>
          <span class="device-calls-panel__pager-label">{{ page }} / {{ totalPages }}</span>
          <button
            type="button"
            class="dev-range__btn"
            :disabled="loading || page >= totalPages"
            @click="goPage(page + 1)"
          >
            {{ '下一页' }}
          </button>
        </footer>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  ScrollText,
  ShieldAlert,
  Terminal,
  XCircle,
} from '@lucide/vue'
import { useDeviceCommandAudit } from '@/composables/device/useDeviceCommandAudit'

// 组件属性：entityId 必填，visible 控制面板可见性（影响是否加载数据）。
const props = withDefaults(
  defineProps<{
    entityId: string
    visible?: boolean
  }>(),
  { visible: true },
)

// 计算属性：将 entityId 转为响应式引用，供组合式函数监听变化自动刷新。
const entityIdRef = computed(() => props.entityId)
// 计算属性：visible 默认 true，转显式布尔引用。
const visibleRef = computed(() => props.visible !== false)

const {
  isAdmin,
  loading,
  error,
  logs,
  page,
  totalPages,
  total,
  successCount,
  failCount,
  refresh,
  goPage,
  formatAuditTime,
// 调用记录组合式函数：返回管理员态、加载/错误状态、日志列表、分页与格式化方法。
// visibleRef 用于在面板不可见时暂停请求，节省资源。
} = useDeviceCommandAudit(entityIdRef, visibleRef)
</script>

<style scoped src="./styles/DeviceCommandAuditPanel.css"></style>
