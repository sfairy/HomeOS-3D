<!--
组件：EmbedView.vue
所属模块：frontend / src / views
-->
<template>
  <div
    class="embed-page"
    :style="{
      '--page-accent': 'var(--module-accent-admin)',
      '--page-accent-rgb': 'var(--module-accent-admin-rgb)',
      '--page-accent-secondary': 'var(--module-accent-admin-sub)',
    }"
  >
    <Transition name="embed-load">
      <div v-if="loading && iframeSrc && !loadError" class="embed-loading">
        <div class="embed-loading__orb">
          <div class="embed-loading__ring embed-loading__ring--a" />
          <div class="embed-loading__ring embed-loading__ring--b" />
          <Globe class="embed-loading__icon w-7 h-7" />
        </div>
        <h2 class="embed-loading__title">{{ `正在连接 ${embedTitle}` }}</h2>
        <p class="embed-loading__host">{{ displayHost }}</p>
      </div>
    </Transition>

    <div v-if="loadError" class="embed-state">
      <div class="embed-state__card">
        <div class="embed-state__icon embed-state__icon--warn">
          <AlertTriangle class="w-6 h-6" />
        </div>
        <h2 class="embed-state__title">{{ '页面加载失败' }}</h2>
        <p class="embed-state__desc">
          {{
            embedBlockReason ||
            `无法加载 ${embedTitle}。请检查 URL、目标服务是否在线，以及是否允许 iframe 嵌入。`
          }}
        </p>
        <p v-if="embedUrl" class="embed-state__url">{{ embedUrl }}</p>
        <div class="embed-state__actions">
          <button v-if="!embedBlockReason" type="button" class="embed-btn" @click="retryLoad">
            {{ '重试' }}
          </button>
          <RouterLink :to="SETTINGS_ROUTES.embeds()" class="embed-btn embed-btn--primary">
            {{ '检查内嵌配置' }}
          </RouterLink>
        </div>
      </div>
    </div>

    <iframe
      v-else-if="iframeSrc && !embedBlockReason"
      :key="iframeKey"
      :src="iframeSrc"
      :class="['embed-frame', loading && 'embed-frame--loading']"
      :title="embedTitle"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
      referrerpolicy="unsafe-url"
      @load="onLoad"
    />

    <div v-else class="embed-state">
      <div class="embed-state__card">
        <div class="embed-state__icon embed-state__icon--muted">
          <MonitorPlay class="w-6 h-6" />
        </div>
        <h2 class="embed-state__title">{{ '未配置页面地址' }}</h2>
        <p class="embed-state__desc">
          {{
            routeEmbedId() === 'movie-pilot'
              ? '尚未填写 MoviePilot 地址。请在「设置 → 内嵌网页」配置 MoviePilot URL 后保存。'
              : `「${embedTitle}」尚未填写内嵌 URL，请先在设置中配置。`
          }}
        </p>
        <div class="embed-state__actions">
          <RouterLink :to="SETTINGS_ROUTES.embeds()" class="embed-btn embed-btn--primary">
            {{ '前往内嵌网页设置' }}
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * 嵌入页面视图
 * 将外部页面（如 MoviePilot 或其他自建系统）通过 iframe 嵌入到 HomeOS 中。
 */
import { ref, computed, watch, onUnmounted, onDeactivated, onActivated } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { AlertTriangle, MonitorPlay, Globe } from '@lucide/vue'
import { useLayoutStore } from '@/stores/layout.store'
import {
  getEmbedBlockReason,
  isIframeChromeError,
  resolveEmbedIframeSrc,
  clearAllEmbedCtxCookies,
  setEmbedCtxCookie,
} from '@/utils/layout/embed-url.util'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'

const route = useRoute()
const layoutStore = useLayoutStore()

const loading = ref(true)
const loadError = ref(false)
const iframeKey = ref(0)
let loadTimer = null

function routeEmbedId() {
  const id = route.params.id
  return Array.isArray(id) ? String(id[0] || '') : String(id || '')
}

const embed = computed(() => {
  const id = routeEmbedId()
  return layoutStore.layoutConfig.customEmbeds?.find((t) => t.id === id)
})

const embedUrl = computed(() => {
  const id = routeEmbedId()
  if (id === 'movie-pilot') {
    return embed.value?.url || layoutStore.layoutConfig.moviePilotUrl || ''
  }
  return embed.value?.url || ''
})

const embedTitle = computed(() => {
  if (routeEmbedId() === 'movie-pilot' && !embed.value?.name) return 'MoviePilot'
  return embed.value?.name || '嵌入式页面'
})

const iframeSrc = computed(() => resolveEmbedIframeSrc(routeEmbedId(), embedUrl.value))

const displayHost = computed(() => {
  try {
    const u = new URL(embedUrl.value)
    return `${u.hostname}${u.port ? `:${u.port}` : ''}`
  } catch {
    return embedUrl.value || '—'
  }
})

const embedBlockReason = computed(() => getEmbedBlockReason(embedUrl.value))

function syncLoadState() {
  loadError.value = false
  if (embedBlockReason.value) {
    loading.value = false
    loadError.value = true
    clearLoadTimer()
    return
  }
  if (!iframeSrc.value) {
    loading.value = false
    clearLoadTimer()
    return
  }
  loading.value = true
  startLoadTimeout()
}

function clearLoadTimer() {
  if (loadTimer) {
    clearTimeout(loadTimer)
    loadTimer = null
  }
}

function startLoadTimeout() {
  clearLoadTimer()
  loadTimer = setTimeout(() => {
    if (loading.value) {
      loading.value = false
      loadError.value = true
    }
  }, 20000)
}

watch(iframeSrc, syncLoadState, { immediate: true })

function onLoad(ev) {
  clearLoadTimer()
  if (isIframeChromeError(ev?.target)) {
    loading.value = false
    loadError.value = true
    return
  }
  setTimeout(() => {
    loading.value = false
    loadError.value = false
  }, 280)
}

function retryLoad() {
  if (embedBlockReason.value) return
  loading.value = true
  loadError.value = false
  iframeKey.value++
  startLoadTimeout()
}

function enterEmbedPage() {
  clearAllEmbedCtxCookies()
  setEmbedCtxCookie(routeEmbedId())
}

function leaveEmbedPage() {
  clearLoadTimer()
  clearAllEmbedCtxCookies()
}

onActivated(enterEmbedPage)
onDeactivated(leaveEmbedPage)
onUnmounted(leaveEmbedPage)
</script>

<style scoped src="./styles/EmbedView.css"></style>
