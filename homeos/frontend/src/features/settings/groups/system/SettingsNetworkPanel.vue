<!--
  网络信息：本机内网 / 公网地址、端口与升级指引（后端 GET /system/network-info）。
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="network"
    icon-key="network"
    accent="var(--hos-color-accent)"
    layout="single"
  >
    <template #actions>
      <button type="button" class="settings-btn-accent" :disabled="loading" @click="load">
        <RefreshCw :class="['w-4 h-4', loading && 'animate-spin']" />
        {{ '刷新' }}
      </button>
    </template>

    <div v-if="error" class="settings-note-box settings-note-box--danger">{{ error }}</div>

    <SettingsCard full static>
      <dl class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div v-for="row in rows" :key="row.label" class="flex flex-col">
          <dt class="text-xs opacity-60">{{ row.label }}</dt>
          <dd class="truncate font-mono text-sm">{{ row.value || '—' }}</dd>
        </div>
      </dl>
    </SettingsCard>

    <SettingsCard full static extra-class="mt-3">
      <p class="font-semibold">{{ '升级' }}</p>
      <p class="mt-1 text-sm opacity-75">
        {{ '容器不会自我替换镜像。请在宿主机执行 docker compose pull && docker compose up -d。' }}
      </p>
      <button type="button" class="settings-btn-ghost mt-3" :disabled="upgrading" @click="upgrade">
        {{ upgrading ? '请求中…' : '查看升级说明' }}
      </button>
    </SettingsCard>
  </SettingsPageShell>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { RefreshCw } from '@lucide/vue'
import SettingsPageShell from '@/features/settings/components/shell/SettingsPageShell.vue'
import SettingsCard from '@/features/settings/components/shell/SettingsCard.vue'
import { useChromeStore } from '@/kernel/ui/chrome/chrome-store'
import { fetchSystemNetworkInfo } from '@/kernel/http/index'
import { apiPost } from '@/kernel/http/index'
import { getApiErrorMessage } from '@/kernel/utils/core/index'

defineProps({ activeTab: { type: String, default: 'network' } })

const chrome = useChromeStore()
const loading = ref(false)
const upgrading = ref(false)
const error = ref('')
const info = ref(null)

const rows = computed(() => [
  { label: '内网地址', value: info.value?.internalUrl },
  { label: '本机 IP', value: info.value?.localIp },
  { label: '外部地址', value: info.value?.externalUrl },
  { label: '公网 IPv4', value: info.value?.publicIpv4 },
  { label: '公网 IPv6', value: info.value?.publicIpv6 },
  { label: '本机 IPv6', value: info.value?.localIpv6 },
  { label: '后端端口', value: info.value?.backendPort },
  { label: '前端端口', value: info.value?.frontendPort },
])

async function load() {
  loading.value = true
  error.value = ''
  try {
    const { data } = await fetchSystemNetworkInfo()
    info.value = data
  } catch (e) {
    error.value = getApiErrorMessage(e, '读取网络信息失败')
  } finally {
    loading.value = false
  }
}

async function upgrade() {
  upgrading.value = true
  try {
    const { data } = await apiPost('/system/upgrade')
    chrome.notify(data?.message || '请在宿主机执行升级', 'info')
  } catch (e) {
    chrome.notify(getApiErrorMessage(e, '升级指引获取失败'), 'error')
  } finally {
    upgrading.value = false
  }
}

onMounted(load)
</script>
