<!--
组件：SettingsLicensePanel.vue
所属模块：frontend / src / views / settings / system
职责：授权状态面板（参考原 homeos-3d 授权页）。集中展示本机商业授权的状态、租约、权益与账号信息，
     并提供「重新连接授权后台」「重新激活」「退出本机登录」「复制诊断信息」四类操作。
Props：
  - activeTab：当前 Tab
关键依赖：
  - SettingsPageShell / SettingsHubSubnav / SettingsCard：页面骨架与子导航
  - services/api/license：状态读取、重试、重激活与文案映射
  - auth.store：退出本机登录会话
  - feature-labels.util：功能码中文名（与 ops/feature_codes.json 同源，有门禁校验）
数据来源：GET /license/status（要求登录会话）；进入面板与点击刷新时各拉一次，不做后台常驻轮询
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="license"
    icon-key="key"
    accent="var(--module-accent-admin)"
    layout="single"
    page-class="license-hub"
  >
    <template #actions>
      <button type="button" class="settings-btn-accent" :disabled="loading" @click="load">
        <RefreshCw :class="['w-5 h-5', loading && 'animate-spin']" />
        {{ '刷新' }}
      </button>
    </template>

    <template #subnav>
      <SettingsHubSubnav v-model="section" :sections="SUBNAV" nav-class="license-hub__subnav" />
    </template>

    <!-- 加载失败：整页替成可重试的空态，避免子分区各自报错 -->
    <div v-if="loadError" class="settings-premium-empty settings-premium-empty--amber">
      <AlertCircle class="settings-premium-empty__icon" />
      <p class="settings-premium-empty__title">{{ '授权状态读取失败' }}</p>
      <p class="settings-premium-empty__desc">{{ loadError }}</p>
      <div class="settings-premium-empty__actions">
        <button
          type="button"
          class="settings-premium-empty__btn settings-premium-empty__btn--accent"
          :disabled="loading"
          @click="load"
        >
          <RefreshCw :class="['w-3.5 h-3.5', loading && 'animate-spin']" />
          {{ '重试' }}
        </button>
      </div>
    </div>

    <template v-else>
      <!-- ── 状态总览 ── -->
      <SettingsCard v-show="section === 'overview'" full static extra-class="license-card">
        <div class="license-hero">
          <div class="license-hero__main">
            <div class="license-hero__title">
              <span :class="['license-badge', `license-badge--${statusTone}`]">
                <i class="license-badge__dot" aria-hidden="true" />
                {{ statusLabel }}
              </span>
              <h3 class="license-hero__name">{{ '本机授权' }}</h3>
            </div>
            <p class="license-hero__desc">{{ statusMessage }}</p>
            <p v-if="status?.startupValidationPending" class="license-hero__hint">
              {{ '服务已启动，正在后台验证授权；本地有效授权可继续使用。' }}
            </p>
            <p v-if="retryHint" class="license-hero__hint license-hero__hint--amber">{{ retryHint }}</p>
          </div>
          <div class="license-hero__gates">
            <div v-for="gate in gates" :key="gate.key" :class="['license-gate', gate.ok ? 'is-on' : 'is-off']">
              <span class="license-gate__dot" aria-hidden="true" />
              <span class="license-gate__label">{{ gate.label }}</span>
              <span class="license-gate__value">{{ gate.ok ? '放行' : '未放行' }}</span>
            </div>
          </div>
        </div>

        <dl class="license-facts">
          <div v-for="fact in overviewFacts" :key="fact.label" class="license-fact">
            <dt>{{ fact.label }}</dt>
            <dd :class="fact.tone ? `is-${fact.tone}` : ''">{{ fact.value }}</dd>
          </div>
        </dl>
      </SettingsCard>

      <!-- ── 租约信息 ── -->
      <SettingsCard v-show="section === 'lease'" full static extra-class="license-card">
        <div class="license-card__head">
          <h3 class="license-card__name">{{ '签名租约' }}</h3>
          <span class="license-card__hint">{{ '本机离线可用性由这份租约决定，到期前后台会自动续租' }}</span>
        </div>
        <div v-if="leaseProgress !== null" class="license-progress">
          <div class="license-progress__bar">
            <span class="license-progress__fill" :style="{ width: `${leaseProgress}%` }" />
          </div>
          <p class="license-progress__text">{{ leaseProgressText }}</p>
        </div>
        <dl class="license-facts">
          <div v-for="fact in leaseFacts" :key="fact.label" class="license-fact">
            <dt>{{ fact.label }}</dt>
            <dd :class="fact.tone ? `is-${fact.tone}` : ''">{{ fact.value }}</dd>
          </div>
        </dl>
      </SettingsCard>

      <!-- ── 权益清单 ── -->
      <SettingsCard v-show="section === 'features'" full static extra-class="license-card">
        <div class="license-card__head">
          <h3 class="license-card__name">{{ '功能码与权益' }}</h3>
          <span class="license-card__hint">{{ '功能码目录与授权商店同源（ops/feature_codes.json）' }}</span>
        </div>

        <h4 class="license-subtitle">{{ '模块门禁' }}</h4>
        <ul class="license-codes">
          <li v-for="row in gateRows" :key="row.code" :class="['license-code', row.ok ? 'is-on' : 'is-off']">
            <span class="license-code__name">{{ row.label }}</span>
            <code class="license-code__id">{{ row.code }}</code>
            <span class="license-code__state">{{ row.ok ? '已授权' : '未授权' }}</span>
          </li>
        </ul>

        <h4 class="license-subtitle">{{ '租约功能码' }}</h4>
        <p v-if="!featureRows.length" class="license-empty">{{ '当前租约未携带功能码。' }}</p>
        <ul v-else class="license-codes">
          <li v-for="row in featureRows" :key="row.code" class="license-code is-on">
            <span class="license-code__name">{{ row.label }}</span>
            <code class="license-code__id">{{ row.code }}</code>
          </li>
        </ul>

        <h4 class="license-subtitle">{{ '商品与到期' }}</h4>
        <p v-if="!products.length" class="license-empty">{{ '当前租约未携带商品信息。' }}</p>
        <ul v-else class="license-codes">
          <li v-for="(item, index) in products" :key="`${item.name}-${index}`" class="license-code is-on">
            <span class="license-code__name">{{ item.name }}</span>
            <code class="license-code__id">{{ item.type }}</code>
            <span class="license-code__state">{{ formatExpiry(item.expiresAt) }}</span>
          </li>
        </ul>

        <h4 class="license-subtitle">{{ '限时权益' }}</h4>
        <p v-if="!entitlements.length" class="license-empty">{{ '没有额外的限时权益。' }}</p>
        <ul v-else class="license-codes">
          <li v-for="item in entitlements" :key="`${item.code}-${item.expiresAt}`" class="license-code is-on">
            <span class="license-code__name">{{ featureLabel(String(item.code)) }}</span>
            <code class="license-code__id">{{ item.code }}</code>
            <span class="license-code__state">{{ formatExpiry(item.expiresAt) }}</span>
          </li>
        </ul>
      </SettingsCard>

      <!-- ── 账号与操作 ── -->
      <SettingsCard v-show="section === 'account'" full static extra-class="license-card">
        <div class="license-card__head">
          <h3 class="license-card__name">{{ '账号与操作' }}</h3>
          <span class="license-card__hint">{{ '本机账号用于登录这台中控；商店账号用于授权绑定与售后' }}</span>
        </div>

        <!-- 身份：两格并排，短字段一眼可读 -->
        <div class="license-account__identity">
          <div v-for="fact in accountIdentity" :key="fact.label" class="license-account__tile">
            <span class="license-account__label">{{ fact.label }}</span>
            <span class="license-account__value">{{ fact.value }}</span>
          </div>
        </div>

        <!-- 技术标识：整行 label / value，避免长串挤成一行被截断 -->
        <dl class="license-account__meta">
          <div v-for="fact in accountMeta" :key="fact.label" class="license-account__row">
            <dt>{{ fact.label }}</dt>
            <dd>
              <code>{{ fact.value }}</code>
            </dd>
          </div>
        </dl>

        <div class="license-actions">
          <div class="license-actions__main">
            <button
              type="button"
              class="settings-btn-accent"
              :disabled="busy || !status?.canRetry"
              @click="onRetry"
            >
              <PlugZap class="w-4 h-4" />
              {{ actionBusy === 'retry' ? '连接中…' : '重新连接授权后台' }}
            </button>
            <button type="button" class="settings-btn-ghost" :disabled="busy" @click="goActivate">
              <KeyRound class="w-4 h-4" />
              {{ '重新激活' }}
            </button>
            <button type="button" class="settings-btn-ghost" :disabled="busy" @click="copyDiagnostics">
              <Copy class="w-4 h-4" />
              {{ copied ? '已复制' : '复制诊断信息' }}
            </button>
          </div>
          <button
            type="button"
            class="settings-btn-ghost settings-btn-ghost--danger license-actions__logout"
            :disabled="busy"
            @click="onLogout"
          >
            <LogOut class="w-4 h-4" />
            {{ '退出本机登录' }}
          </button>
        </div>

        <p class="license-note">
          {{ '「重新激活」不要求重新填激活码：本机保存了可用于自动重激活的凭证；凭证缺失时会引导到激活页重新填码。' }}
        </p>
      </SettingsCard>
    </template>
  </SettingsPageShell>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import {
  AlertCircle,
  Copy,
  KeyRound,
  LogOut,
  PlugZap,
  RefreshCw,
} from '@lucide/vue'
import SettingsPageShell from '@/components/common/page-shell/SettingsPageShell.vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsHubSubnav from '@/views/settings/shared/layout/SettingsHubSubnav.vue'
import { useChromeStore } from '@/stores/chrome.store'
import { useAuthStore } from '@/stores/auth.store'
import {
  getLicenseStatus,
  licenseErrorMessage,
  licenseMessage,
  reactivateLicense,
  retryLicense,
} from '@/services/api/license'
import { setLicenseFeatureAccess } from '@/router/license-gate'
import { featureLabel } from '@/utils/registry/feature-labels.util'
import { isUnauthorizedError } from '@/utils/core/error-message'

defineProps({ activeTab: { type: String, default: 'license' } })

const chrome = useChromeStore()
const auth = useAuthStore()

/** 子分区：与 SettingsHubSubnav 的 id 对齐。 */
const SUBNAV = [
  { id: 'overview', label: '状态总览', emoji: '🛡️' },
  { id: 'lease', label: '租约信息', emoji: '📜' },
  { id: 'features', label: '权益清单', emoji: '🧩' },
  { id: 'account', label: '账号与操作', emoji: '👤' },
]

const section = ref('overview')
const status = ref(null)
const loading = ref(false)
const loadError = ref('')
/** 正在执行的动作：'retry' | 'reactivate' | ''，用于禁用按钮与文案。 */
const actionBusy = ref('')
const copied = ref(false)

/** 未授权时不该显示「已授权」的假象：状态码决定徽标颜色而非文案本身。 */
const statusTone = computed(() => {
  const state = String(status.value?.status || '')
  if (state === 'ACTIVE') return 'ok'
  if (state === 'INSTANCE_MISMATCH' || state === 'REVOKED' || state === 'INVALID') return 'alert'
  return 'warn'
})

const statusLabel = computed(() => status.value?.statusLabel || '正在读取授权状态')

const statusMessage = computed(() => {
  if (!status.value) return '正在读取授权状态…'
  if (!status.value.required) return '当前安装未开启授权校验，全部能力默认放行。'
  return licenseMessage(status.value, String(status.value.lastError || '').trim())
})

const busy = computed(() => Boolean(actionBusy.value))

/** 门禁布尔 → 三格放行指示。 */
const gates = computed(() => {
  const current = status.value
  if (!current) return []
  return [
    { key: 'allowed', label: '基础能力', ok: Boolean(current.allowed) },
    { key: 'editor', label: '编辑器', ok: Boolean(current.editorAllowed) },
    { key: 'display', label: '展示页', ok: Boolean(current.allowed) },
  ]
})

/** 审计需要的机器可读信息（供复制诊断）。 */
function errorText() {
  const current = status.value
  if (!current) return '—'
  const code = String(current.errorCode || '').trim()
  return code || '—'
}

const overviewFacts = computed(() => [
  { label: '状态码', value: String(status.value?.status || '—') },
  { label: '错误码', value: errorText(), tone: status.value?.errorCode ? 'warn' : '' },
  { label: '是否放行', value: status.value?.allowed ? '是' : '否' },
  {
    label: '重试',
    value: status.value?.retrying
      ? '正在验证…'
      : status.value?.canRetry
        ? `可重试（第 ${Number(status.value?.retryAttempt || 0) + 1} 次）`
        : '当前状态不可自动重试',
  },
])

/** 租约进度：按已过时长占总租期的百分比。 */
const leaseProgress = computed(() => {
  const issued = Date.parse(String(status.value?.leaseIssuedAt || ''))
  const expires = Date.parse(String(status.value?.leaseExpiresAt || ''))
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued) return null
  const ratio = (Date.now() - issued) / (expires - issued)
  return Math.min(100, Math.max(0, Math.round(ratio * 100)))
})

const leaseProgressText = computed(() => {
  const expires = Date.parse(String(status.value?.leaseExpiresAt || ''))
  if (!Number.isFinite(expires)) return ''
  const seconds = Math.ceil((expires - Date.now()) / 1000)
  if (seconds <= 0) return '租约已到期，等待联网续租。'
  return `剩余约 ${formatDuration(seconds)}（已用 ${leaseProgress.value}%）`
})

/** 可重试时的倒计时提示（复用入户页同一套口径）。 */
const retryHint = computed(() => {
  const current = status.value
  if (!current || current.retrying || !current.retryable || !current.nextRetryAt) return ''
  const seconds = Math.max(0, Math.ceil((Date.parse(current.nextRetryAt) - Date.now()) / 1000))
  if (!Number.isFinite(seconds)) return ''
  return `第 ${Number(current.retryAttempt || 0) + 1} 次重试将在约 ${formatDuration(seconds)}后进行。`
})

const leaseFacts = computed(() => [
  { label: '实例标识', value: status.value?.instanceId || '—' },
  { label: '租约 ID', value: status.value?.leaseId || '—' },
  { label: '租约序号', value: String(status.value?.leaseSequence ?? '—') },
  { label: '签发时间', value: formatTime(status.value?.leaseIssuedAt) },
  { label: '到期时间', value: formatTime(status.value?.leaseExpiresAt) },
  { label: '心跳间隔', value: formatDuration(status.value?.heartbeatIn) },
  { label: '最后心跳', value: formatTime(status.value?.lastHeartbeatAt) },
  { label: '最后校验', value: formatTime(status.value?.lastVerifiedAt) },
  { label: '版本', value: status.value?.edition || '—' },
])

/** 门禁明细的短键 → 真源码：``interaction3d`` 是 3D Studio 沿用的前端短键。 */
const GATE_ALIASES = { interaction3d: 'module.3d_interaction' }

/** 模块门禁：以后端下发的 featureAccess 为准，前端只做展示。 */
const gateRows = computed(() => {
  const access = status.value?.featureAccess || {}
  // 后端同时下发短键与真源码（同一个能力两把键），先归一化再按码合并，
  // 否则同一能力会出现两行，短键那行还会因为查不到中文名而显示原始英文码。
  const byCode = new Map()
  for (const [key, ok] of Object.entries(access)) {
    const code = GATE_ALIASES[key] ?? key
    byCode.set(code, Boolean(ok) || byCode.get(code) === true)
  }
  return [...byCode.entries()].map(([code, ok]) => ({
    code,
    label: featureLabel(code),
    ok,
  }))
})

const featureRows = computed(() =>
  (status.value?.features || []).map((code) => ({ code, label: featureLabel(code) })),
)

const products = computed(() => status.value?.products || [])
const entitlements = computed(() => status.value?.entitlements || [])

/** 账号身份（短字段）与技术标识（长串）分开排，避免挤成一行。 */
const accountIdentity = computed(() => [
  { label: '本机账号名', value: status.value?.accountName || auth.user || '—' },
  { label: '商店账号', value: status.value?.activationEmail || '—' },
])

const accountMeta = computed(() => [
  { label: '激活码提示', value: status.value?.activationCodeHint || '—' },
  { label: '公钥指纹', value: status.value?.publicKeyFingerprint || '—' },
  { label: '激活码 ID', value: status.value?.activationCodeId || '—' },
])

function formatTime(value) {
  if (!value) return '—'
  const stamp = Date.parse(String(value))
  if (!Number.isFinite(stamp)) return String(value)
  return new Date(stamp).toLocaleString()
}

function formatExpiry(value) {
  if (!value) return '永久'
  return `至 ${formatTime(value)}`
}

/** 秒 → 人话时长；非法输入返回「—」。 */
function formatDuration(seconds) {
  const total = Number(seconds)
  if (!Number.isFinite(total) || total <= 0) return '—'
  if (total < 60) return `${Math.round(total)} 秒`
  const minutes = Math.floor(total / 60)
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时 ${minutes % 60} 分`
  return `${Math.floor(hours / 24)} 天 ${hours % 24} 时`
}

/** 把面板拿到的 featureAccess 同步进全局门禁缓存，刷新导航/壳层显隐。 */
function syncFeatureAccessFromStatus(next) {
  if (next?.featureAccess && typeof next.featureAccess === 'object') {
    setLicenseFeatureAccess(next.featureAccess)
  }
}

/** 拉取授权状态（要求登录会话）。 */
async function load() {
  loading.value = true
  loadError.value = ''
  try {
    status.value = (await getLicenseStatus()).data
    syncFeatureAccessFromStatus(status.value)
  } catch (error) {
    if (isUnauthorizedError(error)) {
      loadError.value = '此页面需要先登录本机账号。'
    } else {
      loadError.value = licenseErrorMessage(error, '读取授权状态失败，请稍后重试。')
    }
  } finally {
    loading.value = false
  }
}

/** 显式重连授权后台（不必等后台轮询）。 */
async function onRetry() {
  if (busy.value) return
  actionBusy.value = 'retry'
  try {
    status.value = (await retryLicense()).data
    syncFeatureAccessFromStatus(status.value)
    chrome.notify('已重新连接授权后台。', 'success')
  } catch (error) {
    chrome.notify(licenseErrorMessage(error, '重新连接授权后台失败。'), 'error')
  } finally {
    actionBusy.value = ''
  }
}

/** 用本机已保存凭据重激活；没凭据时引导去激活页填码。 */
async function goActivate() {
  if (busy.value) return
  actionBusy.value = 'reactivate'
  try {
    status.value = (await reactivateLicense()).data
    syncFeatureAccessFromStatus(status.value)
    chrome.notify('已用本机凭证重新激活。', 'success')
  } catch (error) {
    chrome.notify(licenseErrorMessage(error, '重新激活失败，请到激活页重新填写激活码。'), 'warning')
    window.location.assign('/activate')
  } finally {
    actionBusy.value = ''
  }
}

/** 复制一份诊断文本，便于排障时贴给客服。 */
async function copyDiagnostics() {
  const lines = [
    'HomeOS 授权诊断',
    `导出时间: ${new Date().toISOString()}`,
    `状态: ${status.value?.status} (${status.value?.statusLabel})`,
    `错误码: ${errorText()}`,
    `实例标识: ${status.value?.instanceId}`,
    `租约: ${status.value?.leaseId} / seq ${status.value?.leaseSequence}`,
    `到期: ${status.value?.leaseExpiresAt}`,
    `账号: ${status.value?.accountName} / ${status.value?.activationEmail}`,
    `功能码: ${(status.value?.features || []).join(', ')}`,
  ]
  try {
    await navigator.clipboard.writeText(lines.join('\n'))
    copied.value = true
    chrome.notify('授权诊断信息已复制。', 'success')
    window.setTimeout(() => (copied.value = false), 2000)
  } catch {
    chrome.notify('复制失败，请手动截图或导出诊断。', 'warning')
  }
}

/** 退出本机登录会话（不解绑商店授权）。 */
async function onLogout() {
  await auth.logout()
  window.location.replace('/login')
}

onMounted(() => {
  void load()
})
</script>

<style src="./styles/license-panel.css"></style>
