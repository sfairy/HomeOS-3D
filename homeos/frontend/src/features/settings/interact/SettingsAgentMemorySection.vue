<!--
  智能管家「长期记忆」区段：别名（alias）与长期偏好（preference）。
  记忆由后端按 user:{userId} 分作用域，本页只能看到当前登录用户自己的条目；
  偏好由模型在对话中自动学习，别名仍可在本页手工增删。
  不提供「导入 / 导出」：记忆是辅助理解的软状态，导出容易把家人的房间习惯带出去。
-->
<template>
  <section class="settings-hub-section">
    <SettingsCard static extra-class="agent-memory-workspace">
      <SettingsCardIntro
        :icon="Brain"
        icon-class="agent-icon--model"
        orb-class="agent-orb--model"
        eyebrow="长期记忆"
        :description="'别名把「客厅灯」这类说法映射到具体实体；偏好记录你长期表达的照明亮度、温度等习惯。只对当前账号生效，删除后下一轮对话立即失效。'"
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
            <HosSelect v-model="draftKind" variant="settings" block :searchable="false">
              <option value="preference">长期偏好</option>
              <option value="alias">别名</option>
            </HosSelect>
          </div>
          <div>
            <label class="settings-form-label mb-1.5">
              {{ draftKind === 'alias' ? '说法' : '说明（可留空）' }}
            </label>
            <input
              v-model="draftAlias"
              class="settings-field"
              type="text"
              maxlength="80"
              :placeholder="draftKind === 'alias' ? '如：客厅主灯' : '如：睡觉亮度'"
            />
          </div>
        </div>

        <div class="agent-form-block">
          <label class="settings-form-label mb-1.5">
            {{ draftKind === 'alias' ? '映射到（实体 ID 或标准名）' : '偏好内容' }}
          </label>
          <input
            v-model="draftValue"
            class="settings-field"
            type="text"
            maxlength="200"
            :placeholder="draftKind === 'alias' ? 'light.living_room_main' : '睡觉时把灯调到 20%'"
            @keyup.enter="save"
          />
        </div>

        <div class="agent-form-block flex items-center gap-2">
          <button
            type="button"
            class="settings-btn-accent"
            :disabled="saving || !draftValue.trim() || (draftKind === 'alias' && draftAlias.trim().length < 2)"
            @click="save"
          >
            {{ saving ? '保存中…' : '记住' }}
          </button>
          <button
            v-if="items.length"
            type="button"
            class="settings-btn-ghost"
            :disabled="saving"
            @click="clearAll"
          >
            清空全部
          </button>
          <span class="agent-memory-count">{{ items.length }} / 50</span>
        </div>

        <p v-if="!items.length" class="agent-band-hint">
          {{ loading ? '读取中…' : '还没有长期记忆。在对话里说「记住……」，或直接在上方新增。' }}
        </p>
        <ul v-else class="agent-sched-list">
          <li v-for="item in items" :key="`${item.kind}:${item.key}`" class="agent-sched-row">
            <div class="agent-sched-row__main">
              <span class="agent-sched-row__name">
                <span class="agent-memory-kind">{{ item.kind === 'alias' ? '别名' : '偏好' }}</span>
                {{ item.kind === 'alias' ? item.key : item.value }}
              </span>
              <span class="agent-sched-row__meta">
                {{ item.kind === 'alias' ? item.value : item.key }}
              </span>
            </div>
            <button
              type="button"
              class="settings-btn-ghost shrink-0"
              :disabled="saving"
              @click="forget(item)"
            >
              删除
            </button>
          </li>
        </ul>
      </div>
    </SettingsCard>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Brain } from '@lucide/vue'
import HosSelect from '@/components/common/base/HosSelect.vue'
import SettingsCard from '@/components/common/settings-page-shell/SettingsCard.vue'
import SettingsCardIntro from '@/components/common/settings-page-shell/SettingsCardIntro.vue'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import { useChromeStore } from '@/stores/chrome.store'
import {
  clearAgentMemories,
  forgetAgentMemory,
  listAgentMemories,
  saveAgentMemory,
  type AgentMemoryItem,
} from '@/services/api/agent'

const chrome = useChromeStore()

const items = ref<AgentMemoryItem[]>([])
const loading = ref(false)
const saving = ref(false)
const message = ref('')
const messageOk = ref(true)

const draftKind = ref<AgentMemoryItem['kind']>('preference')
const draftAlias = ref('')
const draftValue = ref('')

function setMessage(text: string, ok = true) {
  message.value = text
  messageOk.value = ok
}

async function refresh() {
  loading.value = true
  try {
    items.value = await listAgentMemories()
  } catch (e: unknown) {
    setMessage(getApiErrorMessage(e, '读取长期记忆失败'), false)
  } finally {
    loading.value = false
  }
}

async function save() {
  const value = draftValue.value.trim()
  if (!value || saving.value) return
  const alias = draftAlias.value.trim()
  if (draftKind.value === 'alias' && alias.length < 2) return
  saving.value = true
  try {
    items.value = await saveAgentMemory({
      kind: draftKind.value,
      value,
      ...(alias ? { alias } : {}),
    })
    draftAlias.value = ''
    draftValue.value = ''
    setMessage('已记住，下一轮对话生效')
  } catch (e: unknown) {
    setMessage(getApiErrorMessage(e, '保存长期记忆失败'), false)
  } finally {
    saving.value = false
  }
}

async function forget(item: AgentMemoryItem) {
  if (saving.value) return
  saving.value = true
  try {
    await forgetAgentMemory(item.kind, item.key)
    items.value = items.value.filter((entry) => !(entry.kind === item.kind && entry.key === item.key))
    setMessage('已删除')
  } catch (e: unknown) {
    setMessage(getApiErrorMessage(e, '删除长期记忆失败'), false)
  } finally {
    saving.value = false
  }
}

async function clearAll() {
  if (saving.value) return
  const ok = await chrome.confirm('清空全部长期记忆？别名与偏好都会被删除，无法恢复。', '清空', {
    type: 'danger',
    confirmText: '清空',
  })
  if (!ok) return
  saving.value = true
  try {
    await clearAgentMemories()
    items.value = []
    setMessage('已清空全部长期记忆')
  } catch (e: unknown) {
    setMessage(getApiErrorMessage(e, '清空长期记忆失败'), false)
  } finally {
    saving.value = false
  }
}

onMounted(refresh)
</script>

<style scoped>
.agent-memory-count {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--hos-text-secondary);
}

.agent-memory-kind {
  display: inline-block;
  margin-right: 6px;
  padding: 0 6px;
  border-radius: 6px;
  font-size: 0.7rem;
  color: var(--hos-text-secondary);
  background: rgba(255, 255, 255, 0.08);
}
</style>
