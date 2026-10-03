<!-- eslint-disable vue/no-mutating-props -->
<!--
  GeekActionVarFields.vue
  职责：在动作节点表单中渲染「变量类」动作（variable_set/var_math/var_concat/var_fn）的字段。
  所属模块：geek-automation。
  关键依赖：GeekVarKeyField（变量键+作用域选择并支持声明）、
    GeekDeviceCatalog（设备/属性查询）、GeekVarMathPanel、GeekVarConcatPanel。
  Props：
    - selectedPayload：当前选中节点数据，含 action 子字段，双向修改。
    - graph：自动化图，用于在「用触发设备填充」时定位触发节点 entityId。
    - variableList：当前已声明变量列表，供下拉选择。
    - editingId：当前自动化 ID，存在时启用「使用规则变量」能力。
  Emits：
    - refresh-selected：字段变更时通知父级刷新。
    - declare-var：声明新变量。
    - notify：弹出提示。
  关键交互：
    - variable_set 通过 varSourceKind 切换字面/变量/设备三种取值来源。
    - var_math/var_concat 委托给子面板，并监听其 change 同步 source 模式。
    - var_fn 支持 round/floor/ceil/abs/len/now/timestamp 等函数，参数可为字面/变量/设备取值。
-->
<template>
  <div class="geek-action-var-fields">
      <template v-if="selectedPayload.action.type === 'variable_set'">
        <GeekVarKeyField
          v-model="selectedPayload.action.varKey"
          v-model:scope="selectedPayload.action.varScope"
          :label="'写入变量'"
          :declared="variableList"
          :can-use-rule="Boolean(editingId)"
          @change="refreshSelected"
          @declare="onDeclareVar"
        />
        <div class="geek-field">
          <span>{{ '类型' }}</span>
          <HosSelect
            v-model="selectedPayload.action.varType"
            :options="varTypeOptions"
            variant="orchestrator"
            size="sm"
            block
            :searchable="false"
            @change="refreshSelected"
          />
        </div>
        <div class="geek-field">
          <span>{{ '操作' }}</span>
          <HosSelect
            v-model="selectedPayload.action.varOp"
            :options="varOpOptions"
            variant="orchestrator"
            size="sm"
            block
            :searchable="false"
            @change="refreshSelected"
          />
        </div>
        <div class="geek-field">
          <span>{{ '取值来源' }}</span>
          <HosSelect
            :model-value="varSetSourceMode"
            :options="varSourceModeOptions"
            variant="orchestrator"
            size="sm"
            block
            :searchable="false"
            @update:model-value="onVarSetSourceModeChange"
          />
        </div>
        <label v-if="varSetSourceMode === 'literal'" class="geek-field">
          <span>{{ '值' }}</span>
          <input v-model="selectedPayload.action.varValue" @change="refreshSelected" />
        </label>
        <GeekVarKeyField
          v-if="varSetSourceMode === 'var'"
          v-model="selectedPayload.action.varSourceVar"
          :scope="selectedPayload.action.varScope || 'global'"
          :show-scope="false"
          :label="'来源变量'"
          :declared="variableList"
          :allow-declare="false"
          @change="refreshSelected"
        />
        <div v-if="varSetSourceMode === 'device'" class="geek-field geek-field--stack">
          <span>{{ '查询设备' }}</span>
          <GeekDeviceCatalog
            v-model="selectedPayload.action.varSourceEntityId"
            mode="condition"
            :attribute="selectedPayload.action.varSourceAttribute || ''"
            @update:model-value="refreshSelected"
            @pick-attribute="onVarSourceAttribute"
          />
          <label v-if="selectedPayload.action.varSourceEntityId" class="geek-field">
            <span>{{ '来源属性（空=状态）' }}</span>
            <input
              v-model="selectedPayload.action.varSourceAttribute"
              @change="refreshSelected"
            />
          </label>
          <button
            type="button"
            class="list-page__link-btn"
            @click="fillVarSourceFromTrigger"
          >
            {{ '用触发设备填充' }}
          </button>
        </div>
      </template>
      <template v-if="selectedPayload.action.type === 'var_math'">
        <GeekVarMathPanel v-model="selectedPayload.action" @change="onVarMathPanelChange">
          <template #target>
            <GeekVarKeyField
              v-model="selectedPayload.action.varKey"
              v-model:scope="selectedPayload.action.varScope"
              :label="'写入变量'"
              :declared="variableList"
              :can-use-rule="Boolean(editingId)"
              @change="refreshSelected"
              @declare="onDeclareVar"
            />
          </template>
          <template #lhs-var>
            <GeekVarKeyField
              v-model="selectedPayload.action.mathLhsVar"
              :scope="selectedPayload.action.varScope || 'global'"
              :show-scope="false"
              :label="'左变量'"
              :declared="variableList"
              :allow-declare="false"
              @change="refreshSelected"
            />
          </template>
          <template #rhs-var>
            <GeekVarKeyField
              v-model="selectedPayload.action.mathRhsVar"
              :scope="selectedPayload.action.varScope || 'global'"
              :show-scope="false"
              :label="'右变量'"
              :declared="variableList"
              :allow-declare="false"
              @change="refreshSelected"
            />
          </template>
        </GeekVarMathPanel>
      </template>
      <template v-if="selectedPayload.action.type === 'var_concat'">
        <GeekVarConcatPanel
          v-model="selectedPayload.action"
          @change="onConcatPanelChange"
        />
      </template>
      <template v-if="selectedPayload.action.type === 'var_fn'">
        <div class="geek-var-math">
          <GeekVarKeyField
            v-model="selectedPayload.action.varKey"
            v-model:scope="selectedPayload.action.varScope"
            :label="'写入变量'"
            :declared="variableList"
            :can-use-rule="Boolean(editingId)"
            @change="refreshSelected"
            @declare="onDeclareVar"
          />
          <div class="geek-var-math__expr">
            <div class="geek-field">
              <span>{{ '函数' }}</span>
              <HosSelect
                v-model="selectedPayload.action.fnName"
                :options="fnNameOptions"
                variant="orchestrator"
                size="sm"
                block
                :searchable="false"
                @change="refreshSelected"
              />
            </div>
            <template v-if="!['now', 'timestamp'].includes(selectedPayload.action.fnName || '')">
              <div class="geek-field">
                <span>{{ '参数来源' }}</span>
                <HosSelect
                  :model-value="fnArgMode"
                  :options="fnArgModeOptions"
                  variant="orchestrator"
                  size="sm"
                  block
                  :searchable="false"
                  @update:model-value="onFnArgModeChange"
                />
              </div>
              <label v-if="fnArgMode === 'literal'" class="geek-field">
                <span>{{ '参数' }}</span>
                <input v-model="selectedPayload.action.fnArg" @change="refreshSelected" />
              </label>
              <GeekVarKeyField
                v-else-if="fnArgMode === 'var'"
                v-model="selectedPayload.action.fnArgVar"
                :scope="selectedPayload.action.varScope || 'global'"
                :show-scope="false"
                :label="'参数变量'"
                :declared="variableList"
                :allow-declare="false"
                @change="refreshSelected"
              />
              <div v-else class="geek-field geek-field--stack">
                <span>{{ '从设备取值' }}</span>
                <GeekDeviceCatalog
                  v-model="selectedPayload.action.varSourceEntityId"
                  mode="condition"
                  :attribute="selectedPayload.action.varSourceAttribute || ''"
                  @update:model-value="refreshSelected"
                  @pick-attribute="onVarSourceAttribute"
                />
                <label v-if="selectedPayload.action.varSourceEntityId" class="geek-field">
                  <span>{{ '属性（空=状态）' }}</span>
                  <input
                    v-model="selectedPayload.action.varSourceAttribute"
                    @change="refreshSelected"
                  />
                </label>
              </div>
            </template>
            <label v-if="selectedPayload.action.fnName === 'round'" class="geek-field">
              <span>{{ '小数位' }}</span>
              <input
                v-model.number="selectedPayload.action.fnDigits"
                type="number"
                min="0"
                max="10"
                @change="refreshSelected"
              />
            </label>
            <p class="geek-var-math__preview">{{ varFnPreview }}</p>
          </div>
        </div>
      </template>
  </div>
</template>

<script setup>
import { getEntityLeaf } from '@homeos/shared'
/**
 * 所属模块：frontend/components
 * 职责：实现 GeekActionVarFields 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { computed, ref } from 'vue'
import '@/components/geek-automation/styles/geek-var-panel.css'
import HosSelect from '@/components/common/base/HosSelect.vue'
import GeekDeviceCatalog from './GeekDeviceCatalog.vue'
import GeekVarMathPanel from './GeekVarMathPanel.vue'
import GeekVarConcatPanel from './GeekVarConcatPanel.vue'
import GeekVarKeyField from './GeekVarKeyField.vue'

const props = defineProps({
  selectedPayload: { type: Object, required: true },
  graph: { type: Object, required: true },
  variableList: { type: Array, default: () => [] },
  editingId: { type: [String, Number], default: null },
})

const emit = defineEmits(['refresh-selected', 'declare-var', 'notify'])

// 取值来源模式：字面值/另一变量/查询设备（仅用于 variable_set UI 切换）
const varSetSourceMode = ref('literal')
// var_math 左右操作数模式：literal/var
const mathLhsMode = ref('literal')
const mathRhsMode = ref('literal')
// var_fn 参数来源模式：字面/变量/设备
const fnArgMode = ref('literal')

const varTypeOptions = [
  { value: 'number', label: '数值' },
  { value: 'string', label: '文本' },
]
const varOpOptions = [
  { value: 'set', label: '设为' },
  { value: 'add', label: '累加' },
  { value: 'concat', label: '拼接' },
]
const varSourceModeOptions = [
  { value: 'literal', label: '字面值' },
  { value: 'var', label: '另一变量' },
  { value: 'device', label: '查询设备' },
]
const fnArgModeOptions = [
  { value: 'literal', label: '字面' },
  { value: 'var', label: '变量' },
  { value: 'device', label: '设备' },
]
const fnNameOptions = [
  { value: 'round', label: 'round' },
  { value: 'floor', label: 'floor' },
  { value: 'ceil', label: 'ceil' },
  { value: 'abs', label: 'abs' },
  { value: 'len', label: 'len' },
  { value: 'now', label: 'now' },
  { value: 'timestamp', label: 'timestamp' },
]

// var_fn 预览表达式：根据当前配置渲染「key = fn(arg)」形式以便直观校验
const varFnPreview = computed(() => {
  const a = props.selectedPayload?.action
  if (!a || a.type !== 'var_fn') return ''
  const key = String(a.varKey || '').trim() || '结果'
  const fn = a.fnName || 'round'
  if (fn === 'now' || fn === 'timestamp') return `${key} = ${fn}()`
  const arg =
    fnArgMode.value === 'var'
      ? String(a.fnArgVar || '').trim() || '变量'
      : fnArgMode.value === 'device'
        ? String(a.varSourceEntityId || '').trim() || '设备'
        : String(a.fnArg ?? '')
  return `${key} = ${fn}(${arg})`
})

function refreshSelected() {
  emit('refresh-selected')
}

function onDeclareVar(payload) {
  emit('declare-var', payload)
}

// 从 action 字段反推各 UI 模式：根据 varSourceKind/mathLhsKind/fnArgKind 设置下拉项
function syncVarModesFromAction() {
  const a = props.selectedPayload?.action
  if (!a) return
  if (a.type === 'variable_set') {
    const kind = String(a.varSourceKind || '')
    if (kind === 'var' || kind === 'device' || kind === 'literal') {
      varSetSourceMode.value = kind
    } else if (a.varSourceVar) {
      varSetSourceMode.value = 'var'
    } else if (a.varSourceEntityId) {
      varSetSourceMode.value = 'device'
    } else {
      varSetSourceMode.value = 'literal'
    }
  }
  if (a.type === 'var_math') {
    const lhs = String(a.mathLhsKind || '')
    const rhs = String(a.mathRhsKind || '')
    mathLhsMode.value = lhs === 'var' || lhs === 'literal' ? lhs : a.mathLhsVar ? 'var' : 'literal'
    mathRhsMode.value = rhs === 'var' || rhs === 'literal' ? rhs : a.mathRhsVar ? 'var' : 'literal'
    if (!a.mathLhsKind) a.mathLhsKind = mathLhsMode.value
    if (!a.mathRhsKind) a.mathRhsKind = mathRhsMode.value
    if (mathLhsMode.value === 'literal' && (a.mathLhs == null || a.mathLhs === '')) a.mathLhs = '0'
    if (mathRhsMode.value === 'literal' && (a.mathRhs == null || a.mathRhs === '')) a.mathRhs = '0'
  }
  if (a.type === 'var_concat') {
    if (!a.concatSourceVar && a.mathRhsVar) a.concatSourceVar = a.mathRhsVar
  }
  if (a.type === 'var_fn') {
    const kind = String(a.fnArgKind || '')
    if (kind === 'var' || kind === 'device' || kind === 'literal') {
      fnArgMode.value = kind
    } else if (a.varSourceEntityId) {
      fnArgMode.value = 'device'
    } else if (a.fnArgVar) {
      fnArgMode.value = 'var'
    } else {
      fnArgMode.value = 'literal'
    }
  }
}

function onVarSetSourceModeChange(value) {
  varSetSourceMode.value = String(value || 'literal')
  onVarSetSourceMode()
}

// 切换取值来源模式：清空不属于当前模式的字段，避免脏数据残留
function onVarSetSourceMode() {
  const a = props.selectedPayload?.action
  if (!a) return
  a.varSourceKind = varSetSourceMode.value
  if (varSetSourceMode.value === 'literal') {
    a.varSourceVar = ''
    a.varSourceEntityId = ''
    a.varSourceAttribute = ''
  } else if (varSetSourceMode.value === 'var') {
    a.varSourceEntityId = ''
    a.varSourceAttribute = ''
    a.varValue = ''
  } else {
    a.varSourceVar = ''
    a.varValue = ''
  }
  refreshSelected()
}

// var_math 面板变更：先同步模式再触发刷新
function onVarMathPanelChange() {
  syncVarModesFromAction()
  refreshSelected()
}

// var_concat 面板变更：兼容旧数据将 mathRhsVar 迁移到 concatSourceVar
function onConcatPanelChange() {
  syncVarModesFromAction()
  refreshSelected()
}

function onFnArgModeChange(value) {
  fnArgMode.value = String(value || 'literal')
  onFnArgMode()
}

// 切换 var_fn 参数来源模式：清空不属于当前模式的字段
function onFnArgMode() {
  const a = props.selectedPayload?.action
  if (!a) return
  a.fnArgKind = fnArgMode.value
  if (fnArgMode.value === 'literal') {
    a.fnArgVar = ''
    a.varSourceEntityId = ''
    a.varSourceAttribute = ''
  } else if (fnArgMode.value === 'var') {
    a.fnArg = ''
    a.varSourceEntityId = ''
    a.varSourceAttribute = ''
  } else {
    a.fnArg = ''
    a.fnArgVar = ''
  }
  refreshSelected()
}

function onVarSourceAttribute(attr) {
  const a = props.selectedPayload?.action
  if (!a) return
  a.varSourceAttribute = attr || ''
  refreshSelected()
}

// 「用触发设备填充」：从画布触发节点取 entityId/attribute，并生成默认 varKey
function fillVarSourceFromTrigger() {
  const a = props.selectedPayload?.action
  if (!a) return
  const fromCanvas = props.graph.flowNodes
    ?.map((n) => n.data?.trigger)
    .find((t) => t?.entityId)
  const t = fromCanvas || props.graph.triggers?.find((tr) => tr?.entityId)
  if (!t?.entityId) {
    emit('notify', { ok: false, msg: '画布上还没有带设备的触发节点' })
    return
  }
  a.varSourceEntityId = t.entityId
  a.varSourceAttribute = t.attribute || ''
  if (!a.varKey) {
    const leaf = getEntityLeaf(t.entityId) || 'device_value'
    a.varKey = `last_${leaf}`
  }
  a.varOp = 'set'
  refreshSelected()
  emit('notify', { ok: true, msg: `已用触发设备 ${t.entityId} 填充来源` })
}

defineExpose({ syncFromSelection: syncVarModesFromAction })
</script>
