<!--
组件：SettingsAgentPanel.vue
所属模块：frontend / src / views / settings / interact
职责：智能管家面板入口。通过子导航切换 model（大模型接口配置+凭据+检测）、
      scene-voice（HA 场景 / 脚本语音控制允许清单，默认全禁）、
      channels（消息通道，委托给 SettingsAgentChannelsSection）、chat（管家对话调试）四个区段。
      页头提供保存/取消；演示模式（未配置密钥）禁用对话并提示。
关键依赖：
  - SettingsPageShell / SettingsHubSubnav / SettingsPendingSaveAction：页面骨架/子导航/保存条
  - SettingsCard / SettingsCardIntro / SettingsFlowBand / SettingsFlowStat / SettingsSectionHead：卡片与流程
  - SettingsAgentChannelsSection：消息通道子区段
  - useSettingsAgentPanel：聚合模型配置/对话/语音输入/检测
  - useRegisterSettingsTabPending：Tab 级离开拦截
数据来源：useSettingsAgentPanel() 返回的 agentDraft / channelDraft / chatLog 等
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="agent"
    icon-key="sparkles"
    accent="var(--module-accent-smart-services)"
    page-class="agent-hub"
    body-class="agent-hub__body"
    layout="single"
  >
    <template #actions>
      <SettingsPendingSaveAction
        :pending="pending"
        :saving="saving"
        pending-label="智能管家配置未保存"
        save-text="保存配置"
        saving-text="保存中…"
        @save="saveConfig"
        @cancel="resetDraft"
      />
    </template>

    <template #mobile-save>
      <SettingsPendingSaveAction
        :pending="pending"
        :saving="saving"
        pending-label="智能管家配置未保存"
        save-text="保存配置"
        saving-text="保存中…"
        @save="saveConfig"
        @cancel="resetDraft"
      />
    </template>

    <template #subnav>
      <SettingsHubSubnav v-model="section" :sections="subnavSections" />
    </template>

    <p
      v-if="saveTip"
      :class="['agent-save-tip', saveTipOk ? 'agent-save-tip--ok' : 'agent-save-tip--err']"
    >
      {{ saveTip }}
    </p>

    <div
      v-if="isMockProvider"
      class="agent-mock-banner"
      role="status"
    >
      <AlertTriangle class="agent-mock-banner__icon" />
      <div class="agent-mock-banner__body">
        <p class="agent-mock-banner__title">{{ '未配置接口密钥，当前为演示模式' }}</p>
        <p class="agent-mock-banner__text">{{
          '演示模式已禁用对话，避免误以为模拟回复即真实控家。请在「模型配置」填写有效接口密钥并保存，再点「检测状态」确认就绪。'
        }}</p>
        <button type="button" class="settings-btn-accent mt-3" @click="goConfigureApiKey">
          {{ '去配置接口密钥' }}
        </button>
      </div>
    </div>

    <!-- 模型配置 -->
    <section v-show="section === 'model'" class="settings-hub-section">
      <SettingsCard static extra-class="agent-workspace">
        <div class="agent-model-head">
          <SettingsCardIntro
            :icon="Sparkles"
            icon-class="agent-icon--model"
            orb-class="agent-orb--model"
            eyebrow="大模型"
            :description="'配置 OpenAI 兼容接口（DeepSeek / 豆包 / 通义等）。未填接口密钥时使用演示模式，仅验证快路径与工具流程。'"
          >
            <template #actions>
              <button
                type="button"
                class="settings-btn-ghost shrink-0"
                :disabled="pinging"
                @click="refreshPing"
              >
                {{ pinging ? '检测中…' : '检测状态' }}
              </button>
            </template>
          </SettingsCardIntro>
        </div>

        <SettingsFlowBand
          :steps="modelFlowSteps"
          class="agent-model-band"
          collapsible
          toggle-label="流程概览"
          :collapsed-summary="modelFlowSummary"
        >
          <template #stats>
            <SettingsFlowStat
              label="当前生效"
              :value="modelStatProvider"
              tone="sky"
              val-tone="sky"
            />
            <SettingsFlowStat
              label="连接状态"
              :value="modelStatReadyLabel"
              :tone="toneFromAgentClass(modelStatReadyClass)"
              :val-tone="toneFromAgentClass(modelStatReadyValClass)"
            />
          </template>
        </SettingsFlowBand>

        <p v-if="pending > 0" class="agent-band-hint">
          表单有未保存修改。「当前生效」仍是上次已保存配置，请先保存再检测。
        </p>

        <div class="agent-model-body">
          <SettingsSectionHead
            title="接口参数"
            eyebrow="连接"
            description="选择提供商预设并填写 OpenAI 兼容端点"
            bordered
          />

          <div class="settings-form-grid settings-form-grid--2 agent-form-block">
            <div>
              <label class="settings-form-label mb-1.5">提供商预设</label>
              <HosSelect
                v-model="agentDraft.provider"
                variant="settings"
                block
                :searchable="false"
                @change="applyPreset"
              >
                <option v-for="p in providerPresets" :key="p.id" :value="p.id">{{ p.label }}</option>
              </HosSelect>
            </div>
            <div>
              <label class="settings-form-label mb-1.5">语言</label>
              <HosSelect v-model="agentDraft.language" variant="settings" block :searchable="false">
                <option value="zh">中文</option>
                <option value="en">English</option>
              </HosSelect>
            </div>
            <div>
              <label class="settings-form-label mb-1.5">接口地址</label>
              <input
                v-model="agentDraft.apiBase"
                class="settings-field"
                type="url"
                placeholder="https://api.deepseek.com"
              />
            </div>
            <div>
              <label class="settings-form-label mb-1.5">模型</label>
              <input
                v-model="agentDraft.model"
                class="settings-field"
                type="text"
                placeholder="deepseek-v4-flash"
              />
            </div>
          </div>

          <SettingsSectionHead
            title="凭据与提示"
            eyebrow="高级"
            description="接口密钥留空时回退到环境变量或演示模式"
            bordered
            class="agent-section-gap"
          />

          <div id="agent-api-key" class="agent-cred-panel">
            <header class="agent-cred-panel__head">
              <div class="agent-cred-panel__icon">
                <KeyRound class="w-4 h-4" />
              </div>
              <div class="min-w-0">
                <h4 class="agent-cred-panel__title">接口密钥</h4>
                <p class="agent-cred-panel__desc">访问令牌，保存后立即生效；刷新后不回显明文</p>
              </div>
            </header>
            <div
              v-if="apiKeyLocked"
              class="agent-secret-secure"
            >
              <div class="agent-secret-secure__shield">
                <ShieldCheck class="w-4 h-4" />
              </div>
              <div class="agent-secret-secure__body">
                <div class="agent-secret-secure__row">
                  <span class="agent-secret-secure__label">密钥已加密存储</span>
                  <span class="agent-secret-secure__badge">已就绪</span>
                </div>
                <p class="agent-secret-secure__hint">
                  接口不会回传明文；保存与调用时自动使用，无需再次粘贴
                </p>
              </div>
              <button
                type="button"
                class="agent-secret-secure__edit"
                @click="beginEditApiKey"
              >
                <Pencil class="w-3.5 h-3.5" />
                <span>更换</span>
              </button>
            </div>
            <div v-else class="agent-secret-field">
              <input
                v-model="agentDraft.apiKey"
                class="settings-field agent-cred-input"
                :type="showApiKey ? 'text' : 'password'"
                autocomplete="off"
                placeholder="留空则使用环境变量或演示模式"
              />
              <button
                type="button"
                class="agent-secret-field__toggle"
                :aria-label="showApiKey ? '隐藏接口密钥' : '显示接口密钥'"
                :aria-pressed="showApiKey"
                @click="showApiKey = !showApiKey"
              >
                <Eye v-if="!showApiKey" class="w-4 h-4" />
                <EyeOff v-else class="w-4 h-4" />
              </button>
            </div>
          </div>

          <div class="agent-cred-panel agent-cred-panel--prompt">
            <header class="agent-cred-panel__head">
              <div class="agent-cred-panel__icon">
                <FileText class="w-4 h-4" />
              </div>
              <div class="min-w-0">
                <h4 class="agent-cred-panel__title">自定义系统提示</h4>
                <p class="agent-cred-panel__desc">追加到内置管家规则之后</p>
              </div>
            </header>
            <textarea
              v-model="agentDraft.systemPrompt"
              class="settings-field agent-textarea agent-cred-textarea"
              rows="3"
              placeholder="回复时带上当前家庭模式提醒（可选）"
            />
          </div>

          <div class="settings-inline-hints agent-form-block">
            <div class="settings-inline-hint settings-inline-hint--indigo">
              <Thermometer class="settings-inline-hint__icon" />
              <span>
                房间温湿度快查询会回退到「环境与健康」传感器映射。请先在
                <RouterLink class="agent-link" :to="envHealthHref">环境与健康</RouterLink>
                绑定实体，并确保 HA 区域已关联。
              </span>
            </div>
          </div>
        </div>
      </SettingsCard>
    </section>

    <!-- 场景语音控制 -->
    <section v-show="section === 'scene-voice'" class="settings-hub-section">
      <SettingsCard static extra-class="agent-scene-voice-workspace">
        <SettingsCardIntro
          :icon="ShieldAlert"
          icon-class="agent-icon--model"
          orb-class="agent-orb--model"
          eyebrow="场景语音"
          :description="'Home Assistant 的 scene.* / script.* 内部动作无法静态审计（可能包含撤防、开阀、开门等危险联动），因此默认一律拒绝语音触发。仅当在此显式启用并逐个勾选后，管家才会放行对应场景。'"
        />

        <div class="agent-model-body">
          <SettingsSectionHead
            title="语音可执行清单"
            eyebrow="安全"
            description="未勾选的场景 / 脚本仍会被拦截，并提示用户到手机 App 二次确认"
            bordered
          />

          <label
            class="agent-scene-toggle"
            :class="{ 'agent-scene-toggle--on': sceneVoiceEnabled }"
          >
            <input v-model="sceneVoiceEnabled" type="checkbox" class="settings-checkbox" />
            <div>
              <span class="agent-scene-toggle__title">{{ '启用场景语音控制' }}</span>
              <span class="agent-scene-toggle__desc">{{
                '关闭时所有场景 / 脚本均不可通过语音或管家触发'
              }}</span>
            </div>
          </label>

          <div class="settings-form-grid agent-form-block">
            <div>
              <label class="settings-form-label mb-1.5">允许语音触发的场景 / 脚本</label>
              <EntityMultiSelect
                v-model="sceneVoiceAllow"
                :allowed-domains="['scene', 'script']"
                :placeholder="sceneVoiceEnabled ? '搜索并勾选场景或脚本…' : '请先启用左侧开关'"
                :max-selection="50"
              />
              <p class="agent-band-hint mt-2">
                已选 <strong>{{ sceneVoiceAllowCount }}</strong> 个。清单内的场景会走快路径直接执行（约
                300ms，二次指令走缓存更快）；清单外的一律拦截。
              </p>
            </div>
          </div>
        </div>
      </SettingsCard>
    </section>

    <SettingsAgentChannelsSection
      v-show="section === 'channels'"
      v-model:channel-draft="channelDraft"
      v-model:agent-draft="agentDraft"
      :channel-status="channelStatus"
      :status-loading="statusLoading"
      :pending="pending"
      @refresh-status="refreshChannelStatus"
    />

    <!-- 管家对话 -->
    <section v-show="section === 'chat'" class="settings-hub-section">
      <SettingsCard static extra-class="agent-chat-workspace">
        <div class="agent-chat-head">
          <SettingsCardIntro
            :icon="MessageCircle"
            icon-class="agent-icon--chat"
            orb-class="agent-orb--chat"
            eyebrow="对话"
            :description="'完整链路：命令缓存 → 温湿度快查询 → 快路径 → LLM → 工具执行。仪表板与手机首页也可直接对话。'"
          >
            <template #actions>
              <button
                v-if="chatLog.length"
                type="button"
                class="settings-btn-ghost shrink-0"
                @click="chatLog = []"
              >
                清空记录
              </button>
            </template>
          </SettingsCardIntro>
        </div>

        <SettingsFlowBand
          :steps="chatFlowSteps"
          class="agent-chat-band"
          collapsible
          default-collapsed
          toggle-label="流程概览"
          :collapsed-summary="chatFlowSummary"
        >
          <template #stats>
            <SettingsFlowStat
              label="模型状态"
              :value="chatStatReadyLabel"
              :tone="toneFromAgentClass(chatStatReadyClass)"
              :val-tone="toneFromAgentClass(chatStatReadyValClass)"
            />
            <SettingsFlowStat
              label="对话轮次"
              :value="chatStatRoundLabel"
              tone="violet"
              val-tone="violet"
            />
          </template>
        </SettingsFlowBand>

        <div class="agent-chat-body">
          <SettingsSectionHead
            title="管家对话"
            eyebrow="调试"
            description="支持连续追问，验证多轮上下文与工具调用。仪表板与手机首页也可直接对话。"
            bordered
          />

          <div ref="chatLogEl" class="agent-chat-log agent-form-block" aria-live="polite">
            <article
              v-for="(m, i) in chatLog"
              :key="i"
              :class="['agent-chat-bubble', `agent-chat-bubble--${m.role}`]"
            >
              <div
                class="agent-chat-bubble__avatar"
                :class="m.role === 'user' ? 'agent-chat-bubble__avatar--user' : 'agent-chat-bubble__avatar--bot'"
              >
                <User v-if="m.role === 'user'" class="w-3.5 h-3.5" />
                <Sparkles v-else class="w-3.5 h-3.5" />
              </div>
              <div class="agent-chat-bubble__main">
                <header class="agent-chat-bubble__head">
                  <span class="agent-chat-bubble__name">{{ m.role === 'user' ? '你' : '管家' }}</span>
                  <span
                    v-if="m.outcome"
                    class="agent-chat-bubble__pill"
                    :data-tone="chatOutcomeTone(m.outcome)"
                  >
                    {{ chatOutcomeLabel(m.outcome) }}
                  </span>
                </header>
                <div class="agent-chat-bubble__body">{{ m.text }}</div>
                <footer v-if="m.meta" class="agent-chat-bubble__meta">{{ m.meta }}</footer>
              </div>
            </article>

            <article v-if="chatting" class="agent-chat-bubble agent-chat-bubble--assistant agent-chat-bubble--typing">
              <div class="agent-chat-bubble__avatar agent-chat-bubble__avatar--bot">
                <Sparkles class="w-3.5 h-3.5" />
              </div>
              <div class="agent-chat-bubble__main">
                <header class="agent-chat-bubble__head">
                  <span class="agent-chat-bubble__name">管家</span>
                </header>
                <div class="agent-chat-typing" aria-label="思考中">
                  <span /><span /><span />
                </div>
              </div>
            </article>

            <div v-if="!chatLog.length && !chatting" class="agent-chat-empty">
              <div class="agent-chat-empty__icon">
                <MessageCircle class="w-6 h-6" />
              </div>
              <template v-if="isMockProvider">
                <p class="agent-chat-empty__title">演示模式不可对话</p>
                <p class="agent-chat-empty__desc">
                  请先配置并保存有效接口密钥，确认「连接状态」就绪后再试对话。
                </p>
                <button type="button" class="settings-btn-accent mt-3" @click="goConfigureApiKey">
                  {{ '去配置接口密钥' }}
                </button>
              </template>
              <template v-else>
                <p class="agent-chat-empty__title">开始对话</p>
                <p class="agent-chat-empty__desc">
                  先说「打开客厅灯」，再追问「那把它关掉」，验证多轮理解
                </p>
                <div class="agent-chat-quick">
                  <button
                    v-for="prompt in chatQuickPrompts"
                    :key="prompt"
                    type="button"
                    class="agent-chat-quick__chip"
                    @click="sendQuickPrompt(prompt)"
                  >
                    {{ prompt }}
                  </button>
                </div>
              </template>
            </div>
          </div>

          <div
            v-if="chatLog.length && !isMockProvider"
            class="agent-chat-quick agent-chat-quick--inline agent-form-block"
          >
            <span class="agent-chat-quick__label">快捷指令</span>
            <button
              v-for="prompt in chatQuickPrompts"
              :key="`inline-${prompt}`"
              type="button"
              class="agent-chat-quick__chip"
              :disabled="chatting"
              @click="sendQuickPrompt(prompt)"
            >
              {{ prompt }}
            </button>
          </div>

          <div class="agent-chat-composer">
            <div class="agent-chat-composer__field">
              <MessageSquare class="agent-chat-composer__icon" />
              <input
                v-model="chatInput"
                class="settings-field agent-chat-composer__input"
                type="text"
                :maxlength="AGENT_CHAT_MAX_LENGTH"
                :placeholder="chatPlaceholder"
                :disabled="chatting || isMockProvider"
                @keydown.enter.prevent="sendChat"
              />
            </div>
            <button
              type="button"
              class="agent-chat-composer__mic"
              :class="{ 'agent-chat-composer__mic--on': voiceListening || voiceTranscribing }"
              :disabled="chatting || isMockProvider"
              :aria-label="voiceListening || voiceTranscribing ? '停止语音输入' : '语音输入'"
              :title="voiceListening || voiceTranscribing ? '停止语音输入' : '点按说话，再说完点一次结束'"
              @click="toggleVoiceListen"
            >
              <Mic class="w-4 h-4" :class="{ 'agent-chat-composer__mic-pulse': voiceListening }" />
            </button>
            <button
              type="button"
              class="agent-chat-composer__send"
              :disabled="chatting || isMockProvider || !chatInput.trim()"
              @click="sendChat"
            >
              <Loader2 v-if="chatting" class="w-4 h-4 animate-spin" />
              <Send v-else class="w-4 h-4" />
              <span>{{ chatting ? '思考中' : '发送' }}</span>
            </button>
          </div>
          <p v-if="voiceError" class="agent-chat-voice-err">{{ voiceError }}</p>
        </div>
      </SettingsCard>
    </section>
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import {
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  Loader2,
  MessageCircle,
  MessageSquare,
  Mic,
  Pencil,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  AlertTriangle,
  Thermometer,
  User,
} from '@lucide/vue'
import HosSelect from '@/components/common/base/HosSelect.vue'
import EntityMultiSelect from '@/components/common/EntityMultiSelect.vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsCardIntro from '@/components/common/page-shell/SettingsCardIntro.vue'
import SettingsPageShell from '@/components/common/page-shell/SettingsPageShell.vue'
import SettingsPendingSaveAction from '@/views/settings/shared/SettingsPendingSaveAction.vue'
import SettingsHubSubnav from '@/views/settings/shared/layout/SettingsHubSubnav.vue'
import SettingsSectionHead from '@/views/settings/shared/layout/SettingsSectionHead.vue'
import SettingsFlowBand from '@/views/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/views/settings/shared/layout/SettingsFlowStat.vue'
import { useSettingsAgentPanel } from '@/composables/settings/interact/agent-panel.internals'
import SettingsAgentChannelsSection from './SettingsAgentChannelsSection.vue'
import { useRegisterSettingsTabPending } from '@/composables/settings/pending.internals'

const props = defineProps({ activeTab: { type: String, default: 'agent' } })

const {
  showApiKey,
  apiKeyLocked,
  beginEditApiKey,
  section,
  subnavSections,
  providerPresets,
  chatQuickPrompts,
  agentDraft,
  channelDraft,
  channelStatus,
  statusLoading,
  refreshChannelStatus,
  pending,
  saving,
  saveTip,
  saveTipOk,
  pinging,
  chatInput,
  chatting,
  AGENT_CHAT_MAX_LENGTH,
  chatLog,
  chatLogEl,
  envHealthHref,
  isMockProvider,
  sceneVoiceEnabled,
  sceneVoiceAllow,
  sceneVoiceAllowCount,
  toneFromAgentClass,
  modelFlowSteps,
  chatFlowSteps,
  modelStatProvider,
  modelStatReadyLabel,
  modelStatReadyClass,
  modelStatReadyValClass,
  chatStatReadyLabel,
  chatStatReadyClass,
  chatStatReadyValClass,
  chatStatRoundLabel,
  chatOutcomeLabel,
  chatOutcomeTone,
  sendQuickPrompt,
  applyPreset,
  resetDraft,
  saveConfig,
  refreshPing,
  sendChat,
  voiceListening,
  voiceTranscribing,
  voiceError,
  toggleVoiceListen,
  chatPlaceholder,
} = useSettingsAgentPanel(props)

useRegisterSettingsTabPending('agent', () => pending.value > 0)

const modelFlowSummary = computed(
  () => `${modelStatProvider.value} · ${modelStatReadyLabel.value}`,
)

const chatFlowSummary = computed(
  () => `${chatStatReadyLabel.value} · ${chatStatRoundLabel.value}`,
)

function goConfigureApiKey() {
  section.value = 'model'
  requestAnimationFrame(() => {
    const el = document.getElementById('agent-api-key')
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  })
}
</script>
<style src="./styles/SettingsAgentPanel.css"></style>
