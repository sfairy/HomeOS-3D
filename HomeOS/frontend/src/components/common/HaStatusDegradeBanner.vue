<template>
  <div v-if="visible" class="hos-degrade-banner" role="status">
    <!-- 离线图标：HA 未连接且非重连中 -->
    <WifiOff v-if="showOfflineIcon" class="hos-degrade-banner__icon" aria-hidden="true" />
    <!-- 加载图标：正在重连 HA -->
    <Loader2
      v-else-if="showSpinner"
      class="hos-degrade-banner__icon hos-degrade-banner__icon--spin"
      aria-hidden="true"
    />
    <!-- 数据库图标：Redis 未就绪 -->
    <Database
      v-else-if="redisReady === false"
      class="hos-degrade-banner__icon"
      aria-hidden="true"
    />
    <div class="hos-degrade-banner__body">
      <p class="hos-degrade-banner__title">{{ resolvedTitle }}</p>
      <p class="hos-degrade-banner__text">{{ resolvedMessage }}</p>
    </div>
    <!-- 重试按钮：仅当 HA 离线/重连中且开关启用时展示 -->
    <button
      v-if="showRetryDropped"
      type="button"
      class="hos-degrade-banner__retry focus-ring"
      @click="retryDropped"
    >
      {{ '重试指令' }}
    </button>
    <button
      v-if="showRetry && showRetryButton"
      type="button"
      class="hos-degrade-banner__retry focus-ring"
      @click="retryHa"
    >
      {{ retryLabel }}
    </button>
  </div>
</template>

<script setup>
/**
 * @file HaStatusDegradeBanner.vue
 * @module common/HaStatusDegradeBanner
 * @description HA 状态降级提示横幅
 *  职责：
 *    - 根据 entitiesStore 的连接/重连/缓存过期状态，展示降级提示；
 *    - 支持 Redis 未就绪、业务未配置等多级降级文案；
 *    - 提供重试按钮触发 HA 重连。
 *  依赖：vue computed，@lucide/vue 图标，entities.store 与 chrome.store。
 *  注意：高风险控制（阀门/门锁/报警）在离线时会被业务层拦截，本组件仅做提示。
 */
import { computed } from 'vue'
import { WifiOff, Loader2, Database } from '@lucide/vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { retryDroppedHaCommands } from '@/services/api/entities'

const props = defineProps({
  /** 自定义标题，留空则按状态自动推导 */
  title: { type: String, default: '' },
  /** 自定义描述，留空则按状态自动拼接 */
  message: { type: String, default: '' },
  /** 是否展示重试按钮 */
  showRetry: { type: Boolean, default: true },
  /** 重试按钮文案 */
  retryLabel: { type: String, default: '重试连接' },
  /** 强制展示（用于调试/特定场景） */
  forceVisible: { type: Boolean, default: false },
  /** 离线时是否展示高风险控制已拦截的提示 */
  showOfflineControlHint: { type: Boolean, default: true },
  /** Redis 时间线/缓存是否就绪；false 时展示三级降级文案 */
  redisReady: { type: Boolean, default: null },
  /** 业务配置是否完成；false 时提示前往设置 */
  configured: { type: Boolean, default: null },
  /** 业务未配置时的提示文案 */
  configuredHint: { type: String, default: '相关绑定尚未完成，部分功能不可用' },
  /** Redis 未就绪时的提示文案 */
  redisHint: { type: String, default: '历史数据服务未就绪，实时状态仍可用' },
})

const entitiesStore = useEntitiesStore()
const chrome = useChromeStore()

/** HA 是否处于降级态：未连接 / 重连中 / 实体缓存过期任一成立即为降级 */
const haDegraded = computed(
  () => !entitiesStore.connected || entitiesStore.reconnecting || entitiesStore.entitiesStale,
)

/** 横幅是否可见：forceVisible 优先，其次 Redis/配置未就绪，最后回退到 HA 降级态 */
const visible = computed(() => {
  if (props.forceVisible) return true
  if (props.redisReady === false || props.configured === false) return true
  if (entitiesStore.haQueueDroppedTotal > 0) return true
  return haDegraded.value
})

/** 解析后的标题：优先自定义，否则按 Redis/配置/默认降级推导 */
const resolvedTitle = computed(() => {
  if (props.title) return props.title
  if (props.redisReady === false) return '数据服务降级'
  if (props.configured === false) return '配置未完成'
  return '数据可能不完整'
})

/** 解析后的描述：优先自定义，否则按多级降级态拼接提示文案 */
const resolvedMessage = computed(() => {
  if (props.message) return props.message
  const parts = []
  if (props.configured === false) parts.push(props.configuredHint)
  if (props.redisReady === false) parts.push(props.redisHint)
  if (!entitiesStore.connected && !entitiesStore.reconnecting) {
    parts.push('Home Assistant 未连接')
    if (props.showOfflineControlHint) parts.push('阀门/门锁/报警等高风险控制已拦截')
  } else if (entitiesStore.reconnecting) {
    parts.push('正在重连 Home Assistant…')
  }
  if (entitiesStore.entitiesStale) parts.push('实体缓存可能已过期')
  if (entitiesStore.haQueueDroppedTotal > 0) {
    parts.push(`有 ${entitiesStore.haQueueDroppedTotal} 条控制指令未能下发`)
  }
  return parts.length ? parts.join('；') : '请检查 HA 连接与网络'
})

/** 是否展示离线图标：降级且未连接且非重连中 */
const showOfflineIcon = computed(
  () => haDegraded.value && !entitiesStore.connected && !entitiesStore.reconnecting,
)
/** 是否展示旋转加载图标：重连中 */
const showSpinner = computed(() => entitiesStore.reconnecting)
/** 是否展示重试按钮：未连接或重连中 */
const showRetryButton = computed(() => !entitiesStore.connected || entitiesStore.reconnecting)
const showRetryDropped = computed(() => entitiesStore.haQueueDroppedTotal > 0)

async function retryDropped() {
  try {
    const { data } = await retryDroppedHaCommands()
    const retried = Number(data?.retried ?? 0)
    const queued = Number(data?.queued ?? 0)
    chrome.notify(
      retried || queued ? `已重试 ${retried} 条，排队 ${queued} 条` : '没有可重试的指令',
      retried || queued ? 'success' : 'info',
    )
  } catch {
    chrome.notify('重试指令失败', 'error')
  }
}

/**
 * 重试连接 HA
 * 先断开再重连，并在 UI 上通知用户连接进度
 * 失败时弹出错误通知
 * @returns {Promise<void>}
 */
async function retryHa() {
  try {
    entitiesStore.disconnect()
    await entitiesStore.connect()
    chrome.notify('正在重新连接 HA…', 'info')
  } catch {
    chrome.notify('重连失败，请检查 HA 地址与网络', 'error')
  }
}
</script>