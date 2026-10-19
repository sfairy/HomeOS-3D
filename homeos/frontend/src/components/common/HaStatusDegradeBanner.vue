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
    <!-- 配置图标：业务未配置 -->
    <Database
      v-else-if="configured === false"
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
/** - 根据 entitiesStore 的连接/重连/缓存过期状态，展示降级提示； */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
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
  /** 业务配置是否完成；false 时提示前往设置 */
  configured: { type: Boolean, default: null },
  /** 业务未配置时的提示文案 */
  configuredHint: { type: String, default: '相关绑定尚未完成，部分功能不可用' },
})

const entitiesStore = useEntitiesStore()
const chrome = useChromeStore()

/**
 * 降级态「熬过多久才值得打扰用户」。
 *
 * 为什么需要：后端重启（开发期文件监听 / 升级）/ socket 抖动会让 HA 状态瞬间变成
 * 「未知 → 重连」，实际 1~4 秒就恢复。立刻弹横幅会让用户以为家里设备一直掉线，
 * 而真正的中断（>5s）仍然照常提示。
 */
const DEGRADE_HYSTERESIS_MS = 5000
let degradeTimer = null

/**
 * HA 状态是否由后端明确播报为断开/重连中。
 *
 * 只有这两态才说明「HA 真的不可用」。socket 层断开（后端重启、网络切换）时
 * 后端根本没机会播报，此时不能把锅甩给 HA。
 */
const haDown = computed(
  () => entitiesStore.haStatus === 'disconnected' || entitiesStore.haStatus === 'reconnecting',
)
/** 后端通道（socket.io）本身没连上：此时我们对 HA 状态一无所知 */
const backendDown = computed(
  () =>
    !entitiesStore.connected &&
    !haDown.value &&
    // 冷启动首次全量同步期间 connected 天然为 false：这是正常加载，不是降级
    !(entitiesStore.loading && entitiesStore.totalCount === 0),
)

/** HA 是否处于降级态：未连接 / 重连中 / 实体缓存过期任一成立即为降级 */
const haDegraded = computed(
  () => haDown.value || backendDown.value || entitiesStore.entitiesStale,
)

/** 无需等待的强制展示：调试、配置未完成、有指令被丢弃（可操作） */
const immediateVisible = computed(
  () =>
    props.forceVisible ||
    props.configured === false ||
    entitiesStore.haQueueDroppedTotal > 0,
)

/** 降级态已持续超过迟滞窗口 */
const degradedSettled = ref(false)

watch(
  haDegraded,
  (degraded) => {
    if (!degraded) {
      if (degradeTimer) clearTimeout(degradeTimer)
      degradeTimer = null
      degradedSettled.value = false
      return
    }
    if (degradedSettled.value || degradeTimer) return
    degradeTimer = setTimeout(() => {
      degradeTimer = null
      degradedSettled.value = true
    }, DEGRADE_HYSTERESIS_MS)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (degradeTimer) clearTimeout(degradeTimer)
  degradeTimer = null
})

/** 横幅是否可见：强制展示优先，其余降级态需熬过迟滞窗口 */
const visible = computed(() => immediateVisible.value || degradedSettled.value)

/** 解析后的标题：优先自定义，否则按配置/默认降级推导 */
const resolvedTitle = computed(() => {
  if (props.title) return props.title
  if (props.configured === false) return '配置未完成'
  return '数据可能不完整'
})

/** 解析后的描述：优先自定义，否则按多级降级态拼接提示文案 */
const resolvedMessage = computed(() => {
  if (props.message) return props.message
  const parts = []
  if (props.configured === false) parts.push(props.configuredHint)
  if (haDown.value) {
    if (entitiesStore.haStatus === 'reconnecting') {
      parts.push('正在重连 Home Assistant…')
    } else {
      parts.push('Home Assistant 未连接')
      if (props.showOfflineControlHint) parts.push('阀门/门锁/报警等高风险控制已拦截')
    }
  } else if (backendDown.value) {
    // 措辞必须准确：这里是 HomeOS 后端通道断了，HA 可能一直是好的
    parts.push('正在重新连接 HomeOS 服务…')
  }
  if (entitiesStore.entitiesStale) parts.push('实体缓存可能已过期')
  if (entitiesStore.haQueueDroppedTotal > 0) {
    parts.push(`有 ${entitiesStore.haQueueDroppedTotal} 条控制指令未能下发`)
  }
  return parts.length ? parts.join('；') : '请检查 HA 连接与网络'
})

/** 是否展示离线图标：HA 明确断开且非重连中 */
const showOfflineIcon = computed(() => haDown.value && entitiesStore.haStatus === 'disconnected')
/** 是否展示旋转加载图标：重连中（HA 或后端通道） */
const showSpinner = computed(
  () => entitiesStore.reconnecting || entitiesStore.haStatus === 'reconnecting' || backendDown.value,
)
/** 是否展示重试按钮：未连接或重连中 */
const showRetryButton = computed(
  () => !entitiesStore.connected || entitiesStore.reconnecting || haDown.value,
)
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