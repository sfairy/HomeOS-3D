<!--
  自动化草案：Agent 生成的预览（不写入 HA），展示触发 / 目标 / 动作 / 冲突 / 盲区 /
  过期倒计时；可作废，也可在用户二次确认后生成一条本机计划任务。
  列表在切回本页、窗口重新获得焦点以及每 20 秒静默刷新。
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="automation-drafts"
    icon-key="automation-drafts"
    accent="var(--hos-color-accent)"
    layout="single"
  >
    <template #actions>
      <span v-if="drafts.length" class="draft-count">{{ drafts.length }} 份</span>
      <button type="button" class="settings-btn-accent" :disabled="loading" @click="load()">
        <RefreshCw :class="['w-4 h-4', loading && 'animate-spin']" />
        {{ '刷新' }}
      </button>
    </template>

    <div v-if="error" class="draft-alert draft-alert--danger" role="alert">{{ error }}</div>

    <div v-if="drafts.length" class="draft-intro">
      <span class="draft-intro__label">{{ '预览' }}</span>
      <span>
        {{ '草案不会写入 Home Assistant，也不会自动执行；30 分钟内有效。确认无误后可生成计划任务，或直接作废。' }}
      </span>
    </div>

    <SettingsCard v-if="loading && !drafts.length" full static>
      <div class="draft-skeleton" aria-hidden="true">
        <span class="draft-skeleton__line draft-skeleton__line--short" />
        <span class="draft-skeleton__line" />
        <span class="draft-skeleton__line draft-skeleton__line--medium" />
      </div>
      <p class="mt-3 text-sm opacity-60">{{ '正在读取草案…' }}</p>
    </SettingsCard>

    <div v-else-if="drafts.length" class="draft-list-stack">
      <SettingsCard v-for="draft in drafts" :key="draft.draftId" full static>
        <header class="draft-head">
          <div class="draft-head__main">
            <div class="draft-meta">
              <span :class="['draft-status', `draft-status--${statusOf(draft).tone}`]">
                {{ statusOf(draft).label }}
              </span>
              <span class="draft-meta__item">{{ `第 ${draft.revSeq} 版` }}</span>
              <span
                v-if="draft.expiresAt"
                :class="['draft-meta__item', isExpiringSoon(draft) && 'draft-meta__item--warning']"
              >
                <Timer class="w-3 h-3" />
                {{ expiresText(draft) }}
              </span>
              <span v-if="draft.createdAt" class="draft-meta__item" :title="new Date(draft.createdAt).toLocaleString()">
                {{ formatTime(draft.createdAt) }}
              </span>
            </div>
            <h3 class="draft-title">{{ draftTitle(draft) }}</h3>
            <p v-if="draft.rawPrompt && draft.rawPrompt !== draft.preview?.intentSummary" class="draft-raw">
              {{ `原话：${draft.rawPrompt}` }}
            </p>
          </div>
          <div class="draft-actions">
            <button
              v-if="draft.status === 'READY'"
              type="button"
              class="settings-btn-accent"
              :disabled="!canApply(draft) || applyingId === draft.draftId || discardingId === draft.draftId"
              :title="landingReason(draft) || '先确认预览，再生成一条本机计划任务'"
              @click="applyDraft(draft)"
            >
              <Play class="w-4 h-4" />
              {{ applyingId === draft.draftId ? '创建中…' : '确认并生成任务' }}
            </button>
            <button
              v-if="draft.status === 'READY'"
              type="button"
              class="settings-btn-ghost"
              :disabled="!canApply(draft) || exportingId === draft.draftId || applyingId === draft.draftId"
              :title="landingReason(draft) || '写进 HA 自动化：由 HA 执行，自动化列表里可见'"
              @click="exportToHa(draft)"
            >
              <Upload class="w-4 h-4" />
              {{ exportingId === draft.draftId ? '写入中…' : '写入 HA 自动化' }}
            </button>
            <button
              v-if="canEditTargets(draft)"
              type="button"
              class="settings-btn-ghost"
              :disabled="savingTargets || discardingId === draft.draftId"
              @click="openPicker(draft)"
            >
              <Plus class="w-4 h-4" />
              {{ '添加设备' }}
            </button>
            <button
              type="button"
              class="settings-btn-ghost"
              :disabled="discardingId === draft.draftId || applyingId === draft.draftId"
              @click="discard(draft)"
            >
              {{ discardingId === draft.draftId ? '作废中…' : '作废' }}
            </button>
          </div>
        </header>

        <div class="draft-body">
          <section class="draft-block">
            <p class="draft-block__label">{{ '触发与动作' }}</p>
            <p class="draft-block__primary">{{ triggerText(draft) }}</p>
            <div class="draft-chips">
              <code v-if="actionService(draft)" class="draft-chip draft-chip--mono">
                {{ actionService(draft) }}
              </code>
              <span v-else class="draft-chip draft-chip--muted">{{ '未指定动作' }}</span>
              <span v-if="timezoneOf(draft)" class="draft-chip">{{ timezoneOf(draft) }}</span>
              <span v-if="modeOf(draft)" class="draft-chip">{{ modeOf(draft) }}</span>
              <span v-if="conditionText(draft)" class="draft-chip">{{ conditionText(draft) }}</span>
            </div>
            <details v-if="actionData(draft)" class="draft-details draft-details--tight">
              <summary>{{ '动作参数' }}</summary>
              <pre class="draft-json">{{ actionData(draft) }}</pre>
            </details>
          </section>

          <section class="draft-block">
            <p class="draft-block__label">{{ `目标设备 · ${targetsOf(draft).length}` }}</p>
            <ul v-if="targetsOf(draft).length" class="draft-targets">
              <li v-for="(target, index) in targetsOf(draft)" :key="`${target.entityId || target.name}-${index}`">
                <div class="draft-target__line">
                  <span class="draft-target__name">{{ target.name || target.entityId || '未解析目标' }}</span>
                  <span v-if="target.area" class="draft-tag">{{ target.area }}</span>
                  <span v-if="target.risk === 'HIGH'" class="draft-tag draft-tag--danger">{{ '高危' }}</span>
                  <span v-else-if="target.resolved === false" class="draft-tag draft-tag--warning">
                    {{ '未匹配' }}
                  </span>
                  <button
                    v-if="canEditTargets(draft) && targetsOf(draft).length > 1"
                    type="button"
                    class="draft-target__remove"
                    :disabled="savingTargets"
                    :aria-label="`移除 ${target.name || target.entityId}`"
                    :title="`移除 ${target.name || target.entityId}`"
                    @click="removeTarget(draft, target)"
                  >
                    <X class="w-3 h-3" />
                  </button>
                </div>
                <code v-if="target.entityId" class="draft-target__id" :title="target.entityId">
                  {{ target.entityId }}
                </code>
              </li>
            </ul>
            <p v-else class="draft-block__primary draft-block__primary--muted">{{ '未指定目标设备' }}</p>
          </section>
        </div>

        <p v-if="landingHint(draft)" class="draft-hint">
          <Info class="w-4 h-4 shrink-0" />
          <span>{{ landingHint(draft) }}</span>
          <button
            v-if="canSplit(draft)"
            type="button"
            class="settings-btn-ghost draft-hint__action"
            :disabled="splittingId === draft.draftId"
            :title="'可选：把这条规则拆成各自独立的计划任务'"
            @click="splitDraft(draft)"
          >
            {{ splittingId === draft.draftId ? '拆分中…' : `拆成 ${resolvedTargets(draft)} 条` }}
          </button>
        </p>

        <div v-if="highRisk(draft).length" class="draft-alert draft-alert--danger">
          <p class="draft-alert__title">
            <ShieldAlert class="w-4 h-4" />
            {{ '高危拦截：这份草案不会进入待确认状态' }}
          </p>
          <ul class="draft-list">
            <li v-for="reason in highRisk(draft)" :key="reason">{{ reason }}</li>
          </ul>
        </div>

        <div v-if="conflictsOf(draft, 'certain').length" class="draft-alert draft-alert--danger">
          <p class="draft-alert__title">
            <TriangleAlert class="w-4 h-4" />
            {{ `确定性冲突 ${conflictsOf(draft, 'certain').length} 条` }}
          </p>
          <ul class="draft-list">
            <li v-for="(item, index) in conflictsOf(draft, 'certain')" :key="`certain-${index}`">
              {{ conflictText(item) }}
            </li>
          </ul>
        </div>

        <div v-if="conflictsOf(draft, 'possible').length" class="draft-alert draft-alert--warning">
          <p class="draft-alert__title">
            <TriangleAlert class="w-4 h-4" />
            {{ `可能冲突 ${conflictsOf(draft, 'possible').length} 条` }}
          </p>
          <ul class="draft-list">
            <li v-for="(item, index) in conflictsOf(draft, 'possible')" :key="`possible-${index}`">
              {{ conflictText(item) }}
            </li>
          </ul>
        </div>

        <footer v-if="hasDetails(draft)" class="draft-foot">
          <details v-if="conflictsOf(draft, 'unknown').length" class="draft-details">
            <summary>{{ `盲区 ${conflictsOf(draft, 'unknown').length} 条（无法静态判定）` }}</summary>
            <ul class="draft-list">
              <li v-for="(item, index) in conflictsOf(draft, 'unknown')" :key="`unknown-${index}`">
                {{ conflictText(item) }}
              </li>
            </ul>
          </details>
          <details v-if="runtimeImpact(draft).length" class="draft-details">
            <summary>{{ '运行与重启影响' }}</summary>
            <ul class="draft-list">
              <li v-for="line in runtimeImpact(draft)" :key="line">{{ line }}</li>
            </ul>
          </details>
        </footer>
      </SettingsCard>
    </div>

    <SettingsCard v-else full static>
      <div class="draft-empty">
        <ListChecks class="w-5 h-5 mt-0.5 opacity-70" />
        <div class="min-w-0">
          <p class="font-semibold">{{ '暂无草案' }}</p>
          <p class="mt-1 text-sm opacity-70">
            {{ '对智能管家说「帮我做一个每天十点关客厅灯的自动化」，它会先生成预览，出现在这里。' }}
          </p>
          <p class="mt-2 text-xs opacity-55">
            {{ '草案 30 分钟内有效；生成计划任务后才会真正生效。' }}
          </p>
        </div>
      </div>
    </SettingsCard>

    <EntityPickModal
      v-if="picker.open"
      :key="picker.draftId || 'picker'"
      :is-open="picker.open"
      :domain="picker.domain"
      :domain-label="picker.label"
      :initial-ids="picker.ids"
      standalone
      @close="closePicker"
      @save="onTargetsPicked"
    />
  </SettingsPageShell>
</template>

<script setup>
import { defineAsyncComponent, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'
import { Info, ListChecks, Play, Plus, RefreshCw, ShieldAlert, Timer, TriangleAlert, Upload, X } from '@lucide/vue'
import SettingsPageShell from '@/features/settings/components/shell/SettingsPageShell.vue'
import SettingsCard from '@/features/settings/components/shell/SettingsCard.vue'
import { useChromeStore } from '@/kernel/ui/chrome/chrome-store'
import {
  applyAutomationDraft,
  exportAutomationDraftToHa,
  deleteAutomationDraft,
  listAutomationDrafts,
  setAutomationDraftTargets,
  splitAutomationDraft,
} from '@/domain/api/automation'
import { getApiErrorMessage } from '@/kernel/utils/core/error-message'

/** 实体选择器按需加载：它只在点「添加设备」时才需要。 */
const EntityPickModal = defineAsyncComponent(() => import('@/features/entity/components/EntityPickModal.vue'))

defineProps({ activeTab: { type: String, default: 'automation-drafts' } })

const POLL_INTERVAL_MS = 20_000
const EXPIRING_SOON_MS = 5 * 60_000
/** 本机计划任务能够承载的触发类型（与后端 landing / scheduler 保持一致）。 */
const LANDABLE_TRIGGERS = new Set(['time', 'cron'])
const STATUS_META = {
  READY: { label: '待确认', tone: 'ready' },
  CLARIFYING: { label: '待补充', tone: 'clarifying' },
  BLOCKED: { label: '已拦截', tone: 'blocked' },
  APPLIED: { label: '已生成任务', tone: 'ready' },
  EXPIRED: { label: '已过期', tone: 'muted' },
  SUPERSEDED: { label: '已被替代', tone: 'muted' },
  DISCARDED: { label: '已作废', tone: 'muted' },
}

const chrome = useChromeStore()
const loading = ref(false)
const error = ref('')
const drafts = ref([])
const discardingId = ref('')
const applyingId = ref('')
/** 正在「写入 HA 自动化」的草案 id（与 applyingId 分开：两个动作互不阻塞提示） */
const exportingId = ref('')
const splittingId = ref('')
const savingTargets = ref(false)
/** 目标设备选择器状态：draftId 为空表示关闭。 */
const picker = ref({ open: false, draftId: '', ids: [], domain: 'light', label: '设备' })
const now = ref(Date.now())

let pollTimer = null
let tickTimer = null
let activatedOnce = false

function formatTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  // 只显示「月/日 时:分」：完整时间在悬停提示里，避免挤占状态行
  return date.toLocaleString(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusOf(draft) {
  return STATUS_META[draft.status] || { label: draft.status || '未知', tone: 'muted' }
}

function expiresText(draft) {
  if (!draft.expiresAt) return '无过期时间'
  const remaining = new Date(draft.expiresAt).getTime() - now.value
  if (Number.isNaN(remaining)) return '无过期时间'
  if (remaining <= 0) return '已过期'
  const minutes = Math.floor(remaining / 60_000)
  const seconds = Math.floor((remaining % 60_000) / 1000)
  return minutes > 0 ? `${minutes} 分 ${seconds} 秒后过期` : `${seconds} 秒后过期`
}

function isExpiringSoon(draft) {
  if (!draft.expiresAt) return false
  const remaining = new Date(draft.expiresAt).getTime() - now.value
  return Number.isFinite(remaining) && remaining > 0 && remaining <= EXPIRING_SOON_MS
}

function draftTitle(draft) {
  return draft.preview?.intentSummary || draft.rawPrompt || '未命名草案'
}

function targetsOf(draft) {
  return draft.preview?.targetEntities || []
}

function triggersOf(draft) {
  const spec = draft.preview?.triggerAndConditionSpec
  if (!spec) return []
  if (Array.isArray(spec.triggers) && spec.triggers.length) return spec.triggers
  return [spec]
}

function triggerText(draft) {
  const lines = triggersOf(draft)
    .map((item) => item?.description || [item?.type, item?.at].filter(Boolean).join(' '))
    .filter(Boolean)
  return lines.join('；') || '未指定触发条件'
}

function timezoneOf(draft) {
  return draft.preview?.triggerAndConditionSpec?.timezone || ''
}

function modeOf(draft) {
  const mode = draft.preview?.triggerAndConditionSpec?.mode
  if (!mode || mode === 'single') return ''
  return mode === 'restart' ? '可重复触发' : `模式 ${mode}`
}

function conditionText(draft) {
  const spec = draft.preview?.triggerAndConditionSpec
  if (!spec) return ''
  const parts = []
  if (spec.forDuration) parts.push(`持续 ${spec.forDuration}`)
  if (Array.isArray(spec.conditions) && spec.conditions.length) {
    parts.push(`${spec.conditions.length} 条前置条件`)
  }
  return parts.join(' · ')
}

function actionService(draft) {
  return draft.spec?.action?.service || ''
}

function actionData(draft) {
  const data = draft.spec?.action?.data
  if (!data || typeof data !== 'object' || !Object.keys(data).length) return ''
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return ''
  }
}

function runtimeImpact(draft) {
  return draft.preview?.runtimeAndRestartImpact || []
}

function highRisk(draft) {
  return draft.preview?.highRisk || []
}

function conflictsOf(draft, kind) {
  return draft.preview?.conflictAndBlindspotReport?.[kind] || []
}

function hasDetails(draft) {
  return conflictsOf(draft, 'unknown').length > 0 || runtimeImpact(draft).length > 0
}

function conflictText(item) {
  if (!item || typeof item !== 'object') return String(item || '')
  if (item.reason) return item.reason
  const label = item.existingName || item.name || item.entityId || item.refs?.join('、')
  return label ? `${label}（${item.kind || item.source || '未知来源'}）` : item.kind || '未知冲突'
}

/**
 * 这份草案能否一键生成计划任务。
 *
 * 与后端 `landing.build_task_payload` 同一套限制：单一时间型触发、目标与动作同域；
 * 多台同域设备是允许的（到点逐个下发）。后端在预览里直接给出 `landing` 结论，前端只用它
 * 决定「按钮可点 / 显示原因」；老数据没有该字段时才回退到本地判断。
 */
function landingReason(draft) {
  const landing = draft.preview?.landing
  if (landing && typeof landing.available === 'boolean') {
    return landing.available ? '' : landing.reason || '这份草案暂时无法生成计划任务。'
  }
  // 老数据没有 landing 字段：按本地规则逐项判断，顺序与后端一致
  return targetIssue(draft) || actionIssue(draft) || triggerIssue(draft)
}

function targetIssue(draft) {
  const resolved = targetsOf(draft).filter((target) => target.entityId)
  if (!resolved.length) return '草案还没有解析出目标设备，暂时无法生成计划任务。'
  const domain = targetDomain(draft)
  const mismatched = resolved.find((target) => target.entityId.split('.', 1)[0] !== domain)
  if (mismatched && domain !== 'homeassistant') {
    return `动作域 ${domain} 与目标设备 ${mismatched.entityId} 不一致，请把不同域的设备拆成多条规则。`
  }
  return ''
}

function actionIssue(draft) {
  const service = actionService(draft)
  return service && service.includes('.') ? '' : '草案的动作缺少设备域（需要「域.服务」），无法生成计划任务。'
}

function triggerIssue(draft) {
  const triggers = triggersOf(draft)
  if (triggers.length !== 1) return '计划任务只支持一个触发条件；请让管家精简这份草案。'
  const type = triggers[0]?.type || 'time'
  return LANDABLE_TRIGGERS.has(type) ? '' : `「${type}」类型的触发暂不支持生成计划任务（当前支持每天 / 每周定时）。`
}

function canApply(draft) {
  return draft.status === 'READY' && !landingReason(draft)
}

/** 目标设备可编辑的状态：待确认 / 待补充（已拦截的草案不允许绕过风险改回可用）。 */
function canEditTargets(draft) {
  return draft.status === 'READY' || draft.status === 'CLARIFYING'
}

/** 选择器只看动作所属的设备域：light.turn_off 的草案不该把开关加进来。 */
function targetDomain(draft) {
  const service = actionService(draft)
  return service.includes('.') ? service.split('.', 1)[0] : 'other'
}

function openPicker(draft) {
  const domain = targetDomain(draft)
  picker.value = {
    open: true,
    draftId: draft.draftId,
    ids: targetsOf(draft)
      .map((target) => target.entityId)
      .filter(Boolean),
    domain,
    label: domain === 'other' ? '设备' : `${domain} 设备`,
  }
}

function closePicker() {
  picker.value = { ...picker.value, open: false, draftId: '' }
}

async function saveTargets(draftId, entityIds, successText) {
  if (!entityIds.length) {
    chrome.notify('至少要保留一个目标设备', 'warning')
    return
  }
  savingTargets.value = true
  try {
    const { data } = await setAutomationDraftTargets(draftId, entityIds)
    await load({ silent: true })
    if (data?.status === 'BLOCKED') {
      chrome.notify('更新后命中高危设备，草案已被拦截', 'error')
    } else {
      chrome.notify(successText, 'success')
    }
  } catch (e) {
    const message = getApiErrorMessage(e, '更新目标设备失败')
    error.value = message
    chrome.notify(message, 'error')
  } finally {
    savingTargets.value = false
  }
}

async function onTargetsPicked(entityIds) {
  const draftId = picker.value.draftId
  closePicker()
  if (!draftId) return
  await saveTargets(draftId, entityIds, '目标设备已更新')
}

async function removeTarget(draft, target) {
  if (savingTargets.value) return
  const remaining = targetsOf(draft)
    .map((item) => item.entityId)
    .filter((id) => id && id !== target.entityId)
  const label = target.name || target.entityId
  const confirmed = await chrome.confirm(`移除「${label}」后，这条草案只控制剩下的设备。`, '移除目标设备', {
    confirmText: '移除',
    cancelText: '取消',
    type: 'danger',
  })
  if (!confirmed) return
  await saveTargets(draft.draftId, remaining, `已移除「${label}」`)
}

/** 多目标草案：可以机械拆成每个目标一条（可选，不是落地前提）。 */
function canSplit(draft) {
  return draft.status === 'READY' && resolvedTargets(draft) > 1
}

function resolvedTargets(draft) {
  return targetsOf(draft).filter((target) => target.entityId).length
}

function landingHint(draft) {
  // 待补充的草案也把原因说清楚，否则只剩一个「待补充」标签无从下手
  if (draft.status !== 'READY' && draft.status !== 'CLARIFYING') return ''
  const reason = landingReason(draft)
  if (reason) return reason
  const certain = conflictsOf(draft, 'certain').length
  if (certain) return `生成前需要确认 ${certain} 条确定性冲突。`
  const count = resolvedTargets(draft)
  if (count > 1) return `到点会依次控制 ${count} 台设备；每台仍单独走权限与高危校验。`
  return ''
}

async function load({ silent = false } = {}) {
  if (!silent) loading.value = true
  try {
    const { data } = await listAutomationDrafts()
    drafts.value = data?.items || []
    error.value = ''
  } catch (e) {
    error.value = getApiErrorMessage(e, '读取草案失败')
  } finally {
    if (!silent) loading.value = false
  }
}

async function discard(draft) {
  const confirmed = await chrome.confirm('作废后这份草案会立即从列表移除，且不能恢复。', '作废自动化草案', {
    confirmText: '作废',
    cancelText: '取消',
    type: 'danger',
  })
  if (!confirmed) return
  discardingId.value = draft.draftId
  try {
    await deleteAutomationDraft(draft.draftId)
    drafts.value = drafts.value.filter((item) => item.draftId !== draft.draftId)
    chrome.notify('草案已作废', 'success')
  } catch (e) {
    chrome.notify(getApiErrorMessage(e, '作废失败'), 'error')
  } finally {
    discardingId.value = ''
  }
}

function applyConfirmMessage(draft) {
  const parts = [triggerText(draft)]
  const targets = targetsOf(draft)
    .map((target) => target.name || target.entityId)
    .filter(Boolean)
  if (targets.length) parts.push(`目标：${targets.join('、')}`)
  if (actionService(draft)) parts.push(`动作：${actionService(draft)}`)
  if (targets.length > 1) parts.push(`到点会依次控制 ${targets.length} 台设备`)
  const certain = conflictsOf(draft, 'certain')
  if (certain.length) parts.push(`注意：与 ${certain.length} 条已有规则存在确定性冲突。`)
  parts.push('确认后会创建一条本机计划任务，可随时在计划任务里停用或删除。')
  return parts.filter(Boolean).join('；')
}

async function splitDraft(draft) {
  if (splittingId.value) return
  const lines = targetsOf(draft)
    .map((target) => target.name || target.entityId)
    .filter(Boolean)
  const confirmed = await chrome.confirm(
    `会按目标拆成 ${lines.length} 条单目标草案（${lines.join('、')}），原草案作废；拆出的每条可单独确认生成计划任务。`,
    '拆分为多条草案',
    { confirmText: '拆分', cancelText: '取消' },
  )
  if (!confirmed) return
  splittingId.value = draft.draftId
  try {
    const { data } = await splitAutomationDraft(draft.draftId)
    chrome.notify(`已拆成 ${data?.items?.length || lines.length} 条草案`, 'success')
    await load({ silent: true })
  } catch (e) {
    const message = getApiErrorMessage(e, '拆分失败')
    error.value = message
    chrome.notify(message, 'error')
  } finally {
    splittingId.value = ''
  }
}

async function applyDraft(draft) {
  if (applyingId.value || !canApply(draft)) return
  const confirmed = await chrome.confirm(applyConfirmMessage(draft), '确认并生成计划任务', {
    confirmText: '确认生成',
    cancelText: '取消',
  })
  if (!confirmed) return
  applyingId.value = draft.draftId
  try {
    const { data } = await applyAutomationDraft(draft.draftId, conflictsOf(draft, 'certain').length > 0)
    const name = data?.task?.name || draftTitle(draft)
    drafts.value = drafts.value.filter((item) => item.draftId !== draft.draftId)
    chrome.notify(`已创建计划任务「${name}」`, 'success')
  } catch (e) {
    const message = getApiErrorMessage(e, '生成计划任务失败')
    error.value = message
    chrome.notify(message, 'error')
  } finally {
    applyingId.value = ''
  }
}

/**
 * 把草案写进 HA 自动化（由 HA 执行，自动化列表里可见、换机后仍在）。
 *
 * 与 `applyDraft` 并列而不是替换：本机计划任务由 HomeOS 调度器执行，HA 自动化由 HA 执行，
 * 两者语义不同，用户按需选。`automationId` 由草案派生，重复点击是覆盖同一条。
 */
async function exportToHa(draft) {
  if (exportingId.value || !canApply(draft)) return
  const confirmed = await chrome.confirm(
    '这条规则会写进 Home Assistant 的自动化配置，之后由 HA 自己执行（不再是 HomeOS 计划任务）。重复导出会覆盖同一条自动化。继续？',
    '写入 HA 自动化',
    { confirmText: '写入 HA', cancelText: '取消' },
  )
  if (!confirmed) return
  exportingId.value = draft.draftId
  try {
    const { data } = await exportAutomationDraftToHa(draft.draftId, conflictsOf(draft, 'certain').length > 0)
    chrome.notify(`已写入 HA 自动化「${data?.automation?.alias || draftTitle(draft)}」`, 'success')
    await load({ silent: true })
  } catch (e) {
    const message = getApiErrorMessage(e, '写入 HA 自动化失败')
    error.value = message
    chrome.notify(message, 'error')
  } finally {
    exportingId.value = ''
  }
}

function onVisibilityChange() {
  if (!document.hidden) load({ silent: true })
}

function stopTimers() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
  document.removeEventListener('visibilitychange', onVisibilityChange)
}

function startTimers() {
  stopTimers()
  tickTimer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
  // 草案由 Agent 在对话里创建：停留在本页时也要能自动看到新草案，不必反复点刷新。
  pollTimer = setInterval(() => load({ silent: true }), POLL_INTERVAL_MS)
  document.addEventListener('visibilitychange', onVisibilityChange)
}

onMounted(() => {
  now.value = Date.now()
  startTimers()
  load()
})

onActivated(() => {
  // 首次挂载时 mounted 已加载过一次；keep-alive 缓存后再次切回来需要重新拉取。
  if (activatedOnce) load({ silent: true })
  activatedOnce = true
  startTimers()
})

onDeactivated(() => {
  stopTimers()
})

onBeforeUnmount(() => {
  stopTimers()
})
</script>

<style scoped src="./styles/automation-drafts.css"></style>
