<!--
  智能管家「学习与调优」区段：把后端已经实现、但此前只能靠对话触发的学习体系
  暴露成可管理列表 —— 已学别名 / 房间默认（暂停 / 回滚 / 删除）、习惯候选
  （接受 / 忽略 / 重置），以及意图门影子回放（决定是否切 enforce 的依据）。
-->
<template>
  <section class="settings-hub-section">
    <SettingsCard static extra-class="agent-scene-voice-workspace">
      <SettingsCardIntro
        :icon="GraduationCap"
        icon-class="agent-icon--model"
        orb-class="agent-orb--model"
        eyebrow="学习"
        :description="'管家从对话里学到的别名、房间默认设备与重复操作习惯。学错时在这里暂停或回滚，不必再靠「撤销刚才的学习」这类口令。'"
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
        <SettingsSectionHead
          title="指令缓存"
          eyebrow="快路径命中"
          description="常用原话直接映射到工具调用，不必每句都走大模型；学错了可以在这里删掉"
          bordered
        />
        <div class="agent-learn-metrics">
          <span v-for="item in metricItems" :key="item.label" class="agent-learn-metric">
            <span class="agent-learn-metric__value">{{ item.value }}</span>
            <span class="agent-learn-metric__label">{{ item.label }}</span>
          </span>
        </div>
        <p v-if="!commands.length" class="agent-band-hint">
          {{ loading ? '读取中…' : '还没有学会指令。控制成功几次后会自动出现。' }}
        </p>
        <ul v-else class="agent-sched-list">
          <li v-for="item in commands" :key="item.key" class="agent-sched-row">
            <div class="agent-sched-row__main">
              <span class="agent-sched-row__name">
                「{{ item.key }}」→ {{ item.toolName }}
                <span class="agent-learn-tag" :data-tone="item.confirmed ? 'on' : 'meta'">
                  {{ item.confirmed ? '已确认' : '待二次验证' }}
                </span>
              </span>
              <span class="agent-sched-row__meta">命中 {{ item.hitCount }} 次</span>
            </div>
            <div class="agent-sched-row__side">
              <button
                type="button"
                class="settings-btn-ghost"
                :disabled="busyId === item.key"
                @click="forgetCommand(item)"
              >
                删除
              </button>
            </div>
          </li>
        </ul>

        <SettingsSectionHead
          title="已学会的映射"
          eyebrow="别名 / 房间默认"
          description="暂停后立即不参与快路径解析；回滚会回到上一版目标设备"
          bordered
          class="agent-section-gap"
        />
        <p v-if="!learning.length" class="agent-band-hint">
          {{ loading ? '读取中…' : '还没有学习记录。对管家说「以后把主灯叫做客厅主灯」试试。' }}
        </p>
        <ul v-else class="agent-sched-list">
          <li v-for="item in learning" :key="item.id" class="agent-sched-row">
            <div class="agent-sched-row__main">
              <span class="agent-sched-row__name">
                {{ kindLabel(item.kind) }} · {{ item.key }}
                <span class="agent-learn-tag" :data-tone="item.isActive ? 'on' : 'off'">
                  {{ item.isActive ? '生效中' : '已暂停' }}
                </span>
              </span>
              <span class="agent-sched-row__meta">→ {{ item.entityId }} · r{{ item.revision }}</span>
            </div>
            <div class="agent-sched-row__side">
              <button type="button" class="settings-btn-ghost" :disabled="busyId === item.id" @click="toggle(item)">
                {{ item.isActive ? '暂停' : '恢复' }}
              </button>
              <button type="button" class="settings-btn-ghost" :disabled="busyId === item.id" @click="revert(item)">
                回滚
              </button>
              <button type="button" class="settings-btn-ghost" :disabled="busyId === item.id" @click="remove(item)">
                删除
              </button>
            </div>
          </li>
        </ul>

        <SettingsSectionHead
          title="习惯候选"
          eyebrow="重复操作"
          description="同一串操作重复出现后才会列出；接受后转为定时 / 自动化建议"
          bordered
          class="agent-section-gap"
        />
        <p v-if="!habits.length" class="agent-band-hint">没有待确认的习惯。</p>
        <ul v-else class="agent-sched-list">
          <li v-for="item in habits" :key="item.id" class="agent-sched-row">
            <div class="agent-sched-row__main">
              <span class="agent-sched-row__name">
                {{ habitLabel(item) }}
                <span class="agent-learn-tag" data-tone="meta">{{ statusLabel(item.status) }}</span>
              </span>
              <span class="agent-sched-row__meta">
                证据 {{ item.evidenceCount }} 次 · 最近 {{ formatTime(item.lastSeenAt) }}
              </span>
            </div>
            <div class="agent-sched-row__side">
              <button type="button" class="settings-btn-ghost" :disabled="busyId === item.id" @click="habit(item, 'accept')">
                接受
              </button>
              <button type="button" class="settings-btn-ghost" :disabled="busyId === item.id" @click="habit(item, 'dismiss')">
                忽略
              </button>
              <button type="button" class="settings-btn-ghost" :disabled="busyId === item.id" @click="habit(item, 'reset')">
                重置
              </button>
            </div>
          </li>
        </ul>

        <SettingsSectionHead
          title="意图门影子回放"
          eyebrow="切 enforce 前先看"
          description="统计最近判为规则型 / 歧义的表达；正常口令若大量出现，说明词表过宽"
          bordered
          class="agent-section-gap"
        />
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="settings-btn-ghost" :disabled="replayLoading" @click="loadReplay">
            {{ replayLoading ? '统计中…' : '查看最近判定' }}
          </button>
          <span v-if="replay" class="agent-band-hint">
            共 {{ replay.total }} 条判定 · {{ verdictSummary }}
          </span>
        </div>
        <ul v-if="replay?.blockedSamples.length" class="agent-sched-list agent-learn-replay">
          <li v-for="(sample, index) in replay.blockedSamples" :key="index" class="agent-sched-row">
            <span class="agent-sched-row__meta">
              「{{ sample.utterance || '—' }}」· {{ sample.verdict || '—' }}
              <template v-if="sample.reason">· {{ sample.reason }}</template>
            </span>
          </li>
        </ul>
      </div>
    </SettingsCard>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { GraduationCap } from '@lucide/vue'
import SettingsCard from '@/components/common/settings-page-shell/SettingsCard.vue'
import SettingsCardIntro from '@/components/common/settings-page-shell/SettingsCardIntro.vue'
import SettingsSectionHead from '@/features/settings/shared/layout/SettingsSectionHead.vue'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import { formatFullDateTime } from '@/shared/utils/format/locale-format.util'
import { useChromeStore } from '@/stores/chrome.store'
import {
  actOnAgentHabit,
  deleteAgentCommandCache,
  deleteAgentLearning,
  getAgentCommandMetrics,
  getAgentIntentReplay,
  listAgentCommandCache,
  listAgentHabits,
  listAgentLearning,
  revertAgentLearning,
  setAgentLearningActive,
  type AgentCommandCacheEntry,
  type AgentCommandMetrics,
  type AgentHabitCandidate,
  type AgentIntentReplay,
  type AgentLearningConfig,
} from '@/services/api/agent'

const chrome = useChromeStore()

const loading = ref(false)
const replayLoading = ref(false)
const busyId = ref('')
const message = ref('')
const messageOk = ref(true)
const learning = ref<AgentLearningConfig[]>([])
const habits = ref<AgentHabitCandidate[]>([])
const replay = ref<AgentIntentReplay | null>(null)
const metrics = ref<AgentCommandMetrics | null>(null)
const commands = ref<AgentCommandCacheEntry[]>([])

/** 指标卡：命中率与 LLM 调用最直观，其余放说明里 */
const metricItems = computed(() => {
  const m = metrics.value
  if (!m) return []
  const total = m.totalRequests || 0
  const hits = m.fastPathHits + m.cacheHits
  const rate = total > 0 ? Math.round((hits / total) * 100) : null
  return [
    { label: '累计请求', value: String(total) },
    { label: '免模型命中', value: rate === null ? '—' : `${rate}%` },
    { label: 'LLM 调用', value: String(m.llmCalls) },
    { label: '纠正次数', value: String(m.corrections) },
  ]
})

const verdictSummary = computed(() => {
  const entries = Object.entries(replay.value?.verdicts ?? {})
  return entries.length ? entries.map(([key, value]) => `${key} ${value}`).join(' · ') : '暂无分布'
})

function setMessage(text: string, ok = true) {
  message.value = text
  messageOk.value = ok
}

function kindLabel(kind: string): string {
  if (kind === 'alias') return '别名'
  if (kind === 'area_default') return '房间默认'
  return kind || '学习'
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    OBSERVING: '观察中',
    PROMPTED: '已提示',
    DISMISSED: '已忽略',
    GRADUATED: '已接受',
  }
  return labels[status] || status || '—'
}

function habitLabel(item: AgentHabitCandidate): string {
  return `${item.candidateType || '习惯'} · ${item.contextKey || item.entityId || '—'}`
}

function formatTime(raw: string | null): string {
  if (!raw) return '—'
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? raw : formatFullDateTime(date)
}

async function refresh() {
  loading.value = true
  try {
    const [configs, candidates, stats, cached] = await Promise.all([
      listAgentLearning(),
      listAgentHabits(),
      getAgentCommandMetrics().catch(() => null),
      listAgentCommandCache().catch(() => [] as AgentCommandCacheEntry[]),
    ])
    learning.value = configs
    habits.value = candidates
    metrics.value = stats
    commands.value = cached
    message.value = ''
  } catch (error) {
    setMessage(getApiErrorMessage(error, '读取学习记录失败'), false)
  } finally {
    loading.value = false
  }
}

/** 删除一条学错的指令映射（下次同一句话重新走解析） */
async function forgetCommand(item: AgentCommandCacheEntry) {
  const ok = await chrome.confirm(`删除「${item.key}」的已学指令？下次同一句话会重新解析。`, '删除', {
    type: 'danger',
    confirmText: '删除',
  })
  if (!ok) return
  busyId.value = item.key
  try {
    await deleteAgentCommandCache(item.key)
    commands.value = commands.value.filter((entry) => entry.key !== item.key)
    setMessage('已删除这条指令映射')
  } catch (error) {
    setMessage(getApiErrorMessage(error, '删除指令映射失败'), false)
  } finally {
    busyId.value = ''
  }
}

async function toggle(item: AgentLearningConfig) {
  busyId.value = item.id
  try {
    await setAgentLearningActive(item.id, !item.isActive)
    setMessage(item.isActive ? '已暂停这条学习' : '已恢复这条学习')
    await refresh()
  } catch (error) {
    setMessage(getApiErrorMessage(error, '切换学习状态失败'), false)
  } finally {
    busyId.value = ''
  }
}

async function revert(item: AgentLearningConfig) {
  busyId.value = item.id
  try {
    const result = await revertAgentLearning(item.id, item.revision)
    if (result?.success === false) {
      setMessage(String(result.message || '回滚失败'), false)
    } else {
      setMessage('已回滚到上一版目标设备')
    }
    await refresh()
  } catch (error) {
    setMessage(getApiErrorMessage(error, '回滚学习失败'), false)
  } finally {
    busyId.value = ''
  }
}

async function remove(item: AgentLearningConfig) {
  const ok = await chrome.confirm('删除这条学习记录？删除后管家会忘掉这个别名 / 房间默认。', '删除', {
    type: 'danger',
    confirmText: '删除',
  })
  if (!ok) return
  busyId.value = item.id
  try {
    await deleteAgentLearning(item.id)
    setMessage('已删除这条学习')
    await refresh()
  } catch (error) {
    setMessage(getApiErrorMessage(error, '删除学习记录失败'), false)
  } finally {
    busyId.value = ''
  }
}

async function habit(item: AgentHabitCandidate, action: 'accept' | 'dismiss' | 'reset') {
  busyId.value = item.id
  try {
    const result = await actOnAgentHabit(item.id, action)
    if (result?.success === false) {
      setMessage(String(result.message || '处理习惯失败'), false)
    } else if (action === 'accept') {
      // 接受 = 生成自动化草案：把「每天这个点做同一件事」交给用户在草案页核对
      setMessage(
        result?.draftId
          ? '已生成自动化草案：请到「设置 → 自动化与安防 → 自动化草案」核对时间与目标'
          : String(result?.message || '已接受该习惯'),
        true,
      )
    } else {
      setMessage(action === 'dismiss' ? '已忽略该习惯' : '已重置为观察中')
    }
    await refresh()
  } catch (error) {
    setMessage(getApiErrorMessage(error, '处理习惯失败'), false)
  } finally {
    busyId.value = ''
  }
}

async function loadReplay() {
  replayLoading.value = true
  try {
    replay.value = await getAgentIntentReplay(100)
    message.value = ''
  } catch (error) {
    setMessage(getApiErrorMessage(error, '读取意图门回放失败'), false)
  } finally {
    replayLoading.value = false
  }
}

onMounted(refresh)
</script>

<style scoped>
.agent-learn-tag {
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
}
.agent-learn-tag[data-tone='on'] {
  background: var(--set-success-bg);
  color: var(--set-success);
}
.agent-learn-tag[data-tone='off'] {
  background: var(--set-warn-bg);
  color: var(--set-warn);
}
.agent-learn-tag[data-tone='meta'] {
  background: var(--set-glass-bg-hover);
  color: var(--set-text-tertiary);
}
.agent-learn-replay {
  margin-top: 8px;
}
.agent-learn-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin: 8px 0 4px;
}
.agent-learn-metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.agent-learn-metric__value {
  font-size: 1.05rem;
  font-weight: 600;
}
.agent-learn-metric__label {
  font-size: 0.72rem;
  color: var(--hos-text-secondary);
}
</style>
