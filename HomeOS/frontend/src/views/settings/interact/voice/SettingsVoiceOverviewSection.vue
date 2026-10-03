<!--
组件：SettingsVoiceOverviewSection.vue
所属模块：frontend / src / views / settings / interact / voice
职责：语音概览区段。通过 FlowBand 展示语音子系统配置摘要与运行状态，含交互方式、每日问候、
      识别/播报引擎、音箱数量、语音命令数等指标。
Props：
  - sttModeLabel / intentLabel / ttsSpeakerLabel：引擎与意图文案
  - voiceCommandsCount：语音命令数量
  - entityStats：实体统计（tts / stt / media）
  - voice：语音配置对象
  - voiceRooms：语音房间列表
关键依赖：
  - SettingsCard / SettingsSectionHead / SettingsFlowBand / SettingsFlowStat：卡片与流程
数据来源：父级 SettingsVoicePanel 透传的 props
-->
<template>
  <div class="settings-hub-section">
    <SettingsCard extra-class="voice-workspace" static>
      <SettingsFlowBand
        :steps="voiceFlowSteps"
        class="voice-flow-band"
        collapsible
        default-collapsed
        toggle-label="流程概览"
        :collapsed-summary="voiceFlowSummary"
      >
        <template #stats>
          <SettingsFlowStat
            :label="'播报音箱'"
            :value="entityStats.media"
            tone="emerald"
            val-tone="emerald"
          />
          <SettingsFlowStat
            :label="'语音命令'"
            :value="voiceCommandsCount"
            tone="amber"
            val-tone="amber"
          />
        </template>
      </SettingsFlowBand>

      <div class="voice-status-body">
        <SettingsSectionHead
          :title="'运行状态'"
          :eyebrow="'状态'"
          :description="'当前语音子系统配置摘要'"
          bordered
        />
        <div class="voice-status-panel">
          <div class="voice-status-metrics">
            <article class="voice-status-metric voice-status-metric--mode">
              <span class="voice-status-metric__k">{{ '交互方式' }}</span>
              <span
                class="voice-status-metric__v"
                :class="
                  voice.interactionMode === 'wake'
                    ? 'voice-status-metric__v--accent'
                    : 'voice-status-metric__v--sky'
                "
              >
                {{ voice.interactionMode === 'wake' ? '唤醒词待命' : '长按说话' }}
              </span>
            </article>
            <article class="voice-status-metric voice-status-metric--greet">
              <span class="voice-status-metric__k">{{ '每日问候' }}</span>
              <span
                class="voice-status-metric__v"
                :class="voice.dailyAdvisorSpeak ? 'voice-status-metric__v--success' : 'voice-status-metric__v--muted'"
              >
                {{ voice.dailyAdvisorSpeak ? `${voice.dailyAdvisorSpeakHour}:00 后` : '未启用' }}
              </span>
            </article>
          </div>

          <section class="voice-status-rooms">
            <header class="voice-status-rooms__head">
              <span class="voice-status-rooms__k">{{ '分房间说法' }}</span>
              <span class="voice-status-rooms__meta">{{
                voiceRooms.length ? `${voiceRooms.length} 个房间` : '暂无房间'
              }}</span>
            </header>
            <div v-if="voiceRooms.length" class="voice-room-chips">
              <span v-for="room in voiceRooms" :key="room" class="voice-room-chip">{{ room }}</span>
            </div>
            <p v-else class="voice-status-rooms__empty">{{
              '尚未同步房间显示名，保存房间配置后将自动生成语音说法'
            }}</p>
          </section>
        </div>
      </div>
    </SettingsCard>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Brain, Home, Mic, Volume2 } from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsSectionHead from '@/views/settings/shared/layout/SettingsSectionHead.vue'
import SettingsFlowBand from '@/views/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/views/settings/shared/layout/SettingsFlowStat.vue'

const props = defineProps({
  sttModeLabel: { type: String, default: '' },
  intentLabel: { type: String, default: '' },
  ttsSpeakerLabel: { type: String, default: '' },
  voiceCommandsCount: { type: Number, default: 0 },
  entityStats: { type: Object, default: () => ({ tts: 0, stt: 0, media: 0 }) },
  voice: { type: Object, required: true },
  voiceRooms: { type: Array, default: () => [] },
})

const commandMetaLabel = computed(() =>
  '{n} 条命令'.replace('{n}', String(props.voiceCommandsCount)),
)

const voiceFlowSummary = computed(
  () => `${props.entityStats.media} 音箱 · ${props.voiceCommandsCount} 命令`,
)

const voiceFlowSteps = computed(() => [
  { label: '语音输入', meta: props.sttModeLabel, icon: Mic, tone: 'in' },
  { label: '意图理解', meta: props.intentLabel, icon: Brain, tone: 'mid' },
  { label: '全屋执行', meta: commandMetaLabel.value, icon: Home, tone: 'exec' },
  { label: '语音播报', meta: props.ttsSpeakerLabel, icon: Volume2, tone: 'out' },
])
</script>
<style src="./styles/voice-overview.css"></style>
