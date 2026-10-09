<!--
组件：AlertRulesInboxSection.vue
所属模块：frontend / src / views / settings / interact / alert-rules
职责：应用内告警规则收件箱。展示规则列表（名称/级别/实体/条件），提供新建、编辑、删除、测试入口，
      并引导跳转至实体自定义播报配置。非 admin 账户仅可查看。
关键依赖：
  - ApiQueryState：规则列表加载态/错误重试
  - SettingsCard / SettingsFlowBand / SettingsFlowStat：卡片与流程概览
  - useAlertRulesSection：注入 rules / loading / loadRules / openCreate / openEdit / testRule / removeRule 等
数据来源：useAlertRulesSection() 返回的 rules 列表与规则操作方法
-->
<template>
  <div class="settings-hub-section alert-inbox-hub">
    <SettingsCard v-if="!isAdmin" extra-class="ar-admin-warn">
      <p class="text-[12px] ar-warn-text">
        {{ '当前账户无 admin 权限，仅可查看规则。新建、编辑与删除需管理员账户。' }}
      </p>
    </SettingsCard>

    <SettingsCard static extra-class="!py-3 !px-4 ar-inbox-workspace">
      <SettingsFlowBand
        :steps="inboxFlowSteps"
        collapsible
        default-collapsed
        toggle-label="流程概览"
        :collapsed-summary="inboxFlowSummary"
      >
        <template #stats>
          <SettingsFlowStat :label="'应用内规则'" :value="rules.length" tone="accent" val-tone="accent" />
          <SettingsFlowStat
            :label="'语音播报项'"
            :value="enabledVoiceAlertCount"
            tone="emerald"
            val-tone="emerald"
          />
        </template>
      </SettingsFlowBand>
    </SettingsCard>

    <SettingsCard extra-class="ar-voice-card !py-3 !px-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div class="min-w-0">
          <p class="text-xs font-medium ar-voice-title">{{ '📍 实体自定义播报' }}</p>
          <p class="text-[12px] ar-voice-desc mt-1 leading-relaxed">
            {{ '为指定实体配置独立 TTS 话术（如门磁打开、传感器触发时朗读）。' }}
          </p>
        </div>
        <button
          type="button"
          class="settings-btn-accent text-xs shrink-0"
          @click="openVoiceEntityTts"
        >
          {{ '去配置' }}
        </button>
      </div>
    </SettingsCard>

    <ApiQueryState
      :loading="loading"
      :error="rulesLoadError"
      skeleton="list"
      error-title="规则加载失败"
      tone="rose"
      @retry="loadRules"
    >
      <div v-if="rules.length === 0" class="settings-premium-empty settings-premium-empty--rose">
        <Bell class="settings-premium-empty__icon" />
        <p class="settings-premium-empty__title">{{ '暂无应用内规则' }}</p>
        <p class="settings-premium-empty__desc">
          {{ '实体状态满足条件时，将在 HomeOS 通知中心显示提醒' }}
        </p>
        <div class="settings-premium-empty__actions">
          <button
            type="button"
            class="settings-premium-empty__btn settings-premium-empty__btn--accent"
            @click="openCreate"
          >
            {{ '新建规则' }}
          </button>
        </div>
      </div>

      <div v-else class="alert-rule-list">
        <article
          v-for="rule in rules"
          :key="rule.id"
          :class="[
            'alert-rule-row',
            `alert-rule-row--${rule.level || 'info'}`,
            !rule.enabled && 'alert-rule-row--disabled',
          ]"
        >
          <div class="alert-rule-row__accent" aria-hidden="true" />
          <div class="alert-rule-row__body">
            <div class="alert-rule-row__title-row">
              <span class="alert-rule-row__name">{{ rule.name }}</span>
              <span :class="['alert-rule-row__level', levelClass(rule.level)]">{{
                rule.level
              }}</span>
              <span v-if="!rule.enabled" class="alert-rule-row__off">{{ '已禁用' }}</span>
            </div>
            <p class="alert-rule-row__entity">{{ rule.entityId || '任意实体' }}</p>
            <p class="alert-rule-row__condition">{{ rule.condition }}</p>
          </div>
          <div class="alert-rule-row__actions">
            <label
              class="alert-rule-switch"
              :title="rule.enabled ? '停用此规则' : '启用此规则'"
              @click.stop
            >
              <input
                type="checkbox"
                class="alert-rule-switch__input"
                :checked="rule.enabled !== false"
                :disabled="!isAdmin"
                :aria-label="`${rule.name} 启用开关`"
                @change="toggleRuleEnabled(rule, $event.target.checked)"
              />
              <span class="alert-rule-switch__track" aria-hidden="true">
                <span class="alert-rule-switch__thumb" />
              </span>
            </label>
            <button
              type="button"
              class="alert-rule-row__btn"
              :disabled="!isAdmin"
              @click="testRule(rule)"
            >
              {{ '测试' }}
            </button>
            <button
              type="button"
              class="alert-rule-row__btn alert-rule-row__btn--primary"
              :disabled="!isAdmin"
              @click="openEdit(rule)"
            >
              {{ '编辑' }}
            </button>
            <button
              type="button"
              class="alert-rule-row__btn alert-rule-row__btn--danger"
              :disabled="!isAdmin"
              :aria-label="'删除规则'"
              @click="removeRule(rule.id)"
            >
              <Trash2 class="w-3 h-3" />
            </button>
          </div>
        </article>
      </div>
    </ApiQueryState>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Activity, Bell, Filter, Trash2, Volume2 } from '@lucide/vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsFlowBand from '@/features/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/features/settings/shared/layout/SettingsFlowStat.vue'
import { useAlertRulesSection } from './context'

const inboxFlowSteps = [
  { label: '实体状态', meta: '变化/阈值', icon: Activity, tone: 'in' },
  { label: '规则匹配', meta: '条件命中', icon: Filter, tone: 'mid' },
  { label: '通知中心', meta: '应用内提醒', icon: Bell, tone: 'exec' },
  { label: '语音播报', meta: '可选 TTS', icon: Volume2, tone: 'out' },
]

const {
  rules,
  loading,
  rulesLoadError,
  enabledVoiceAlertCount,
  isAdmin,
  levelClass,
  loadRules,
  openCreate,
  openEdit,
  testRule,
  removeRule,
  toggleRuleEnabled,
  openVoiceEntityTts,
} = useAlertRulesSection([
  'rules',
  'loading',
  'rulesLoadError',
  'enabledVoiceAlertCount',
  'isAdmin',
  'levelClass',
  'loadRules',
  'openCreate',
  'openEdit',
  'testRule',
  'removeRule',
  'toggleRuleEnabled',
  'openVoiceEntityTts',
])

const inboxFlowSummary = computed(
  () => `${rules.value.length} 规则 · ${enabledVoiceAlertCount.value} 语音项`,
)
</script>

<style src="./styles/AlertRulesInboxSection.css"></style>
