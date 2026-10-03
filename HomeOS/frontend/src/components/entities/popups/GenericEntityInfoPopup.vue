/**
 * @file GenericEntityInfoPopup.vue
 * @module components/entities/popups
 * @brief 通用实体信息弹窗（兜底）
 *
 * 职责：
 * - 无专用控制面板的实体（传感器 / scene / script 等）的兜底信息弹窗
 * - 展示实体状态、房间、主要操作按钮（如有）与复制 ID / 打开详情入口
 *
 * 依赖：
 * - vue（computed/ref）、vue-router（useRouter）、@lucide/vue（Info）
 * - ./EntityPopupShell、./PopupHead
 * - @/composables/entity/useEntityPopupBase、@homeos/shared（getEntityDomain/resolveEntityArea）
 * - displayEntityStateLabel、getDomainLabel、copyTextWithNotify
 */
<template>
  <EntityPopupShell
    :entity="liveEntity"
    :x-pct="xPct"
    :y-pct="yPct"
    :anchor-x="anchorX"
    :anchor-y="anchorY"
    :width="300"
    :height="shellHeight"
    @close="$emit('close')"
  >
    <PopupHead :title="entityName" :icon="Info" :eyebrow="domainLabel" />

    <div class="gei">
      <div class="gei__state">
        <span class="gei__state-label">{{ '当前状态' }}</span>
        <strong class="gei__state-value">{{ stateLabel }}</strong>
        <em v-if="unit" class="gei__unit">{{ unit }}</em>
      </div>

      <dl v-if="metaRows.length" class="gei__meta">
        <div v-for="row in metaRows" :key="row.key" class="gei__meta-row">
          <dt>{{ row.label }}</dt>
          <dd :title="row.value">{{ row.value }}</dd>
        </div>
      </dl>

      <div v-if="primaryAction" class="gei__actions">
        <button
          type="button"
          class="btn-action"
          :disabled="acting || unavailable"
          @click="runPrimary"
        >
          {{ acting ? '执行中…' : primaryAction.label }}
        </button>
      </div>

      <div class="gei__links">
        <button type="button" class="gei__link" @click="copyId">{{ '复制 ID' }}</button>
        <button type="button" class="gei__link" @click="goDetail">{{ '打开详情' }}</button>
      </div>
    </div>
  </EntityPopupShell>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 GenericEntityInfoPopup 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Info } from '@lucide/vue'
import { getEntityDomain, resolveEntityArea } from '@homeos/shared'
import EntityPopupShell from '@/components/entities/popups/EntityPopupShell.vue'
import PopupHead from '@/components/entities/popups/PopupHead.vue'
import { defineEntityPopupProps, useEntityPopupBase } from '@/composables/entity/useEntityPopupBase'
import { displayEntityStateLabel } from '@/constants/entity-state-labels'
import { getDomainLabel } from '@/utils/device/domain-labels.util'
import { copyTextWithNotify } from '@/services/notify'

const props = defineProps(defineEntityPopupProps())
const emit = defineEmits(['close'])

const router = useRouter()
const { liveEntity, entityName, callService } = useEntityPopupBase(props)
const acting = ref(false)

const entityId = computed(() => String(liveEntity.value?.entity_id || '').trim())
const domain = computed(() => getEntityDomain(entityId.value) || '')
const domainLabel = computed(() => getDomainLabel(domain.value) || domain.value || '实体')
const stateLabel = computed(() =>
  displayEntityStateLabel(entityId.value, liveEntity.value?.state),
)
const unavailable = computed(() => {
  const s = liveEntity.value?.state
  return s === 'unavailable' || s === 'unknown'
})
const unit = computed(() => {
  const u = liveEntity.value?.attributes?.unit_of_measurement
  return u != null && String(u).trim() ? String(u) : ''
})

const metaRows = computed(() => {
  const attrs = liveEntity.value?.attributes || {}
  const rows = []
  const area = resolveEntityArea(attrs)?.display
  if (area) rows.push({ key: 'area', label: '房间', value: area })
  if (attrs.device_class) {
    rows.push({ key: 'device_class', label: '类型', value: String(attrs.device_class) })
  }
  if (entityId.value) {
    rows.push({ key: 'id', label: '实体 ID', value: entityId.value })
  }
  return rows.slice(0, 4)
})

const primaryAction = computed(() => {
  const d = domain.value
  if (d === 'scene') return { label: '激活场景', service: 'turn_on' }
  if (d === 'script') return { label: '执行脚本', service: 'turn_on' }
  if (d === 'button' || d === 'input_button') return { label: '按下', service: 'press' }
  if (d === 'automation') return { label: '触发一次', service: 'trigger' }
  const st = String(liveEntity.value?.state || '')
  if (st === 'on' || st === 'off') return { label: st === 'on' ? '关闭' : '打开', service: 'toggle' }
  return null
})

const shellHeight = computed(() => {
  let h = 210
  if (metaRows.value.length) h += 18 * metaRows.value.length
  if (primaryAction.value) h += 52
  return Math.min(360, h)
})

async function runPrimary() {
  const action = primaryAction.value
  if (!action || acting.value || !entityId.value) return
  acting.value = true
  try {
    const d = domain.value
    if (action.service === 'toggle' && (liveEntity.value?.state === 'on' || liveEntity.value?.state === 'off')) {
      await callService('homeassistant', 'toggle', entityId.value, undefined, '切换失败')
    } else {
      await callService(d, action.service, entityId.value, undefined, `${action.label}失败`)
    }
  } finally {
    acting.value = false
  }
}

async function copyId() {
  if (!entityId.value) return
  await copyTextWithNotify(entityId.value, {
    successMessage: '已复制实体 ID',
    errorMessage: '复制失败',
  })
}

function goDetail() {
  if (!entityId.value) return
  emit('close')
  router.push({ path: '/device', query: { id: entityId.value } })
}
</script>

<style src="./styles/PopupAccents.css"></style>
<style scoped>
.gei {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 2px 8px;
}
.gei__state {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 8px;
  padding: 10px 12px;
  border-radius: var(--hos-radius-card);
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid rgba(56, 189, 248, 0.22);
}
.gei__state-label {
  font-size: var(--premium-fs-micro);
  color: rgba(148, 163, 184, 0.9);
}
.gei__state-value {
  font-size: 18px;
  font-weight: 650;
  color: #e2e8f0;
  line-height: 1.2;
}
.gei__unit {
  font-size: var(--premium-fs-micro);
  font-style: normal;
  color: rgba(148, 163, 184, 0.85);
}
.gei__meta {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.gei__meta-row {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 8px;
  font-size: var(--premium-fs-micro);
}
.gei__meta-row dt {
  margin: 0;
  color: rgba(148, 163, 184, 0.75);
}
.gei__meta-row dd {
  margin: 0;
  color: #cbd5e1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gei__actions {
  display: flex;
}
.gei__actions .btn-action {
  width: 100%;
  justify-content: center;
}
.gei__links {
  display: flex;
  gap: 8px;
}
.gei__link {
  flex: 1;
  padding: 7px 8px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(30, 41, 59, 0.65);
  color: #cbd5e1;
  font-size: var(--premium-fs-micro);
  cursor: pointer;
}
.gei__link:hover {
  background: rgba(51, 65, 85, 0.9);
  color: #f1f5f9;
}
</style>
