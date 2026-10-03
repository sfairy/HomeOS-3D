<!--
组件：AlertRulesNotifyTtsSection.vue
所属模块：frontend / src / views / settings / interact / alert-rules
职责：通知播报规则区段。为自定义应用通知配置 TTS 话术，支持按级别/关键词匹配后用模板合成播报文本。
      提供规则列表的增删、启用切换、名称编辑与变量插入。
关键依赖：
  - SettingsCard / SettingsFlowBand / SettingsFlowStat：卡片与流程概览
  - VoiceSpeechComposer：话术模板编辑（预设/自定义/变量插入）
  - HosSelect：级别/模式选择
  - useAlertRulesSection：注入 voice（含 customTtsAlerts）及增删方法
数据来源：useAlertRulesSection() 返回的 voice.customTtsAlerts 列表
-->
<template>
  <div class="alert-notify-tts space-y-3">
    <SettingsCard static extra-class="arn-workspace">
      <SettingsFlowBand
        :steps="notifyFlowSteps"
        class="arn-flow-band"
        collapsible
        default-collapsed
        toggle-label="流程概览"
        :collapsed-summary="notifyFlowSummary"
      >
        <template #stats>
          <SettingsFlowStat
            :label="'规则数'"
            :value="voice.customTtsAlerts.length"
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
      <header class="alert-notify__head">
        <span v-if="voice.customTtsAlerts.length" class="alert-notify__badge">{{
          `${voice.customTtsAlerts.length} 条`
        }}</span>
        <button
          type="button"
          class="settings-btn-ghost text-xs"
          :disabled="!voice.ttsAlerts?.enabled"
          @click="addCustomAlert"
        >
          <Plus class="w-3.5 h-3.5" /> {{ '添加规则' }}
        </button>
      </header>
    </SettingsCard>

    <div v-if="voice.customTtsAlerts.length" class="space-y-3">
      <div v-for="(rule, idx) in voice.customTtsAlerts" :key="rule.id" class="alert-custom-card">
        <div class="alert-custom-card__head">
          <label class="settings-check-row !mb-0 flex-1">
            <input v-model="rule.enabled" type="checkbox" class="settings-checkbox" />
            <input
              v-model="rule.label"
              type="text"
              class="settings-field text-xs flex-1"
              :placeholder="'规则名称'"
            />
          </label>
          <button
            type="button"
            class="settings-list-btn settings-list-btn--danger"
            :aria-label="'删除播报规则'"
            @click="removeCustomAlert(idx)"
          >
            <Trash2 class="w-4 h-4" />
          </button>
        </div>
        <div class="settings-form-grid">
          <div>
            <label class="settings-form-label mb-1">{{ '通知级别' }}</label>
            <HosSelect
              variant="settings"
              block
              trigger-class="text-xs"
              v-model="rule.notificationLevel"
            >
              <option value="">{{ '任意' }}</option>
              <option value="danger">{{ '危险' }}</option>
              <option value="warn">{{ '警告' }}</option>
              <option value="info">{{ '信息' }}</option>
            </HosSelect>
          </div>
          <div>
            <label class="settings-form-label mb-1">{{ '消息包含' }}</label>
            <input
              v-model="rule.messageContains"
              type="text"
              class="settings-field text-xs"
              :placeholder="'门铃'"
            />
          </div>
          <div class="col-span-2">
            <label class="settings-form-label mb-1">{{ '来源包含' }}</label>
            <input
              v-model="rule.sourceContains"
              type="text"
              class="settings-field text-xs"
              :placeholder="'alert-rule / advisor-tip'"
            />
          </div>
        </div>
        <VoiceSpeechComposer
          :presets="customAlertSpeechModes"
          :active-preset="rule.speechMode || 'notify_read'"
          :custom-text="rule.speechText || ''"
          :preview-template="composeCustomAlertTemplate(rule.speechMode, rule.speechText)"
          :preview-vars="{ message: '有人按门铃', name: '门铃', level: 'info' }"
          :custom-label="'固定播报文字'"
          :custom-placeholder="'例如：{{message}}'"
          :show-custom-field="rule.speechMode === 'fixed'"
          compact
          @update:active-preset="rule.speechMode = $event"
          @update:custom-text="rule.speechText = $event"
        />
      </div>
    </div>
    <div v-else class="settings-premium-empty settings-premium-empty--amber">
      <Bell class="settings-premium-empty__icon" />
      <p class="settings-premium-empty__title">{{ '暂无通知播报规则' }}</p>
      <p class="settings-premium-empty__desc">{{ '可按通知级别、消息或来源关键词匹配播报' }}</p>
      <div class="settings-premium-empty__actions">
        <button
          type="button"
          class="settings-premium-empty__btn settings-premium-empty__btn--accent"
          :disabled="!voice.ttsAlerts?.enabled"
          @click="addCustomAlert"
        >
          <Plus class="w-3.5 h-3.5" /> {{ '添加规则' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, unref } from 'vue'
import HosSelect from '@/components/common/base/HosSelect.vue'
import { Bell, Filter, MessageSquare, Plus, Trash2, Volume2 } from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsFlowBand from '@/views/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/views/settings/shared/layout/SettingsFlowStat.vue'
import VoiceSpeechComposer from '@/views/settings/interact/voice/SpeechComposer.vue'
import { useAlertRulesSection } from './context'

const notifyFlowSteps = [
  { label: '应用通知', meta: '到达事件', icon: Bell, tone: 'in' },
  { label: '级别/关键词', meta: '多维匹配', icon: Filter, tone: 'mid' },
  { label: '话术合成', meta: '模板变量', icon: MessageSquare, tone: 'exec' },
  { label: 'TTS 播报', meta: '默认音箱', icon: Volume2, tone: 'out' },
]

const {
  voice,
  customAlertSpeechModes,
  composeCustomAlertTemplate,
  addCustomAlert,
  removeCustomAlert,
} = useAlertRulesSection([
  'voice',
  'customAlertSpeechModes',
  'composeCustomAlertTemplate',
  'addCustomAlert',
  'removeCustomAlert',
])

const notifyFlowSummary = computed(() => {
  const data = unref(voice)
  const on = data?.ttsAlerts?.enabled ? '已启用' : '已关闭'
  return `${data?.customTtsAlerts?.length || 0} 规则 · ${on}`
})
</script>

<style scoped src="./styles/alert-rules.css"></style>
