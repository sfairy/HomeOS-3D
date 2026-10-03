<template>
  <div class="cl-root">
    <!-- 头部：非嵌入模式下展示标题与启用状态徽标 -->
    <div v-if="!embedded" class="cl-header">
      <div class="cl-header-left">
        <Sun :class="['w-3.5 h-3.5', status.enabled ? 'cl-icon-active' : 'text-white/30']" />
        <span class="cl-title">{{ '昼夜节律' }}</span>
      </div>
      <span :class="['cl-badge', status.enabled ? 'cl-badge--on' : 'cl-badge--off']">
        {{ status.enabled ? '已启用' : '已停用' }}
      </span>
    </div>

    <div class="cl-body">
      <!-- API 查询状态容器：统一处理 loading/error/重试 -->
      <ApiQueryState
        :loading="loading"
        :error="loadError"
        error-title="昼夜节律加载失败"
        @retry="query.retry()"
      >
        <template #default>
          <!-- 嵌入模式下的紧凑状态行 -->
          <div v-if="embedded" class="cl-status-row">
            <span class="cl-status-row__label">{{ '节律照明' }}</span>
            <span :class="['cl-badge', status.enabled ? 'cl-badge--on' : 'cl-badge--off']">
              {{ status.enabled ? '已启用' : '已停用' }}
            </span>
          </div>

          <div class="cl-split">
            <!-- 左侧：当前目标色温/亮度展示，背景色按色温档位动态变化 -->
            <div class="cl-target" :style="targetStyle">
              <div class="cl-target-phase">{{ phaseLabel }}</div>
              <div class="cl-target-metrics">
                <div class="cl-metric">
                  <span class="cl-metric-val">{{
                    status.currentTarget?.colorTempKelvin || '—'
                  }}</span>
                  <span class="cl-metric-unit">{{ 'K 色温' }}</span>
                </div>
                <div class="cl-metric">
                  <span class="cl-metric-val">{{ status.currentTarget?.brightnessPct ?? '—' }}</span>
                  <span class="cl-metric-unit">{{ '% 亮度' }}</span>
                </div>
              </div>
            </div>

            <div class="cl-side">
              <!-- 右侧统计信息：太阳高度角、跟踪灯具数量、偏好来源 -->
              <div class="cl-stats">
                <div class="cl-stat">
                  <span class="cl-stat__label">{{ '太阳高度角' }}</span>
                  <span class="cl-stat__val">{{
                    status.sunElevation != null ? status.sunElevation.toFixed(1) + '°' : '无数据'
                  }}</span>
                </div>
                <div class="cl-stat">
                  <span class="cl-stat__label">{{ '跟踪灯具' }}</span>
                  <span class="cl-stat__val">{{ `${status.trackedLights || 0} 个` }}</span>
                </div>
                <div v-if="status.preference?.summary" class="cl-stat cl-stat--wide">
                  <span class="cl-stat__label">{{ '偏好来源' }}</span>
                  <span class="cl-stat__val cl-stat__val--pref">{{ status.preference.summary }}</span>
                </div>
              </div>

              <!-- 未跟踪任何灯具时引导用户去配置 -->
              <div v-if="!status.trackedLights" class="cl-no-lights">
                <VEmptyState
                  compact
                  tone="emerald"
                  :title="'尚未配置可跟踪的灯具'"
                  :description="'在设置中启用昼夜节律并选择支持色温的灯具后即可自动调节。'"
                />
              </div>
            </div>
          </div>

          <!-- 各房间节律：按房间展示当前目标与人员占用状态 -->
          <div v-if="roomRows.length" class="cl-rooms">
            <div class="cl-rooms-title">{{ '各房间节律' }}</div>
            <div class="cl-rooms-grid">
              <div v-for="row in roomRows" :key="row.room" class="cl-room-row">
                <div class="cl-room-main">
                  <span class="cl-room-name">{{ row.label }}</span>
                  <span :class="['cl-room-occ', row.occupied ? 'cl-room-occ--on' : '']">{{
                    row.occupied ? '有人' : '无人'
                  }}</span>
                </div>
                <span class="cl-room-meta">
                  {{ row.target?.colorTempKelvin }}K · {{ row.target?.brightnessPct }}%
                </span>
              </div>
            </div>
          </div>

          <!-- 家庭模式提示：若处于睡眠模式可能与之冲突 -->
          <div v-if="activeModeName" class="cl-mode-hint">
            {{ `当前家庭模式：${activeModeName}` }}
            <span v-if="sleepModeActive">{{ ' · 睡眠模式可能与节律照明冲突' }}</span>
          </div>

          <!-- 应用预览：弹层确认目标色温/亮度后再应用 -->
          <div v-if="showPreview" class="cl-preview">
            <div class="cl-preview-title">{{ '应用预览' }}</div>
            <p>
              {{ '将把已开启灯具调整为'
              }}<strong>{{ status.currentTarget?.colorTempKelvin }}K</strong> /
              <strong>{{ status.currentTarget?.brightnessPct }}%</strong>（{{ phaseLabel }}）
            </p>
            <div class="cl-preview-actions">
              <button class="cl-btn cl-btn--primary" :disabled="busy" @click="confirmApply">
                {{ '确认应用' }}
              </button>
              <button class="cl-btn cl-btn--ghost" @click="cancelPreview">
                {{ '取消' }}
              </button>
            </div>
          </div>

          <!-- 操作区：启用/停用自动调节、立即应用 -->
          <div class="cl-actions">
            <button
              :class="['cl-btn', status.enabled ? 'cl-btn--danger' : 'cl-btn--primary']"
              :disabled="busy"
              @click="toggle"
            >
              {{ status.enabled ? '停用自动调节' : '启用自动调节' }}
            </button>
            <button class="cl-btn cl-btn--ghost" :disabled="busy" @click="applyNow">
              {{ '立即应用' }}
            </button>
          </div>
        </template>
      </ApiQueryState>
    </div>
  </div>
</template>
<script setup>
/**
 * @file CircadianLightingPanel.vue
 * @module widgets/climate
 * @description 昼夜节律照明面板：根据太阳高度角与节律阶段，
 *              自动调整已跟踪灯具的色温与亮度，并支持启用/停用与一键应用。
 *
 * API:
 *  - GET  /system/lighting/circadian/status   节律状态
 *  - GET  /system/lighting/circadian/rooms    各房间节律
 *  - POST /system/lighting/circadian/apply    立即应用
 *  - POST /system/lighting/circadian/{enable|disable} 启用/停用
 *
 * @dependencies
 *  - vue: computed 计算属性
 *  - @lucide/vue: Sun 图标
 *  - @/services/api/system: 节律状态查询与控制接口
 *  - @/stores/chrome.store: 全局通知
 *  - @/composables/api/useWidgetApiQuery: Widget 数据查询 composable
 *  - @/components/common/ApiQueryState.vue: 通用查询状态容器
 *  - @/components/common/base/VEmptyState.vue: 空态组件
 *  - @/composables/climate/useClimateRecommendApplyPanel: 应用流程 composable
 *  - @/constants/room-labels: 房间友好名映射
 */
import { computed } from 'vue'
import { Sun } from '@lucide/vue'

import {
  fetchCircadianLightingStatus,
  fetchCircadianLightingRooms,
  postCircadianLighting,
} from '@/services/api/system'
import { useChromeStore } from '@/stores/chrome.store'
import { useWidgetApiQuery } from '@/composables/api/useWidgetApiQuery'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import VEmptyState from '@/components/common/base/VEmptyState.vue'
import { useClimateRecommendApplyPanel } from '@/composables/climate/useClimateRecommendApplyPanel'
import { roomLabel } from '@/constants/room-labels'

const props = defineProps({
  embedded: { type: Boolean, default: false },
  panelVisible: { type: Boolean, default: true },
})

// 全局 UI store，用于弹出通知
const chrome = useChromeStore()

// 数据查询：并行拉取节律状态与各房间节律，每 30 秒自动刷新；仅在面板可见时轮询
const query = useWidgetApiQuery(
  'circadianLighting',
  async () => {
    const [statusRes, roomsRes] = await Promise.all([
      fetchCircadianLightingStatus(),
      // 房间节律查询失败时降级为空，避免阻塞主状态展示
      fetchCircadianLightingRooms().catch(() => ({ data: null })),
    ])
    return {
      data: {
        status: statusRes.data || {},
        roomStatus: roomsRes.data || { rooms: {} },
      },
    }
  },
  30_000,
  {
    pollKey: 'widget:CircadianLightingPanel',
    panelVisible: () => props.panelVisible !== false,
  },
)

const loading = query.loading
const loadError = query.error
// 当前节律状态，缺省为空对象
const status = computed(() => query.data?.value?.status || {})
// 各房间节律状态
const roomStatus = computed(() => query.data?.value?.roomStatus || { rooms: {} })

// 节律阶段映射：日间/清晨/傍晚/夜间 中文文案
const phaseMap = computed(() => ({
  day: '日间 · 清醒',
  morning: '清晨 · 唤醒',
  evening: '傍晚 · 放松',
  night: '夜间 · 助眠',
}))

// 各房间节律表格行：将原始对象转为带 label 的数组便于 v-for 渲染
const roomRows = computed(() =>
  Object.entries(roomStatus.value?.rooms || {}).map(([room, info]) => ({
    room,
    label: roomLabel(room),
    ...info,
  })),
)

// 应用流程状态：busy / showPreview / 当前家庭模式名 / 确认回调
const { busy, showPreview, activeModeName, confirmApply } = useClimateRecommendApplyPanel({
  applyPath: '/system/lighting/circadian/apply',
  successUnit: '个灯具',
})

// 当前阶段文案，未匹配时显示 —
const phaseLabel = computed(() => phaseMap.value[status.value.currentTarget?.phase] || '—')
// 睡眠模式检测：通过家庭模式名匹配中文/英文关键字判断
const sleepModeActive = computed(() => /睡眠|助眠|night|sleep/i.test(activeModeName.value))

/**
 * 当前目标卡片背景渐变样式：按色温档位选择暖色/中性/冷色调色板。
 * @returns {Object} Vue style 对象，包含 background 渐变
 */
const targetStyle = computed(() => {
  const k = status.value.currentTarget?.colorTempKelvin || 4000
  const warm = k <= 3000
  const mid = k > 3000 && k <= 4800
  const c1 = warm
    ? 'rgba(245,158,11,0.2)'
    : mid
      ? 'rgba(251,191,36,0.14)'
      : 'rgba(96,165,250,0.16)'
  const c2 = warm ? 'rgba(217,119,6,0.05)' : mid ? 'rgba(96,165,250,0.05)' : 'rgba(59,130,246,0.05)'
  return { background: `linear-gradient(135deg, ${c1}, ${c2})` }
})

/**
 * 切换昼夜节律照明的启用状态。
 * 后端可能因与家庭模式冲突而拒绝启用，此时返回 blocked=true 并展示原因。
 * @returns {Promise<void>}
 * @throws {Error} 网络或权限错误时通过 chrome.notify 提示
 */
async function toggle() {
  busy.value = true
  try {
    const path = status.value.enabled ? 'disable' : 'enable'
    const { data } = await postCircadianLighting(path)
    // 与家庭模式冲突导致无法启用时仅警告，不抛错
    if (data?.blocked) {
      chrome.notify(data.blockedReason || '与当前家庭模式冲突，无法启用', 'warn')
      return
    }
    chrome.notify(data?.enabled ? '昼夜节律照明已启用' : '已停用', 'success')
    await query.retry()
  } catch (e) {
    // 403 视为权限不足，其他错误统一提示操作失败
    chrome.notify(e?.response?.status === 403 ? '需要管理员权限' : '操作失败', 'error')
  } finally {
    busy.value = false
  }
}

/** 触发应用预览：弹层让用户确认后再调用 confirmApply */
function applyNow() {
  showPreview.value = true
}

/** 取消应用预览 */
function cancelPreview() {
  showPreview.value = false
}
</script>

<style scoped src="./styles/CircadianLightingPanel.css"></style>