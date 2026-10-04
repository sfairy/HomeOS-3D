<!--
组件：AlertRulesVoiceSection.vue
所属模块：frontend / src / views / settings / interact / alert-rules
职责：语音告警配置区段。总开关控制自动语音告警，通过子导航切换内置规则（按事件类型展开配置话术/样式）、
      实体自定义播报（AlertRulesEntityTtsSection）与通知播报（AlertRulesNotifyTtsSection）。
      未保存时挂起保存条；未配置默认音箱时给出引导。
关键依赖：
  - ApiQueryState：语音告警配置加载态/错误重试
  - SettingsCard / SettingsOrchTabs / SettingsFlowBand / SettingsFlowStat / SettingsFeatureMaster：卡片与流程
  - VoiceSpeechComposer：内置规则话术编辑
  - AlertRulesEntityTtsSection / AlertRulesNotifyTtsSection：实体/通知播报子区段
  - SettingsPendingSaveAction：未保存修改的保存/取消条
  - useAlertRulesSection：注入 voice / voiceFlowSteps / 各类规则编辑方法
数据来源：useAlertRulesSection() 返回的 voice 配置与规则操作方法
-->
<template>
  <div class="settings-hub-section">
    <p v-if="voiceAlertsPending > 0" class="settings-note-callout settings-note-callout--amber">
      <span class="settings-note-callout__label">未保存</span>
      <span>语音告警有未保存修改，请点击下方「保存语音告警」使配置生效。</span>
    </p>
    <div v-if="voiceAlertsPending > 0" class="alert-hub-save-bar">
      <SettingsPendingSaveAction
        :pending="voiceAlertsPending"
        :saving="voiceSaving"
        save-text="保存语音告警"
        saving-text="保存中…"
        @save="onSaveVoiceAlerts"
        @cancel="cancelVoiceAlerts"
      />
    </div>
    <ApiQueryState
      :loading="voiceLoading"
      :error="voiceLoadError"
      error-title="语音告警配置加载失败"
      tone="indigo"
      @retry="initVoiceAlerts"
    >
      <SettingsCard extra-class="arv-workspace" static>
        <SettingsFlowBand
          :steps="voiceFlowSteps"
          class="arv-flow-band"
          collapsible
          default-collapsed
          toggle-label="流程概览"
          :collapsed-summary="voiceAlertFlowSummary"
        >
          <template #stats>
            <SettingsFlowStat
              :label="'默认音箱'"
              :value="ttsMediaPlayerId?.trim() ? '已配置' : '未配置'"
              :tone="ttsMediaPlayerId?.trim() ? 'sky' : 'amber'"
              :val-tone="ttsMediaPlayerId?.trim() ? 'sky' : 'amber'"
            />
            <SettingsFlowStat
              :label="'播报项'"
              :value="enabledVoiceAlertCount"
              tone="accent"
              val-tone="accent"
            />
          </template>
        </SettingsFlowBand>

        <div v-if="!ttsMediaPlayerId?.trim()" class="arv-warn-strip">
          {{ '尚未配置默认播报音箱。请先到 ' }}<strong>{{ '设置 → 语音 → 播报输出' }}</strong
          >{{ ' 选择 media_player，否则语音告警无法播报。' }}
        </div>

        <SettingsFeatureMaster
          class="arv-master-bar"
          :icon="Volume2"
          tone="accent"
          :active="voice.ttsAlerts.enabled"
          :title="'自动语音告警'"
          :hint="'全屋事件触发时通过默认音箱 TTS 播报'"
        >
          <template #actions>
            <div class="arv-cooldown">
              <label class="arv-cooldown__label">{{ '播报冷却（分钟）' }}</label>
              <input
                v-model.number="speakCooldownMin"
                type="number"
                min="1"
                max="120"
                class="settings-field arv-cooldown__input"
              />
            </div>
            <label class="alert-switch arv-master-switch">
              <input v-model="voice.ttsAlerts.enabled" type="checkbox" class="settings-checkbox" />
              <span>{{ voice.ttsAlerts.enabled ? '已启用' : '已关闭' }}</span>
            </label>
          </template>
        </SettingsFeatureMaster>

        <div class="arv-tabs-rail">
          <SettingsOrchTabs v-model="alertVoiceTab" :tabs="alertVoiceTabs" plain />
        </div>

        <div class="arv-body" :class="{ 'arv-body--dim': !voice.ttsAlerts.enabled }">
          <template v-for="group in alertRuleGroups" :key="group.id">
            <div v-show="alertVoiceTab === group.id">
              <div class="alert-voice-cards">
                <div
                  v-for="item in group.items"
                  :key="item.key"
                  class="alert-voice-card"
                  :class="{
                    'alert-voice-card--on': voice.ttsAlerts[item.key],
                    'alert-voice-card--expanded': expandedAlert === item.key,
                  }"
                >
                  <div class="alert-voice-card__head" @click="toggleAlertExpand(item.key)">
                    <label class="alert-voice-card__toggle" @click.stop>
                      <input
                        v-model="voice.ttsAlerts[item.key]"
                        type="checkbox"
                        class="settings-checkbox"
                        :disabled="!voice.ttsAlerts.enabled"
                      />
                    </label>
                    <div class="min-w-0 flex-1">
                      <span class="alert-voice-card__label">{{ item.label }}</span>
                      <span class="alert-voice-card__desc">{{ item.description }}</span>
                    </div>
                    <ChevronDown
                      class="alert-voice-card__chev"
                      :class="{ 'alert-voice-card__chev--open': expandedAlert === item.key }"
                    />
                  </div>
                  <div
                    v-if="expandedAlert === item.key && voice.ttsAlerts[item.key]"
                    class="alert-voice-card__body"
                  >
                    <VoiceSpeechComposer
                      :presets="stylesForAlertKey(item.key)"
                      :active-preset="builtinStyleState[item.key]?.style || 'default'"
                      :custom-text="builtinStyleState[item.key]?.customText || ''"
                      :preview-template="builtinPreviewTemplate(item.key)"
                      :preview-vars="alertPreviewSamples[item.key]"
                      :default-preview="builtinDefaultSpeech[item.key]"
                      :custom-label="'自定义播报'"
                      :show-var-chips="builtinStyleState[item.key]?.style === 'custom'"
                      :var-chips="varChipsForKey(item.key)"
                      compact
                      @update:active-preset="setBuiltinStyle(item.key, $event)"
                      @update:custom-text="setBuiltinCustom(item.key, $event)"
                      @insert-var="insertBuiltinVar(item.key, $event)"
                    />
                  </div>
                </div>
              </div>
            </div>
          </template>

          <div v-show="alertVoiceTab === 'custom'" class="arv-custom-panel">
            <SettingsOrchTabs v-model="alertCustomSubTab" :tabs="alertCustomSubTabs" plain />
            <AlertRulesEntityTtsSection v-show="alertCustomSubTab === 'entity'" />
            <AlertRulesNotifyTtsSection v-show="alertCustomSubTab === 'notify'" />
          </div>
        </div>
      </SettingsCard>
    </ApiQueryState>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import { Activity, Bell, ChevronDown, Filter, Volume2 } from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsOrchTabs from '@/views/settings/shared/layout/SettingsOrchTabs.vue'
import SettingsFlowBand from '@/views/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/views/settings/shared/layout/SettingsFlowStat.vue'
import SettingsFeatureMaster from '@/views/settings/shared/layout/SettingsFeatureMaster.vue'
import VoiceSpeechComposer from '@/views/settings/interact/voice/SpeechComposer.vue'
import AlertRulesEntityTtsSection from './AlertRulesEntityTtsSection.vue'
import AlertRulesNotifyTtsSection from './AlertRulesNotifyTtsSection.vue'
import SettingsPendingSaveAction from '@/views/settings/shared/SettingsPendingSaveAction.vue'
import { useAlertRulesSection } from './context'

const voiceFlowSteps = [
  { label: '全屋事件', meta: '状态变化', icon: Activity, tone: 'in' },
  { label: '规则匹配', meta: '内置/自定义', icon: Filter, tone: 'mid' },
  { label: '通知中心', meta: '可选写入', icon: Bell, tone: 'exec' },
  { label: 'TTS 播报', meta: '默认音箱', icon: Volume2, tone: 'out' },
]

const {
  voice,
  voiceLoading,
  voiceLoadError,
  ttsMediaPlayerId,
  speakCooldownMin,
  enabledVoiceAlertCount,
  alertRuleGroups,
  expandedAlert,
  builtinStyleState,
  alertPreviewSamples,
  alertVoiceTab,
  alertVoiceTabs,
  alertCustomSubTab,
  alertCustomSubTabs,
  toggleAlertExpand,
  stylesForAlertKey,
  builtinPreviewTemplate,
  builtinDefaultSpeech,
  varChipsForKey,
  setBuiltinStyle,
  setBuiltinCustom,
  insertBuiltinVar,
  initVoiceAlerts,
  voiceAlertsPending,
  voiceSaving,
  onSaveVoiceAlerts,
  cancelVoiceAlerts,
} = useAlertRulesSection([
  'voice',
  'voiceLoading',
  'voiceLoadError',
  'ttsMediaPlayerId',
  'speakCooldownMin',
  'enabledVoiceAlertCount',
  'alertRuleGroups',
  'expandedAlert',
  'builtinStyleState',
  'alertPreviewSamples',
  'alertVoiceTab',
  'alertVoiceTabs',
  'alertCustomSubTab',
  'alertCustomSubTabs',
  'toggleAlertExpand',
  'stylesForAlertKey',
  'builtinPreviewTemplate',
  'builtinDefaultSpeech',
  'varChipsForKey',
  'setBuiltinStyle',
  'setBuiltinCustom',
  'insertBuiltinVar',
  'initVoiceAlerts',
  'voiceAlertsPending',
  'voiceSaving',
  'onSaveVoiceAlerts',
  'cancelVoiceAlerts',
])

const voiceAlertFlowSummary = computed(() => {
  const speaker = ttsMediaPlayerId.value?.trim() ? '音箱已配' : '音箱未配'
  return `${speaker} · ${enabledVoiceAlertCount.value} 播报项`
})
</script>
<style src="./styles/alert-rules.css"></style>
