<!--
组件：SettingsAgentChannelsSection.vue
所属模块：frontend / src / views / settings / interact
职责：智能管家消息通道区段。通过 OrchTabs 切换 Email / WebPush / 企业微信 / MCP 四个通道，
      每通道含启用开关、凭据配置（SMTP/VAPID/企微密钥/回调校验）、WebPush 订阅管理（测推/删除）。
      布局对齐语音交互「播报输出」：FlowBand 状态卡 → OrchTabs → FeatureMaster + 表单。
关键依赖：
  - SettingsCard / SettingsFlowBand / SettingsFlowStat / SettingsFeatureMaster / SettingsOrchTabs：卡片与流程
  - fetchWebPushSubscriptions / testWebPush / unsubscribeWebPush：WebPush 订阅 API
  - useChromeStore：notify / confirm
  - defineModel：channelDraft / agentDraft 双向绑定
数据来源：父级透传的 channelDraft / agentDraft / channelStatus
-->
<template>
  <section class="settings-hub-section">
    <SettingsCard static extra-class="agent-channel-workspace">
      <SettingsFlowBand
        :steps="channelFlowSteps"
        class="agent-channel-flow-band"
        band-class="agent-channel-flow-band__shell"
        collapsible
        default-collapsed
        toggle-label="流程概览"
        :collapsed-summary="channelFlowSummary"
      >
        <template #stats>
          <button
            v-for="tab in channelTabItems"
            :key="`stat-${tab.id}`"
            type="button"
            class="agent-channel-stat"
            :class="{ 'agent-channel-stat--active': channelTab === tab.id }"
            :title="`切换到 ${tab.label}`"
            @click="channelTab = tab.id"
          >
            <SettingsFlowStat
              :label="tab.label"
              :value="tab.status"
              :tone="tab.statTone"
              :val-tone="tab.statTone"
            />
          </button>
        </template>
      </SettingsFlowBand>

      <p v-if="(pending ?? 0) > 0" class="agent-band-hint">
        表单有未保存修改。通道状态仍反映上次已保存配置，请先保存后再刷新。
      </p>

      <div class="agent-channel-dock-row">
        <div class="bind-energy-dock agent-channel-dock">
          <SettingsOrchTabs v-model="channelTab" :tabs="channelOrchTabs" plain />
        </div>
        <button
          type="button"
          class="settings-btn-ghost shrink-0"
          :disabled="statusLoading"
          @click="$emit('refresh-status')"
        >
          {{ statusLoading ? '刷新中…' : '刷新状态' }}
        </button>
      </div>

      <!-- Email -->
      <div v-show="channelTab === 'email'" class="agent-channel-panel mt-2.5 space-y-4">
        <SettingsFeatureMaster
          :icon="Mail"
          tone="sky"
          :active="channelDraft.email.enabled"
          title="启用 Email 通道"
          hint="SMTP 出站通知；告警规则勾选 email 后生效"
        >
          <template #actions>
            <label class="alert-switch agent-channel-master-switch">
              <input
                v-model="channelDraft.email.enabled"
                type="checkbox"
                class="settings-checkbox"
              />
              <span>{{ channelDraft.email.enabled ? '已启用' : '已关闭' }}</span>
            </label>
          </template>
        </SettingsFeatureMaster>

        <div :class="{ 'agent-channel-fields--dim': !channelDraft.email.enabled }">
          <div class="settings-form-grid settings-form-grid--2">
            <div>
              <label class="settings-form-label mb-1.5">SMTP 主机</label>
              <input v-model="channelDraft.email.smtpHost" class="settings-field" type="text" />
            </div>
            <div>
              <label class="settings-form-label mb-1.5">端口</label>
              <input
                v-model.number="channelDraft.email.smtpPort"
                class="settings-field"
                type="number"
              />
            </div>
            <div>
              <label class="settings-form-label mb-1.5">用户名</label>
              <input v-model="channelDraft.email.smtpUser" class="settings-field" type="text" />
            </div>
            <div>
              <label class="settings-form-label mb-1.5">发件人</label>
              <input
                v-model="channelDraft.email.fromAddress"
                class="settings-field"
                type="email"
              />
            </div>
            <div class="settings-form-grid__span-2">
              <label class="settings-form-label mb-1.5">收件人（逗号分隔）</label>
              <input v-model="channelDraft.email.toAddresses" class="settings-field" type="text" />
            </div>
          </div>

          <div class="agent-cred-panel">
            <header class="agent-cred-panel__head">
              <div class="agent-cred-panel__icon">
                <KeyRound class="w-4 h-4" />
              </div>
              <div class="min-w-0">
                <h4 class="agent-cred-panel__title">SMTP 密码</h4>
                <p class="agent-cred-panel__desc">邮箱授权码或 SMTP 密码，保存后热重载</p>
              </div>
            </header>
            <div class="agent-secret-field">
              <input
                v-model="channelDraft.email.smtpPassword"
                class="settings-field agent-cred-input"
                :type="showSecrets.email ? 'text' : 'password'"
                autocomplete="off"
                placeholder="••••••••"
              />
              <button
                type="button"
                class="agent-secret-field__toggle"
                :aria-label="showSecrets.email ? '隐藏密码' : '显示密码'"
                :aria-pressed="showSecrets.email"
                @click="showSecrets.email = !showSecrets.email"
              >
                <Eye v-if="!showSecrets.email" class="w-4 h-4" />
                <EyeOff v-else class="w-4 h-4" />
              </button>
            </div>
          </div>

          <label class="settings-check-row agent-channel-enable">
            <input
              v-model="channelDraft.email.tlsEnabled"
              type="checkbox"
              class="settings-checkbox"
            />
            <span>启用 TLS</span>
          </label>

          <div class="settings-inline-hints">
            <div class="settings-inline-hint settings-inline-hint--indigo">
              <Bell class="settings-inline-hint__icon" />
              <span>
                在
                <RouterLink class="agent-link" :to="alertsHref">告警规则</RouterLink>
                编辑页勾选 Email 渠道后，触发会同步发信。
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- WebPush -->
      <div v-show="channelTab === 'webpush'" class="agent-channel-panel mt-2.5 space-y-4">
        <SettingsFeatureMaster
          :icon="Smartphone"
          tone="emerald"
          :active="channelDraft.webpush.enabled"
          title="启用 WebPush 通道"
          hint="浏览器 / PWA 推送；需配置 VAPID，可在下方「订阅本机」"
        >
          <template #actions>
            <label class="alert-switch agent-channel-master-switch">
              <input
                v-model="channelDraft.webpush.enabled"
                type="checkbox"
                class="settings-checkbox"
              />
              <span>{{ channelDraft.webpush.enabled ? '已启用' : '已关闭' }}</span>
            </label>
          </template>
        </SettingsFeatureMaster>

        <div :class="{ 'agent-channel-fields--dim': !channelDraft.webpush.enabled }">
          <div class="settings-form-grid settings-form-grid--2">
            <div class="settings-form-grid__span-2">
              <label class="settings-form-label mb-1.5">VAPID 公钥</label>
              <input
                v-model="channelDraft.webpush.vapidPublicKey"
                class="settings-field"
                type="text"
              />
            </div>
            <div class="settings-form-grid__span-2">
              <label class="settings-form-label mb-1.5">主题</label>
              <input
                v-model="channelDraft.webpush.subject"
                class="settings-field"
                type="text"
                placeholder="mailto:admin@example.com"
              />
            </div>
          </div>

          <div class="agent-cred-panel">
            <header class="agent-cred-panel__head">
              <div class="agent-cred-panel__icon">
                <KeyRound class="w-4 h-4" />
              </div>
              <div class="min-w-0">
                <h4 class="agent-cred-panel__title">VAPID 私钥</h4>
                <p class="agent-cred-panel__desc">
                  可用 <code>npx web-push generate-vapid-keys</code> 生成
                </p>
              </div>
            </header>
            <div class="agent-secret-field">
              <input
                v-model="channelDraft.webpush.vapidPrivateKey"
                class="settings-field agent-cred-input"
                :type="showSecrets.webpush ? 'text' : 'password'"
                autocomplete="off"
                placeholder="••••••••"
              />
              <button
                type="button"
                class="agent-secret-field__toggle"
                :aria-label="showSecrets.webpush ? '隐藏密钥' : '显示密钥'"
                :aria-pressed="showSecrets.webpush"
                @click="showSecrets.webpush = !showSecrets.webpush"
              >
                <Eye v-if="!showSecrets.webpush" class="w-4 h-4" />
                <EyeOff v-else class="w-4 h-4" />
              </button>
            </div>
          </div>

          <div class="settings-inline-hints">
            <div class="settings-inline-hint settings-inline-hint--indigo">
              <Smartphone class="settings-inline-hint__icon" />
              <span>点击下方「订阅本机」授权浏览器通知后，本机即可接收 WebPush 推送。</span>
            </div>
          </div>

          <div class="agent-cred-panel">
            <header class="agent-cred-panel__head">
              <div class="agent-cred-panel__icon">
                <Smartphone class="w-4 h-4" />
              </div>
              <div class="min-w-0 flex-1">
                <h4 class="agent-cred-panel__title">已订阅设备</h4>
                <p class="agent-cred-panel__desc">管理本站 WebPush 订阅；可单设备测推或删除</p>
              </div>
              <button
                type="button"
                class="settings-btn-accent shrink-0 text-xs"
                :disabled="pushBusy"
                @click="subscribeLocalPush"
              >
                {{ pushBusy ? '订阅中…' : '订阅本机' }}
              </button>
              <button
                type="button"
                class="settings-btn-ghost shrink-0 text-xs"
                :disabled="pushSubsLoading"
                @click="loadPushSubscriptions"
              >
                {{ pushSubsLoading ? '刷新中…' : '刷新' }}
              </button>
            </header>
            <p v-if="pushSubsError" class="agent-field-hint" style="color: var(--set-danger)">
              {{ pushSubsError }}
            </p>
            <p v-else-if="!pushSubs.length && !pushSubsLoading" class="agent-field-hint">
              暂无订阅。点击上方「订阅本机」授权浏览器通知后即可添加。
            </p>
            <ul v-else class="agent-push-subs">
              <li v-for="sub in pushSubs" :key="sub.endpoint" class="agent-push-subs__row">
                <div class="min-w-0">
                  <p class="agent-push-subs__label">{{ sub.label || '未命名设备' }}</p>
                  <p class="agent-push-subs__meta">
                    {{ shortenEndpoint(sub.endpoint) }}
                    <template v-if="sub.createdAt"> · {{ formatSubTime(sub.createdAt) }}</template>
                  </p>
                </div>
                <div class="agent-push-subs__actions">
                  <button
                    type="button"
                    class="settings-btn-ghost text-xs"
                    :disabled="pushActionBusy === sub.endpoint"
                    @click="testPushDevice(sub.endpoint)"
                  >
                    测推
                  </button>
                  <button
                    type="button"
                    class="settings-btn-ghost text-xs"
                    :disabled="pushActionBusy === sub.endpoint"
                    @click="removePushDevice(sub.endpoint)"
                  >
                    删除
                  </button>
                </div>
              </li>
            </ul>
            <div class="mt-3">
              <button
                type="button"
                class="settings-btn-ghost text-xs"
                :disabled="!!pushActionBusy || !pushSubs.length"
                @click="testPushDevice()"
              >
                向全部设备测推
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- WeCom -->
      <div v-show="channelTab === 'wecom'" class="agent-channel-panel mt-2.5 space-y-4">
        <SettingsFeatureMaster
          :icon="MessagesSquare"
          tone="amber"
          :active="channelDraft.wecom.enabled"
          title="启用企业微信通道"
          hint="应用消息回调 → 智能管家；支持热重载"
        >
          <template #actions>
            <label class="alert-switch agent-channel-master-switch">
              <input
                v-model="channelDraft.wecom.enabled"
                type="checkbox"
                class="settings-checkbox"
              />
              <span>{{ channelDraft.wecom.enabled ? '已启用' : '已关闭' }}</span>
            </label>
          </template>
        </SettingsFeatureMaster>

        <div :class="{ 'agent-channel-fields--dim': !channelDraft.wecom.enabled }">
          <div class="settings-form-grid settings-form-grid--2">
            <div>
              <label class="settings-form-label mb-1.5">企业 ID</label>
              <input v-model="channelDraft.wecom.corpId" class="settings-field" type="text" />
            </div>
            <div>
              <label class="settings-form-label mb-1.5">应用 ID</label>
              <input v-model="channelDraft.wecom.agentId" class="settings-field" type="text" />
            </div>
            <div>
              <label class="settings-form-label mb-1.5">API 代理（可选）</label>
              <input
                v-model="channelDraft.wecom.apiProxy"
                class="settings-field"
                type="url"
                placeholder="https://proxy.example.com"
              />
            </div>
            <div>
              <label class="settings-form-label mb-1.5">用户 ID 白名单</label>
              <input
                v-model="channelDraft.wecom.allowedUsers"
                class="settings-field"
                type="text"
                placeholder="zhangsan,lisi（空=不限制）"
              />
            </div>
            <div>
              <label class="settings-form-label mb-1.5">绑定 HomeOS 用户 ID</label>
              <input
                v-model="channelDraft.wecom.boundHomeOsUserId"
                class="settings-field"
                type="text"
                placeholder="未绑定则仅允许查询，禁止控制设备"
              />
              <p class="settings-form-hint mt-1">
                企微消息将以该用户的角色与设备白名单执行控制；留空时控制类指令会被拒绝。
              </p>
            </div>
          </div>

          <div class="agent-cred-panel">
            <header class="agent-cred-panel__head">
              <div class="agent-cred-panel__icon">
                <KeyRound class="w-4 h-4" />
              </div>
              <div class="min-w-0">
                <h4 class="agent-cred-panel__title">应用密钥</h4>
                <p class="agent-cred-panel__desc">企业微信应用密钥</p>
              </div>
            </header>
            <div class="agent-secret-field">
              <input
                v-model="channelDraft.wecom.corpSecret"
                class="settings-field agent-cred-input"
                :type="showSecrets.wecomSecret ? 'text' : 'password'"
                autocomplete="off"
                placeholder="••••••••"
              />
              <button
                type="button"
                class="agent-secret-field__toggle"
                :aria-label="showSecrets.wecomSecret ? '隐藏密钥' : '显示密钥'"
                :aria-pressed="showSecrets.wecomSecret"
                @click="showSecrets.wecomSecret = !showSecrets.wecomSecret"
              >
                <Eye v-if="!showSecrets.wecomSecret" class="w-4 h-4" />
                <EyeOff v-else class="w-4 h-4" />
              </button>
            </div>
          </div>

          <div class="agent-cred-panel agent-cred-panel--prompt">
            <header class="agent-cred-panel__head">
              <div class="agent-cred-panel__icon">
                <Shield class="w-4 h-4" />
              </div>
              <div class="min-w-0">
                <h4 class="agent-cred-panel__title">回调校验</h4>
                <p class="agent-cred-panel__desc">回调 Token 与 EncodingAESKey（应用接收消息配置）</p>
              </div>
            </header>
            <div class="settings-form-grid settings-form-grid--2">
              <div class="agent-secret-field">
                <input
                  v-model="channelDraft.wecom.callbackToken"
                  class="settings-field agent-cred-input"
                  :type="showSecrets.wecomToken ? 'text' : 'password'"
                  autocomplete="off"
                  placeholder="回调 Token"
                />
                <button
                  type="button"
                  class="agent-secret-field__toggle"
                  :aria-label="showSecrets.wecomToken ? '隐藏回调 Token' : '显示回调 Token'"
                  :aria-pressed="showSecrets.wecomToken"
                  @click="showSecrets.wecomToken = !showSecrets.wecomToken"
                >
                  <Eye v-if="!showSecrets.wecomToken" class="w-4 h-4" />
                  <EyeOff v-else class="w-4 h-4" />
                </button>
              </div>
              <div class="agent-secret-field">
                <input
                  v-model="channelDraft.wecom.callbackAesKey"
                  class="settings-field agent-cred-input"
                  :type="showSecrets.wecomAes ? 'text' : 'password'"
                  autocomplete="off"
                  placeholder="EncodingAESKey"
                />
                <button
                  type="button"
                  class="agent-secret-field__toggle"
                  :aria-label="showSecrets.wecomAes ? '隐藏 EncodingAESKey' : '显示 EncodingAESKey'"
                  :aria-pressed="showSecrets.wecomAes"
                  @click="showSecrets.wecomAes = !showSecrets.wecomAes"
                >
                  <Eye v-if="!showSecrets.wecomAes" class="w-4 h-4" />
                  <EyeOff v-else class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div class="settings-inline-hints">
            <div class="settings-inline-hint settings-inline-hint--amber">
              <MessagesSquare class="settings-inline-hint__icon" />
              <span>
                回调地址：
                <code class="agent-channel-code">/api/v1/channels/wecom/callback</code>
                ；告警出站按 UserId 白名单推送，白名单为空则发
                <code class="agent-channel-code">@all</code>。
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- MCP -->
      <div v-show="channelTab === 'mcp'" class="agent-channel-panel mt-2.5 space-y-4">
        <SettingsSectionHead
          title="MCP 开放网关"
          eyebrow="二次开发"
          description="小智 ESP32 / 第三方 Agent：POST /api/v1/mcp，头 x-homeos-mcp-key"
          bordered
          :icon="KeyRound"
          icon-class="agent-icon--channel"
          orb-class="agent-orb--channel"
        />
        <div class="agent-cred-panel">
          <header class="agent-cred-panel__head">
            <div class="agent-cred-panel__icon">
              <KeyRound class="w-4 h-4" />
            </div>
            <div class="min-w-0">
              <h4 class="agent-cred-panel__title">MCP 网关密钥</h4>
              <p class="agent-cred-panel__desc">
                也可使用环境变量 MCP_GATEWAY_SECRET（优先于本字段）
              </p>
            </div>
          </header>
          <div class="agent-secret-field">
            <input
              v-model="agentDraft.mcpGatewaySecret"
              class="settings-field agent-cred-input"
              :type="showSecrets.mcp ? 'text' : 'password'"
              autocomplete="off"
              placeholder="••••••••"
            />
            <button
              type="button"
              class="agent-secret-field__toggle"
              :aria-label="showSecrets.mcp ? '隐藏密钥' : '显示密钥'"
              :aria-pressed="showSecrets.mcp"
              @click="showSecrets.mcp = !showSecrets.mcp"
            >
              <Eye v-if="!showSecrets.mcp" class="w-4 h-4" />
              <EyeOff v-else class="w-4 h-4" />
            </button>
          </div>
          <div class="mt-4">
            <label class="settings-form-label mb-1.5">绑定 HomeOS 用户 ID</label>
            <input
              v-model="agentDraft.mcpActorUserId"
              class="settings-field"
              type="text"
              placeholder="未绑定则仅允许查询，禁止控制设备"
            />
            <p class="settings-form-hint mt-1">
              MCP 工具调用将以该用户的角色与设备白名单执行；留空时控制类指令会被拒绝。
            </p>
          </div>
        </div>
      </div>
    </SettingsCard>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  Bell,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  MessagesSquare,
  Route,
  Send,
  Shield,
  Smartphone,
} from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsSectionHead from '@/views/settings/shared/layout/SettingsSectionHead.vue'
import SettingsFlowBand from '@/views/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat, {
  type FlowStatTone,
} from '@/views/settings/shared/layout/SettingsFlowStat.vue'
import SettingsFeatureMaster from '@/views/settings/shared/layout/SettingsFeatureMaster.vue'
import SettingsOrchTabs from '@/views/settings/shared/layout/SettingsOrchTabs.vue'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import type { AgentConfig, ChannelConfig } from '@/types/layout'
import type { ChannelsStatusResult } from '@/services/api/agent'
import {
  fetchWebPushSubscriptions,
  testWebPush,
  unsubscribeWebPush,
} from '@/services/api/notifications'
import { notifyError } from '@/services/notify'
import { useChromeStore } from '@/stores/chrome.store'
import { useWebPushSubscribe } from '@/composables/ui/useWebPushSubscribe'
import { formatShortDateTime } from '@/utils/format/locale-format.util'

type ChannelTabId = 'email' | 'webpush' | 'wecom' | 'mcp'

type ChannelDraft = ChannelConfig & {
  email: NonNullable<ChannelConfig['email']>
  webpush: NonNullable<ChannelConfig['webpush']>
  wecom: NonNullable<ChannelConfig['wecom']>
}

interface PushSubRow {
  endpoint: string
  label?: string
  userAgent?: string
  createdAt?: string
}

const channelDraft = defineModel<ChannelDraft>('channelDraft', { required: true })
const agentDraft = defineModel<AgentConfig>('agentDraft', { required: true })

const props = defineProps<{
  channelStatus: ChannelsStatusResult | null
  statusLoading: boolean
  pending?: number
}>()

defineEmits<{ 'refresh-status': [] }>()

const chrome = useChromeStore()
const channelTab = ref<ChannelTabId>('email')

const showSecrets = reactive({
  email: false,
  webpush: false,
  wecomSecret: false,
  wecomToken: false,
  wecomAes: false,
  mcp: false,
})

const pushSubs = ref<PushSubRow[]>([])
const pushSubsLoading = ref(false)
const pushSubsError = ref('')
const pushActionBusy = ref('')

const alertsHref = SETTINGS_ROUTES.alerts()

const { busy: pushBusy, subscribe: subscribeDevicePush } = useWebPushSubscribe()

/** 订阅本机浏览器并刷新订阅列表。 */
async function subscribeLocalPush() {
  const ok = await subscribeDevicePush()
  if (ok) await loadPushSubscriptions()
}

async function loadPushSubscriptions() {
  pushSubsLoading.value = true
  pushSubsError.value = ''
  try {
    const { data } = await fetchWebPushSubscriptions<{ items?: PushSubRow[] }>()
    pushSubs.value = Array.isArray(data?.items) ? data.items : []
  } catch (e: unknown) {
    pushSubsError.value = '加载订阅列表失败'
    notifyError(e, '加载 WebPush 订阅')
    pushSubs.value = []
  } finally {
    pushSubsLoading.value = false
  }
}

function shortenEndpoint(endpoint: string): string {
  if (!endpoint) return ''
  if (endpoint.length <= 48) return endpoint
  return `${endpoint.slice(0, 28)}…${endpoint.slice(-14)}`
}

function formatSubTime(iso: string): string {
  return formatShortDateTime(iso)
}

async function testPushDevice(endpoint?: string) {
  pushActionBusy.value = endpoint || '__all__'
  try {
    await testWebPush(endpoint ? { endpoint } : {})
    chrome.notify(endpoint ? '已向该设备发送测试推送' : '已向全部设备发送测试推送', 'success')
  } catch (e: unknown) {
    notifyError(e, '测试推送')
  } finally {
    pushActionBusy.value = ''
  }
}

async function removePushDevice(endpoint: string) {
  const ok = await chrome.confirm('删除该 WebPush 订阅？', '删除订阅', {
    type: 'danger',
    confirmText: '删除',
  })
  if (!ok) return
  pushActionBusy.value = endpoint
  try {
    await unsubscribeWebPush(endpoint)
    chrome.notify('已删除订阅', 'success')
    await loadPushSubscriptions()
  } catch (e: unknown) {
    notifyError(e, '删除订阅')
  } finally {
    pushActionBusy.value = ''
  }
}

watch(
  channelTab,
  (tab) => {
    if (tab === 'webpush') void loadPushSubscriptions()
  },
  { immediate: false },
)
const channelFlowSteps = [
  { label: '事件触发', meta: '告警 / 管家', icon: Bell, tone: 'in' as const },
  { label: '通道路由', meta: 'Email · Push · 企微', icon: Route, tone: 'mid' as const },
  { label: '凭据校验', meta: 'SMTP / VAPID / 企微', icon: KeyRound, tone: 'amber' as const },
  { label: '用户触达', meta: '收件箱 / 设备', icon: Send, tone: 'out' as const },
]

const channelOrchTabs = [
  { id: 'email', label: 'Email', icon: Mail, accent: 'var(--module-accent-devices)' },
  { id: 'webpush', label: 'WebPush', icon: Smartphone, accent: 'var(--module-accent-agent)' },
  { id: 'wecom', label: '企业微信', icon: MessagesSquare, accent: 'var(--module-accent-automation)' },
  { id: 'mcp', label: 'MCP', icon: KeyRound, accent: 'var(--module-accent-template)' },
]

function channelLabel(enabled?: boolean, configured?: boolean, extra = ''): string {
  if (!enabled) return '关闭'
  if (configured) return extra ? `就绪 · ${extra}` : '就绪'
  return '未配齐'
}

function channelStatTone(enabled?: boolean, configured?: boolean): FlowStatTone {
  if (!enabled) return 'secondary'
  if (configured) return 'emerald'
  return 'amber'
}

const channelTabItems = computed(() => {
  const email = props.channelStatus?.email
  const webpush = props.channelStatus?.webpush
  const wecom = props.channelStatus?.wecom
  const mcpKey = String(agentDraft.value.mcpGatewaySecret || '').trim()
  const mcpConfigured =
    Boolean(mcpKey) && mcpKey !== '••••••••' && mcpKey !== '********'
  const webpushExtra =
    webpush?.enabled && webpush?.configured
      ? `${webpush.subscriptionCount ?? 0} 设备`
      : ''

  return [
    {
      id: 'email' as const,
      label: 'Email',
      status: channelLabel(email?.enabled, email?.configured),
      statTone: channelStatTone(email?.enabled, email?.configured),
    },
    {
      id: 'webpush' as const,
      label: 'WebPush',
      status: channelLabel(webpush?.enabled, webpush?.configured, webpushExtra),
      statTone: channelStatTone(webpush?.enabled, webpush?.configured),
    },
    {
      id: 'wecom' as const,
      label: '企业微信',
      status: channelLabel(wecom?.enabled, wecom?.configured),
      statTone: channelStatTone(wecom?.enabled, wecom?.configured),
    },
    {
      id: 'mcp' as const,
      label: 'MCP',
      status: mcpConfigured ? '已配置' : '未配置',
      statTone: (mcpConfigured ? 'sky' : 'secondary') as FlowStatTone,
    },
  ]
})

const channelFlowSummary = computed(() => {
  const ready = channelTabItems.value.filter((t) => t.status.startsWith('就绪') || t.status === '已配置')
  return `${ready.length}/${channelTabItems.value.length} 通道就绪`
})
</script>
