<!--
  智能管家「计划任务」区段：一次性 / 每天 / cron 定时执行设备动作。
  列表与执行日志走独立即时 CRUD（不进布局保存），因此不参与设置页的 pending 计算。
-->
<template>
  <section class="settings-hub-section">
    <SettingsCard static extra-class="agent-scene-voice-workspace">
      <SettingsCardIntro
        :icon="CalendarClock"
        icon-class="agent-icon--model"
        orb-class="agent-orb--model"
        eyebrow="计划任务"
        :description="'到点或按周期执行一个设备动作。执行时仍走实体 ACL、服务白名单与高危拦截；创建者身份被收回时任务只会失败并记录，不会提权执行。'"
      >
        <template #actions>
          <button
            type="button"
            class="settings-btn-ghost shrink-0"
            :disabled="loading"
            @click="refresh"
          >
            {{ loading ? '刷新中…' : '刷新' }}
          </button>
        </template>
      </SettingsCardIntro>

      <p v-if="message" class="agent-band-hint" :class="{ 'agent-band-hint--meta': !messageOk }">
        {{ message }}
      </p>

      <div class="agent-model-body">
        <div class="agent-split">
          <div class="agent-split__main">
        <SettingsSectionHead
          :title="editingId ? '编辑任务' : '新建任务'"
          eyebrow="定时"
          description="一次性用延迟分钟；周期用 HH:MM 或 5 段 cron"
          bordered
        />

        <div class="settings-form-grid settings-form-grid--2 agent-form-block">
          <div>
            <label class="settings-form-label mb-1.5">任务名称</label>
            <input v-model="form.name" class="settings-field" type="text" placeholder="每天 22 点关客厅灯" />
          </div>
          <div>
            <label class="settings-form-label mb-1.5">执行方式</label>
            <HosSelect v-model="form.scheduleType" variant="settings" block :searchable="false">
              <option value="RECURRING">每天 / 周期</option>
              <option value="ONCE">一次性</option>
            </HosSelect>
          </div>
          <div v-if="form.scheduleType === 'RECURRING'">
            <label class="settings-form-label mb-1.5">每天时间</label>
            <input v-model="form.time" class="settings-field" type="time" :disabled="!!form.cron.trim()" />
          </div>
          <div v-else>
            <label class="settings-form-label mb-1.5">多少分钟后执行</label>
            <input v-model.number="form.delayMinutes" class="settings-field" type="number" min="0" max="10080" />
          </div>
          <div v-if="form.scheduleType === 'RECURRING'">
            <label class="settings-form-label mb-1.5">cron（可选，优先于上面的时间）</label>
            <input
              v-model="form.cron"
              class="settings-field"
              type="text"
              placeholder="0 7 * * 1-5（工作日 7 点）"
            />
            <p class="agent-band-hint mt-2">5 段：分 时 日 月 周；留空则用左边的每天时间</p>
          </div>
          <div>
            <label class="settings-form-label mb-1.5">目标设备</label>
            <EntityMultiSelect
              v-model="form.entities"
              placeholder="搜索并选择一个设备…"
              :max-selection="1"
            />
          </div>
          <div>
            <label class="settings-form-label mb-1.5">动作</label>
            <HosSelect v-model="form.service" variant="settings" block :searchable="false">
              <option value="turn_off">关闭</option>
              <option value="turn_on">打开</option>
              <option value="toggle">切换</option>
            </HosSelect>
          </div>
        </div>
        <p class="agent-band-hint">
          cron 表达式可直接在对话里说「工作日早上 7 点开窗帘」，管家会自动换算。
        </p>
        <div class="agent-sched-actions">
          <button v-if="editingId" type="button" class="settings-btn-ghost" @click="cancelEdit">
            取消编辑
          </button>
          <button
            type="button"
            class="settings-btn-accent"
            :disabled="creating || !form.entities.length"
            @click="submit"
          >
            {{ creating ? '保存中…' : editingId ? '保存修改' : '创建任务' }}
          </button>
        </div>
          </div>

          <div class="agent-split__side">
        <SettingsSectionHead
          title="任务列表"
          eyebrow="运行中"
          description="一次性任务执行后自动停用"
          bordered
          class="agent-section-gap"
        />

        <p v-if="!tasks.length" class="agent-band-hint">还没有计划任务。</p>
        <ul v-else class="agent-sched-list">
          <li v-for="task in tasks" :key="task.id" class="agent-sched-row">
            <div class="agent-sched-row__main">
              <span class="agent-sched-row__name">{{ task.name }}</span>
              <span class="agent-sched-row__meta">
                {{ scheduleLabel(task) }} · 下次 {{ formatTime(task.nextRunAt) }}
                <template v-if="task.lastStatus">
                  · 上次 {{ statusLabel(task.lastStatus) }}
                </template>
              </span>
              <span v-if="task.lastError" class="agent-sched-row__err">{{ task.lastError }}</span>
              <span class="agent-sched-row__meta">最后修改：{{ editorName(task.updatedBy) }}</span>
            </div>
            <div class="agent-sched-row__side">
              <button type="button" class="settings-btn-ghost" @click="startEdit(task)">编辑</button>
              <button
                type="button"
                class="settings-btn-ghost"
                @click="toggle(task.id, !task.enabled)"
              >
                {{ task.enabled ? '停用' : '启用' }}
              </button>
              <button type="button" class="settings-btn-ghost" @click="loadLogs(task.id)">
                日志
              </button>
              <button type="button" class="settings-btn-ghost" @click="remove(task.id)">删除</button>
            </div>
          </li>
        </ul>

        <div v-if="logs.length" class="agent-sched-logs">
          <SettingsSectionHead
            title="最近执行"
            eyebrow="日志"
            :description="logHeader"
            bordered
            class="agent-section-gap"
          />
          <ul class="agent-sched-list">
            <li v-for="log in logs" :key="log.id" class="agent-sched-row">
              <div class="agent-sched-row__main">
                <span class="agent-sched-row__name">
                  {{ statusLabel(log.status) }} · {{ formatTime(log.startedAt) }}
                </span>
                <span v-if="log.message" class="agent-sched-row__meta">{{ log.message }}</span>
              </div>
            </li>
          </ul>
        </div>
          </div>
        </div>
      </div>
    </SettingsCard>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { CalendarClock } from '@lucide/vue'
import HosSelect from '@/components/common/base/HosSelect.vue'
import EntityMultiSelect from '@/components/common/EntityMultiSelect.vue'
import SettingsCard from '@/components/common/settings-page-shell/SettingsCard.vue'
import SettingsCardIntro from '@/components/common/settings-page-shell/SettingsCardIntro.vue'
import SettingsSectionHead from '@/features/settings/shared/layout/SettingsSectionHead.vue'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import { formatFullDateTime } from '@/shared/utils/format/locale-format.util'
import {
  createAgentSchedule,
  deleteAgentSchedule,
  listAgentScheduleLogs,
  listAgentSchedules,
  toggleAgentSchedule,
  updateAgentSchedule,
  type AgentActorSnapshot,
  type AgentScheduleLog,
  type AgentSchedulePayload,
  type AgentScheduledTask,
  type AgentScheduleWriteResult,
} from '@/services/api/agent'

const loading = ref(false)
const creating = ref(false)
/** 非空表示正在编辑该条计划任务 */
const editingId = ref('')
const message = ref('')
const messageOk = ref(true)
const tasks = ref<AgentScheduledTask[]>([])
const logs = ref<AgentScheduleLog[]>([])
const logTaskName = ref('')

const form = reactive({
  name: '',
  scheduleType: 'RECURRING' as 'ONCE' | 'RECURRING',
  time: '22:00',
  cron: '',
  delayMinutes: 10,
  entities: [] as string[],
  service: 'turn_off',
})

const logHeader = computed(() =>
  logTaskName.value ? `任务「${logTaskName.value}」最近 20 条` : '最近 20 条',
)

function scheduleLabel(task: AgentScheduledTask): string {
  if (task.scheduleType === 'RECURRING') {
    return task.cron ? `周期 ${task.cron}` : '周期'
  }
  return `一次性 ${formatTime(task.runAt)}`
}

function statusLabel(status: string): string {
  if (status === 'success') return '成功'
  if (status === 'skipped') return '已跳过'
  if (status === 'failed') return '失败'
  return status || '未执行'
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

/** 展示「最后修改者」；系统写入（空快照）显示为系统 */
function editorName(snapshot?: AgentActorSnapshot): string {
  return snapshot?.username || snapshot?.userId || '系统'
}

/** 把 ``0 22 * * *`` 这类整点 cron 还原成时间选择器能显示的值 */
function cronToTime(cron: string): string {
  const match = /^0 (\d{1,2}) \* \* \*$/.exec(cron.trim())
  if (!match) return ''
  return `${match[1].padStart(2, '0')}:00`
}

/** 一次性任务：把剩余时间折算回「多少分钟后执行」 */
function minutesUntil(runAt: string | null): number {
  if (!runAt) return 0
  const text = String(runAt).replace(' ', 'T')
  const target = new Date(text.endsWith('Z') ? text : `${text}Z`).getTime()
  if (Number.isNaN(target)) return 0
  return Math.max(0, Math.round((target - Date.now()) / 60_000))
}

function resetForm() {
  editingId.value = ''
  form.name = ''
  form.scheduleType = 'RECURRING'
  form.time = '22:00'
  form.cron = ''
  form.delayMinutes = 10
  form.entities = []
  form.service = 'turn_off'
}

/** 把列表项回填进表单，改完走同一个提交入口 */
function startEdit(task: AgentScheduledTask) {
  const args = task.actionArgs ?? {}
  editingId.value = task.id
  form.name = task.name
  form.scheduleType = task.scheduleType
  form.cron = task.scheduleType === 'RECURRING' && !cronToTime(task.cron) ? task.cron : ''
  form.time = cronToTime(task.cron) || '22:00'
  form.delayMinutes = minutesUntil(task.runAt)
  form.entities = typeof args.entity_id === 'string' ? [args.entity_id] : []
  form.service = typeof args.service === 'string' ? args.service : 'turn_off'
  message.value = ''
}

function cancelEdit() {
  resetForm()
  message.value = ''
}

async function refresh() {
  loading.value = true
  try {
    tasks.value = await listAgentSchedules()
  } catch (error) {
    setMessage(getApiErrorMessage(error, '读取计划任务失败'), false)
  } finally {
    loading.value = false
  }
}

/** 时间部分：一次性取延迟分钟，周期优先 cron，其次每天时间；都不合法返回 null */
function buildScheduleTiming(): Partial<AgentSchedulePayload> | null {
  if (form.scheduleType !== 'RECURRING') {
    return { delayMinutes: Math.max(0, Number(form.delayMinutes) || 0) }
  }
  const cron = form.cron.trim()
  if (cron) return { cron }
  return form.time ? { time: form.time } : null
}

/** 组装保存请求；缺目标设备或时间时给出提示并返回 null */
function buildSchedulePayload(): AgentSchedulePayload | null {
  const entityId = form.entities[0] || ''
  if (!entityId) {
    setMessage('请选择一个目标设备', false)
    return null
  }
  const timing = buildScheduleTiming()
  if (!timing) {
    setMessage('请选择每天执行时间或填写 cron', false)
    return null
  }
  return {
    name: form.name.trim() || `${entityId} ${form.service}`,
    scheduleType: form.scheduleType,
    ...timing,
    actionTool: 'control_device',
    actionArgs: {
      domain: entityId.split('.')[0],
      service: form.service,
      entity_id: entityId,
    },
  }
}

/** 保存 / 创建共用一份结果处理，避免 submit 里的分支越堆越多 */
async function applyWriteResult(
  result: AgentScheduleWriteResult,
  payload: AgentSchedulePayload,
  targetId: string,
) {
  if (!result.ok) {
    setMessage(result.message || (targetId ? '保存失败' : '创建失败'), false)
    return
  }
  const action = targetId ? '已保存' : '已创建'
  setMessage(`${action}计划任务「${result.task?.name || payload.name || ''}」`, true)
  resetForm()
  await refresh()
}

async function submit() {
  const payload = buildSchedulePayload()
  if (!payload) return
  const targetId = editingId.value
  creating.value = true
  try {
    const result = targetId
      ? await updateAgentSchedule(targetId, payload)
      : await createAgentSchedule(payload)
    await applyWriteResult(result, payload, targetId)
  } catch (error) {
    setMessage(getApiErrorMessage(error, targetId ? '保存计划任务失败' : '创建计划任务失败'), false)
  } finally {
    creating.value = false
  }
}

async function toggle(taskId: string, enabled: boolean) {
  try {
    const result = await toggleAgentSchedule(taskId, enabled)
    if (!result.ok) setMessage(result.message || '切换失败', false)
    await refresh()
  } catch (error) {
    setMessage(getApiErrorMessage(error, '切换失败'), false)
  }
}

async function remove(taskId: string) {
  try {
    const result = await deleteAgentSchedule(taskId)
    if (!result.ok) setMessage(result.message || '删除失败', false)
    else setMessage('已删除', true)
    if (logTaskName.value) logs.value = []
    await refresh()
  } catch (error) {
    setMessage(getApiErrorMessage(error, '删除失败'), false)
  }
}

async function loadLogs(taskId: string) {
  logTaskName.value = tasks.value.find((item) => item.id === taskId)?.name ?? ''
  try {
    logs.value = await listAgentScheduleLogs(taskId, 20)
  } catch (error) {
    setMessage(getApiErrorMessage(error, '读取执行日志失败'), false)
  }
}

onMounted(() => {
  void refresh()
})
</script>

<style scoped>
.agent-sched-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}
.agent-sched-logs {
  margin-top: 8px;
}
</style>
