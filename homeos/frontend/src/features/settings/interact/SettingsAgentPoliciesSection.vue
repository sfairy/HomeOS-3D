<!--
  智能管家「家规」区段：房间长期无人时提醒，或按规则自动关停低危设备。
  列表 / 表单走独立即时 CRUD；自动关停仍受「主动管家」里的总开关与设备域白名单约束。
-->
<template>
  <section class="settings-hub-section">
    <SettingsCard static extra-class="agent-scene-voice-workspace">
      <SettingsCardIntro
        :icon="ScrollText"
        icon-class="agent-icon--model"
        orb-class="agent-orb--model"
        eyebrow="家规"
        :description="'房间长期无人时提醒，或按规则关闭常开的灯 / 风扇 / 空调。自动关停必须同时在「主动管家」开启总开关，且只作用于低危设备域；门锁、安防、燃气、窗帘永远不会被自动操作。'"
      >
        <template #actions>
          <button
            type="button"
            class="settings-btn-ghost shrink-0"
            :disabled="patrolling"
            @click="runPatrol"
          >
            {{ patrolling ? '巡检中…' : '立即巡检' }}
          </button>
        </template>
      </SettingsCardIntro>

      <p v-if="message" class="agent-band-hint" :class="{ 'agent-band-hint--meta': !messageOk }">
        {{ message }}
      </p>
      <div v-if="conflicts.length" class="agent-policy-conflicts">
        <p class="agent-policy-conflicts__title">与已有家规冲突：</p>
        <ul>
          <li v-for="item in conflicts" :key="item.ruleId">{{ item.reason }}</li>
        </ul>
        <button type="button" class="settings-btn-accent mt-2" :disabled="creating" @click="submit(true)">
          {{ editingId ? '仍然保存' : '仍然创建' }}
        </button>
      </div>

      <div class="agent-model-body">
        <div class="agent-split">
          <div class="agent-split__main">
        <SettingsSectionHead
          :title="editingId ? '编辑家规' : '新建家规'"
          eyebrow="空转"
          description="无人超过阈值且设备常开时命中"
          bordered
        />

        <div class="settings-form-grid settings-form-grid--2 agent-form-block">
          <div>
            <label class="settings-form-label mb-1.5">规则名称</label>
            <input v-model="form.name" class="settings-field" type="text" placeholder="客厅无人关灯" />
          </div>
          <div>
            <label class="settings-form-label mb-1.5">房间</label>
            <HosSelect v-model="form.areaId" variant="settings" block>
              <option value="">全屋（任意房间）</option>
              <option v-for="area in areas" :key="area.id" :value="area.id">{{ area.name }}</option>
            </HosSelect>
          </div>
          <div>
            <label class="settings-form-label mb-1.5">无人多少分钟后命中</label>
            <input v-model.number="form.idleMinutes" class="settings-field" type="number" min="0" max="1440" />
            <p class="agent-band-hint mt-2">0 表示沿用「主动管家」里的全局阈值</p>
          </div>
          <div>
            <label class="settings-form-label mb-1.5">目标设备类型</label>
            <div class="agent-policy-domains">
              <label v-for="domain in domainOptions" :key="domain.id" class="agent-policy-domain">
                <input v-model="form.domains" type="checkbox" class="settings-checkbox" :value="domain.id" />
                <span>{{ domain.label }}</span>
              </label>
            </div>
          </div>
        </div>

        <label class="agent-scene-toggle" :class="{ 'agent-scene-toggle--on': form.autoClose }">
          <input v-model="form.autoClose" type="checkbox" class="settings-checkbox" />
          <div>
            <span class="agent-scene-toggle__title">命中后自动关停</span>
            <span class="agent-scene-toggle__desc">
              仍需在「主动管家」开启自动关停总开关；单次最多关停数量也在那里配置
            </span>
          </div>
        </label>

        <div class="agent-sched-actions">
          <button v-if="editingId" type="button" class="settings-btn-ghost" @click="cancelEdit">
            取消编辑
          </button>
          <button type="button" class="settings-btn-accent" :disabled="creating" @click="submit(false)">
            {{ creating ? '保存中…' : editingId ? '保存修改' : '创建家规' }}
          </button>
        </div>
          </div>

          <div class="agent-split__side">
        <SettingsSectionHead
          title="家规列表"
          eyebrow="生效中"
          description="停用后不会参与巡检"
          bordered
          class="agent-section-gap"
        />

        <p v-if="!rules.length" class="agent-band-hint">还没有家规。</p>
        <ul v-else class="agent-sched-list">
          <li v-for="rule in rules" :key="rule.id" class="agent-sched-row">
            <div class="agent-sched-row__main">
              <span class="agent-sched-row__name">
                {{ rule.name }}
                <span class="agent-policy-tag" :data-tone="rule.enabled ? 'on' : 'off'">
                  {{ rule.enabled ? '启用' : '停用' }}
                </span>
              </span>
              <span class="agent-sched-row__meta">
                {{ rule.areaName || '全屋' }} · {{ rule.targetDomains.join(' / ') || '低危设备' }}
                · 无人 {{ rule.idleMinutes || '全局' }} 分钟
                {{ rule.autoClose ? ' · 自动关停' : ' · 仅提醒' }}
              </span>
              <span v-if="rule.triggerCount" class="agent-sched-row__meta">
                已触发 {{ rule.triggerCount }} 次
              </span>
              <span class="agent-sched-row__meta">最后修改：{{ editorName(rule.updatedBy) }}</span>
            </div>
            <div class="agent-sched-row__side">
              <button type="button" class="settings-btn-ghost" @click="startEdit(rule)">编辑</button>
              <button type="button" class="settings-btn-ghost" @click="toggle(rule.id, !rule.enabled)">
                {{ rule.enabled ? '停用' : '启用' }}
              </button>
              <button type="button" class="settings-btn-ghost" @click="remove(rule.id)">删除</button>
            </div>
          </li>
        </ul>

        <div v-if="patrolSignals.length" class="agent-sched-logs">
          <SettingsSectionHead title="上次巡检结果" eyebrow="信号" bordered class="agent-section-gap" />
          <ul class="agent-sched-list">
            <li v-for="(signal, index) in patrolSignals" :key="index" class="agent-sched-row">
              <span class="agent-sched-row__meta">{{ signal }}</span>
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
import { onMounted, reactive, ref } from 'vue'
import { ScrollText } from '@lucide/vue'
import HosSelect from '@/components/common/base/HosSelect.vue'
import SettingsCard from '@/components/common/settings-page-shell/SettingsCard.vue'
import SettingsCardIntro from '@/components/common/settings-page-shell/SettingsCardIntro.vue'
import SettingsSectionHead from '@/features/settings/shared/layout/SettingsSectionHead.vue'
import { useAreaOptions } from '@/composables/entity/useAreaOptions'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import {
  createAgentPolicy,
  deleteAgentPolicy,
  listAgentPolicies,
  runAgentPatrol,
  toggleAgentPolicy,
  updateAgentPolicy,
  type AgentActorSnapshot,
  type AgentPolicyConflict,
  type AgentPolicyPayload,
  type AgentPolicyRule,
  type AgentPolicyWriteResult,
} from '@/services/api/agent'

/** 可被家规自动关停的低危域（与后端 AUTO_CLOSE_DOMAINS 一致） */
const domainOptions = [
  { id: 'light', label: '灯' },
  { id: 'switch', label: '开关' },
  { id: 'fan', label: '风扇' },
  { id: 'climate', label: '空调' },
]

const { resolvedAreas: areas } = useAreaOptions()

const creating = ref(false)
const patrolling = ref(false)
/** 非空表示正在编辑该条家规；提交后回到「新建」模式 */
const editingId = ref('')
const message = ref('')
const messageOk = ref(true)
const rules = ref<AgentPolicyRule[]>([])
const conflicts = ref<AgentPolicyConflict[]>([])
const patrolSignals = ref<string[]>([])

const form = reactive({
  name: '',
  areaId: '',
  idleMinutes: 0,
  domains: ['light'] as string[],
  autoClose: false,
})

function setMessage(text: string, ok: boolean) {
  message.value = text
  messageOk.value = ok
}

/** 展示「最后修改者」；系统写入（空快照）显示为系统 */
function editorName(snapshot?: AgentActorSnapshot): string {
  return snapshot?.username || snapshot?.userId || '系统'
}

function resetForm() {
  editingId.value = ''
  form.name = ''
  form.areaId = ''
  form.idleMinutes = 0
  form.domains = ['light']
  form.autoClose = false
}

/** 把列表项回填进表单，改完走同一个提交入口 */
function startEdit(rule: AgentPolicyRule) {
  editingId.value = rule.id
  form.name = rule.name
  form.areaId = rule.areaId
  form.idleMinutes = rule.idleMinutes
  form.domains = rule.targetDomains.length ? [...rule.targetDomains] : ['light']
  form.autoClose = rule.autoClose
  conflicts.value = []
  message.value = ''
}

function cancelEdit() {
  resetForm()
  conflicts.value = []
  message.value = ''
}

async function refresh() {
  try {
    rules.value = await listAgentPolicies()
  } catch (error) {
    setMessage(getApiErrorMessage(error, '读取家规失败'), false)
  }
}

/** 组装创建请求；未选设备类型时给出提示并返回 null */
function buildPolicyPayload(forceOverride: boolean): AgentPolicyPayload | null {
  if (!form.domains.length) {
    setMessage('请至少选择一种设备类型', false)
    return null
  }
  const areaId = form.areaId
  const areaName = areas.value.find((item) => item.id === areaId)?.name ?? ''
  return {
    name: form.name.trim() || `${areaName || '全屋'}无人空转规则`,
    areaId,
    areaName,
    targetDomains: [...form.domains],
    idleMinutes: Math.max(0, Number(form.idleMinutes) || 0),
    autoClose: form.autoClose,
    forceOverride,
  }
}

/** 保存 / 创建共用一份结果处理，避免 submit 里的分支越堆越多 */
async function applyWriteResult(
  result: AgentPolicyWriteResult,
  payload: AgentPolicyPayload,
  targetId: string,
) {
  if (!result.ok) {
    conflicts.value = result.conflicts ?? []
    setMessage(result.message || (targetId ? '保存失败' : '创建失败'), false)
    return
  }
  conflicts.value = []
  const action = targetId ? '已保存' : '已创建'
  setMessage(`${action}家规「${result.rule?.name || payload.name || ''}」`, true)
  resetForm()
  await refresh()
}

async function submit(forceOverride: boolean) {
  const payload = buildPolicyPayload(forceOverride)
  if (!payload) return
  const targetId = editingId.value
  creating.value = true
  try {
    const result = targetId
      ? await updateAgentPolicy(targetId, payload)
      : await createAgentPolicy(payload)
    await applyWriteResult(result, payload, targetId)
  } catch (error) {
    setMessage(getApiErrorMessage(error, targetId ? '保存家规失败' : '创建家规失败'), false)
  } finally {
    creating.value = false
  }
}

async function toggle(ruleId: string, enabled: boolean) {
  try {
    const result = await toggleAgentPolicy(ruleId, enabled)
    if (!result.ok) setMessage(result.message || '切换失败', false)
    await refresh()
  } catch (error) {
    setMessage(getApiErrorMessage(error, '切换失败'), false)
  }
}

async function remove(ruleId: string) {
  try {
    const result = await deleteAgentPolicy(ruleId)
    if (!result.ok) setMessage(result.message || '删除失败', false)
    else setMessage('已删除', true)
    await refresh()
  } catch (error) {
    setMessage(getApiErrorMessage(error, '删除失败'), false)
  }
}

async function runPatrol() {
  patrolling.value = true
  try {
    const result = await runAgentPatrol(false)
    patrolSignals.value = result.signals ?? []
    if (result.skipped === 'disabled') {
      setMessage('看门狗未开启：请先在「主动管家」打开无人空转巡检', false)
    } else if (!patrolSignals.value.length) {
      setMessage('巡检完成：没有发现空转设备', true)
    } else {
      setMessage('巡检完成：发现以下信号', true)
    }
  } catch (error) {
    setMessage(getApiErrorMessage(error, '巡检失败'), false)
  } finally {
    patrolling.value = false
  }
}

onMounted(() => {
  void refresh()
})
</script>

<style scoped>
.agent-policy-conflicts {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid var(--hos-color-warning, #fbbf24);
  border-radius: 10px;
  font-size: 12px;
  color: var(--hos-text-secondary, #cbd5e1);
}
.agent-policy-conflicts__title {
  font-weight: 600;
  margin-bottom: 4px;
}
.agent-policy-conflicts ul {
  list-style: disc;
  padding-left: 18px;
}
.agent-policy-domains {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.agent-policy-domain {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
.agent-policy-tag {
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
}
.agent-policy-tag[data-tone='on'] {
  background: rgba(34, 197, 94, 0.16);
  color: #4ade80;
}
.agent-policy-tag[data-tone='off'] {
  background: rgba(148, 163, 184, 0.16);
  color: #94a3b8;
}
.agent-sched-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}
.agent-sched-logs {
  margin-top: 8px;
}
</style>
