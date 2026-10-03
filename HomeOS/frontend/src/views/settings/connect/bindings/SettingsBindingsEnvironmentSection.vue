<!--
组件：SettingsBindingsEnvironmentSection.vue
所属模块：frontend / src / views / settings / connect / bindings
职责：环境传感器绑定分区。按 HA 区域绑定温湿度/空气质量实体，支持房间 Tab 切换、
      显示名编辑、隐藏恢复、CSV 导入导出，并提供快捷规则设备绑定与 RoomQuickRules 草案入口。
      showSensorFields=false 时退化为「房间目录」精简视图，仅编辑显示名与展示引用徽章。
关键依赖：
  - EntityInput：实体选择
  - RoomQuickRules：房间自动化草案生成
  - RoomReferenceBadges：房间引用徽章（环境/移动端/Agent）
  - SettingsSectionHead / SettingsOrchTabs / SettingsCard：布局
  - fetchDbAreas：拉取 DB 关联区域用于徽章推断
数据来源：父级透传的 envRoomList / sensorMap（双向）/ 各类 emit 回调
-->
<template>
  <div class="settings-hub-section">
    <SettingsCard
      v-if="showSensorFields"
      full
      static
      extra-class="bind-env-workspace-card"
    >
      <div class="bind-env-workspace-card__tabs bind-energy-dock">
        <SettingsOrchTabs v-model="bindingsEnvTab" :tabs="bindingsEnvTabs" plain />
      </div>

      <div class="bind-env-workspace-card__body">
        <div v-show="bindingsEnvTab === 'rooms'">
          <SettingsSectionHead
            icon-key="leaf"
            icon-class="bind-env-head-icon"
            orb-class="bind-env-head-orb"
            title="环境传感器映射"
            :description="roomSectionDescription"
            bordered
          >
            <template #description>
              <span>{{ roomSectionDescription }}</span>
              <span class="bind-env-head-desc">
                {{ '按 HA 区域绑定温湿度与空气质量实体；环境健康面板将使用此映射。' }}
              </span>
            </template>
            <template #actions>
              <div class="bind-env-head-actions">
                <button
                  type="button"
                  class="env-room-btn"
                  :disabled="envLoading"
                  @click="$emit('sync-ha-areas')"
                >
                  {{ '同步 HA 区域' }}
                </button>
                <button
                  v-if="hiddenPresetCount"
                  type="button"
                  class="env-room-btn env-room-btn--muted"
                  @click="$emit('restore-hidden-rooms')"
                >
                  {{ `恢复隐藏 (${hiddenPresetCount})` }}
                </button>
                <button
                  type="button"
                  class="settings-btn-accent bind-env-infer-btn"
                  :disabled="envLoading"
                  @click="$emit('infer-env-map')"
                >
                  <Sparkles class="w-3.5 h-3.5" />
                  {{ '智能推断' }}
                </button>
              </div>
            </template>
          </SettingsSectionHead>

          <p class="settings-note-callout settings-note-callout--emerald bind-env-note">
            <span class="settings-note-callout__label">{{ '与 HA 区域的关系' }}</span>
            <span>
              {{ '房间目录与设备页筛选均读取 HA' }}
              <code>area_registry</code>
              {{ '；本页保存显示名与隐藏状态。增删房间请在 HA「设置 → 区域与楼层」操作后同步。' }}
            </span>
          </p>

          <div v-if="envLoading" class="settings-premium-empty settings-premium-empty--emerald mt-4">
            <Loader2 class="settings-premium-empty__icon animate-spin" />
            <p class="settings-premium-empty__title">{{ '加载房间配置…' }}</p>
          </div>
          <div v-else class="env-room-panel mt-4">
            <div v-if="envRoomList.length" class="bind-energy-dock bind-env-room-tabs">
              <SettingsOrchTabs v-model="envRoomTab" :tabs="envRoomTabs" />
            </div>

            <div
              v-if="activeEnvRoom && sensorMap[activeEnvRoom.id]"
              :key="envRoomTab"
              class="env-room-editor"
            >
              <div class="env-room-editor__bar">
                <span class="env-room-editor__tag">{{ 'HA 区域' }}</span>
                <button
                  type="button"
                  class="env-room-editor__remove"
                  @click="$emit('remove-env-room', activeEnvRoom.id)"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                  {{ '隐藏房间' }}
                </button>
              </div>

              <div class="env-room-form">
                <div class="env-room-field">
                  <label class="settings-form-label env-room-field__label--accent">{{
                    '房间显示名'
                  }}</label>
                  <input
                    v-model="sensorMap[activeEnvRoom.id].label"
                    type="text"
                    class="settings-field"
                    :placeholder="activeEnvRoom.defaultLabel"
                  />
                </div>

                <div class="bind-env-sensor-grid">
                  <div
                    v-for="field in envSensorFieldList"
                    :key="field.key"
                    class="bind-env-sensor-cell"
                  >
                    <label :class="['settings-form-label mb-1.5', field.labelClass]">{{
                      field.shortLabel
                    }}</label>
                    <EntityInput
                      v-model="sensorMap[activeEnvRoom.id][field.key]"
                      :placeholder="field.placeholder"
                      domain-filter="sensor"
                      :suggest-device-class="field.deviceClass"
                    />
                  </div>
                </div>
                <p class="bind-energy-hint">
                  {{
                    '温湿度配对后可计算露点与霉菌风险；PM2.5 / CO₂ / TVOC 参与 IAQ 综合评分。留空则跳过该项。'
                  }}
                </p>
                <div v-if="activeEnvRoom" class="bind-env-quick-rules">
                  <p class="bind-env-quick-rules__title">{{ '快捷规则设备' }}</p>
                  <p class="bind-env-quick-rules__desc">
                    {{
                      '绑定人体传感器、灯光与空调；高温空调会优先使用上方温度传感器，若无则尝试空调的 current_temperature。'
                    }}
                  </p>
                  <div class="bind-env-sensor-grid">
                    <div
                      v-for="field in quickRuleFieldList"
                      :key="field.key"
                      class="bind-env-sensor-cell"
                    >
                      <label :class="['settings-form-label mb-1.5', field.labelClass]">{{
                        field.shortLabel
                      }}</label>
                      <EntityInput
                        v-model="sensorMap[activeEnvRoom.id][field.key]"
                        :placeholder="field.placeholder"
                        :domain-filter="field.domain"
                        :suggest-device-class="field.deviceClass"
                      />
                    </div>
                  </div>
                </div>
                <RoomQuickRules
                  v-if="activeEnvRoom"
                  :room-id="activeEnvRoom.id"
                  :room-label="sensorMap[activeEnvRoom.id]?.label || activeEnvRoom.defaultLabel"
                  :sensor-map="sensorMap"
                  :pending-env-changes="pendingEnvChanges"
                  :save-bindings="saveBindings"
                />
              </div>
            </div>

            <div
              v-else-if="!envRoomList.length"
              class="settings-premium-empty settings-premium-empty--emerald"
            >
              <Leaf class="settings-premium-empty__icon" />
              <p class="settings-premium-empty__title">{{ '尚未同步 HA 区域' }}</p>
              <p class="settings-premium-empty__desc">
                {{ '请先在 Home Assistant 中配置区域，然后点击「同步 HA 区域」' }}
              </p>
              <div class="settings-premium-empty__actions">
                <button
                  type="button"
                  class="settings-premium-empty__btn settings-premium-empty__btn--accent"
                  :disabled="envLoading"
                  @click="$emit('sync-ha-areas')"
                >
                  {{ '同步 HA 区域' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-show="bindingsEnvTab === 'io'" class="bind-env-io-panel">
          <SettingsSectionHead
            icon-key="leaf"
            icon-class="bind-env-head-icon"
            orb-class="bind-env-head-orb"
            title="导入导出"
            description="批量备份或恢复环境传感器映射"
            bordered
          />
          <div class="bind-env-io-actions">
            <button type="button" class="settings-btn-ghost" @click="$emit('export-env-csv')">
              {{ '导出 CSV' }}
            </button>
            <label class="settings-btn-ghost cursor-pointer">
              {{ '导入 CSV' }}
              <input
                type="file"
                accept=".csv,text/csv"
                class="hidden"
                @change="$emit('env-csv-file', $event)"
              />
            </label>
          </div>
        </div>
      </div>
    </SettingsCard>

    <SettingsCard v-else full static extra-class="rooms-catalog-card">
      <div class="rooms-catalog-body">
        <SettingsSectionHead title="房间目录" :description="catalogDescription" bordered>
          <template #actions>
            <button
              v-if="hiddenPresetCount"
              type="button"
              class="env-room-btn env-room-btn--muted"
              @click="$emit('restore-hidden-rooms')"
            >
              {{ `恢复隐藏 (${hiddenPresetCount})` }}
            </button>
          </template>
        </SettingsSectionHead>

        <div
          v-if="envLoading"
          class="settings-premium-empty settings-premium-empty--emerald mt-3"
        >
          <Loader2 class="settings-premium-empty__icon animate-spin" />
          <p class="settings-premium-empty__title">{{ '加载房间配置…' }}</p>
        </div>
        <div v-else class="env-room-panel mt-3">
          <div
            v-if="envRoomList.length"
            class="bind-energy-dock env-room-tabs rooms-catalog-tabs"
          >
            <SettingsOrchTabs v-model="envRoomTab" :tabs="envRoomTabs" />
          </div>

          <div
            v-if="activeEnvRoom && sensorMap[activeEnvRoom.id]"
            :key="envRoomTab"
            class="env-room-editor rooms-catalog-editor"
          >
            <div class="env-room-editor__bar">
              <div class="rooms-editor-preview">
                <span class="rooms-editor-preview__emoji">{{ activeRoomEmoji }}</span>
                <div class="min-w-0">
                  <p class="rooms-editor-preview__title">
                    {{ effectiveLabel(activeEnvRoom.id) }}
                    <RoomReferenceBadges :badges="badgesForRoom(activeEnvRoom.id)" />
                  </p>
                  <p class="rooms-editor-preview__sub">
                    <code>{{ activeEnvRoom.id }}</code>
                    <span aria-hidden="true">{{ ' · ' }}</span>
                    <span>{{ `HA ${activeEnvRoom.defaultLabel}` }}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                class="env-room-editor__remove"
                @click="$emit('remove-env-room', activeEnvRoom.id)"
              >
                <Trash2 class="w-3.5 h-3.5" />
                {{ '隐藏房间' }}
              </button>
            </div>

            <div class="env-room-form">
              <div class="env-room-field">
                <label class="settings-form-label env-room-field__label--accent">{{
                  '房间显示名'
                }}</label>
                <input
                  v-model="sensorMap[activeEnvRoom.id].label"
                  type="text"
                  class="settings-field rooms-catalog-input"
                  :placeholder="activeEnvRoom.defaultLabel"
                />
                <p
                  v-if="isLabelOverridden(activeEnvRoom.id)"
                  class="rooms-override-hint"
                >
                  {{ '已覆盖 HA 默认名' }}
                  <code>{{ activeEnvRoom.defaultLabel }}</code>
                </p>
                <p v-else class="rooms-default-hint">
                  {{ '留空则使用 HA 默认名' }}
                  <code>{{ activeEnvRoom.defaultLabel }}</code>
                </p>
              </div>
            </div>
          </div>

          <div
            v-else-if="!envRoomList.length"
            class="settings-premium-empty settings-premium-empty--emerald"
          >
            <Leaf class="settings-premium-empty__icon" />
            <p class="settings-premium-empty__title">{{ '尚未同步 HA 区域' }}</p>
            <p class="settings-premium-empty__desc">
              {{ '请先在 Home Assistant 中配置区域，然后同步 HA 区域' }}
            </p>
          </div>
        </div>
      </div>
    </SettingsCard>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { Sparkles, Trash2, Leaf, Loader2 } from '@lucide/vue'
import { fetchDbAreas } from '@/services/api/areas'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsSectionHead from '@/views/settings/shared/layout/SettingsSectionHead.vue'
import SettingsOrchTabs from '@/views/settings/shared/layout/SettingsOrchTabs.vue'
import EntityInput from '@/components/common/EntityInput.vue'
import RoomQuickRules from './RoomQuickRules.vue'
import RoomReferenceBadges from '@/views/settings/home/RoomReferenceBadges.vue'
import { getQuickRuleFields } from '@/composables/settings/env-sensor-map.internals'
import {
  buildRoomReferenceBadges,
  roomHasEnvSensors,
} from '@/utils/settings/room-reference-badges.util'

// 入参：加载态、房间列表、Tab 配置、激活房间、字段元信息、隐藏数、是否显示传感器字段、待保存计数、保存回调
const props = defineProps({
  envLoading: Boolean,
  envRoomList: { type: Array, default: () => [] },
  bindingsEnvTabs: { type: Array, default: () => [] },
  envRoomTabs: { type: Array, default: () => [] },
  activeEnvRoom: { type: Object, default: null },
  envSensorFieldList: { type: Array, default: () => [] },
  hiddenPresetCount: { type: Number, default: 0 },
  showSensorFields: { type: Boolean, default: true },
  pendingEnvChanges: { type: Number, default: 0 },
  saveBindings: { type: Function, default: null },
})

// 双向绑定：环境绑定子 Tab（rooms / io）
const bindingsEnvTab = defineModel('bindingsEnvTab', { type: String, default: 'rooms' })
// 双向绑定：当前激活的房间 Tab id
const envRoomTab = defineModel('envRoomTab', { type: String, default: '' })
// 双向绑定：房间 → 传感器映射表（含显示名与各实体 id）
const sensorMap = defineModel('sensorMap', { type: Object, required: true })

// DB 关联区域缓存，用于推断房间引用徽章（移动端 / Agent）
const dbAreas = ref([])

onMounted(async () => {
  try {
    const { data } = await fetchDbAreas()
    dbAreas.value = Array.isArray(data) ? data : []
  } catch {
    dbAreas.value = []
  }
})

// 计算房间引用徽章：环境传感器已绑 + 关联移动端区域 + 关联 Agent 区域
function badgesForRoom(roomId) {
  const hasEnv = roomHasEnvSensors(sensorMap.value?.[roomId])
  const linked = dbAreas.value.filter(
    (a) => String(a.haAreaId || '').trim() === String(roomId || '').trim(),
  )
  const hasMobile = linked.length > 0
  const hasAgent = linked.some((a) => (a.entities?.length || 0) > 0)
  return buildRoomReferenceBadges({ hasEnv, hasMobileArea: hasMobile, hasAgentArea: hasAgent })
}

// 房间区块描述：已配置房间数量
const roomSectionDescription = computed(() => `已配置 ${props.envRoomList.length} 个房间`)

// 快捷规则字段列表（人体传感器 / 灯光 / 空调等）
const quickRuleFieldList = computed(() => Object.values(getQuickRuleFields()))

// 房间目录描述：依据房间数与隐藏数生成不同提示文案
const catalogDescription = computed(() => {
  const count = props.envRoomList.length
  if (!count) return '尚未同步 HA 区域'
  if (props.hiddenPresetCount) {
    return `${count} 个房间 · ${props.hiddenPresetCount} 个已隐藏 · 选中 Tab 编辑显示名`
  }
  return `${count} 个房间 · 选中 Tab 编辑显示名，← → 快速切换`
})

// 当前激活房间的 emoji（取自 Tab 配置，缺失回退为 📍）
const activeRoomEmoji = computed(() => {
  if (!props.activeEnvRoom) return '📍'
  return props.envRoomTabs.find((t) => t.id === props.activeEnvRoom.id)?.emoji || '📍'
})

// 房间有效显示名：自定义名优先，否则 HA 默认名，再否则回退为 id
function effectiveLabel(roomId) {
  const custom = sensorMap.value[roomId]?.label?.trim()
  const room = props.envRoomList.find((r) => r.id === roomId)
  return custom || room?.defaultLabel || roomId
}

// 判断房间显示名是否已覆盖 HA 默认名（用于展示「已覆盖」提示）
function isLabelOverridden(roomId) {
  const room = props.envRoomList.find((r) => r.id === roomId)
  const label = sensorMap.value[roomId]?.label?.trim()
  return Boolean(room && label && label !== room.defaultLabel)
}

// 对外事件：智能推断映射、同步 HA 区域、恢复隐藏房间、移除房间、导出 CSV、导入 CSV 文件
defineEmits([
  'infer-env-map',
  'sync-ha-areas',
  'restore-hidden-rooms',
  'remove-env-room',
  'export-env-csv',
  'env-csv-file',
])
</script>

<style scoped src="./styles/SettingsBindingsEnvironmentSection.css"></style>
