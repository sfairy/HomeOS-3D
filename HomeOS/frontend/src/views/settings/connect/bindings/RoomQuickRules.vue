<!--
组件：RoomQuickRules.vue
所属模块：frontend / src / views / settings / connect / bindings
职责：根据房间绑定与 HA 区域实体生成「人来灯亮」「高温空调」自动化草案；实体未就绪时
      优先引导绑定，仍可生成含占位符的草案，创建后跳转联动中心编辑。
关键依赖：
  - room-automation-draft.util：草案构建、复用查找与 YAML 暂存
  - room-draft-entity-resolve.util：实体解析与就绪判定
  - orchestrator API：创建/更新自动化草案
  - useChromeStore / useEntitiesStore：确认弹窗与实体索引
数据来源：父级透传的 roomId / sensorMap / 待保存计数 / saveBindings 回调
-->
<template>
  <div class="room-quick-rules">
    <header class="room-quick-rules__head">
      <div class="room-quick-rules__head-orb" aria-hidden="true">
        <Zap class="room-quick-rules__head-icon" />
      </div>
      <div class="room-quick-rules__head-copy">
        <p class="room-quick-rules__eyebrow">{{ '自动化草案' }}</p>
        <h3 class="room-quick-rules__title">{{ '本房间快捷规则' }}</h3>
        <p class="room-quick-rules__desc">
          {{
            '根据房间绑定与 HA 区域实体生成自动化草案。实体未就绪时请先完成上方绑定，或仍可生成含占位符的草案。'
          }}
        </p>
      </div>
    </header>

    <div class="room-quick-rules__cards" role="list">
      <div
        class="room-quick-rules__card room-quick-rules__card--motion"
        role="listitem"
        :title="motionHint"
      >
        <div class="room-quick-rules__card-top">
          <div class="room-quick-rules__card-icon-wrap">
            <Lightbulb class="room-quick-rules__card-icon" aria-hidden="true" />
          </div>
          <span
            class="room-quick-rules__badge"
            :class="motionReady ? 'room-quick-rules__badge--ok' : 'room-quick-rules__badge--warn'"
          >
            {{ motionReady ? '实体已就绪' : `待完善 · ${motionMissingLabel}` }}
          </span>
        </div>
        <h4 class="room-quick-rules__card-name">{{ busyKind === 'motion' ? '生成中…' : '人来灯亮草案' }}</h4>
        <p class="room-quick-rules__card-hint">{{ '人体传感器触发 → 自动开灯' }}</p>
        <p class="room-quick-rules__card-status">{{ motionHint }}</p>
        <div class="room-quick-rules__card-actions">
          <button
            v-if="!motionReady"
            type="button"
            class="room-quick-rules__card-cta room-quick-rules__card-cta--primary"
            :disabled="!!busyKind"
            @click="focusBindings"
          >
            <span>{{ '去绑定实体' }}</span>
            <ArrowRight class="room-quick-rules__card-arrow" />
          </button>
          <router-link
            v-if="!motionReady"
            :to="devicesBinarySensorLink"
            class="room-quick-rules__card-cta room-quick-rules__card-cta--ghost"
          >
            <span>{{ '在设备列表找传感器' }}</span>
            <ArrowRight class="room-quick-rules__card-arrow" />
          </router-link>
          <button
            type="button"
            class="room-quick-rules__card-cta"
            :class="motionReady ? 'room-quick-rules__card-cta--primary' : 'room-quick-rules__card-cta--ghost'"
            :disabled="!!busyKind"
            @click="emitDraft('motion')"
          >
            <span>{{
              busyKind === 'motion'
                ? '请稍候'
                : motionReady
                  ? '生成草案'
                  : '仍生成占位草案'
            }}</span>
            <ArrowRight class="room-quick-rules__card-arrow" />
          </button>
        </div>
      </div>

      <div
        class="room-quick-rules__card room-quick-rules__card--climate"
        role="listitem"
        :title="climateHint"
      >
        <div class="room-quick-rules__card-top">
          <div class="room-quick-rules__card-icon-wrap">
            <ThermometerSun class="room-quick-rules__card-icon" aria-hidden="true" />
          </div>
          <span
            class="room-quick-rules__badge"
            :class="climateReady ? 'room-quick-rules__badge--ok' : 'room-quick-rules__badge--warn'"
          >
            {{ climateReady ? '实体已就绪' : `待完善 · ${climateMissingLabel}` }}
          </span>
        </div>
        <h4 class="room-quick-rules__card-name">{{
          busyKind === 'climate' ? '生成中…' : '高温空调草案'
        }}</h4>
        <p class="room-quick-rules__card-hint">{{ '温度超阈值 → 自动开启空调' }}</p>
        <p class="room-quick-rules__card-status">{{ climateHint }}</p>
        <div class="room-quick-rules__card-actions">
          <button
            v-if="!climateReady"
            type="button"
            class="room-quick-rules__card-cta room-quick-rules__card-cta--primary"
            :disabled="!!busyKind"
            @click="focusBindings"
          >
            <span>{{ '去绑定实体' }}</span>
            <ArrowRight class="room-quick-rules__card-arrow" />
          </button>
          <router-link
            v-if="!climateReady"
            :to="devicesClimateSensorLink"
            class="room-quick-rules__card-cta room-quick-rules__card-cta--ghost"
          >
            <span>{{ '在设备列表找温度' }}</span>
            <ArrowRight class="room-quick-rules__card-arrow" />
          </router-link>
          <button
            type="button"
            class="room-quick-rules__card-cta"
            :class="climateReady ? 'room-quick-rules__card-cta--primary' : 'room-quick-rules__card-cta--ghost'"
            :disabled="!!busyKind"
            @click="emitDraft('climate')"
          >
            <span>{{
              busyKind === 'climate'
                ? '请稍候'
                : climateReady
                  ? '生成草案'
                  : '仍生成占位草案'
            }}</span>
            <ArrowRight class="room-quick-rules__card-arrow" />
          </button>
        </div>
      </div>
    </div>

    <div class="room-quick-rules__note">
      <Info class="room-quick-rules__note-icon" aria-hidden="true" />
      <p class="room-quick-rules__note-text">
        {{ '生成后可在联动中心编辑 YAML、替换占位 entity_id 并启用。' }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Zap, Lightbulb, ThermometerSun, ArrowRight, Info } from '@lucide/vue'
import {
  createOrchestratorItem,
  fetchOrchestratorList,
  updateOrchestratorItem,
} from '@/services/api/orchestrator'
import {
  buildRoomDraftFromSources,
  findReusableRoomDraft,
  roomDraftName,
  roomDraftNeedsWizard,
  stashAutomationDraftYaml,
} from '@/utils/orchestrator/room-automation-draft.util'
import {
  describeResolvedEntity,
  isRoomDraftFullyResolved,
  resolveRoomDraftSources,
} from '@/utils/orchestrator/room-draft-entity-resolve.util'
import { settingsRoute } from '@/utils/registry/settings-route.util'
import { DEVICES_ROUTES } from '@/utils/device/devices-route.util'
import { useChromeStore } from '@/stores/chrome.store'
import { useEntitiesStore } from '@/stores/entities.store'
import { getApiErrorMessage } from '@/utils/core/error-message'

const devicesBinarySensorLink = DEVICES_ROUTES.domain('binary_sensor')
const devicesClimateSensorLink = DEVICES_ROUTES.domain('sensor')

// 入参：房间 id、房间标签、传感器映射表、待保存计数、保存绑定回调
const props = defineProps({
  roomId: { type: String, required: true },
  roomLabel: { type: String, default: '' },
  sensorMap: { type: Object, default: () => ({}) },
  pendingEnvChanges: { type: Number, default: 0 },
  saveBindings: { type: Function, default: null },
})

// 对外事件：聚焦绑定区（引导用户去绑定实体）
const emit = defineEmits(['focus-bindings'])

const router = useRouter()
const chrome = useChromeStore()
const entitiesStore = useEntitiesStore()
// 当前生成中的草案类型（motion/climate），空表示空闲
const busyKind = ref('')

const entry = computed(() => props.sensorMap?.[props.roomId] || {})
const label = computed(
  () => entry.value.label?.trim() || props.roomLabel || props.roomId,
)

// 解析人来灯亮 / 高温空调两类草案的实体来源
const motionSources = computed(() =>
  resolveRoomDraftSources('motion', entry.value, props.roomId, entitiesStore.entities, {
    roomLabel: label.value,
    sensorMap: props.sensorMap,
  }),
)
const climateSources = computed(() =>
  resolveRoomDraftSources('climate', entry.value, props.roomId, entitiesStore.entities, {
    roomLabel: label.value,
    sensorMap: props.sensorMap,
  }),
)

// 两类草案是否实体均已就绪（无占位符）
const motionReady = computed(() => isRoomDraftFullyResolved('motion', motionSources.value))
const climateReady = computed(() => isRoomDraftFullyResolved('climate', climateSources.value))

// 收集某类草案中尚未解析的实体标签
function missingLabels(kind, sources) {
  const missing = []
  if (kind === 'motion') {
    if (sources.motion?.source === 'placeholder') missing.push('人体传感器')
    if (sources.light?.source === 'placeholder') missing.push('灯光')
  } else {
    if (sources.temperature?.source === 'placeholder') missing.push('温度')
    if (sources.climate?.source === 'placeholder') missing.push('空调')
  }
  return missing
}

const motionMissingLabel = computed(() => missingLabels('motion', motionSources.value).join('、') || '实体')
const climateMissingLabel = computed(
  () => missingLabels('climate', climateSources.value).join('、') || '实体',
)

const motionHint = computed(() => {
  const parts = [
    describeResolvedEntity('人体传感器', motionSources.value.motion),
    describeResolvedEntity('灯光', motionSources.value.light),
  ]
  return motionReady.value
    ? '人来灯亮：实体已就绪'
    : parts.filter((p) => p.includes('待绑定')).join(' · ') || parts.join(' · ')
})

const climateHint = computed(() => {
  const parts = [
    describeResolvedEntity('温度', climateSources.value.temperature),
    describeResolvedEntity('空调', climateSources.value.climate),
  ]
  return climateReady.value
    ? '高温空调：实体已就绪'
    : parts.filter((p) => p.includes('待绑定')).join(' · ') || parts.join(' · ')
})

// 聚焦绑定区：滚动到绑定网格并提示用户去绑定
function focusBindings() {
  emit('focus-bindings')
  const el = document.querySelector('.bind-env-sensor-grid')
  if (el && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  chrome.notify('请在上方完成人体传感器、灯光、温度或空调绑定', 'info')
}

// 生成草案前确保房间绑定已保存：有未保存修改时弹确认并触发保存
async function ensureBindingsSaved() {
  if (!props.pendingEnvChanges || !props.saveBindings) return true
  const ok = await chrome.confirm(
    '房间绑定有未保存的修改。生成草案前需要先保存，是否继续？',
    '保存房间绑定',
    { confirmText: '保存并继续', cancelText: '取消', type: 'warning' },
  )
  if (!ok) return false
  const saved = await props.saveBindings()
  return saved !== false
}

// 生成自动化草案：构建 YAML，复用或新建草案，暂存 YAML 后跳转联动中心编辑
async function emitDraft(kind) {
  if (busyKind.value) return
  if (!(await ensureBindingsSaved())) return

  const sources = kind === 'climate' ? climateSources.value : motionSources.value
  const name = roomDraftName(kind, label.value)
  const yaml = buildRoomDraftFromSources(kind, label.value, sources)
  const needsWizard = roomDraftNeedsWizard(yaml)
  const fullyResolved = isRoomDraftFullyResolved(kind, sources)

  if (!fullyResolved) {
    const missing = missingLabels(kind, sources)
    const ok = await chrome.confirm(
      `以下实体未能解析：${missing.join('、')}。草案将包含占位 entity_id，是否继续？`,
      '部分实体未就绪',
      { confirmText: '继续生成', cancelText: '取消', type: 'warning' },
    )
    if (!ok) return
  }

  busyKind.value = kind
  try {
    const { data: listData } = await fetchOrchestratorList('automation')
    const list = Array.isArray(listData) ? listData : []
    const reusable = findReusableRoomDraft(list, name)

    let editId = ''
    if (reusable?.id != null) {
      const ok = await chrome.confirm(
        `已存在未完成的同名草案「${name}」，是否更新该草案？`,
        '更新已有草案',
        { confirmText: '更新草案', cancelText: '新建副本', type: 'primary' },
      )
      if (ok) {
        const { data } = await updateOrchestratorItem('automation', String(reusable.id), {
          name,
          yaml,
          runOnHa: false,
          enabled: false,
        })
        editId = String(data?.id ?? reusable.id)
      }
    }

    if (!editId) {
      const { data } = await createOrchestratorItem('automation', {
        name,
        yaml,
        runOnHa: false,
        enabled: false,
      })
      editId = String(data?.id || '')
    }

    if (!editId) {
      chrome.notify('创建草案失败：未返回 ID', 'error')
      return
    }

    stashAutomationDraftYaml(yaml)
    chrome.notify(
      fullyResolved
        ? '已创建自动化草案，可在联动中心核对后启用'
        : '已创建自动化草案，请完成占位符替换',
      'success',
    )
    router.push(
      settingsRoute({
        tab: 'orchestrator',
        orchTab: 'automation',
        edit: editId,
        ...(needsWizard || !fullyResolved ? { wizard: 1 } : {}),
      }),
    )
  } catch (e) {
    chrome.notify(getApiErrorMessage(e, '创建草案失败'), 'error')
  } finally {
    busyKind.value = ''
  }
}
</script>
