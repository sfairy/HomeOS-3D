<!--
  @module HA 同步状态卡片（HaSyncStatusCard）
  @description 展示与 Home Assistant 的连接状态：连接/未连接、HA 版本、地址、
    WebSocket 主节点/模式、重连次数、上次连接时间等。仅管理员可查看。
  @dependencies
    - vue（ref/computed/onMounted）
    - @lucide/vue RefreshCw 图标
    - ApiQueryState 加载/错误状态
    - services/api/orchestrator fetchHaSyncStatus
    - stores/auth.store 管理员判断
    - utils/format/locale-format.util 时间格式化
    - views/settings/settings-route.util 跳转路由常量
-->
<template>
  <div class="ha-sync-card" :class="toneClass">
    <header v-if="!embedded" class="ha-sync-card__head">
      <h3>{{ 'HA 同步状态' }}</h3>
      <button
        type="button"
        class="ha-sync-card__refresh"
        :disabled="loading"
        :aria-label="loading ? '刷新中' : '刷新 HA 同步状态'"
        @click="load"
      >
        <RefreshCw :class="['w-3 h-3', loading && 'animate-spin']" />
      </button>
    </header>

    <!-- 非管理员提示 -->
    <p v-if="!isAdmin" class="ha-sync-card__muted">{{ '需要管理员权限查看 HA 同步状态' }}</p>
    <ApiQueryState
      v-else
      :loading="loading"
      :error="error"
      tone="emerald"
      error-title="HA 同步状态加载失败"
      @retry="load"
    >
      <template v-if="status">
        <!-- 连接状态行 -->
        <div class="ha-sync-card__row">
          <span>{{ '连接' }}</span>
          <strong :class="status.connected ? 'ha-sync-card__ok' : 'ha-sync-card__fail'">
            {{ status.connected ? '已连接' : '未连接' }}
          </strong>
        </div>
        <!-- HA 版本号 -->
        <div v-if="status.ha_version" class="ha-sync-card__row">
          <span>{{ 'HA 版本' }}</span>
          <strong>{{ status.ha_version }}</strong>
        </div>
        <!-- HA 服务地址 -->
        <div v-if="status.ha_url" class="ha-sync-card__row">
          <span>{{ '地址' }}</span>
          <code class="ha-sync-card__url">{{ status.ha_url }}</code>
        </div>
        <!-- WebSocket 主节点标识 -->
        <div class="ha-sync-card__row">
          <span>{{ 'WS 主节点' }}</span>
          <strong>{{ status.ha_ws_leader ? '是' : '否' }}</strong>
        </div>
        <!-- WebSocket 模式（leader/follower 等） -->
        <div v-if="status.ha_ws_mode" class="ha-sync-card__row">
          <span>{{ 'WS 模式' }}</span>
          <strong>{{ status.ha_ws_mode }}</strong>
        </div>
        <!-- 累计重连次数 -->
        <div v-if="status.reconnect_count != null" class="ha-sync-card__row">
          <span>{{ '重连次数' }}</span>
          <strong>{{ status.reconnect_count }}</strong>
        </div>
        <!-- 上次成功连接时间 -->
        <div v-if="status.last_connected_at" class="ha-sync-card__row">
          <span>{{ '上次连接' }}</span>
          <time>{{ formatShortDateTimeOrDash(status.last_connected_at, { use24h: true }) }}</time>
        </div>
        <!-- 跳转到联动健康设置页 -->
        <RouterLink :to="SETTINGS_ROUTES.securityModes('linkage')" class="ha-sync-card__link">
          联动健康 →
        </RouterLink>
      </template>
    </ApiQueryState>
  </div>
</template>

<script setup>
/**
 * HA 同步状态卡片脚本
 *
 * 职责：
 * - 通过 fetchHaSyncStatus 拉取连接信息
 * - 根据连接状态切换卡片色调（ok/warn）
 * - 仅管理员可访问
 */
import { getApiErrorMessage } from '@/utils/core/error-message'
import { ref, computed, onMounted } from 'vue'
import { RefreshCw } from '@lucide/vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import { fetchHaSyncStatus } from '@/services/api/orchestrator'
import { useAuthStore } from '@/stores/auth.store'
import { formatShortDateTimeOrDash } from '@/utils/format/locale-format.util'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'

defineProps({
  /** 是否嵌入到容器中（嵌入时隐藏头部） */
  embedded: { type: Boolean, default: false },
})

const authStore = useAuthStore()
/** 是否管理员：决定是否拉取数据 */
const isAdmin = computed(() => authStore.role === 'admin')

const loading = ref(true)
const error = ref('')
/** 后端返回的同步状态对象 */
const status = ref(null)

/** 卡片色调：已连接为 ok，否则 warn */
const toneClass = computed(() =>
  status.value?.connected ? 'ha-sync-card--ok' : 'ha-sync-card--warn',
)

/**
 * 拉取 HA 同步状态
 * - 非管理员：直接置空并结束，不发起请求
 * - 异常：清空 status 并展示错误信息
 * @returns {Promise<void>}
 */
async function load() {
  if (!isAdmin.value) {
    loading.value = false
    error.value = ''
    status.value = null
    return
  }
  loading.value = true
  error.value = ''
  try {
    const { data } = await fetchHaSyncStatus()
    status.value = data
  } catch (e) {
    error.value = getApiErrorMessage(e, '加载失败')
    status.value = null
  } finally {
    loading.value = false
  }
}

onMounted(load)
// 暴露刷新接口供父组件调用
defineExpose({ refresh: load })
</script>

<style scoped src="./styles/HaSyncStatusCard.css"></style>