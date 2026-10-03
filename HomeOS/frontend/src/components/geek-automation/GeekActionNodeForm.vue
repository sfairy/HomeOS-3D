<!-- eslint-disable vue/no-mutating-props -->
<!--
  GeekActionNodeForm.vue
  职责：自动化编辑器中「动作节点」的属性配置表单。
  所属模块：geek-automation（自动化编排）。
  关键依赖：GeekFlowActionInspector（流程型动作：stop/repeat/parallel/sequence/choose）、
    GeekCfgCard（普通动作卡片容器）、GeekDeviceCatalog（设备/能力选择）、
    GeekActionVarFields（变量类动作字段）、GeekActionWaitFields（等待类动作字段）。
  Props：
    - selectedPayload：当前选中节点的数据对象（含 action 子字段），双向修改。
    - graph：自动化图结构（含触发节点等），用于推导触发设备。
    - engineCaps：本地引擎能力清单，用于提示动作是否被引擎支持。
    - variableList：当前可用的已声明变量列表。
    - editingId：当前编辑中的自动化 ID，存在时表示处于「规则上下文」。
  Emits：
    - refresh-selected：表单字段变更时通知父级刷新选中节点。
    - declare-var：声明新变量（由子组件 GeekVarKeyField 触发）。
    - notify：向父级弹出提示消息。
  关键交互：
    - 切换动作类型时清空并重建 action 对象，保留 continueOnError 选项。
    - 设备/能力选择后写入 domain/service/data；deviceAction 单独写入 device_id。
    - 场景/脚本/家庭模式选项通过 fetchOrchestratorList/fetchHomeModes 异步加载。
-->
<template>
  <div class="geek-action-node-form">
      <div class="geek-insp-section">
        <p class="geek-insp-section__label">{{ '动作设置' }}</p>
        <div class="geek-field">
          <span>{{ '类型' }}</span>
          <HosSelect
            :model-value="selectedPayload.action.type"
            :options="actionTypeSelectOptions"
            :unsupported="isActionTypeUnsupported(selectedPayload.action.type)"
            variant="orchestrator"
            size="sm"
            block
            @update:model-value="onActionTypeChange"
          />
        </div>
        <p v-if="actionUnsupportedHint" class="geek-hint geek-hint--warn">{{ actionUnsupportedHint }}</p>
        <div class="geek-switch-row">
          <div class="geek-switch-row__label">
            <strong>{{ '失败后继续' }}</strong>
            <span>{{ '出错时是否跳过并执行后续动作' }}</span>
          </div>
          <div class="geek-seg" role="group" aria-label="失败后继续">
            <button
              type="button"
              :class="['geek-seg__btn', !selectedPayload.action.continueOnError && 'is-on']"
              @click="onContinueOnErrorChange('0')"
            >
              {{ '中止' }}
            </button>
            <button
              type="button"
              :class="['geek-seg__btn', 'is-warn', selectedPayload.action.continueOnError && 'is-on']"
              @click="onContinueOnErrorChange('1')"
            >
              {{ '继续' }}
            </button>
          </div>
        </div>
      </div>
      <GeekFlowActionInspector
        v-if="['stop', 'repeat', 'parallel', 'sequence', 'choose'].includes(selectedPayload.action.type)"
        ref="flowInspectorRef"
        v-model="selectedPayload.action"
        :show-continue-on-error="false"
        @change="refreshSelected"
      />
    <GeekCfgCard
      v-else
      :title="actionCardTitle"
      accent
      :preview="actionConfigPreview"
    >
      <template v-if="selectedPayload.action.type === 'callService'">
        <div class="geek-field geek-field--stack">
          <span>{{ '设备目录' }}</span>
          <GeekDeviceCatalog
            v-model="selectedPayload.action.entityId"
            mode="action"
            :capability-id="selectedCapabilityId"
            @update:model-value="onEntityPicked"
            @pick-capability="onCatalogCapability"
          />
        </div>
        <p class="geek-hint">
          {{
            selectedPayload.action.domain
              ? `${selectedPayload.action.domain}.${selectedPayload.action.service}`
              : '选设备后点能力（打开/关闭…）'
          }}
        </p>
        <div v-if="serviceParamFields.length" class="geek-field geek-field--stack">
          <span>{{ '参数' }}</span>
          <label
            v-for="f in primaryParamFields"
            :key="f.key"
            class="geek-field"
          >
            <span>{{ f.label }}</span>
            <HosSelect
              v-if="f.input === 'select'"
              :model-value="String(serviceDataValues[f.key] ?? f.defaultValue ?? '')"
              @change="onServiceParamChange(f.key, $event)"
             variant="orchestrator" size="sm" block>
              <option
                v-for="o in f.options || []"
                :key="o.value"
                :value="o.value"
              >
                {{ o.label }}
              </option>
            </HosSelect>
            <input
              v-else
              :type="f.input === 'number' ? 'number' : 'text'"
              :min="f.min"
              :max="f.max"
              :step="f.step"
              :value="serviceDataValues[f.key] ?? f.defaultValue ?? ''"
              @change="onServiceParamChange(f.key, $event)"
            />
          </label>
          <details v-if="advancedParamFields.length" class="geek-advanced-params">
            <summary>{{ '高级参数' }}</summary>
            <label
              v-for="f in advancedParamFields"
              :key="f.key"
              class="geek-field"
            >
              <span>{{ f.label }}</span>
              <input
                :type="f.input === 'number' ? 'number' : 'text'"
                :min="f.min"
                :max="f.max"
                :step="f.step"
                :value="serviceDataValues[f.key] ?? f.defaultValue ?? ''"
                @change="onServiceParamChange(f.key, $event)"
              />
            </label>
          </details>
        </div>
      </template>
      <template v-if="selectedPayload.action.type === 'deviceAction'">
        <p class="geek-hint">{{ 'HA 设备动作（device_id），本地引擎不执行，请勾选「由 HA 执行」。' }}</p>
        <label class="geek-field">
          <span>{{ 'device_id' }}</span>
          <input :value="deviceActionDeviceId" @change="onDeviceActionDeviceId($event)" />
        </label>
        <label class="geek-field">
          <span>{{ 'domain' }}</span>
          <input v-model="selectedPayload.action.domain" @change="onDeviceActionMeta" />
        </label>
        <label class="geek-field">
          <span>{{ 'type（动作）' }}</span>
          <input
            v-model="selectedPayload.action.service"
            :placeholder="'如 turn_on'"
            @change="onDeviceActionMeta"
          />
        </label>
        <label class="geek-field geek-field--stack">
          <span>{{ '关联实体（可选）' }}</span>
          <GeekDeviceCatalog
            v-model="selectedPayload.action.entityId"
            mode="action"
            @update:model-value="onDeviceActionEntity"
          />
        </label>
      </template>
      <template v-if="selectedPayload.action.type === 'trigger_automation'">
        <p class="geek-hint">{{ '调用 automation.trigger 触发另一条自动化。' }}</p>
        <label class="geek-field">
          <span>{{ '自动化实体 ID' }}</span>
          <input
            v-model="selectedPayload.action.entityId"
            :placeholder="'automation.xxx 或 HomeOS UUID'"
            @change="refreshSelected"
          />
        </label>
      </template>
      <template v-if="selectedPayload.action.type === 'debug'">
        <label class="geek-field">
          <span>{{ '调试消息' }}</span>
          <input v-model="selectedPayload.action.notifyMsg" @change="refreshSelected" />
        </label>
        <p class="geek-hint">{{ '保存后编译为 homeos.geek_debug 事件，便于联调。' }}</p>
      </template>
      <label v-if="selectedPayload.action.type === 'delay'" class="geek-field">
        <span>{{ '秒' }}</span>
        <input
          v-model.number="selectedPayload.action.seconds"
          type="number"
          min="1"
          @change="refreshSelected"
        />
      </label>
      <label v-if="selectedPayload.action.type === 'notify_homeos'" class="geek-field">
        <span>{{ '文案' }}</span>
        <input v-model="selectedPayload.action.notifyMsg" @change="refreshSelected" />
      </label>
      <template v-if="selectedPayload.action.type === 'notify'">
        <label class="geek-field">
          <span>{{ '通知服务' }}</span>
          <EntityInput
            v-model="selectedPayload.action.message"
            :placeholder="'notify.xxx'"
            :domain-filter="'notify'"
            @update:model-value="refreshSelected"
          />
        </label>
        <label class="geek-field">
          <span>{{ '文案' }}</span>
          <input v-model="selectedPayload.action.notifyMsg" @change="refreshSelected" />
        </label>
      </template>
      <template v-if="selectedPayload.action.type === 'scene'">
        <label class="geek-field">
          <span>{{ '本地场景' }}</span>
          <HosSelect v-model="selectedPayload.action.sceneId" @change="refreshSelected" variant="orchestrator" size="sm" block>
            <option value="">{{ '选择场景…' }}</option>
            <option v-for="s in sceneOptions" :key="s.id" :value="s.id">
              {{ s.name || s.id }}
            </option>
          </HosSelect>
        </label>
        <label class="geek-field">
          <span>{{ '或 HA 场景实体' }}</span>
          <EntityInput
            v-model="selectedPayload.action.entityId"
            :domain-filter="'scene'"
            :placeholder="'scene.xxx'"
            @update:model-value="onSceneEntityPicked"
          />
        </label>
      </template>
      <template v-if="selectedPayload.action.type === 'script'">
        <label class="geek-field">
          <span>{{ '本地脚本' }}</span>
          <HosSelect v-model="selectedPayload.action.scriptId" @change="refreshSelected" variant="orchestrator" size="sm" block>
            <option value="">{{ '选择脚本…' }}</option>
            <option v-for="s in scriptOptions" :key="s.id" :value="s.id">
              {{ s.name || s.id }}
            </option>
          </HosSelect>
        </label>
        <label class="geek-field">
          <span>{{ '或 HA 脚本实体' }}</span>
          <EntityInput
            v-model="selectedPayload.action.entityId"
            :domain-filter="'script'"
            :placeholder="'script.xxx'"
            @update:model-value="onScriptEntityPicked"
          />
        </label>
      </template>
      <template v-if="selectedPayload.action.type === 'fire_event'">
        <label class="geek-field">
          <span>{{ '事件类型' }}</span>
          <input v-model="selectedPayload.action.eventType" @change="refreshSelected" />
        </label>
        <label class="geek-field">
          <span>{{ '事件数据（JSON 或 key=value 逗号分隔）' }}</span>
          <textarea
            v-model="selectedPayload.action.eventData"
            rows="3"
            class="geek-textarea"
            @change="refreshSelected"
          />
        </label>
      </template>
      <template v-if="selectedPayload.action.type === 'variables'">
        <label class="geek-field">
          <span>{{ '运行时变量（key=value, 逗号分隔）' }}</span>
          <textarea
            v-model="selectedPayload.action.variablesMap"
            rows="3"
            class="geek-textarea"
            :placeholder="'foo=1,bar=hello'"
            @change="refreshSelected"
          />
        </label>
        <p class="geek-hint">{{ '仅当前执行上下文有效，不会写入持久变量。' }}</p>
      </template>
      <template v-if="selectedPayload.action.type === 'home_mode'">
        <label class="geek-field">
          <span>{{ '家庭模式' }}</span>
          <HosSelect v-model="selectedPayload.action.modeId" @change="refreshSelected" variant="orchestrator" size="sm" block>
            <option value="">{{ '选择模式…' }}</option>
            <option v-for="m in homeModeOptions" :key="m.id" :value="m.id">
              {{ m.name || m.id }}
            </option>
          </HosSelect>
        </label>
      </template>
      <template v-if="selectedPayload.action.type === 'loop_start'">
        <p class="geek-hint">{{ '启动本自动化的循环执行（默认当前规则）。' }}</p>
        <label class="geek-field">
          <span>{{ '自动化 ID（可空）' }}</span>
          <input v-model="selectedPayload.action.entityId" @change="refreshSelected" />
        </label>
      </template>
      <template v-if="selectedPayload.action.type === 'loop_stop'">
        <p class="geek-hint">{{ '停止循环。' }}</p>
        <label class="geek-field">
          <span>{{ '自动化 ID（可空）' }}</span>
          <input v-model="selectedPayload.action.entityId" @change="refreshSelected" />
        </label>
      </template>
      <template v-if="selectedPayload.action.type === 'note'">
        <label class="geek-field">
          <span>{{ '注释内容' }}</span>
          <textarea
            v-model="selectedPayload.action.noteText"
            rows="4"
            class="geek-textarea"
            @change="refreshSelected"
          />
        </label>
      </template>
      <GeekActionVarFields
        ref="varFieldsRef"
        :selected-payload="selectedPayload"
        :graph="graph"
        :variable-list="variableList"
        :editing-id="editingId"
        @refresh-selected="refreshSelected"
        @declare-var="onDeclareVar"
        @notify="onNotify"
      />
      <GeekActionWaitFields
        :selected-payload="selectedPayload"
        @refresh-selected="refreshSelected"
      />
      <p
        v-if="!actionHasInspectorFields"
        class="geek-hint"
      >
        {{ '当前动作类型暂无额外字段，可在上方切换类型。' }}
      </p>
    </GeekCfgCard>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import '@/components/geek-automation/styles/geek-builder-shared.css'
import EntityInput from '@/components/common/EntityInput.vue'
import HosSelect from '@/components/common/base/HosSelect.vue'
import GeekDeviceCatalog from './GeekDeviceCatalog.vue'
import GeekFlowActionInspector from './GeekFlowActionInspector.vue'
import GeekCfgCard from './GeekCfgCard.vue'
import GeekActionVarFields from './GeekActionVarFields.vue'
import GeekActionWaitFields from './GeekActionWaitFields.vue'
import { GEEK_ACTION_LABELS, actionSummary } from '@/utils/geek-automation'
import { fetchOrchestratorList } from '@/services/api/orchestrator'
import { fetchHomeModes } from '@/services/api/home-modes'
import {
  applyCapabilityToAction,
  capabilitiesForEntity,
  capabilityIdOfAction,
  domainFromEntityId,
  readActionServiceData,
  serviceParamFieldsForAction,
  writeActionServiceDataKey,
} from '@/utils/geek-automation/capabilities.util'
import { createGeekAction } from '@/utils/geek-automation/defaults'
import { isFormActionUnsupported } from '@/utils/orchestrator/automation-local-engine.util'
import { useEntitiesStore } from '@/stores/entities.store'

const props = defineProps({
  selectedPayload: { type: Object, required: true },
  graph: { type: Object, required: true },
  engineCaps: { type: Object, default: null },
  variableList: { type: Array, default: () => [] },
  editingId: { type: [String, Number], default: null },
})

const emit = defineEmits(['refresh-selected', 'declare-var', 'notify'])

const entitiesStore = useEntitiesStore()
const selectedCapabilityId = ref('')
const flowInspectorRef = ref(null)
const varFieldsRef = ref(null)
const sceneOptions = ref([])
const scriptOptions = ref([])
const homeModeOptions = ref([])

const actionTypeSelectOptions = Object.entries(GEEK_ACTION_LABELS).map(([value, label]) => ({
  value,
  label,
}))

// 当前动作在本地引擎能力清单中可能不受支持时的提示文案
const actionUnsupportedHint = computed(() => {
  const t = props.selectedPayload?.action?.type
  if (!t || t === 'note') return ''
  if (!isFormActionUnsupported(t, props.engineCaps)) return ''
  return '当前动作在本地引擎能力清单中可能不受支持；若勾选「由 HA 执行」请确认已同步。'
})

// 从 deviceAction 的 data 字段中解析出 device_id，供表单回显
const deviceActionDeviceId = computed(() => {
  const a = props.selectedPayload?.action
  if (!a || a.type !== 'deviceAction') return ''
  try {
    const raw = a.data ? JSON.parse(String(a.data)) : null
    if (raw && typeof raw === 'object' && raw.device_id != null) return String(raw.device_id)
  } catch {
    /* 解析失败时忽略，回退为空字符串 */
  }
  return ''
})

// 当前动作在能力清单中可配置的服务参数字段（区分主要/高级）
const serviceParamFields = computed(() =>
  serviceParamFieldsForAction(props.selectedPayload?.action || null),
)
const primaryParamFields = computed(() =>
  serviceParamFields.value.filter((f) => !f.advanced),
)
const advancedParamFields = computed(() =>
  serviceParamFields.value.filter((f) => f.advanced),
)
const serviceDataValues = computed(() =>
  readActionServiceData(props.selectedPayload?.action || null),
)

// 配置卡片标题：动作类型对应的中文标签
const actionCardTitle = computed(() => {
  const a = props.selectedPayload?.action
  if (!a) return '动作配置'
  return GEEK_ACTION_LABELS[a.type] || a.type || '动作配置'
})

// 配置卡片预览摘要（用于非编辑态展示动作概要）
const actionConfigPreview = computed(() => {
  const a = props.selectedPayload?.action
  if (!a) return ''
  const sum = actionSummary(a)
  return String(sum.detail || sum.label || '').trim()
})

// 判定当前动作类型是否提供 Inspector 字段（用于显示空状态提示）
const actionHasInspectorFields = computed(() => {
  const t = props.selectedPayload?.action?.type
  if (!t || ['stop', 'repeat', 'parallel', 'sequence', 'choose'].includes(t)) return true
  return [
    'callService',
    'deviceAction',
    'trigger_automation',
    'debug',
    'delay',
    'notify_homeos',
    'notify',
    'variable_set',
    'var_math',
    'var_concat',
    'var_fn',
    'scene',
    'script',
    'fire_event',
    'variables',
    'home_mode',
    'wait_for_trigger',
    'wait_template',
    'loop_start',
    'loop_stop',
    'note',
  ].includes(t)
})

// 判断动作类型是否在本地引擎能力清单中不被支持（用于下拉项灰显）
function isActionTypeUnsupported(type) {
  if (!type || type === 'note') return false
  return isFormActionUnsupported(type, props.engineCaps)
}

function refreshSelected() {
  emit('refresh-selected')
}

function onDeclareVar(payload) {
  emit('declare-var', payload)
}

function onNotify(payload) {
  emit('notify', payload)
}

// 统一从原生事件或字符串值中提取出文本值，便于复用
function eventValue(ev) {
  if (ev == null) return ''
  if (typeof ev === 'string' || typeof ev === 'number' || typeof ev === 'boolean') {
    return String(ev)
  }
  return ev?.target?.value ?? ''
}

// 切换动作类型：清空原 action 字段并应用新类型默认值，保留失败后继续选项
function onActionTypeChange(ev) {
  const p = props.selectedPayload
  if (!p?.action) return
  const next = eventValue(ev) || 'callService'
  const fresh = createGeekAction(next)
  const keepContinue = Boolean(p.action.continueOnError)
  Object.keys(p.action).forEach((k) => {
    delete p.action[k]
  })
  Object.assign(p.action, fresh, { continueOnError: keepContinue })
  refreshSelected()
}

// 切换「失败后继续」开关：1=继续，0=中止
function onContinueOnErrorChange(ev) {
  const a = props.selectedPayload?.action
  if (!a) return
  a.continueOnError = eventValue(ev) === '1'
  refreshSelected()
}

// 触发子流程 Inspector 刷新（用于切换节点时同步表单状态）
function flush() {
  flowInspectorRef.value?.flush?.()
}

// 同步当前动作所选的能力 ID（用于 GeekDeviceCatalog 高亮当前能力项）
function syncCapabilityId() {
  const a = props.selectedPayload?.action
  selectedCapabilityId.value = a ? capabilityIdOfAction(a) : ''
}

// 切换选中节点时调用：同步能力 ID 并通知子组件刷新变量相关字段
function syncFromSelection() {
  syncCapabilityId()
  varFieldsRef.value?.syncFromSelection?.()
}

// 将 deviceAction 的 device_id/domain/service 重新写回 data JSON，保证保存数据完整
function syncDeviceActionData() {
  const a = props.selectedPayload?.action
  if (!a || a.type !== 'deviceAction') return
  let deviceId = ''
  try {
    const raw = a.data ? JSON.parse(String(a.data)) : null
    if (raw && typeof raw === 'object' && raw.device_id != null) deviceId = String(raw.device_id)
  } catch {
    /* 忽略解析错误，保留空 device_id */
  }
  a.data = JSON.stringify({
    device_id: deviceId,
    ...(a.domain ? { domain: a.domain } : {}),
    ...(a.service ? { type: a.service } : {}),
  })
}

// deviceAction 的 device_id 输入变更：合并 domain/service 后写回 data
function onDeviceActionDeviceId(ev) {
  const a = props.selectedPayload?.action
  if (!a || a.type !== 'deviceAction') return
  const deviceId = eventValue(ev)
  a.data = JSON.stringify({
    device_id: deviceId,
    ...(a.domain ? { domain: a.domain } : {}),
    ...(a.service ? { type: a.service } : {}),
  })
  refreshSelected()
}

function onDeviceActionMeta() {
  syncDeviceActionData()
  refreshSelected()
}

// deviceAction 关联实体后：尝试从实体属性取 device_id 并回填 domain
function onDeviceActionEntity(entityId) {
  const a = props.selectedPayload?.action
  if (!a || a.type !== 'deviceAction') return
  a.entityId = entityId || ''
  if (entityId) {
    const ent = entitiesStore.getEntity?.(entityId) || entitiesStore.entities?.[entityId]
    const attrs = ent?.attributes || {}
    if (attrs.device_id != null && String(attrs.device_id)) {
      a.data = JSON.stringify({
        device_id: String(attrs.device_id),
        ...(a.domain ? { domain: a.domain } : {}),
        ...(a.service ? { type: a.service } : {}),
      })
    }
    const domain = domainFromEntityId(entityId)
    if (domain && !a.domain) a.domain = domain
  }
  syncDeviceActionData()
  refreshSelected()
}

// 选定场景实体后，将其回填到 sceneId 字段（兼容历史数据）
function onSceneEntityPicked() {
  const a = props.selectedPayload?.action
  if (!a) return
  if (a.entityId && !a.sceneId) a.sceneId = a.entityId
  refreshSelected()
}

// 选定脚本实体后，将其回填到 scriptId 字段（兼容历史数据）
function onScriptEntityPicked() {
  const a = props.selectedPayload?.action
  if (!a) return
  if (a.entityId && !a.scriptId) a.scriptId = a.entityId
  refreshSelected()
}

// 异步加载场景/脚本/家庭模式三类选择器数据，失败不阻断编辑
async function loadOrchestratorPickers() {
  try {
    const [scenes, scripts, modes] = await Promise.all([
      fetchOrchestratorList('scene'),
      fetchOrchestratorList('script'),
      fetchHomeModes(),
    ])
    sceneOptions.value = Array.isArray(scenes?.data) ? scenes.data : []
    scriptOptions.value = Array.isArray(scripts?.data) ? scripts.data : []
    const modeData = modes?.data
    homeModeOptions.value = Array.isArray(modeData)
      ? modeData
      : Array.isArray(modeData?.modes)
        ? modeData.modes
        : []
  } catch {
    /* 选择器数据加载失败不阻断表单编辑流程 */
  }
}

// 选定设备实体后：根据实体能力清单匹配并应用首选能力（默认 turn_on）
function onEntityPicked() {
  const a = props.selectedPayload?.action
  if (!a) return
  const caps = capabilitiesForEntity(a.entityId)
  if (caps.length) {
    const keep = caps.find((c) => c.id === selectedCapabilityId.value)
    const pick = keep || caps.find((c) => c.service === 'turn_on') || caps[0]
    if (pick) {
      applyCapabilityToAction(a, pick)
      selectedCapabilityId.value = pick.id
    }
  }
  refreshSelected()
}

// 从设备目录选择能力后：写入 service/domain，并对未填的参数应用默认值
function onCatalogCapability(cap) {
  const a = props.selectedPayload?.action
  if (!a) return
  if (!cap) {
    selectedCapabilityId.value = ''
    refreshSelected()
    return
  }
  applyCapabilityToAction(a, cap)
  selectedCapabilityId.value = cap.id
  const fields = serviceParamFieldsForAction(a)
  if (fields.length && !a.data) {
    for (const f of fields) {
      if (f.defaultValue !== undefined) writeActionServiceDataKey(a, f.key, f.defaultValue)
    }
  }
  refreshSelected()
}

// 服务参数字段变更：将值写入动作的 data（按字段 key 序列化）
function onServiceParamChange(key, ev) {
  const a = props.selectedPayload?.action
  if (!a) return
  writeActionServiceDataKey(a, key, eventValue(ev))
  refreshSelected()
}

onMounted(() => {
  void loadOrchestratorPickers()
})

defineExpose({
  flush,
  syncFromSelection,
})
</script>
