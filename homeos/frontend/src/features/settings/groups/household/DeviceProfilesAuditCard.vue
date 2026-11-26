<!--
  人工确认审计：谁在什么时候把哪台设备改成了什么（撤销确认也留痕）。

  从 SettingsDeviceProfilesPanel 拆出：这块只读、自带分页与刷新，与画像列表互不依赖。
-->
<template>
  <SettingsCard full static extra-class="dp-card">
    <SettingsCardIntro
      :icon="ScrollText"
      eyebrow="审计留痕"
      title="最近变更"
      :description="'谁在什么时候把哪台设备改成了什么；撤销确认也会留痕，只保留最近若干条。'"
    >
      <template #actions>
        <button type="button" class="settings-btn-ghost settings-btn--sm" :disabled="loading" @click="load">
          <RefreshCw :class="['w-3.5 h-3.5', loading && 'animate-spin']" />
          {{ '刷新' }}
        </button>
      </template>
    </SettingsCardIntro>

    <div v-if="rows.length" class="dp-audit">
      <div class="dp-audit__head">
        <span>{{ '设备' }}</span>
        <span>{{ '动作' }}</span>
        <span>{{ '类型变化' }}</span>
        <span>{{ '操作者' }}</span>
        <span class="dp-audit__time">{{ '时间' }}</span>
      </div>

      <div v-for="row in rows" :key="row.id" class="dp-audit__row">
        <span class="dp-audit__device" :title="row.entityId">{{ nameOf(row.entityId) }}</span>
        <span class="dp-audit__action" :class="actionTone(row.action)">
          {{ AUDIT_LABELS[row.action] || row.action }}
        </span>
        <span class="dp-audit__kind" :title="kindTransition(row)">{{ kindTransition(row) }}</span>
        <span class="dp-audit__actor" :title="row.actor || '未知操作者'">{{ row.actor || '—' }}</span>
        <span class="dp-audit__time" :title="row.createdAt || ''">{{ relativeTime(row.createdAt) }}</span>
      </div>
    </div>

    <div v-else class="dp-empty">
      <span class="dp-empty__icon" aria-hidden="true"><ScrollText /></span>
      <div class="dp-empty__body">
        <p class="dp-empty__title">{{ loading ? '正在读取变更记录…' : '还没有人工确认记录' }}</p>
        <p class="dp-empty__desc">
          {{ '确认设备类型或撤销确认后，这里会留下可追溯的记录。' }}
        </p>
      </div>
    </div>
  </SettingsCard>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { RefreshCw, ScrollText } from '@lucide/vue'
import SettingsCard from '@/features/settings/components/shell/SettingsCard.vue'
import SettingsCardIntro from '@/features/settings/components/shell/SettingsCardIntro.vue'
import { listDeviceProfileAudit } from '@/domain/api/device-profiles'
import { AUDIT_LABELS, kindTransition, relativeTime } from './device-profiles-display.util'

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
  if (item.name && item.name !== entityId) return item.name
  const id = String(item.entityId || '')
  const dot = id.indexOf('.')
  return dot >= 0 ? id.slice(dot + 1) : id
}

/** 动作色调：确认走成功色，撤销确认走警示色，其余中性。 */
function actionTone(action) {
  if (action === 'clear_confirmation') return 'dp-audit__action--warn'
  if (action === 'confirm' || action === 'confirm_with_aliases') return 'dp-audit__action--ok'
  return ''
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
