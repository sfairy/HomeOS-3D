<!--
  网络与远程访问面板：内外网地址、公网 IPv4 / IPv6、端口诊断与原生端推送
  所属模块：设置 - 系统与账户
  职责：
    - 展示后端探测到的内网地址、公网 IPv4 / IPv6、本机公网 IPv6 与端口（前端 / 后端）；
    - 支持「一键回填」远程访问地址（IPv6 自动加方括号）并保存到 layout.externalUrl；
    - 提供端口自检（/health 连通性）与「推送到原生端」按钮（Native Bridge，fire-and-forget）。
  设计说明：
    - 不做上游那种「静默自动写入」——IPv6 回填存在可达性风险，自动填充只由按钮触发；
    - 保存走 layout 持久化（POST /config/project/:id 的 layout.externalUrl），零 Prisma 迁移。
  依赖：fetchSystemNetworkInfo（system API）、useLayoutStore（layout 持久化）、native-bridge（原生推送）
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="network"
    icon-key="globe"
    accent="var(--module-accent-admin)"
    layout="single"
    page-class="network-hub"
  >
    <template #actions>
      <button type="button" class="settings-btn-accent" :disabled="loading" @click="load">
        <RefreshCw :class="['w-5 h-5', loading && 'animate-spin']" />
        {{ '重新探测' }}
      </button>
    </template>

    <div v-if="loadError" class="settings-premium-empty settings-premium-empty--amber">
      <AlertCircle class="settings-premium-empty__icon" />
      <p class="settings-premium-empty__title">{{ '网络信息加载失败' }}</p>
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
      <!-- 概览 -->
      <SettingsCard full static extra-class="network-card">
        <div class="network-card__head">
          <div class="network-card__title">
            <span class="network-card__icon">🌐</span>
            <div>
              <h3 class="network-card__name">{{ '访问概览' }}</h3>
              <p class="network-card__hint">
                {{
                  '局域网内通过 HomeOS 内网地址访问；在外网访问请配置 HomeOS 远程访问地址（DDNS / 反向代理 / IPv6）'
                }}
              </p>
            </div>
          </div>
          <span class="network-status">
            <span class="network-status__dot" :class="{ 'is-off': !hasPublicIp }" />
            {{ hasPublicIp ? '已探测到公网地址' : '未探测到公网地址' }}
          </span>
        </div>

        <div class="network-stats">
          <div class="network-stat network-stat--hero">
            <p class="network-stat__value">{{ info?.localIp || '—' }}</p>
            <p class="network-stat__label">{{ '内网 IPv4' }}</p>
          </div>
          <div class="network-stat">
            <p class="network-stat__value">{{ info?.publicIpv4 || '—' }}</p>
            <p class="network-stat__label">{{ '公网 IPv4' }}</p>
          </div>
          <div class="network-stat">
            <p class="network-stat__value network-stat__value--sm">
              {{ info?.publicIpv6 || info?.localIpv6 || '—' }}
            </p>
            <p class="network-stat__label">
              {{ info?.publicIpv6 ? '公网 IPv6' : '本机公网 IPv6（回退）' }}
            </p>
          </div>
          <div class="network-stat network-stat--muted">
            <p class="network-stat__value network-stat__value--sm">
              {{ `${info?.frontendPort ?? '—'} / ${info?.backendPort ?? '—'}` }}
            </p>
            <p class="network-stat__label">{{ '前端 / 后端端口' }}</p>
          </div>
        </div>
      </SettingsCard>

      <!-- 地址配置 -->
      <SettingsCard full static extra-class="network-card">
        <div class="network-card__head">
          <div class="network-card__title">
            <span class="network-card__icon">🔗</span>
            <div>
              <h3 class="network-card__name">{{ 'HomeOS 远程访问地址' }}</h3>
              <p class="network-card__hint">
                {{
                  '这是 HomeOS 自身的公网入口（不是 HA 地址）。保存后会下发给移动端与已配对终端，用于外网漫游时自动取回入口（如 https://home.example.com）'
                }}
              </p>
            </div>
          </div>
          <div class="network-card__actions">
            <span v-if="dirty" class="network-dirty-chip">{{ '未保存' }}</span>
            <button
              type="button"
              class="settings-btn-accent settings-btn--sm"
              :disabled="saving || !dirty || !layoutStore.isConfigLoaded"
              @click="save"
            >
              <Save :class="['w-4 h-4', saving && 'animate-spin']" />
              {{ saving ? '保存中…' : '保存地址' }}
            </button>
          </div>
        </div>

        <div class="network-body">
          <div class="settings-form-grid network-field">
            <div>
              <label class="settings-form-label mb-1.5">{{ 'HomeOS 内网地址' }}</label>
              <input
                :value="info?.internalUrl || ''"
                type="text"
                readonly
                class="network-input network-input--readonly"
              />
            </div>
            <div>
              <label class="settings-form-label mb-1.5">{{ 'HomeOS 远程访问地址' }}</label>
              <input
                v-model="externalDraft"
                type="text"
                placeholder="https://home.example.com"
                class="network-input"
              />
            </div>
          </div>

          <div class="network-actions">
            <button
              type="button"
              class="settings-btn-ghost settings-btn--sm"
              :disabled="!ipv6Candidate"
              @click="fillFromIpv6"
            >
              <Globe :class="['w-4 h-4']" />
              {{ '用公网 IPv6 回填' }}
            </button>
            <button
              type="button"
              class="settings-btn-ghost settings-btn--sm"
              :disabled="!info?.publicIpv4"
              @click="fillFromIpv4"
            >
              <Globe :class="['w-4 h-4']" />
              {{ '用公网 IPv4 回填' }}
            </button>
            <button
              type="button"
              class="settings-btn-ghost settings-btn--sm"
              :disabled="checking"
              @click="runPortCheck"
            >
              <Activity :class="['w-4 h-4', checking && 'animate-spin']" />
              {{ checking ? '自检中…' : '端口自检' }}
            </button>
            <button
              type="button"
              class="settings-btn-ghost settings-btn--sm"
              :disabled="!nativeAvailable"
              :title="nativeAvailable ? '' : '当前不在原生 App 内，无法推送'"
              @click="pushToNative"
            >
              <Smartphone :class="['w-4 h-4']" />
              {{ '推送到原生端' }}
            </button>
          </div>

          <p v-if="portCheckTip" class="network-tip" :class="{ 'is-err': !portCheckOk }">
            {{ portCheckTip }}
          </p>
        </div>
      </SettingsCard>
    </template>
  </SettingsPageShell>
</template>

<script setup>
/**
 * 所属模块：frontend/views/settings/system
 * 职责：渲染「网络与远程访问」面板，整合后端探测结果、layout 远程地址草稿与原生端推送。
 * 关键依赖：Vue、Pinia（layout store）、system API、native-bridge、chrome.notify。
 * 约定：- onMounted 拉取探测结果；草稿变更走 INDEPENDENT_SAVE（本面板自行保存）。
 */
import { computed, onMounted, ref } from 'vue'
import { Activity, AlertCircle, Globe, RefreshCw, Save, Smartphone } from '@lucide/vue'
import SettingsPageShell from '@/components/common/page-shell/SettingsPageShell.vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useRegisterSettingsTabPending } from '@/composables/settings/pending.internals'
import { fetchSystemNetworkInfo } from '@/services/api/system'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { hasNativeBridge, pushServerAccessConfig } from '@/utils/bridge/native-bridge'

defineProps({ activeTab: { type: String, default: 'network' } })

const chrome = useChromeStore()
const layoutStore = useLayoutStore()

const loading = ref(false)
const saving = ref(false)
const checking = ref(false)
const loadError = ref('')
const info = ref(null)
/** 远程访问地址草稿（保存后写入 layout.externalUrl） */
const externalDraft = ref('')
const portCheckTip = ref('')
const portCheckOk = ref(true)

/** 已保存到 layout 的远程访问地址（作为 dirty 比对的基准） */
const savedExternalUrl = computed(() => String(layoutStore.layoutConfig?.externalUrl ?? ''))

/**
 * 是否与已保存值不同。
 * 用「草稿 vs 已保存值」的比对来判定，而不是只在 blur / 按钮里置位：
 * 否则服务端回填后输入框显示着一个 URL、「未保存」标记却不出现、保存按钮也是灰的，
 * 用户以为能存却没处可存。
 *
 * 注意：必须声明在下面的 useRegisterSettingsTabPending 之前——该 composable 会在
 * setup 阶段同步读取 getter，声明在后会命中 TDZ 报「Cannot access before initialization」。
 */
const dirty = computed(() => externalDraft.value.trim() !== savedExternalUrl.value)

useRegisterSettingsTabPending('network', () => dirty.value)

/** 是否探测到任一公网地址 */
const hasPublicIp = computed(() => Boolean(info.value?.publicIpv4 || info.value?.publicIpv6))

/** 可用于回填的 IPv6（公网优先，回退本机公网 IPv6） */
const ipv6Candidate = computed(() => info.value?.publicIpv6 || info.value?.localIpv6 || '')

/** 是否处于原生壳内（决定「推送到原生端」是否可用） */
const nativeAvailable = computed(() => hasNativeBridge())

/**
 * 推测远程访问应使用的协议。
 *
 * 不能写死 `http://`：默认 Docker 部署同时开启 Caddy TLS 监听（HTTPS_PORT=8443），
 * 后端 `frontendPort` 的推导顺序是 FRONTEND_PORT → HTTPS_PORT → HTTP_PORT → Host 端口
 * （见 backend/modules/system/service.ts），因此管理员很可能正用 https 访问本页、
 * 而回填出的 `frontendPort` 正是 8443 那个 TLS 端口——此时写死 http 会生成
 * `http://<ip>:8443`（用明文去打 TLS 端口）并持久化进 externalUrl，随后随登录响应
 * 与原生桥分发给所有终端。
 * 以当前页面的协议作为最可靠的信号：页面怎么被打开，公网入口通常就该怎么访问。
 * @returns `https` 或 `http`
 */
function remoteScheme() {
  return window.location.protocol === 'https:' ? 'https' : 'http'
}

/** 用 IPv6 回填远程地址（IPv6 必须加方括号，否则 URL 非法） */
function fillFromIpv6() {
  const ip = ipv6Candidate.value
  if (!ip) return
  externalDraft.value = `${remoteScheme()}://[${ip}]:${info.value?.frontendPort ?? ''}`
  chrome.notify('已回填 IPv6 地址，请确认外网可达后保存', 'success')
}

/** 用公网 IPv4 回填远程地址 */
function fillFromIpv4() {
  const ip = info.value?.publicIpv4
  if (!ip) return
  externalDraft.value = `${remoteScheme()}://${ip}:${info.value?.frontendPort ?? ''}`
  chrome.notify('已回填 IPv4 地址，请确认如需端口映射后保存', 'success')
}

/** 端口自检：请求 /health 确认后端可达（同源，仅验证服务在用） */
async function runPortCheck() {
  checking.value = true
  portCheckTip.value = ''
  try {
    const res = await fetch('/api/v1/system/health', { credentials: 'include' })
    portCheckOk.value = res.ok
    portCheckTip.value = res.ok
      ? `端口自检通过：当前页面与后端在 ${info.value?.frontendPort ?? '—'} 端口连通。`
      : `端口自检失败：后端返回 HTTP ${res.status}。`
  } catch (err) {
    portCheckOk.value = false
    portCheckTip.value = `端口自检失败：${getApiErrorMessage(err, '请检查网络与服务状态')}`
  } finally {
    checking.value = false
  }
}

/** 推送访问配置到原生端（fire-and-forget） */
function pushToNative() {
  const ok = pushServerAccessConfig({
    internalUrl: info.value?.internalUrl ?? '',
    externalUrl: externalDraft.value.trim(),
    frontendPort: info.value?.frontendPort ?? 0,
    backendPort: info.value?.backendPort ?? 0,
  })
  chrome.notify(
    ok ? '已推送给原生端' : '未检测到原生桥，当前为浏览器环境，无需推送',
    ok ? 'success' : 'warning',
  )
}

/** 读取 layout 中已保存的远程地址 */
function readExternalFromLayout() {
  externalDraft.value = String(layoutStore.layoutConfig?.externalUrl ?? '')
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const { data } = await fetchSystemNetworkInfo()
    info.value = data ?? null
    readExternalFromLayout()
    // 后端读到的 externalUrl 与本地草稿不同步时，以后端为准（多端编辑场景）
    const serverUrl = String(data?.externalUrl ?? '')
    if (!externalDraft.value && serverUrl) {
      externalDraft.value = serverUrl
    }
  } catch (err) {
    loadError.value = getApiErrorMessage(err, '加载网络信息失败')
  } finally {
    loading.value = false
  }
}

async function save() {
  // 必须用 isConfigLoaded 而不是 layoutConfig 的存在性判断：
  // layoutConfig 是预填了默认值的 reactive 对象，永远为真；而 fetchProject 失败时
  // store 会刻意让 isConfigLoaded 保持 false 以阻止基于空配置的写入。
  // 否则「网络信息接口成功 + 布局加载失败」时，保存会用只含默认值 + externalUrl 的
  // layout 覆盖掉服务端真实配置（房间、楼层、HA 配置、组件全部被清空）。
  if (!layoutStore.isConfigLoaded) {
    chrome.notify('布局尚未加载完成，请稍后重试', 'error')
    return
  }
  saving.value = true
  try {
    layoutStore.layoutConfig.externalUrl = externalDraft.value.trim()
    const ok = await layoutStore.saveLayout(true)
    if (!ok) throw new Error('保存失败')
    if (info.value) info.value.externalUrl = externalDraft.value.trim()
    chrome.notify('远程访问地址已保存', 'success')
    // 保存即推送：原生端无需等到下次重启才能拿到新地址
    if (nativeAvailable.value) {
      pushServerAccessConfig({
        internalUrl: info.value?.internalUrl ?? '',
        externalUrl: externalDraft.value.trim(),
        frontendPort: info.value?.frontendPort ?? 0,
        backendPort: info.value?.backendPort ?? 0,
      })
    }
  } catch (err) {
    chrome.notify(getApiErrorMessage(err, '保存远程访问地址失败'), 'error')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.network-card {
  margin-bottom: var(--hos-space-6, 24px);
}

.network-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 18px 20px 14px;
  border-bottom: var(--hos-hairline) solid var(--hos-border, rgba(255, 255, 255, 0.08));
}

.network-card__title {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}

.network-card__icon {
  font-size: 22px;
  line-height: 1;
}

.network-card__name {
  margin: 0;
  font-size: var(--premium-fs-title);
  font-weight: 600;
  color: var(--hos-text-strong, #f4f4f5);
}

.network-card__hint {
  margin: 4px 0 0;
  font-size: var(--set-fs-micro, 12px);
  line-height: 1.5;
  color: var(--hos-text-dim, #a1a1aa);
}

.network-card__actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* 探测状态徽标 */
.network-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: var(--hos-radius-pill);
  font-size: var(--set-fs-micro, 12px);
  color: var(--hos-text-dim, #a1a1aa);
  background: rgba(255, 255, 255, 0.04);
  border: var(--hos-hairline) solid var(--hos-border, rgba(255, 255, 255, 0.08));
  white-space: nowrap;
}

.network-status__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--module-accent-admin, #facc15);
  box-shadow: 0 0 6px rgba(250, 204, 21, 0.6);
}

.network-status__dot.is-off {
  background: rgba(255, 255, 255, 0.35);
  box-shadow: none;
}

.network-dirty-chip {
  padding: 4px 10px;
  border-radius: var(--hos-radius-pill);
  font-size: var(--set-fs-micro, 12px);
  color: var(--module-accent-admin, #facc15);
  background: rgba(var(--module-accent-admin-rgb, 250, 204, 21), 0.1);
  border: var(--hos-hairline) solid rgba(var(--module-accent-admin-rgb, 250, 204, 21), 0.25);
  white-space: nowrap;
}

.settings-btn--sm {
  padding: 6px 12px;
  font-size: var(--set-fs-micro, 12px);
}

/* 概览统计 */
.network-stats {
  display: grid;
  grid-template-columns: 1.4fr repeat(3, 1fr);
  gap: 12px;
  padding: 18px 20px;
}

.network-stat {
  min-width: 0;
  padding: 14px 16px;
  border-radius: var(--hos-radius-card);
  background: rgba(255, 255, 255, 0.03);
  border: var(--hos-hairline) solid var(--hos-border, rgba(255, 255, 255, 0.07));
}

.network-stat--hero {
  background: rgba(var(--module-accent-admin-rgb, 250, 204, 21), 0.08);
  border-color: rgba(var(--module-accent-admin-rgb, 250, 204, 21), 0.22);
}

.network-stat--hero .network-stat__value {
  color: var(--module-accent-admin, #facc15);
}

.network-stat__value {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--hos-text-strong, #f4f4f5);
  word-break: break-all;
}

.network-stat__value--sm {
  font-size: var(--premium-fs-caption);
  font-weight: 500;
}

.network-stat--muted .network-stat__value {
  font-size: var(--premium-fs-caption);
  font-weight: 500;
}

.network-stat__label {
  margin: 4px 0 0;
  font-size: var(--set-fs-micro, 12px);
  color: var(--hos-text-dim, #a1a1aa);
}

/* 地址配置主体 */
.network-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 20px 20px;
}

.network-field {
  gap: 14px;
}

.network-input {
  width: 100%;
  padding: 9px 12px;
  border-radius: var(--hos-radius-card);
  border: var(--hos-hairline) solid var(--hos-border, rgba(255, 255, 255, 0.14));
  background: rgba(255, 255, 255, 0.04);
  color: var(--hos-text, #e4e4e7);
  font-size: var(--premium-fs-caption);
  outline: none;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.network-input:focus {
  border-color: var(--module-accent-admin, #facc15);
  background: rgba(255, 255, 255, 0.06);
}

.network-input--readonly {
  color: var(--hos-text-dim, #a1a1aa);
  cursor: default;
}

.network-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.network-tip {
  margin: 0;
  font-size: var(--set-fs-micro, 12px);
  line-height: 1.5;
  color: var(--hos-text-dim, #a1a1aa);
}

.network-tip.is-err {
  color: rgba(248, 113, 113, 0.9);
}

@media (max-width: 900px) {
  .network-stats {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 720px) {
  .network-card__head {
    padding: 16px 14px 12px;
  }
  .network-stats {
    padding: 14px;
    gap: 10px;
  }
  .network-body {
    padding: 14px;
  }
  .network-actions {
    gap: 8px;
  }
}
</style>
