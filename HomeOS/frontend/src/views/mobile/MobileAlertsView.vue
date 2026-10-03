<!--
组件：MobileAlertsView.vue
所属模块：frontend / src / views
职责：移动端「告警」页——站内通知收件箱浏览（含分页加载、单条/全部已读）
      + WebPush 本机推送订阅与测试。
数据来源：
  - 通知列表来自 fetchNotifications / markNotificationRead / markAllNotificationsRead；
  - WebPush 订阅能力来自 useWebPushSubscribe；
  - 全局 toast 通过 useChromeStore 抛出。
关键交互：
  - 点击条目标记已读；「全部已读」批量标记；
  - 「加载更多」递增 limit 后追加拉取（按 id 去重）；
  - 「订阅本机推送」触发 subscribe，可在锁屏接收规则告警。
-->
<script setup lang="ts">
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/MobileAlertsView 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
/**
 * 移动端 Alerts：站内通知预览 + WebPush 订阅。
 */
import { computed, onMounted, ref } from 'vue'
import { BellRing, Smartphone } from '@lucide/vue'
import { useWebPushSubscribe } from '@/composables/ui/useWebPushSubscribe'
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/services/api/notifications'
import { notifyError } from '@/services/notify'
import { useChromeStore } from '@/stores/chrome.store'
import { formatShortDateTime } from '@/utils/format/locale-format.util'

/** 通知行结构：与后端返回字段对齐，level/read/createdAt 可空。 */
interface NotifRow {
  id: string
  level?: string
  message: string
  source?: string
  read?: boolean
  createdAt?: string
}

const chrome = useChromeStore()
const { busy, subscribe, sendTest } = useWebPushSubscribe()

const items = ref<NotifRow[]>([])
const loading = ref(true)
const marking = ref(false)
const limit = ref(20)

// 是否还有更多：当前已加载数 >= limit 时认为可继续加载（上限 50）
const hasMore = computed(() => items.value.length >= limit.value)

/** 格式化通知时间：空值返回空字符串避免渲染 undefined。 */
function formatTime(iso?: string): string {
  if (!iso) return ''
  return formatShortDateTime(iso)
}

/**
 * 拉取通知收件箱：append=true 时按 id 去重追加，否则整体替换。
 * 失败时非追加场景清空列表避免显示陈旧数据。
 */
async function loadInbox(append = false) {
  loading.value = true
  try {
    const res = await fetchNotifications({ limit: limit.value })
    const list = Array.isArray(res.data) ? res.data : []
    if (append) {
      const seen = new Set(items.value.map((n) => n.id))
      items.value = [...items.value, ...list.filter((n: NotifRow) => !seen.has(n.id))]
    } else {
      items.value = list as NotifRow[]
    }
  } catch (e: unknown) {
    notifyError(e, '加载通知失败')
    if (!append) items.value = []
  } finally {
    loading.value = false
  }
}

/** 加载更多：递增 limit（上限 50）后追加拉取。 */
async function loadMore() {
  limit.value = Math.min(limit.value + 20, 50)
  await loadInbox(true)
}

/** 点击通知条目：未读时调接口标记已读，本地同步状态；失败静默忽略不阻断交互。 */
async function onOpenItem(n: NotifRow) {
  if (!n.read) {
    try {
      await markNotificationRead(n.id)
      n.read = true
    } catch {
      /* 忽略 */
    }
  }
}

/** 全部已读：调批量接口后本地全部置 read=true 并 toast 反馈。 */
async function markAll() {
  marking.value = true
  try {
    await markAllNotificationsRead()
    items.value = items.value.map((n) => ({ ...n, read: true }))
    chrome.notify('已全部标为已读', 'success')
  } catch (e: unknown) {
    notifyError(e, '标记已读失败')
  } finally {
    marking.value = false
  }
}

// 挂载时首次拉取收件箱
onMounted(() => {
  void loadInbox()
})
</script>

<template>
  <div class="m-page" style="--m-accent-rgb: 251, 113, 133">
    <header class="m-page__header">
      <div class="m-page__title-row">
        <div>
          <p class="m-page__eyebrow">通知</p>
          <h1 class="m-page__title">告警</h1>
        </div>
        <button type="button" class="m-page__action" :disabled="loading" @click="() => loadInbox()">
          刷新
        </button>
      </div>
      <p class="m-page__sub">站内通知与 WebPush 推送</p>
    </header>

    <section class="m-page__card">
      <div class="m-page__row">
        <div>
          <p class="m-page__card-label">收件箱</p>
          <p class="m-page__card-title">最近通知</p>
        </div>
        <BellRing class="w-5 h-5" style="color: rgba(251, 113, 133, 0.85); opacity: 0.9" />
      </div>

      <p v-if="loading" class="m-page__hint">加载中…</p>
      <p v-else-if="!items.length" class="m-page__hint">暂无通知</p>
      <ul v-else class="m-alert-inbox">
        <li v-for="n in items" :key="n.id">
          <button
            type="button"
            class="m-alert-inbox__item"
            :class="{ 'm-alert-inbox__item--unread': !n.read }"
            @click="onOpenItem(n)"
          >
            <span class="m-alert-inbox__level" :data-level="n.level || 'info'">
              {{ n.level || 'info' }}
            </span>
            <span class="m-alert-inbox__body">
              <span class="m-alert-inbox__msg">{{ n.message }}</span>
              <span class="m-alert-inbox__meta">
                {{ formatTime(n.createdAt) }}
                <template v-if="n.source"> · {{ n.source }}</template>
              </span>
            </span>
          </button>
        </li>
      </ul>

      <div class="m-page__btn-row">
        <button
          type="button"
          class="m-page__btn m-page__btn--ghost"
          :disabled="marking || !items.length"
          @click="markAll"
        >
          全部已读
        </button>
        <button
          type="button"
          class="m-page__btn m-page__btn--ghost"
          :disabled="loading || !hasMore"
          @click="loadMore"
        >
          {{ loading ? '加载中…' : '加载更多' }}
        </button>
      </div>
    </section>

    <section class="m-page__card">
      <div class="m-page__row">
        <div>
          <p class="m-page__card-label">推送订阅</p>
          <p class="m-page__card-title">本机推送订阅</p>
        </div>
        <Smartphone class="w-5 h-5" style="color: rgba(125, 211, 252, 0.9)" />
      </div>
      <p class="m-page__hint">
        订阅后可在锁屏收到规则告警（需在设置 · 智能管家 · 消息通道启用 VAPID）。
      </p>
      <div class="m-page__btn-row">
        <button
          type="button"
          class="m-page__btn m-page__btn--primary"
          :disabled="busy"
          @click="subscribe('移动端')"
        >
          {{ busy ? '处理中…' : '订阅本机推送' }}
        </button>
        <button type="button" class="m-page__btn m-page__btn--ghost" :disabled="busy" @click="sendTest">
          测试推送
        </button>
      </div>
    </section>
  </div>
</template>
