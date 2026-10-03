<!-- eslint-disable vue/no-mutating-props -->
<!--
  GeekActionWaitFields.vue
  职责：渲染动作节点表单中的「等待类」动作字段（wait_for_trigger / wait_template）。
  所属模块：geek-automation。
  关键依赖：HosSelect、GeekDeviceCatalog；常量 WAIT_TYPES_SIMPLE_UI 用于判定
    是否为表单可编辑的简单等待类型（state/numeric/event）。
  Props：
    - selectedPayload：当前选中节点数据（含 action），双向修改。
  Emits：
    - refresh-selected：字段变更时通知父级刷新。
  关键交互：
    - wait_for_trigger 支持状态/数值/事件三类触发；非简单类型时仅以只读方式展示，
      并提供「改为设备状态等待」按钮重置回 state。
    - 两类动作均支持 waitTimeout 超时秒数与 continueOnTimeout 超时后是否继续。
-->
<template>
  <div class="geek-action-wait-fields">
      <template v-if="selectedPayload.action.type === 'wait_for_trigger'">
        <p class="geek-hint">{{ '流程在此暂停，直到满足下一条件（类似米家「等待」）' }}</p>
        <template v-if="isSimpleWaitTriggerType(selectedPayload.action.waitTriggerType)">
          <label class="geek-field">
            <span>{{ '等待' }}</span>
            <HosSelect
              v-model="selectedPayload.action.waitTriggerType"
              @change="refreshSelected"
              variant="orchestrator"
              size="sm"
              block
            >
              <option value="state">{{ '设备状态' }}</option>
              <option value="numeric">{{ '数值' }}</option>
              <option value="event">{{ '事件' }}</option>
            </HosSelect>
          </label>
          <div
            v-if="selectedPayload.action.waitTriggerType !== 'event'"
            class="geek-field geek-field--stack"
          >
            <span>{{ '设备目录' }}</span>
            <GeekDeviceCatalog
              v-model="selectedPayload.action.entityId"
              mode="trigger"
              :attribute="selectedPayload.action.waitAttribute || ''"
              @update:model-value="refreshSelected"
              @pick-attribute="onWaitAttribute"
              @pick-event="onWaitCatalogEvent"
            />
          </div>
          <label
            v-if="
              selectedPayload.action.waitTriggerType !== 'event' &&
              selectedPayload.action.waitAttribute
            "
            class="geek-field"
          >
            <span>{{ '属性' }}</span>
            <input v-model="selectedPayload.action.waitAttribute" @change="refreshSelected" />
          </label>
          <label
            v-if="selectedPayload.action.waitTriggerType === 'state'"
            class="geek-field"
          >
            <span>{{ '变为' }}</span>
            <HosSelect
              v-model="selectedPayload.action.waitStateTo"
              @change="refreshSelected"
              variant="orchestrator"
              size="sm"
              block
            >
              <option value="on">on</option>
              <option value="off">off</option>
              <option value="any">{{ '任意' }}</option>
            </HosSelect>
          </label>
          <label
            v-if="selectedPayload.action.waitTriggerType === 'numeric'"
            class="geek-field"
          >
            <span>{{ '比较' }}</span>
            <HosSelect
              v-model="selectedPayload.action.waitNumOp"
              @change="refreshSelected"
              variant="orchestrator"
              size="sm"
              block
            >
              <option value="above">{{ '高于' }}</option>
              <option value="below">{{ '低于' }}</option>
            </HosSelect>
          </label>
          <label
            v-if="selectedPayload.action.waitTriggerType === 'numeric'"
            class="geek-field"
          >
            <span>{{ '阈值' }}</span>
            <input v-model="selectedPayload.action.waitNumValue" @change="refreshSelected" />
          </label>
          <template v-if="selectedPayload.action.waitTriggerType === 'event'">
            <label class="geek-field">
              <span>{{ '事件类型' }}</span>
              <input v-model="selectedPayload.action.waitEventType" @change="refreshSelected" />
            </label>
            <label class="geek-field">
              <span>{{ '数据 key（可选）' }}</span>
              <input
                v-model="selectedPayload.action.waitEventDataKey"
                @change="refreshSelected"
              />
            </label>
            <label class="geek-field">
              <span>{{ '数据值（可选）' }}</span>
              <input
                v-model="selectedPayload.action.waitEventDataVal"
                @change="refreshSelected"
              />
            </label>
          </template>
        </template>
        <template v-else>
          <p class="geek-hint geek-hint--warn">
            {{
              `当前为「${selectedPayload.action.waitTriggerType}」平台，表单仅支持状态/数值/事件；请用 YAML 编辑，或改为上述三类。`
            }}
          </p>
          <label class="geek-field">
            <span>{{ '平台（只读）' }}</span>
            <input :value="selectedPayload.action.waitTriggerType" disabled />
          </label>
          <label
            v-if="selectedPayload.action.entityId"
            class="geek-field"
          >
            <span>{{ '实体' }}</span>
            <input :value="selectedPayload.action.entityId" disabled />
          </label>
          <button
            type="button"
            class="list-page__link-btn"
            @click="resetWaitTriggerToSimple"
          >
            {{ '改为设备状态等待' }}
          </button>
        </template>
        <label class="geek-field"
          ><span>{{ '超时秒' }}</span
          ><input
            v-model="selectedPayload.action.waitTimeout"
            type="number"
            min="0"
            :placeholder="'留空=不限'"
            @change="refreshSelected"
        /></label>
        <label class="geek-builder__ha">
          <input
            v-model="selectedPayload.action.continueOnTimeout"
            type="checkbox"
            @change="refreshSelected"
          />
          <span>{{ '超时后继续执行（continue_on_timeout）' }}</span>
        </label>
      </template>
      <template v-if="selectedPayload.action.type === 'wait_template'">
        <p class="geek-hint">{{ '等待 Jinja 模板为真（本地引擎支持 wait_template）' }}</p>
        <label class="geek-field geek-field--stack">
          <span>{{ '模板' }}</span>
          <textarea
            v-model="selectedPayload.action.waitTemplate"
            rows="3"
            @change="refreshSelected"
          />
        </label>
        <label class="geek-field"
          ><span>{{ '超时秒' }}</span
          ><input
            v-model="selectedPayload.action.waitTimeout"
            type="number"
            min="0"
            :placeholder="'留空=不限'"
            @change="refreshSelected"
        /></label>
        <label class="geek-builder__ha">
          <input
            v-model="selectedPayload.action.continueOnTimeout"
            type="checkbox"
            @change="refreshSelected"
          />
          <span>{{ '超时后继续执行（continue_on_timeout）' }}</span>
        </label>
      </template>
  </div>
</template>

<script setup>
import HosSelect from '@/components/common/base/HosSelect.vue'
import GeekDeviceCatalog from './GeekDeviceCatalog.vue'
import { WAIT_TYPES_SIMPLE_UI } from '@/utils/orchestrator/automation-trigger-yaml.util'

const props = defineProps({
  selectedPayload: { type: Object, required: true },
})

const emit = defineEmits(['refresh-selected'])

function refreshSelected() {
  emit('refresh-selected')
}

// 判定是否为表单可编辑的简单等待类型（state/numeric/event）
function isSimpleWaitTriggerType(type) {
  return WAIT_TYPES_SIMPLE_UI.has(String(type || 'state'))
}

// 「改为设备状态等待」按钮：重置非简单平台回 state，并补默认 waitStateTo
function resetWaitTriggerToSimple() {
  const a = props.selectedPayload?.action
  if (!a || a.type !== 'wait_for_trigger') return
  a.waitTriggerType = 'state'
  a._waitTriggerType = 'state'
  a.waitStateTo = a.waitStateTo || 'on'
  refreshSelected()
}

function onWaitAttribute(attr) {
  const a = props.selectedPayload?.action
  if (!a) return
  a.waitAttribute = attr || ''
  refreshSelected()
}

// 设备目录中选择事件型触发时：回退为 state 类型并应用其 stateTo
function onWaitCatalogEvent(ev) {
  const a = props.selectedPayload?.action
  if (!a || !ev) return
  a.waitTriggerType = 'state'
  a.waitStateTo = ev.stateTo || 'on'
  a.waitAttribute = ''
  refreshSelected()
}
</script>
