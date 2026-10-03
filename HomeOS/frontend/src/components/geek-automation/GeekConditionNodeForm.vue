<!-- eslint-disable vue/no-mutating-props -->
<!--
  GeekConditionNodeForm.vue
  职责：自动化编辑器中「条件节点」的属性配置表单。
  所属模块：geek-automation。
  关键依赖：GeekCfgCard（条件卡片外壳）、GeekDeviceCatalog（设备/属性选择）、
    GeekVarKeyField（变量类条件下的变量选择）、condition-presets.util（条件预设匹配与应用）、
    automation-local-engine.util（判定条件是否在本地引擎能力清单中受支持）。
  Props：
    - selectedPayload：当前选中节点数据（含 condition 子字段），双向修改。
    - engineCaps：本地引擎能力清单，用于提示条件是否被引擎支持。
    - variableList：当前已声明变量列表，供 var_* 条件选择。
    - editingId：当前编辑自动化 ID，存在时启用规则变量能力。
  Emits：
    - refresh-selected：字段变更时通知父级刷新。
    - declare-var：声明新变量。
  关键交互：
    - 顶部下拉支持按预设分组快速选择常见条件，应用预设会覆盖当前 condition 字段。
    - operator 涵盖状态/数值/时间/太阳/星期/变量多类，切换时会按类型补默认值。
    - 支持 negated 外层取反；weekday/时间/太阳类展示星期 chip 多选。
-->
<template>
      <div class="geek-insp-section">
        <p class="geek-insp-section__label">{{ '选择条件' }}</p>
        <label class="geek-field">
          <span>{{ '如果…' }}</span>
          <HosSelect
            v-model="selectedConditionPreset"
            :unsupported="isConditionOpUnsupported(selectedPayload.condition.operator)"
            variant="orchestrator"
            size="sm"
            block
            @change="onConditionPresetPicked"
          >
            <option value="">{{ '自定义 / 选择场景…' }}</option>
            <optgroup
              v-for="g in conditionPresetGroups"
              :key="g"
              :label="g"
            >
              <option
                v-for="p in GEEK_CONDITION_PRESETS.filter((x) => x.group === g)"
                :key="p.id"
                :value="p.id"
              >
                {{ p.label }}
              </option>
            </optgroup>
          </HosSelect>
        </label>
        <p v-if="conditionUnsupportedHint" class="geek-hint geek-hint--warn">{{ conditionUnsupportedHint }}</p>
        <label
          v-if="conditionNeedsEntity"
          class="geek-field geek-field--stack"
        >
          <span>{{ '设备目录' }}</span>
          <GeekDeviceCatalog
            v-model="selectedPayload.condition.entityId"
            mode="condition"
            :attribute="selectedPayload.condition.attribute || ''"
            @update:model-value="refreshSelected"
            @pick-attribute="onConditionAttribute"
            @pick-event="onConditionCatalogEvent"
          />
        </label>
      </div>
      <GeekCfgCard title="条件配置" accent :preview="conditionConfigPreview">
      <label class="geek-field geek-field--check">
        <input
          type="checkbox"
          :checked="Boolean(selectedPayload.condition.negated)"
          @change="onConditionNegatedChange"
        />
        <span>{{ '外层逻辑取反（condition: not）' }}</span>
      </label>
      <p
        v-if="selectedPayload.condition.operator === 'neq'"
        class="geek-hint"
      >{{ '「不等于」本身已是状态取反；一般无需再勾外层取反。' }}</p>
      <label v-if="selectedPayload.condition.attribute" class="geek-field">
        <span>{{ '属性' }}</span>
        <input v-model="selectedPayload.condition.attribute" @change="refreshSelected" />
      </label>
      <label class="geek-field">
        <span>{{ '判断' }}</span>
        <HosSelect
          v-model="selectedPayload.condition.operator"
          variant="orchestrator"
          size="sm"
          block
          @change="onConditionOperatorChange"
        >
          <option value="eq">{{ '等于' }}</option>
          <option value="neq">{{ '不等于' }}</option>
          <option value="gt">{{ '大于' }}</option>
          <option value="lt">{{ '小于' }}</option>
          <option value="gte">{{ '大于等于' }}</option>
          <option value="lte">{{ '小于等于' }}</option>
          <option value="between">{{ '介于' }}</option>
          <option value="state_for">{{ '持续状态' }}</option>
          <option value="contains">{{ '包含' }}</option>
          <option value="time_after">{{ '晚于某时刻' }}</option>
          <option value="time_before">{{ '早于某时刻' }}</option>
          <option value="sun_after">{{ '太阳之后' }}</option>
          <option value="sun_before">{{ '太阳之前' }}</option>
          <option value="weekday">{{ '生效星期' }}</option>
          <option value="var_eq">{{ '变量等于' }}</option>
          <option value="var_neq">{{ '变量不等于' }}</option>
          <option value="var_lt">{{ '变量小于' }}</option>
          <option value="var_lte">{{ '变量小于等于' }}</option>
          <option value="var_gt">{{ '变量大于' }}</option>
          <option value="var_gte">{{ '变量大于等于' }}</option>
        </HosSelect>
      </label>
      <template v-if="String(selectedPayload.condition.operator || '').startsWith('var_')">
        <GeekVarKeyField
          v-model="selectedPayload.condition.varKey"
          v-model:scope="selectedPayload.condition.varScope"
          :label="'查询变量'"
          :declared="variableList"
          :can-use-rule="Boolean(editingId)"
          @change="refreshSelected"
          @declare="onDeclareVar"
        />
      </template>
      <label
        v-show="
          selectedPayload.condition.operator !== 'weekday' &&
          !['time_after', 'time_before', 'sun_after', 'sun_before'].includes(
            selectedPayload.condition.operator,
          ) &&
          !String(selectedPayload.condition.operator || '').startsWith('var_')
        "
        class="geek-field"
      >
        <span>{{ valueLabel }}</span>
        <input v-model="selectedPayload.condition.state" @change="refreshSelected" />
      </label>
      <label
        v-if="
          selectedPayload.condition.operator === 'time_after' ||
          selectedPayload.condition.operator === 'time_before'
        "
        class="geek-field"
      >
        <span>{{ '时刻' }}</span>
        <input
          v-model="selectedPayload.condition.state"
          type="time"
          step="1"
          @change="refreshSelected"
        />
      </label>
      <div
        v-if="
          selectedPayload.condition.operator === 'sun_after' ||
          selectedPayload.condition.operator === 'sun_before'
        "
        class="geek-field"
      >
        <span>{{ '太阳事件' }}</span>
        <div class="geek-seg" role="group" aria-label="太阳事件">
          <button
            type="button"
            :class="['geek-seg__btn', selectedPayload.condition.state !== 'sunset' && 'is-on']"
            @click="selectedPayload.condition.state = 'sunrise'; refreshSelected()"
          >
            {{ '日出' }}
          </button>
          <button
            type="button"
            :class="['geek-seg__btn', selectedPayload.condition.state === 'sunset' && 'is-on']"
            @click="selectedPayload.condition.state = 'sunset'; refreshSelected()"
          >
            {{ '日落' }}
          </button>
        </div>
      </div>
      <label
        v-if="
          selectedPayload.condition.operator === 'sun_after' ||
          selectedPayload.condition.operator === 'sun_before'
        "
        class="geek-field"
      >
        <span>{{ '偏移分钟' }}</span>
        <input
          v-model.number="selectedPayload.condition.sunOffset"
          type="number"
          step="1"
          :placeholder="'如 -30=提前半小时'"
          @change="refreshSelected"
        />
      </label>
      <label v-if="selectedPayload.condition.operator === 'between'" class="geek-field">
        <span>{{ '上界' }}</span>
        <input v-model="selectedPayload.condition.stateTo" @change="refreshSelected" />
      </label>
      <label
        v-if="
          selectedPayload.condition.operator === 'state_for' ||
          selectedPayload.condition.operator === 'gt' ||
          selectedPayload.condition.operator === 'lt' ||
          selectedPayload.condition.operator === 'between'
        "
        class="geek-field"
      >
        <span>{{ '持续秒' }}</span>
        <input v-model="selectedPayload.condition.forSeconds" @change="refreshSelected" />
      </label>
      <div
        v-if="
          selectedPayload.condition.operator === 'weekday' ||
          selectedPayload.condition.operator === 'time_after' ||
          selectedPayload.condition.operator === 'time_before'
        "
        class="geek-field geek-field--stack"
      >
        <span>{{ '生效星期' }}</span>
        <div class="geek-day-chips">
          <button
            v-for="d in weekDays"
            :key="d.value"
            type="button"
            :class="['geek-day-chip', isDaySelected(d.value) && 'is-on']"
            @click="toggleDay(d.value)"
          >
            {{ d.label }}
          </button>
        </div>
      </div>
      </GeekCfgCard>
</template>

<script setup>
import { computed, ref } from 'vue'
import '@/components/geek-automation/styles/geek-builder-shared.css'
import HosSelect from '@/components/common/base/HosSelect.vue'
import GeekDeviceCatalog from './GeekDeviceCatalog.vue'
import GeekCfgCard from './GeekCfgCard.vue'
import GeekVarKeyField from './GeekVarKeyField.vue'
import { conditionSummary } from '@/utils/geek-automation'
import {
  GEEK_CONDITION_PRESETS,
  applyConditionPreset,
  matchConditionPreset,
} from '@/utils/geek-automation/condition-presets.util'
import { isFormConditionUnsupported } from '@/utils/orchestrator/automation-local-engine.util'

const props = defineProps({
  selectedPayload: { type: Object, required: true },
  engineCaps: { type: Object, default: null },
  variableList: { type: Array, default: () => [] },
  editingId: { type: [String, Number], default: null },
})

const emit = defineEmits(['refresh-selected', 'declare-var'])

const selectedConditionPreset = ref('')
// 条件预设分组列表，用于 optgroup 渲染
const conditionPresetGroups = [...new Set(GEEK_CONDITION_PRESETS.map((p) => p.group))]

// 星期 chip 选项（0=周日，1-6=周一至周六）
const weekDays = [
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' },
  { value: 0, label: '日' },
]

// 当前条件在本地引擎能力清单中可能不受支持时的提示文案
const conditionUnsupportedHint = computed(() => {
  const op = props.selectedPayload?.condition?.operator
  if (!op) return ''
  if (!isFormConditionUnsupported(op, props.engineCaps)) return ''
  return '当前条件在本地引擎能力清单中可能不受支持；若勾选「由 HA 执行」请确认已同步。'
})

// 判定当前条件是否需要选择设备实体（变量类 / 时间 / 太阳 / 星期 不需要）
const conditionNeedsEntity = computed(() => {
  const c = props.selectedPayload?.condition
  if (!c) return false
  if (String(c.operator || '').startsWith('var_')) return false
  if (['time_after', 'time_before', 'sun_after', 'sun_before', 'weekday'].includes(String(c.operator))) {
    return false
  }
  return true
})

// 根据 operator 推导值输入框的中文标签
const valueLabel = computed(() => {
  const op = props.selectedPayload?.condition?.operator
  if (op === 'between') return '下界'
  if (op === 'gt' || op === 'lt' || op === 'gte' || op === 'lte') return '数值'
  if (op === 'contains') return '包含文本'
  if (String(op || '').startsWith('var_')) return '比较值'
  return '状态值'
})

// 条件卡片预览：拼接「label · detail」用于非编辑态展示
const conditionConfigPreview = computed(() => {
  const c = props.selectedPayload?.condition
  if (!c) return ''
  const sum = conditionSummary(c)
  const detail = String(sum.detail || '').trim()
  return detail ? `${sum.label} · ${detail}` : sum.label
})

// 判定条件 operator 是否在本地引擎能力清单中不被支持（用于下拉灰显）
function isConditionOpUnsupported(op) {
  return isFormConditionUnsupported(op, props.engineCaps)
}

function refreshSelected() {
  emit('refresh-selected')
}

function onDeclareVar(payload) {
  emit('declare-var', payload)
}

// 统一从原生事件或字符串值中提取文本值
function eventValue(ev) {
  if (ev == null) return ''
  if (typeof ev === 'string' || typeof ev === 'number' || typeof ev === 'boolean') {
    return String(ev)
  }
  return ev?.target?.value ?? ''
}

// 切换选中节点时调用：根据当前 condition 反推匹配的预设 id
function syncFromSelection() {
  const c = props.selectedPayload?.condition
  selectedConditionPreset.value = c ? matchConditionPreset(c) : ''
}

// 选中条件预设：将其模板字段覆盖写入当前 condition
function onConditionPresetPicked() {
  const c = props.selectedPayload?.condition
  if (!c || !selectedConditionPreset.value) return
  applyConditionPreset(c, selectedConditionPreset.value)
  refreshSelected()
}

// 切换 operator：按操作类型补全默认字段（星期/时间/太阳/变量/between 各自补默认）
function onConditionOperatorChange(ev) {
  const c = props.selectedPayload?.condition
  if (!c) return
  const op = eventValue(ev) || 'eq'
  c.operator = op
  if (op === 'weekday') {
    if (!Array.isArray(c.days) || !c.days.length) c.days = [1, 2, 3, 4, 5]
    c.state = ''
  } else if (['time_after', 'time_before', 'sun_after', 'sun_before'].includes(op)) {
    if (!Array.isArray(c.days)) c.days = []
    if (op === 'sun_after' && !c.state) c.state = 'sunset'
    if (op === 'sun_before' && !c.state) c.state = 'sunrise'
    if (op === 'time_after' && (!c.state || c.state === 'on')) c.state = '18:00:00'
    if (op === 'time_before' && (!c.state || c.state === 'on')) c.state = '07:00:00'
    if (c.sunOffset == null) c.sunOffset = 0
  } else if (op.startsWith('var_')) {
    if (c.varKey == null) c.varKey = ''
    if (!c.varScope) c.varScope = 'global'
  } else if (op === 'between') {
    if (!c.state || c.state === 'on') c.state = '10'
    if (!c.stateTo) c.stateTo = '30'
  }
  selectedConditionPreset.value = matchConditionPreset(c) || ''
  refreshSelected()
}

// 切换「外层逻辑取反」复选框
function onConditionNegatedChange(ev) {
  const c = props.selectedPayload?.condition
  if (!c) return
  c.negated = Boolean(ev?.target?.checked)
  selectedConditionPreset.value = matchConditionPreset(c) || ''
  refreshSelected()
}

function isDaySelected(day) {
  const days = props.selectedPayload?.condition?.days
  return Array.isArray(days) && days.includes(day)
}

// 切换星期 chip：增删后保持升序，便于序列化稳定
function toggleDay(day) {
  const c = props.selectedPayload?.condition
  if (!c) return
  const set = new Set(Array.isArray(c.days) ? c.days : [])
  if (set.has(day)) set.delete(day)
  else set.add(day)
  c.days = [...set].sort((a, b) => a - b)
  refreshSelected()
}

function onConditionAttribute(attr) {
  const c = props.selectedPayload?.condition
  if (!c) return
  c.attribute = attr || ''
  refreshSelected()
}

// 设备目录中选择事件型触发时：回退为 eq operator 并写入对应状态值
function onConditionCatalogEvent(ev) {
  const c = props.selectedPayload?.condition
  if (!c || !ev) return
  c.operator = 'eq'
  c.state = ev.stateTo === 'any' ? 'on' : ev.stateTo || 'on'
  c.attribute = ''
  refreshSelected()
}

defineExpose({ syncFromSelection })
</script>
