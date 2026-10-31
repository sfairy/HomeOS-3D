<!--
  智能管家「诊断日志」区段：设备离线 / 恢复 / 低电量 / 连接变化。
  只读列表，数据来自后端诊断服务（已按实体 ACL 过滤，受限账号看不到无权设备）。
-->
<template>
  <section class="settings-hub-section">
    <SettingsCard static extra-class="agent-scene-voice-workspace">
      <SettingsCardIntro
        :icon="Activity"
        icon-class="agent-icon--model"
        orb-class="agent-orb--model"
        eyebrow="诊断"
        :description="'设备掉线、恢复、低电量与连接状态变化会被自动记录，便于回答「最近哪台设备不稳定」。日志同样受设备可见性约束，受限账号查不到无权设备的记录。'"
      >
        <template #actions>
          <button type="button" class="settings-btn-ghost shrink-0" :disabled="loading" @click="refresh">
            {{ loading ? '刷新中…' : '刷新' }}
          </button>
        </template>
      </SettingsCardIntro>

      <p v-if="message" class="agent-band-hint" :class="{ 'agent-band-hint--meta': !messageOk }">
        {{ message }}
      </p>

      <div class="agent-model-body">
        <div class="settings-form-grid settings-form-grid--2 agent-form-block">
          <div>
            <label class="settings-form-label mb-1.5">类型</label>
            <HosSelect v-model="kind" variant="settings" block :searchable="false">
              <option value="">全部</option>
              <option v-for="item in kindOptions" :key="item.id" :value="item.id">{{ item.label }}</option>
            </HosSelect>
          </div>
          <div>
            <label class="settings-form-label mb-1.5">搜索</label>
            <input
              v-model="search"
              class="settings-field"
              type="text"
              placeholder="设备名 / 实体 ID"
              @keyup.enter="refresh"
            />
          </div>
        </div>

        <p v-if="!items.length" class="agent-band-hint">
          {{ loading ? '读取中…' : '还没有诊断记录。' }}
        </p>
        <ul v-else class="agent-sched-list">
          <li v-for="item in items" :key="item.id" class="agent-sched-row">
            <div class="agent-sched-row__main">
              <span class="agent-sched-row__name">
                {{ kindLabel(item.kind) }} · {{ formatTime(item.timestamp) }}
              </span>
              <span class="agent-sched-row__meta">{{ item.message }}</span>
              <span v-if="item.entityId" class="agent-sched-row__meta">{{ item.entityId }}</span>
            </div>
          </li>
        </ul>
      </div>
    </SettingsCard>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Activity } from '@lucide/vue'
import HosSelect from '@/components/common/base/HosSelect.vue'
import SettingsCard from '@/components/common/settings-page-shell/SettingsCard.vue'
import SettingsCardIntro from '@/components/common/settings-page-shell/SettingsCardIntro.vue'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import { formatFullDateTime } from '@/shared/utils/format/locale-format.util'
import { listAgentDiagnostics, type AgentDiagnosticEvent } from '@/services/api/agent'

/** 与后端 diagnostics.py 的 KIND_* 常量保持一致 */
const kindOptions = [
  { id: 'DEVICE_OFFLINE', label: '设备离线' },
  { id: 'DEVICE_RECOVERED', label: '设备恢复' },
  { id: 'LOW_BATTERY', label: '低电量' },
  { id: 'CONNECTIVITY', label: '连接变化' },
]

const loading = ref(false)
const message = ref('')
const messageOk = ref(true)
const kind = ref('')
const search = ref('')
const items = ref<AgentDiagnosticEvent[]>([])

function kindLabel(value: string): string {
  return kindOptions.find((item) => item.id === value)?.label || value || '诊断'
}

function formatTime(raw: string | null): string {
  if (!raw) return '—'
  const text = String(raw).replace(' ', 'T')
  const date = new Date(text.endsWith('Z') ? text : `${text}Z`)
  if (Number.isNaN(date.getTime())) return raw
  return formatFullDateTime(date)
}

function setMessage(text: string, ok: boolean) {
  message.value = text
  messageOk.value = ok
}

async function refresh() {
  loading.value = true
  try {
    items.value = await listAgentDiagnostics({
      kind: kind.value,
      search: search.value.trim(),
      limit: 50,
    })
    message.value = ''
  } catch (error) {
    setMessage(getApiErrorMessage(error, '读取诊断日志失败'), false)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void refresh()
})
</script>
