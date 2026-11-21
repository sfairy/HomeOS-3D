<!--
  人工确认审计：谁在什么时候把哪台设备改成了什么（撤销确认也留痕）。

  从 SettingsDeviceProfilesPanel 拆出：这块只读、自带分页与刷新，与画像列表互不依赖。
-->
<template>
  <SettingsCard full static extra-class="dp-card">
    <div class="dp-section-head">
      <div class="min-w-0">
        <p class="dp-section-head__title">{{ '最近变更' }}</p>
        <p class="dp-section-head__hint">
          {{ '谁在什么时候把哪台设备改成了什么；撤销确认也会留痕，只保留最近若干条。' }}
        </p>
      </div>
      <button type="button" class="settings-btn-ghost settings-btn--sm" :disabled="loading" @click="load">
        <RefreshCw :class="['w-3.5 h-3.5', loading && 'animate-spin']" />
        {{ '刷新' }}
      </button>
    </div>

    <ul v-if="rows.length" class="dp-audit">
      <li v-for="row in rows" :key="row.id" class="dp-audit__row">
        <span class="dp-audit__device" :title="row.entityId">{{ nameOf(row.entityId) }}</span>
        <span class="dp-audit__action">{{ AUDIT_LABELS[row.action] || row.action }}</span>
        <span class="dp-audit__kind">{{ kindTransition(row) }}</span>
        <span class="dp-audit__actor">{{ row.actor || '—' }}</span>
        <span class="dp-audit__time">{{ relativeTime(row.createdAt) }}</span>
      </li>
    </ul>
    <p v-else class="dp-audit__empty">{{ loading ? '读取中…' : '还没有人工确认记录。' }}</p>
  </SettingsCard>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { RefreshCw } from '@lucide/vue'
import SettingsCard from '@/components/common/settings-page-shell/SettingsCard.vue'
import { listDeviceProfileAudit } from '@/services/api/device-profiles'
import { AUDIT_LABELS, KIND_LABELS, kindTransition, relativeTime } from './device-profiles-display.util'

const props = defineProps({
  /** 画像列表：把实体 ID 翻成可读名称 */
  profiles: { type: Array, default: () => [] },
  limit: { type: Number, default: 15 },
})

const rows = ref([])
const loading = ref(false)

/** 名称：优先友好名，没有时用去掉域前缀的对象 ID（与列表行同一口径）。 */
function nameOf(entityId) {
  const item = props.profiles.find((entry) => entry.entityId === entityId)
  if (!item) return entityId
  if (item.name && item.name !== item.entityId) return item.name
  const id = String(item.entityId || '')
  const dot = id.indexOf('.')
  return dot >= 0 ? id.slice(dot + 1) : id
}

async function load() {
  loading.value = true
  try {
    const { data } = await listDeviceProfileAudit(undefined, props.limit)
    rows.value = data?.items || []
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

defineExpose({ load })
onMounted(load)
</script>
