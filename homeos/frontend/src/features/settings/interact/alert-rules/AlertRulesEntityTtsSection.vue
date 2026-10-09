<!--
组件：AlertRulesEntityTtsSection.vue
所属模块：frontend / src / views / settings / interact / alert-rules
职责：实体自定义播报规则区段。展示推荐规则卡片，提供实体选择器添加 entity_id，
      为每个实体配置独立 TTS 话术（状态变化时朗读），支持变量插入与规则增删。
关键依赖：
  - RecommendInsightCard：推荐规则卡片（一键添加全部）
  - EntityInput：实体搜索选择
  - VoiceSpeechComposer：话术模板编辑（预设/自定义/变量）
  - SettingsCard / SettingsFlowBand / SettingsFlowStat：卡片与流程概览
  - useAlertRulesSection：注入 voice 及实体播报相关方法
  - useAlertRulesRecommend：推荐规则与统计
  - useEntitiesStore：实体显示名解析
  - getEntityTtsQuickDomains：实体播报快捷域过滤
数据来源：useAlertRulesSection() 返回的 voice（含 entityTtsAlerts）；useEntitiesStore 的实体列表
-->
<template>
  <div class="alert-entity-tts">
    <RecommendInsightCard
      :title="recommendations.title || '告警规则推荐'"
      :summary="recommendations.summary"
      :loading="statsLoading"
      :actionable="recommendations.hasActionable"
      :show-apply="recommendations.hasActionable"
      apply-label="一键添加全部推荐"
      :groups="recommendations.groups"
      :visible="recommendations.hasActionable || statsLoading"
      @refresh="refresh"
      @apply="applyAll"
      @chip-click="applyChip"
    />

    <SettingsCard static>
      <SettingsFlowBand
        :steps="entityTtsFlowSteps"
        class="are-flow-band"
        collapsible
        default-collapsed
        toggle-label="实体播报流程"
        :collapsed-summary="entityTtsFlowSummary"
      >
        <template #stats>
          <SettingsFlowStat
            :label="'实体规则'"
            :value="voice.entityTtsAlerts?.length || 0"
            tone="accent"
            val-tone="accent"
          />
          <SettingsFlowStat
            :label="'播报开关'"
            :value="voice.ttsAlerts?.enabled ? '已启用' : '已关闭'"
            :tone="voice.ttsAlerts?.enabled ? 'emerald' : 'rose'"
            :val-tone="voice.ttsAlerts?.enabled ? 'emerald' : 'rose'"
          />
        </template>
      </SettingsFlowBand>
      <p class="alert-entity-var-hint">
        {{ '支持变量：' }}<code>{{ entityTtsVarHint }}</code>
      </p>

      <div class="alert-entity-add">
        <div class="alert-entity-add__picker">
          <label class="settings-form-label mb-1">{{ '添加实体' }}</label>
          <div class="flex gap-2">
            <EntityInput
              v-model="pendingEntityId"
              class="flex-1"
              :domain-filter="entityPickerDomain"
              :placeholder="'搜索并选择 entity_id'"
            />
            <button
              type="button"
              class="settings-btn-accent shrink-0"
              :disabled="!voice.ttsAlerts?.enabled || !pendingEntityId?.trim()"
              @click="confirmAddEntity"
            >
              {{ '添加' }}
            </button>
          </div>
        </div>
        <div class="alert-entity-quick">
          <span class="alert-entity-quick__label">{{ '快捷筛选' }}</span>
          <div class="alert-entity-quick__chips">
            <button
              v-for="dom in entityTtsQuickDomains"
              :key="dom.id"
              type="button"
              :class="[
                'alert-entity-quick__chip',
                entityPickerDomain === dom.id && 'alert-entity-quick__chip--active',
              ]"
              @click="togglePickerDomain(dom.id)"
            >
              <span>{{ dom.emoji }}</span>
              <span>{{ dom.label }}</span>
            </button>
          </div>
        </div>
      </div>
    </SettingsCard>

    <div v-if="voice.entityTtsAlerts?.length" class="alert-entity-list space-y-3">
      <div
        v-for="(rule, idx) in voice.entityTtsAlerts"
        :key="rule.id"
        class="alert-entity-card"
        :class="{ 'alert-entity-card--off': !rule.enabled }"
      >
        <div class="alert-entity-card__head">
          <label class="alert-voice-card__toggle shrink-0" @click.stop>
            <input
              v-model="rule.enabled"
              type="checkbox"
              class="settings-checkbox"
              :disabled="!voice.ttsAlerts?.enabled"
            />
          </label>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="alert-entity-card__name">{{ entityLabel(rule.entityId) }}</span>
              <span class="alert-entity-card__state">{{ stateLabel(rule.stateTo) }}</span>
            </div>
            <p class="alert-entity-card__eid">{{ rule.entityId }}</p>
          </div>
          <button
            type="button"
            class="settings-list-btn settings-list-btn--danger shrink-0"
            :aria-label="'删除实体播报'"
            @click="removeEntityTtsAlert(idx)"
          >
            <Trash2 class="w-4 h-4" />
          </button>
        </div>

        <div class="alert-entity-card__body">
          <div class="settings-form-grid">
            <div class="col-span-2">
              <label class="settings-form-label mb-1">{{ '监听实体' }}</label>
              <EntityInput v-model="rule.entityId" :placeholder="'entity_id'" />
            </div>
            <div>
              <label class="settings-form-label mb-1">{{ '触发状态' }}</label>
              <HosSelect variant="settings" block trigger-class="text-xs" v-model="rule.stateTo">
                <option
                  v-for="opt in entityStateOptions"
                  :key="opt.value || 'any'"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </option>
              </HosSelect>
            </div>
          </div>

          <VoiceSpeechComposer
            :presets="customAlertSpeechModes"
            :active-preset="rule.speechMode || 'trigger'"
            :custom-text="rule.speechText || ''"
            :preview-template="composeCustomAlertTemplate(rule.speechMode, rule.speechText)"
            :preview-vars="entityPreviewVars(rule.entityId)"
            :custom-label="'自定义播报'"
            :custom-placeholder="'例如：{{name}} 已打开'"
            :show-var-chips="rule.speechMode === 'fixed' || rule.speechMode === 'custom'"
            :var-chips="entityTtsVarChips"
            compact
            @update:active-preset="rule.speechMode = $event"
            @update:custom-text="rule.speechText = $event"
            @insert-var="insertEntityTtsVar(rule, $event)"
          />
        </div>
      </div>
    </div>

    <div v-else class="settings-premium-empty settings-premium-empty--violet">
      <MapPin class="settings-premium-empty__icon" />
      <p class="settings-premium-empty__title">{{ '暂无实体播报' }}</p>
      <p class="settings-premium-empty__desc">
        {{ '从上方搜索添加门磁、人体传感器、开关等实体，并设置专属播报内容' }}
      </p>
      <div class="settings-premium-empty__actions">
        <button
          type="button"
          class="settings-premium-empty__btn settings-premium-empty__btn--accent"
          :disabled="!voice.ttsAlerts?.enabled"
          @click="addEntityTtsAlert()"
        >
          {{ '添加空白项' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import HosSelect from '@/components/common/base/HosSelect.vue'
import { ref, computed, unref } from 'vue'
import { Trash2, MapPin, Activity, Filter, Volume2 } from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsFlowBand from '@/features/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/features/settings/shared/layout/SettingsFlowStat.vue'
import RecommendInsightCard from '@/components/common/RecommendInsightCard.vue'
import EntityInput from '@/components/common/EntityInput.vue'
import VoiceSpeechComposer from '@/features/settings/interact/voice/SpeechComposer.vue'
import { getEntityTtsQuickDomains } from '@/constants/voice-alert-catalog'
import { useAlertRulesSection } from './context'
import { useEntitiesStore } from '@/stores/entities.store'
import { useAlertRulesRecommend } from '@/features/settings/composables/interact/alert-rules.internals'
import { getEntityDisplayName } from '@/utils/entity/derived.util'

const entitiesStore = useEntitiesStore()
const pendingEntityId = ref('')
const entityPickerDomain = ref('')
const entityTtsQuickDomains = getEntityTtsQuickDomains()
const entityTtsVarHint = '{{name}} {{state}} {{old_state}} {{entity_id}}'

const entityTtsFlowSteps = [
  { label: '实体状态', meta: '变化监听', icon: Activity, tone: 'in' },
  { label: '条件匹配', meta: '状态/阈值', icon: Filter, tone: 'mid' },
  { label: 'TTS 播报', meta: '独立话术', icon: Volume2, tone: 'out' },
]

const {
  voice,
  entityStateOptions,
  customAlertSpeechModes,
  entityTtsVarChips,
  composeCustomAlertTemplate,
  entityPreviewVars,
  insertEntityTtsVar,
  addEntityTtsAlert,
  removeEntityTtsAlert,
} = useAlertRulesSection([
  'voice',
  'entityStateOptions',
  'customAlertSpeechModes',
  'entityTtsVarChips',
  'composeCustomAlertTemplate',
  'entityPreviewVars',
  'insertEntityTtsVar',
  'addEntityTtsAlert',
  'removeEntityTtsAlert',
])

const entityTtsFlowSummary = computed(() => {
  const data = unref(voice)
  const n = data?.entityTtsAlerts?.length || 0
  const on = data?.ttsAlerts?.enabled ? '播报开' : '播报关'
  return `${n} 条规则 · ${on}`
})

const existingEntityIds = computed(() => {
  const data = unref(voice)
  return new Set(
    (data?.entityTtsAlerts || [])
      .map((rule) => String(rule.entityId || '').trim())
      .filter(Boolean),
  )
})

const { statsLoading, recommendations, applyChip, applyAll, refresh } = useAlertRulesRecommend(
  () => existingEntityIds.value,
  (entityId) => addEntityTtsAlert(entityId),
)

function entityLabel(entityId) {
  const entity = entitiesStore.entities[entityId]
  return getEntityDisplayName(entityId, entity) || entityId || '未选择实体'
}

function stateLabel(stateTo) {
  const opts = Array.isArray(entityStateOptions) ? entityStateOptions : entityStateOptions?.value
  const hit = (opts || []).find((o) => o.value === (stateTo ?? ''))
  return hit?.label || '任意状态变化'
}

function togglePickerDomain(id) {
  entityPickerDomain.value = entityPickerDomain.value === id ? '' : id
}

function confirmAddEntity() {
  const id = pendingEntityId.value?.trim()
  if (!id) return
  if (addEntityTtsAlert(id)) pendingEntityId.value = ''
}
</script>

<style scoped src="./styles/alert-rules.css"></style>
