<!--
  choose / parallel / repeat 内嵌动作的紧凑编辑行。
  与 OrchestratorActionEditor 顶层字段对齐的子集。
-->
<template>
  <div class="wr-nested-act">
    <div class="wr-line wr-line--sm">
      <HosSelect variant="orchestrator" size="xs" fit v-model="action.type">
        <option value="callService">{{ '服务' }}</option>
        <option value="deviceAction">{{ '设备动作' }}</option>
        <option value="delay">{{ '延迟' }}</option>
        <option value="notify">{{ '通知' }}</option>
        <option value="notify_homeos">{{ 'HomeOS 通知' }}</option>
        <option value="scene">{{ '场景' }}</option>
        <option value="script">{{ '脚本' }}</option>
        <option value="fire_event">{{ '事件' }}</option>
        <option value="stop">{{ '停止' }}</option>
      </HosSelect>
      <EntityInput
        v-if="['callService', 'scene', 'script'].includes(action.type)"
        v-model="action.entityId"
        :placeholder="'目标'"
      />
      <input
        v-if="action.type === 'delay'"
        v-model.number="action.seconds"
        class="wr-num"
        type="number"
        :placeholder="'秒'"
      />
      <input
        v-if="action.type === 'notify'"
        v-model="action.message"
        class="wr-num"
        :placeholder="'消息'"
      />
      <input
        v-if="action.type === 'notify_homeos'"
        v-model="action.notifyMsg"
        class="wr-num"
        :placeholder="'通知文案'"
      />
      <input
        v-if="action.type === 'fire_event'"
        v-model="action.eventType"
        class="wr-num"
        :placeholder="'事件类型'"
      />
      <input
        v-if="action.type === 'stop'"
        v-model="action.notifyMsg"
        class="wr-num"
        :placeholder="'停止原因'"
      />
      <label
        v-if="action.type === 'stop'"
        class="wr-hint"
        style="display: inline-flex; align-items: center; gap: 4px; white-space: nowrap"
      >
        <input
          type="checkbox"
          :checked="String(action.data || '').includes('error')"
          @change="onStopError"
        />
        {{ '错误' }}
      </label>
      <button type="button" class="wr-btn-x" :aria-label="'删除'" @click="$emit('remove')">✕</button>
    </div>
    <div v-if="action.type === 'deviceAction'" class="wr-line wr-line--sm">
      <input
        class="wr-num wr-num--w120"
        :placeholder="'device_id'"
        :value="deviceId"
        @change="onDeviceId"
      />
      <input
        v-model="action.domain"
        class="wr-num wr-num--w80"
        :placeholder="'domain'"
        @change="syncDeviceData"
      />
      <input
        v-model="action.service"
        class="wr-num wr-num--w80"
        :placeholder="'type'"
        @change="syncDeviceData"
      />
      <EntityInput
        v-model="action.entityId"
        :placeholder="'关联实体'"
        @update:model-value="onDeviceEntity"
      />
    </div>
  </div>
</template>

<script setup>
/**
 * OrchestratorNestedActionRow.vue
 *
 * 所属模块：dashboard / Orchestrator（联动编排器）
 * 职责：choose/parallel/repeat 等结构内嵌动作的紧凑编辑行。
 *      提供与 OrchestratorActionEditor 顶层字段对齐的子集：动作类型切换、
 *      目标实体（callService/scene/script）、延迟秒数、通知文案、事件类型、
 *      停止原因 + 错误标记，以及 deviceAction 的 device_id/domain/type/关联实体。
 * 依赖：vue、HosSelect、EntityInput、useEntitiesStore、capabilities.util。
 */
import HosSelect from '@/components/common/base/HosSelect.vue'
import EntityInput from '@/components/common/EntityInput.vue'
import { computed } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { domainFromEntityId } from '@/utils/geek-automation/capabilities.util'

/** 当前编辑的内嵌动作对象（与父级 v-model 双向绑定） */
const action = defineModel({ type: Object, required: true })
/** 事件：删除当前行 */
defineEmits(['remove'])

const entitiesStore = useEntitiesStore()

/**
 * deviceAction 的 device_id 计算属性
 * 从 action.data（JSON 字符串）解析；解析失败或不存在时返回空字符串
 * @returns {string}
 */
const deviceId = computed(() => {
  try {
    const raw = action.value?.data ? JSON.parse(String(action.value.data)) : null
    if (raw && typeof raw === 'object' && raw.device_id != null) return String(raw.device_id)
  } catch {
    /* 忽略 */
  }
  return ''
})

/**
 * 将当前 device_id/domain/service 重新序列化为 action.data
 * 任一字段非空时一并写入 JSON
 */
function syncDeviceData() {
  const a = action.value
  if (!a || a.type !== 'deviceAction') return
  a.data = JSON.stringify({
    device_id: deviceId.value,
    ...(a.domain ? { domain: a.domain } : {}),
    ...(a.service ? { type: a.service } : {}),
  })
}

/**
 * device_id 输入变更：重写 action.data 中的 device_id
 * @param {Event} ev - change 事件
 */
function onDeviceId(ev) {
  const a = action.value
  if (!a || a.type !== 'deviceAction') return
  const id = String(ev?.target?.value || '').trim()
  a.data = JSON.stringify({
    device_id: id,
    ...(a.domain ? { domain: a.domain } : {}),
    ...(a.service ? { type: a.service } : {}),
  })
}

/**
 * 关联实体变更：从实体 attributes.device_id 自动填充 device_id；
 * 若 a.domain 为空且能从 entityId 解析出 domain，则同步回填
 */
function onDeviceEntity() {
  const a = action.value
  if (!a || a.type !== 'deviceAction') return
  const entityId = String(a.entityId || '').trim()
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
  syncDeviceData()
}

/**
 * stop 动作「错误」勾选变更
 * 勾选时写入 'error: true'，取消时清空 a.data
 * @param {Event} ev - change 事件
 */
function onStopError(ev) {
  const a = action.value
  if (!a || a.type !== 'stop') return
  a.data = ev.target.checked ? 'error: true' : ''
}
</script>
