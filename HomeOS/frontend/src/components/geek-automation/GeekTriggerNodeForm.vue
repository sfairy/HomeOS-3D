<!-- eslint-disable vue/no-mutating-props -->
<!--
  GeekTriggerNodeForm.vue
  职责：自动化编辑器中「触发节点」的属性配置表单。
       支持状态/数值/时间/太阳/区域/间隔/变量/在场/日历/HA 事件/事件/顺序/设备/onload 等多类触发器，
       并就地修改 selectedPayload.trigger 的嵌套字段后通知父级刷新。
  所属模块：geek-automation。
  关键依赖：
    - GeekCfgCard（触发配置卡片外壳）、GeekDeviceCatalog（设备/属性/事件选择）、
      GeekVarKeyField（variable 触发的变量选择）、EntityInput（日历实体等单实体输入）。
    - HosSelect：触发类型/预设/比较值等下拉。
    - trigger-presets.util（GEEK_TRIGGER_PRESETS / applyTriggerPreset / matchTriggerPreset）。
    - defaults（createGeekTrigger）/ triggerSummary / graph-types（GEEK_TRIGGER_LABELS）。
    - automation-local-engine.util（isFormTriggerUnsupported，提示触发是否被本地引擎支持）。
    - useEntitiesStore（device 触发时从实体属性回填 device_id/domain）。
  Props：
    - selectedPayload：当前选中节点数据（含 trigger 子字段），双向修改。
    - engineCaps：本地引擎能力清单，用于提示触发是否被引擎支持。
    - variableList：当前已声明变量列表，供 variable 触发选择。
    - editingId：当前编辑自动化 id，存在时启用「使用规则变量」能力。
  Emits：
    - refresh-selected：字段变更时通知父级刷新选中节点。
    - declare-var：声明新变量（由子组件 GeekVarKeyField 触发）。
    - append-device-assign：从 state/numeric 触发节点追加一个「写入变量」动作节点。
  关键交互：
    - 切换触发类型时保留 entityId/attribute/entityIds，其余字段按 createGeekTrigger 重建。
    - 选择预设会覆盖当前 trigger 字段；onload 类型无需额外字段。
    - state 类型支持 to/from/持续秒/多设备 entityIds；time 类型支持星期 chip 多选与快捷组。
    - device 类型选择实体后会尽量回填 device_id/domain 并补 deviceType。
    - sequence 类型支持多步骤（先…再…）与步骤间隔超时。
    - 通过 defineExpose 暴露 syncFromSelection，供父级在选中切换时同步预设下拉。
-->
<template>
      <div class="geek-insp-section">
        <p class="geek-insp-section__label">{{ '选择触发' }}</p>
        <label class="geek-field">
          <span>{{ '触发类型' }}</span>
          <HosSelect
            :model-value="selectedPayload.trigger.type"
            :unsupported="isTriggerTypeUnsupported(selectedPayload.trigger.type)"
            variant="orchestrator"
            size="sm"
            block
            @change="onTriggerTypeChange"
          >
            <option
              v-for="opt in triggerTypeOptions"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </option>
          </HosSelect>
        </label>
        <label class="geek-field">
          <span>{{ '当…' }}</span>
          <HosSelect
            v-model="selectedTriggerPreset"
            :unsupported="isTriggerTypeUnsupported(selectedPayload.trigger.type)"
            variant="orchestrator"
            size="sm"
            block
            @change="onTriggerPresetPicked"
          >
            <option value="">{{ '自定义 / 选择场景…' }}</option>
            <optgroup
              v-for="g in triggerPresetGroups"
              :key="g"
              :label="g"
            >
              <option
                v-for="p in GEEK_TRIGGER_PRESETS.filter((x) => x.group === g)"
                :key="p.id"
                :value="p.id"
              >
                {{ p.label }}
              </option>
            </optgroup>
          </HosSelect>
        </label>
        <p v-if="triggerUnsupportedHint" class="geek-hint geek-hint--warn">{{ triggerUnsupportedHint }}</p>
        <label
          v-if="triggerNeedsEntity"
          class="geek-field geek-field--stack"
        >
          <span>{{ '设备目录' }}</span>
          <GeekDeviceCatalog
            v-model="selectedPayload.trigger.entityId"
            mode="trigger"
            :attribute="selectedPayload.trigger.attribute || ''"
            @update:model-value="onTriggerEntityPicked"
            @pick-attribute="onTriggerAttribute"
            @pick-event="onTriggerCatalogEvent"
          />
        </label>
      </div>
      <GeekCfgCard title="触发配置" accent :preview="triggerConfigPreview">
      <p v-if="selectedPayload.trigger.type === 'onload'" class="geek-hint">
        {{ '启用本自动化时触发一次，无需额外字段。' }}
      </p>
      <label v-if="selectedPayload.trigger.attribute" class="geek-field">
        <span>{{ '属性' }}</span>
        <input v-model="selectedPayload.trigger.attribute" @change="refreshSelected" />
      </label>
      <template v-if="selectedPayload.trigger.type === 'device'">
        <p class="geek-hint">
          {{ 'HA platform: device 触发，本地引擎不支持，保存时请勾选「由 HA 执行」。选设备会尽量填入 device_id。' }}
        </p>
        <label class="geek-field">
          <span>{{ 'device_id' }}</span>
          <input v-model="selectedPayload.trigger.deviceId" @change="refreshSelected" />
        </label>
        <label class="geek-field">
          <span>{{ 'domain' }}</span>
          <input
            v-model="selectedPayload.trigger.domain"
            :placeholder="'如 light / switch'"
            @change="refreshSelected"
          />
        </label>
        <label class="geek-field">
          <span>{{ 'type（设备事件）' }}</span>
          <input
            v-model="selectedPayload.trigger.deviceType"
            :placeholder="'如 turned_on / turned_off'"
            @change="refreshSelected"
          />
        </label>
      </template>
      <button
        v-if="
          selectedPayload.trigger.entityId &&
          (selectedPayload.trigger.type === 'state' ||
            selectedPayload.trigger.type === 'numeric')
        "
        type="button"
        class="list-page__btn"
        @click="appendDeviceAssignFromTrigger"
      >
        {{ '追加：写入变量' }}
      </button>
      <label v-if="selectedPayload.trigger.type === 'state'" class="geek-field">
        <span>{{ '任一设备（逗号分隔，可选）' }}</span>
        <input
          :value="(selectedPayload.trigger.entityIds || []).join(',')"
          :placeholder="'留空=仅上方设备'"
          @change="onTriggerEntityIds($event)"
        />
      </label>
      <label v-if="selectedPayload.trigger.type === 'state'" class="geek-field">
        <span>{{ '变为' }}</span>
        <div class="geek-seg" role="group" aria-label="变为">
          <button
            type="button"
            :class="['geek-seg__btn', selectedPayload.trigger.stateTo === 'on' && 'is-on']"
            @click="selectedPayload.trigger.stateTo = 'on'; refreshSelected()"
          >
            {{ '打开' }}
          </button>
          <button
            type="button"
            :class="['geek-seg__btn', selectedPayload.trigger.stateTo === 'off' && 'is-on']"
            @click="selectedPayload.trigger.stateTo = 'off'; refreshSelected()"
          >
            {{ '关闭' }}
          </button>
          <button
            type="button"
            :class="['geek-seg__btn', selectedPayload.trigger.stateTo === 'any' && 'is-on']"
            @click="selectedPayload.trigger.stateTo = 'any'; refreshSelected()"
          >
            {{ '任意' }}
          </button>
        </div>
      </label>
      <label v-if="selectedPayload.trigger.type === 'state'" class="geek-field">
        <span>{{ '从（可选）' }}</span>
        <input
          v-model="selectedPayload.trigger.stateFrom"
          :placeholder="'留空=任意'"
          @change="refreshSelected"
        />
      </label>
      <label v-if="selectedPayload.trigger.type === 'state'" class="geek-field">
        <span>{{ '持续秒（可选）' }}</span>
        <input
          v-model="selectedPayload.trigger.forSeconds"
          type="number"
          min="0"
          @change="refreshSelected"
        />
      </label>
      <label v-if="selectedPayload.trigger.type === 'time'" class="geek-field">
        <span>{{ '时间' }}</span>
        <input v-model="selectedPayload.trigger.at" type="time" step="1" @change="refreshSelected" />
      </label>
      <div v-if="selectedPayload.trigger.type === 'time'" class="geek-field geek-field--stack">
        <span>{{ '生效星期（不选=每天）' }}</span>
        <div class="geek-day-chips">
          <button
            v-for="d in weekDays"
            :key="d.value"
            type="button"
            :class="['geek-day-chip', isTriggerDaySelected(d.value) && 'is-on']"
            @click="toggleTriggerDay(d.value)"
          >
            {{ d.label }}
          </button>
        </div>
        <div class="geek-day-quick">
          <button
            type="button"
            :class="['geek-day-quick__btn', !isAnyTriggerDaySelected() && 'is-on']"
            @click="setTriggerDays([])"
          >
            {{ '每天' }}
          </button>
          <button
            type="button"
            :class="['geek-day-quick__btn', isTriggerDaysEqual([1, 2, 3, 4, 5]) && 'is-on']"
            @click="setTriggerDays([1, 2, 3, 4, 5])"
          >
            {{ '工作日' }}
          </button>
          <button
            type="button"
            :class="['geek-day-quick__btn', isTriggerDaysEqual([0, 6]) && 'is-on']"
            @click="setTriggerDays([0, 6])"
          >
            {{ '周末' }}
          </button>
        </div>
      </div>
      <div v-if="selectedPayload.trigger.type === 'sun'" class="geek-field">
        <span>{{ '事件' }}</span>
        <div class="geek-seg" role="group" aria-label="太阳事件">
          <button
            type="button"
            :class="['geek-seg__btn', selectedPayload.trigger.sunEvent !== 'sunset' && 'is-on']"
            @click="selectedPayload.trigger.sunEvent = 'sunrise'; refreshSelected()"
          >
            {{ '日出' }}
          </button>
          <button
            type="button"
            :class="['geek-seg__btn', selectedPayload.trigger.sunEvent === 'sunset' && 'is-on']"
            @click="selectedPayload.trigger.sunEvent = 'sunset'; refreshSelected()"
          >
            {{ '日落' }}
          </button>
        </div>
      </div>
      <label v-if="selectedPayload.trigger.type === 'sun'" class="geek-field">
        <span>{{ '偏移分钟' }}</span>
        <input
          v-model.number="selectedPayload.trigger.sunOffset"
          type="number"
          step="1"
          :placeholder="'如 -30=提前半小时'"
          @change="refreshSelected"
        />
      </label>
      <label v-if="selectedPayload.trigger.type === 'zone'" class="geek-field">
        <span>{{ '区域 ID' }}</span>
        <input v-model="selectedPayload.trigger.zoneId" @change="refreshSelected" />
      </label>
      <div v-if="selectedPayload.trigger.type === 'zone'" class="geek-field">
        <span>{{ '事件' }}</span>
        <div class="geek-seg" role="group" aria-label="区域事件">
          <button
            type="button"
            :class="['geek-seg__btn', selectedPayload.trigger.zoneEvent !== 'leave' && 'is-on']"
            @click="selectedPayload.trigger.zoneEvent = 'enter'; refreshSelected()"
          >
            {{ '进入' }}
          </button>
          <button
            type="button"
            :class="['geek-seg__btn', selectedPayload.trigger.zoneEvent === 'leave' && 'is-on']"
            @click="selectedPayload.trigger.zoneEvent = 'leave'; refreshSelected()"
          >
            {{ '离开' }}
          </button>
        </div>
      </div>
      <label v-if="selectedPayload.trigger.type === 'interval'" class="geek-field">
        <span>{{ '间隔秒' }}</span>
        <input
          v-model.number="selectedPayload.trigger.intervalSeconds"
          type="number"
          min="1"
          @change="refreshSelected"
        />
      </label>
      <template v-if="selectedPayload.trigger.type === 'variable'">
        <GeekVarKeyField
          v-model="selectedPayload.trigger.varKey"
          v-model:scope="selectedPayload.trigger.varScope"
          :label="'监听变量'"
          :declared="variableList"
          :can-use-rule="Boolean(editingId)"
          @change="refreshSelected"
          @declare="onDeclareVar"
        />
        <label class="geek-field">
          <span>{{ '变为值（可选）' }}</span>
          <input
            v-model="selectedPayload.trigger.varValue"
            :placeholder="'留空=任意变更'"
            @change="refreshSelected"
          />
        </label>
      </template>
      <div v-if="selectedPayload.trigger.type === 'presence'" class="geek-field">
        <span>{{ '在场事件' }}</span>
        <div class="geek-seg" role="group" aria-label="在场事件">
          <button
            type="button"
            :class="['geek-seg__btn', selectedPayload.trigger.presenceKind !== 'leave_all' && 'is-on']"
            @click="selectedPayload.trigger.presenceKind = 'arrive'; refreshSelected()"
          >
            {{ '有人回家' }}
          </button>
          <button
            type="button"
            :class="['geek-seg__btn', selectedPayload.trigger.presenceKind === 'leave_all' && 'is-on']"
            @click="selectedPayload.trigger.presenceKind = 'leave_all'; refreshSelected()"
          >
            {{ '全部离开' }}
          </button>
        </div>
      </div>
      <div v-if="selectedPayload.trigger.type === 'numeric'" class="geek-field">
        <span>{{ '比较' }}</span>
        <div class="geek-seg" role="group" aria-label="数值比较">
          <button
            type="button"
            :class="['geek-seg__btn', selectedPayload.trigger.numOp !== 'below' && 'is-on']"
            @click="selectedPayload.trigger.numOp = 'above'; refreshSelected()"
          >
            {{ '高于' }}
          </button>
          <button
            type="button"
            :class="['geek-seg__btn', selectedPayload.trigger.numOp === 'below' && 'is-on']"
            @click="selectedPayload.trigger.numOp = 'below'; refreshSelected()"
          >
            {{ '低于' }}
          </button>
        </div>
      </div>
      <label v-if="selectedPayload.trigger.type === 'numeric'" class="geek-field">
        <span>{{ selectedPayload.trigger.numBelow != null && String(selectedPayload.trigger.numBelow) !== '' ? '下界(above)' : '阈值' }}</span>
        <input v-model="selectedPayload.trigger.numValue" @change="refreshSelected" />
      </label>
      <label v-if="selectedPayload.trigger.type === 'numeric'" class="geek-field">
        <span>{{ '上界 below（可选）' }}</span>
        <input
          v-model="selectedPayload.trigger.numBelow"
          :placeholder="'同时配置 above+below 时填写'"
          @change="refreshSelected"
        />
      </label>
      <label v-if="selectedPayload.trigger.type === 'calendar'" class="geek-field">
        <span>{{ '日历实体' }}</span>
        <EntityInput
          v-model="selectedPayload.trigger.entityId"
          :domain-filter="'calendar'"
          @update:model-value="refreshSelected"
        />
      </label>
      <div v-if="selectedPayload.trigger.type === 'calendar'" class="geek-field">
        <span>{{ '日历事件' }}</span>
        <div class="geek-seg" role="group" aria-label="日历事件">
          <button
            type="button"
            :class="['geek-seg__btn', selectedPayload.trigger.calendarEvent !== 'end' && 'is-on']"
            @click="selectedPayload.trigger.calendarEvent = 'start'; refreshSelected()"
          >
            {{ '开始' }}
          </button>
          <button
            type="button"
            :class="['geek-seg__btn', selectedPayload.trigger.calendarEvent === 'end' && 'is-on']"
            @click="selectedPayload.trigger.calendarEvent = 'end'; refreshSelected()"
          >
            {{ '结束' }}
          </button>
        </div>
      </div>
      <div v-if="selectedPayload.trigger.type === 'homeassistant'" class="geek-field">
        <span>{{ 'HA 事件' }}</span>
        <div class="geek-seg" role="group" aria-label="HA 事件">
          <button
            type="button"
            :class="['geek-seg__btn', selectedPayload.trigger.haEvent !== 'shutdown' && 'is-on']"
            @click="selectedPayload.trigger.haEvent = 'start'; refreshSelected()"
          >
            {{ '启动' }}
          </button>
          <button
            type="button"
            :class="['geek-seg__btn', selectedPayload.trigger.haEvent === 'shutdown' && 'is-on']"
            @click="selectedPayload.trigger.haEvent = 'shutdown'; refreshSelected()"
          >
            {{ '停止' }}
          </button>
        </div>
      </div>
      <template v-if="selectedPayload.trigger.type === 'event'">
        <label class="geek-field">
          <span>{{ '事件类型' }}</span>
          <input v-model="selectedPayload.trigger.eventType" @change="refreshSelected" />
        </label>
        <label class="geek-field">
          <span>{{ '数据 key（可选）' }}</span>
          <input v-model="selectedPayload.trigger.eventDataKey" @change="refreshSelected" />
        </label>
        <label class="geek-field">
          <span>{{ '数据值（可选）' }}</span>
          <input v-model="selectedPayload.trigger.eventDataVal" @change="refreshSelected" />
        </label>
      </template>
      <div v-if="selectedPayload.trigger.type === 'sequence'" class="geek-field geek-field--stack">
        <span>{{ '顺序步骤（先…再…）' }}</span>
        <button type="button" class="wr-btn-add wr-btn-add--xs" @click="addSequenceStep">
          {{ '+ 步骤' }}
        </button>
        <div
          v-for="(step, si) in selectedPayload.trigger.sequenceSteps || []"
          :key="si"
          class="geek-seq-step"
        >
          <div class="geek-seq-step__head">
            <span>{{ `步骤 ${si + 1}` }}</span>
            <button type="button" class="wr-btn-x" @click="removeSequenceStep(si)">✕</button>
          </div>
          <label class="geek-field geek-field--stack">
            <span>{{ '实体' }}</span>
            <EntityInput
              v-model="step.entityId"
              :placeholder="'实体'"
              @update:model-value="refreshSelected"
            />
          </label>
          <label class="geek-field">
            <span>{{ '变为' }}</span>
            <HosSelect
              v-model="step.stateTo"
              @change="refreshSelected"
              variant="orchestrator"
              size="sm"
              block
            >
              <option value="on">on</option>
              <option value="off">off</option>
            </HosSelect>
          </label>
        </div>
        <label class="geek-field">
          <span>{{ '步骤间隔超时（秒，仅本顺序触发）' }}</span>
          <input
            v-model.number="selectedPayload.trigger.sequenceTimeout"
            type="number"
            min="1"
            @change="refreshSelected"
          />
        </label>
      </div>
      </GeekCfgCard>
</template>

<script setup>
import { computed, ref } from 'vue'
import '@/components/geek-automation/styles/geek-builder-shared.css'
import EntityInput from '@/components/common/EntityInput.vue'
import HosSelect from '@/components/common/base/HosSelect.vue'
import GeekDeviceCatalog from './GeekDeviceCatalog.vue'
import GeekCfgCard from './GeekCfgCard.vue'
import GeekVarKeyField from './GeekVarKeyField.vue'
import { triggerSummary } from '@/utils/geek-automation'
import { domainFromEntityId } from '@/utils/geek-automation/capabilities.util'
import { GEEK_TRIGGER_LABELS } from '@/utils/geek-automation/graph-types'
import {
  GEEK_TRIGGER_PRESETS,
  applyTriggerPreset,
  matchTriggerPreset,
} from '@/utils/geek-automation/trigger-presets.util'
import { createGeekTrigger } from '@/utils/geek-automation/defaults'
import { isFormTriggerUnsupported } from '@/utils/orchestrator/automation-local-engine.util'
import { useEntitiesStore } from '@/stores/entities.store'

/* eslint-disable vue/no-mutating-props -- 嵌套 trigger 字段就地写入 */

const props = defineProps({
  selectedPayload: { type: Object, required: true },
  engineCaps: { type: Object, default: null },
  variableList: { type: Array, default: () => [] },
  editingId: { type: [String, Number], default: null },
})

const emit = defineEmits(['refresh-selected', 'declare-var', 'append-device-assign'])

const entitiesStore = useEntitiesStore()
const selectedTriggerPreset = ref('')

const triggerPresetGroups = [...new Set(GEEK_TRIGGER_PRESETS.map((p) => p.group))]
const triggerTypeOptions = Object.entries(GEEK_TRIGGER_LABELS).map(([value, label]) => ({
  value,
  label,
}))

const weekDays = [
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' },
  { value: 0, label: '日' },
]

const triggerUnsupportedHint = computed(() => {
  const t = props.selectedPayload?.trigger?.type
  if (!t || t === 'device') return ''
  if (!isFormTriggerUnsupported(t, props.engineCaps)) return ''
  return '当前触发器在本地引擎能力清单中可能不受支持；若勾选「由 HA 执行」请确认已同步。'
})

const triggerNeedsEntity = computed(() => {
  const t = props.selectedPayload?.trigger
  if (!t) return false
  const p = GEEK_TRIGGER_PRESETS.find((x) => x.id === selectedTriggerPreset.value)
  if (p) return !!p.needsEntity
  return ['state', 'numeric', 'zone', 'calendar', 'sequence', 'device'].includes(t.type)
})

const triggerConfigPreview = computed(() => {
  const t = props.selectedPayload?.trigger
  if (!t) return ''
  const type = t.type || 'state'
  const detail = String(triggerSummary(t).detail || '').trim()
  if (type === 'state' && t.entityId) {
    const to = t.stateTo && t.stateTo !== 'any' ? ` → ${t.stateTo}` : ''
    return `${type} · ${t.entityId}${to}`
  }
  return detail ? `${type} · ${detail}` : type
})

function isTriggerTypeUnsupported(type) {
  return isFormTriggerUnsupported(type, props.engineCaps)
}

function refreshSelected() {
  emit('refresh-selected')
}

function onDeclareVar(payload) {
  emit('declare-var', payload)
}

function appendDeviceAssignFromTrigger() {
  emit('append-device-assign')
}

function eventValue(ev) {
  if (ev == null) return ''
  if (typeof ev === 'string' || typeof ev === 'number' || typeof ev === 'boolean') {
    return String(ev)
  }
  return ev?.target?.value ?? ''
}

function syncFromSelection() {
  const t = props.selectedPayload?.trigger
  selectedTriggerPreset.value = t ? matchTriggerPreset(t) : ''
}

function onTriggerPresetPicked() {
  const t = props.selectedPayload?.trigger
  if (!t || !selectedTriggerPreset.value) return
  applyTriggerPreset(t, selectedTriggerPreset.value)
  refreshSelected()
}

function onTriggerTypeChange(ev) {
  const t = props.selectedPayload?.trigger
  if (!t) return
  const nextType = eventValue(ev) || 'state'
  if (t.type === nextType) return
  const keep = {
    entityId: t.entityId,
    attribute: t.attribute,
    entityIds: Array.isArray(t.entityIds) ? [...t.entityIds] : [],
  }
  Object.assign(t, createGeekTrigger({ type: nextType, ...keep }))
  selectedTriggerPreset.value = matchTriggerPreset(t) || ''
  refreshSelected()
}

function isTriggerDaySelected(day) {
  const days = props.selectedPayload?.trigger?.days
  return Array.isArray(days) && days.includes(day)
}

function isAnyTriggerDaySelected() {
  const days = props.selectedPayload?.trigger?.days
  return Array.isArray(days) && days.length > 0
}

function isTriggerDaysEqual(target) {
  const days = props.selectedPayload?.trigger?.days
  const cur = Array.isArray(days) ? [...days].sort((a, b) => a - b) : []
  return cur.length === target.length && cur.every((d, i) => d === target[i])
}

function toggleTriggerDay(day) {
  const t = props.selectedPayload?.trigger
  if (!t) return
  const set = new Set(Array.isArray(t.days) ? t.days : [])
  if (set.has(day)) set.delete(day)
  else set.add(day)
  t.days = [...set].sort((a, b) => a - b)
  refreshSelected()
}

function setTriggerDays(days) {
  const t = props.selectedPayload?.trigger
  if (!t) return
  t.days = [...days].sort((a, b) => a - b)
  refreshSelected()
}

function onTriggerAttribute(attr) {
  const t = props.selectedPayload?.trigger
  if (!t) return
  t.attribute = attr || ''
  refreshSelected()
}

function onTriggerEntityPicked(entityId) {
  const t = props.selectedPayload?.trigger
  if (!t) return
  t.entityId = entityId || ''
  if (t.type === 'device' && entityId) {
    const ent = entitiesStore.getEntity?.(entityId) || entitiesStore.entities?.[entityId]
    const attrs = ent?.attributes || {}
    if (attrs.device_id != null && String(attrs.device_id)) {
      t.deviceId = String(attrs.device_id)
    }
    const domain = domainFromEntityId(entityId)
    if (domain) t.domain = domain
    if (!t.deviceType) t.deviceType = 'turned_on'
  }
  refreshSelected()
}

function onTriggerCatalogEvent(ev) {
  const t = props.selectedPayload?.trigger
  if (!t || !ev) return
  t.type = 'state'
  t.stateTo = ev.stateTo || 'any'
  t.attribute = ''
  refreshSelected()
}

function onTriggerEntityIds(ev) {
  const t = props.selectedPayload?.trigger
  if (!t) return
  const raw = String(ev?.target?.value || '')
  t.entityIds = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  refreshSelected()
}

function addSequenceStep() {
  const t = props.selectedPayload?.trigger
  if (!t) return
  if (!Array.isArray(t.sequenceSteps)) t.sequenceSteps = []
  t.sequenceSteps.push(createGeekTrigger({ type: 'state', stateTo: 'on' }))
  refreshSelected()
}

function removeSequenceStep(si) {
  props.selectedPayload?.trigger?.sequenceSteps?.splice(si, 1)
  refreshSelected()
}

defineExpose({ syncFromSelection })
</script>

<style scoped>
.geek-day-chip.is-on {
  border-color: rgba(96, 165, 250, 0.8);
  background: rgba(59, 130, 246, 0.25);
  color: #dbeafe;
}
.geek-day-quick {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.geek-day-quick__btn {
  padding: 2px 10px;
  font-size: var(--premium-fs-micro);
  line-height: 20px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 6px;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    color 0.2s ease;
}
.geek-day-quick__btn:hover {
  border-color: rgba(96, 165, 250, 0.6);
  color: #dbeafe;
}
.geek-day-quick__btn.is-on {
  border-color: rgba(96, 165, 250, 0.8);
  background: rgba(59, 130, 246, 0.25);
  color: #dbeafe;
}
</style>
