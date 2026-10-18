<script setup lang="ts">
/**
 * 授权激活页（单 HTTP 栈）。
 *
 * 状态机：轮询 `/license/availability`，终态或用户点击
 * 「重新激活」时才交还表单；`/license/retry` 是「不用等下一拍轮询」的手动重试。
 *
 * 轮询为什么不再读 `/license/status`：该端点要求登录会话，而本页允许匿名访问
 * （门禁会把未登录用户也送到这里）。`/availability` 是公开脱敏接口，门禁判定所需的
 * `status` / `allowed` / `editorAllowed` / `canRetry` 都在其中。
 *
 * 版式：外壳来自 AuthShell（首次开通三步轨道的第 3 步），状态展示来自 StatePanel
 * （加载 / 错误 / 离线三态各有结构，不再把三种处境都写成一行小字）。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

import {
  LICENSE_INSTANCE_MISMATCH_HINT,
  LICENSE_TERMINAL_STATUSES,
  activateLicense,
  getLicenseAvailability,
  licenseErrorCode,
  licenseErrorMessage,
  licenseMessage,
  retryLicense,
  type LicenseMessageState,
} from '@/services/api/license'
import { useAuthStore } from '@/stores/auth.store'
import { isUnauthorizedError } from '@/shared/utils/core/error-message'
import SceneStage from '@/components/common/SceneStage.vue'
import AuthShell from '@/shared/components/auth/AuthShell.vue'
import StatePanel from '@/shared/components/feedback/StatePanel.vue'
import { AUTH_FLOW_SETUP, renderAuthSteps } from '@/shared/utils/auth/auth-flow.util'

/** 状态轮询周期：与后端租约心跳同量级，够快但不至于把授权后台打满。 */
const STATUS_POLL_INTERVAL_MS = 5000

const authStore = useAuthStore()
/** 激活 / 重连都要本机会话；未登录时表单可填，但提交会 401。 */
const needsLocalLogin = computed(() => !authStore.isAuthenticated)
const loginHref = '/login?next=/activate'

const email = ref('')
const activationCode = ref('')
const emailInput = ref<HTMLInputElement | null>(null)

const statusText = ref('正在读取授权状态…')
/** 状态句的语气：需要用户动手时（绑定冲突）用珊瑚色，其余用常规色。 */
const statusTone = ref<'lumen' | 'alert'>('lumen')
const recoveryHint = ref('')
const errorMessage = ref('')

const loadingStatus = ref(false)
const formVisible = ref(false)
const reactivateVisible = ref(false)
const retryVisible = ref(false)
/** 首次状态读取是否已返回：决定抬头显示骨架还是状态句。 */
const statusSettled = ref(false)
/** 最近一次状态读取是否失败（网络/后台不可用），决定是否切到错误/离线态。 */
const statusFailed = ref(false)
/** 失败时的错误码（读不到就是空串）。 */
const statusErrorCode = ref('')
/** 在线状态：离线态与「后台读不到」要区分开，用户才知道该修网络还是等后台。 */
const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)
/** 诊断块是否展开。 */
const diagnosticsOpen = ref(false)

/** 步骤轨道：首次开通（初始化 → 注册 → 激活），本页是激活这一步。 */
const steps = renderAuthSteps(AUTH_FLOW_SETUP, 'activate')

/** 用户点过「重新激活」后，表单必须一直留着，即使状态码不是终态。 */
let reactivateRequested = false

let navigating = false
let pageHidden = false
let statusTimer: ReturnType<typeof setTimeout> | undefined

/** 诊断信息：墙面板没有控制台，报客服时需要这几项才定位得了。 */
const diagnosticsText = computed(() =>
  [
    `时间：${new Date().toISOString()}`,
    `在线：${online.value ? '是' : '否'}`,
    `状态读取：${statusFailed.value ? '失败' : statusSettled.value ? '成功' : '进行中'}`,
    `错误码：${statusErrorCode.value || '（无）'}`,
    `状态句：${statusText.value}`,
    `访问地址：${typeof window === 'undefined' ? '' : window.location.href}`,
    `UA：${typeof navigator === 'undefined' ? '' : navigator.userAgent}`,
  ].join('\n'),
)

/** 复制诊断信息；剪贴板不可用时退化为选中文本（用户仍可手动复制）。 */
async function copyDiagnostics(): Promise<void> {
  try {
    await navigator.clipboard.writeText(diagnosticsText.value)
  } catch {
    // 剪贴板被拒（非安全上下文 / 权限）时不弹错：诊断块本身就是可读文本
  }
}

/**
 * 展开/收起诊断块。用户从「查看诊断」进入。
 */
function onDiagnose(): void {
  diagnosticsOpen.value = !diagnosticsOpen.value
}

/** 已进入编辑器：停止一切轮询与跳转竞争。 */
function enterEditor(): void {
  if (navigating) return
  navigating = true
  clearTimeout(statusTimer)
  window.location.replace('/')
}

/**
 * 只有「已绑定其他设备」需要一段可执行的处理步骤，其余状态靠状态码文案即可说明白。
 */
function setRecoveryHint(statusCode: string): void {
  recoveryHint.value = statusCode === 'INSTANCE_MISMATCH' ? LICENSE_INSTANCE_MISMATCH_HINT : ''
}

/** 把一次状态响应渲染成界面：文案、语气、表单/按钮可见性。 */
function applyStatus(payload: LicenseMessageState & { allowed?: boolean; editorAllowed?: boolean; canRetry?: boolean }): void {
  statusFailed.value = false
  statusErrorCode.value = ''
  if (payload.status === 'ACTIVE' && payload.editorAllowed) {
    enterEditor()
    return
  }
  if (payload.editorAllowed) {
    statusText.value = licenseMessage({
      status: payload.status,
      errorCode: payload.errorCode,
    })
    statusTone.value = 'lumen'
    setRecoveryHint(String(payload.status || ''))
  } else if (payload.allowed) {
    statusText.value = '当前授权有效，但未包含编辑器权益，请联系授权管理员。'
    statusTone.value = 'lumen'
    setRecoveryHint('')
  } else {
    // 公开可用性接口不下发 `lastError`（脱敏），文案只能由状态码 + errorCode 合成。
    statusText.value = licenseMessage(payload)
    statusTone.value = payload.status === 'INSTANCE_MISMATCH' ? 'alert' : 'lumen'
    setRecoveryHint(String(payload.status || ''))
  }

  const isTerminalStatus = LICENSE_TERMINAL_STATUSES.has(String(payload.status || ''))
  formVisible.value = reactivateRequested || isTerminalStatus
  reactivateVisible.value = !formVisible.value
  retryVisible.value = Boolean(payload.canRetry)
}

/** 下一拍轮询；页面隐藏或已跳转时不再排期。 */
function scheduleStatusPoll(): void {
  clearTimeout(statusTimer)
  if (!pageHidden && !navigating) {
    statusTimer = setTimeout(() => void refreshStatus(), STATUS_POLL_INTERVAL_MS)
  }
}

/**
 * 拉取授权状态。
 * @param manual 为 true 时先走 `/license/retry`（显式重试），随后都读公开可用性
 */
async function refreshStatus(manual = false): Promise<void> {
  if (loadingStatus.value || pageHidden || navigating) return
  loadingStatus.value = true
  clearTimeout(statusTimer)
  if (manual) statusText.value = '正在重新连接授权后台…'
  try {
    if (manual) await requestRetry()
    applyStatus((await getLicenseAvailability()).data)
  } catch (statusError) {
    statusFailed.value = true
    statusErrorCode.value = licenseErrorCode(statusError) || ''
    statusText.value = licenseErrorMessage(statusError, '读取授权状态失败，请稍后重试。')
    statusTone.value = 'alert'
    retryVisible.value = true
    formVisible.value = true
    reactivateVisible.value = false
  } finally {
    loadingStatus.value = false
    statusSettled.value = true
    scheduleStatusPoll()
  }
}

/**
 * 手动「重新连接授权后台」。
 *
 * `/license/retry` 要求登录会话，而本页允许匿名：未登录时不再整页跳登录页 ——
 * 门禁会把未登录的 `/login` 原样送回本页，来回跳既没有出路也看不清原因。改成把
 * 「先登录」写进页面提示，然后继续读公开可用性把当前状态显示出来。
 */
async function requestRetry(): Promise<void> {
  try {
    await retryLicense()
  } catch (retryError) {
    if (!isUnauthorizedError(retryError)) throw retryError
    errorMessage.value = '请先登录本机账号，再点「重新连接授权后台」。'
    statusTone.value = 'alert'
    window.setTimeout(() => window.location.assign(loginHref), 600)
  }
}

async function onSubmit(): Promise<void> {
  if (loadingStatus.value || navigating) return
  if (needsLocalLogin.value) {
    errorMessage.value = '此操作需要先登录本机管理员账号。'
    window.location.assign(loginHref)
    return
  }
  loadingStatus.value = true
  clearTimeout(statusTimer)
  errorMessage.value = ''
  try {
    const payload = (await activateLicense(email.value.trim(), activationCode.value.trim())).data
    if (payload.status !== 'ACTIVE' || !payload.editorAllowed) {
      throw new Error(
        payload.allowed || payload.editorAllowed
          ? payload.status === 'ACTIVE'
            ? '激活成功，但当前商品未包含编辑器权益。'
            : '激活后授权仍未就绪，请点击重新激活或稍后再试。'
          : '激活后授权状态尚未生效，请稍后再试。',
      )
    }
    enterEditor()
  } catch (activateError) {
    errorMessage.value = licenseErrorMessage(activateError, '激活失败，请稍后重试。')
    // 绑定冲突是唯一需要「先去商店解绑」的处置步骤：把说明同步显示在表单下方，
    // 而不是只把一句「已绑定其他设备」丢给用户。
    if (licenseErrorCode(activateError) === 'INSTANCE_MISMATCH') {
      statusTone.value = 'alert'
      setRecoveryHint('INSTANCE_MISMATCH')
    }
    if (isUnauthorizedError(activateError)) {
      window.setTimeout(() => window.location.assign(loginHref), 600)
    }
  } finally {
    loadingStatus.value = false
    scheduleStatusPoll()
  }
}

/** 「重新激活」只是把表单交还给用户：真正的无码重激活入口在编辑器首页。 */
function onReactivate(): void {
  reactivateRequested = true
  reactivateVisible.value = false
  formVisible.value = true
  void nextTick(() => emailInput.value?.focus())
}

/** 退出的是本机登录会话，不等于解绑商店授权。未登录时改为去登录页（带回激活页）。 */
async function onAccountAction(): Promise<void> {
  if (needsLocalLogin.value) {
    window.location.assign(loginHref)
    return
  }
  await authStore.logout()
  window.location.replace(loginHref)
}

function onOnline(): void {
  online.value = true
  void refreshStatus()
}
function onOffline(): void {
  online.value = false
}
function onPageHide(): void {
  pageHidden = true
  clearTimeout(statusTimer)
}
function onPageShow(): void {
  pageHidden = false
  void refreshStatus()
}

onMounted(() => {
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('pageshow', onPageShow)
  void refreshStatus()
})

onBeforeUnmount(() => {
  navigating = true
  clearTimeout(statusTimer)
  window.removeEventListener('online', onOnline)
  window.removeEventListener('offline', onOffline)
  window.removeEventListener('pagehide', onPageHide)
  window.removeEventListener('pageshow', onPageShow)
})
</script>

<template>
  <AuthShell
    tone="eco"
    eyebrow="授权激活"
    title="绑定这台机器"
    secure="一机一码"
    :steps="steps"
    steps-label="首次开通进度"
  >
    <template #scene><SceneStage page="activate" /></template>

    <template #head-extra>
      <!-- 首次读取：骨架 + 10 秒后自动出现的诊断入口（StatePanel 内建慢加载计时） -->
      <StatePanel
        v-if="!statusSettled"
        state="loading"
        title="正在读取授权状态"
        description="正在向授权后台确认本机绑定，通常 1 秒内完成。"
        @diagnose="onDiagnose"
      />
      <!-- 读取失败：区分「离线」与「后台不可用」，两者的处置完全不同 -->
      <StatePanel
        v-else-if="statusFailed"
        :state="online ? 'error' : 'offline'"
        :title="online ? '读取授权状态失败' : '本机当前处于离线状态'"
        :description="statusText"
        :error-code="statusErrorCode"
        action-label="重新连接授权后台"
        @action="refreshStatus(true)"
        @diagnose="onDiagnose"
      />
      <template v-else>
        <p id="license-status-text" class="hos-panel__desc" :class="'hos-tone--' + statusTone">{{ statusText }}</p>
        <!-- 提示条留在抬头块里：它说的是「当前授权状态要你做什么」，
             与上面的状态句是同一件事的两句，隔开会被读成两件事。 -->
        <p id="license-recovery-hint" class="hos-notice" :class="'hos-tone--' + statusTone" role="note"
          v-show="recoveryHint">{{ recoveryHint }}</p>
      </template>

      <div v-if="diagnosticsOpen" class="license-diagnostics" role="region" aria-label="连接诊断">
        <p class="license-diagnostics__title">连接诊断</p>
        <dl class="license-diagnostics__list">
          <div><dt>在线</dt><dd>{{ online ? '是' : '否' }}</dd></div>
          <div><dt>状态读取</dt><dd>{{ statusFailed ? '失败' : statusSettled ? '成功' : '进行中' }}</dd></div>
          <div><dt>错误码</dt><dd>{{ statusErrorCode || '（无）' }}</dd></div>
          <div><dt>状态句</dt><dd>{{ statusText }}</dd></div>
        </dl>
        <button class="license-diagnostics__copy" type="button" @click="copyDiagnostics">
          复制诊断信息（报客服时附上）
        </button>
      </div>
    </template>

    <form id="license-form" class="hos-form" v-show="formVisible" @submit.prevent="onSubmit">
      <div class="hos-field">
        <div class="hos-label-row"><label for="license-email">授权邮箱</label></div>
        <div class="hos-control">
          <input id="license-email" name="email" type="email" v-model="email" ref="emailInput"
            :disabled="loadingStatus" maxlength="255" autocomplete="email"
            placeholder="购买授权时使用的邮箱" required>
        </div>
        <!-- 邮箱口径要写清楚：这一格是商店账号邮箱，不是本机登录账号。 -->
        <small>填商店下单时的账号邮箱，不是本机登录账号。</small>
      </div>

      <div class="hos-field">
        <div class="hos-label-row"><label for="license-code">激活码</label></div>
        <div class="hos-control">
          <input id="license-code" name="activationCode" v-model="activationCode"
            :disabled="loadingStatus" class="hos-mono" maxlength="128"
            autocomplete="off" placeholder="HOMEOS-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" spellcheck="false" required>
        </div>
      </div>

      <p v-if="needsLocalLogin" class="hos-msg is-err" role="status">
        激活前请先
        <a class="hos-text-button" :href="loginHref">登录本机管理员账号</a>
        （与上方商店邮箱不是同一个账号）。
      </p>
      <p v-if="errorMessage" id="message" class="hos-msg is-err" role="alert">{{ errorMessage }}</p>

      <div class="hos-actions">
        <button class="hos-btn-primary" type="submit" :disabled="loadingStatus">激活当前安装</button>
        <!-- 「重新连接」的定位是「不用等下一拍轮询」，不是替代填激活码。 -->
        <button id="license-retry" class="hos-btn-ghost" type="button" v-show="retryVisible"
          :disabled="loadingStatus" @click="refreshStatus(true)">重新连接授权后台</button>
      </div>
    </form>

    <!-- 表单藏起来时（授权已生效或正在等状态）才轮到它出场：点击只是把上面的表单交还给用户，
         真正的自动重激活走编辑器首页那颗按钮 —— 那里有完整上下文。 -->
    <div class="hos-actions">
      <button id="license-reactivate" class="hos-btn-ghost" type="button" v-show="reactivateVisible"
        @click="onReactivate">重新激活</button>
    </div>

    <template #copy>
      <div class="hos-panel__meta">
        <span>首次激活绑定本机指纹</span>
        <i class="hos-panel__meta-sep" aria-hidden="true"></i>
        <span>激活后自动进编辑器</span>
      </div>
      <button id="logout" class="hos-text-button" type="button" @click="onAccountAction">
        {{ needsLocalLogin ? "登录本机账号" : "退出本机登录" }}
      </button>
    </template>
  </AuthShell>

  <!-- 手持档开关：普通脚本（不导出、不 defer），必须在首帧前跑完给 <html> 挂 .hos-touch。 -->
</template>

<style scoped>
/* 诊断块：只在用户主动展开时出现，尺寸与正文一致，不改面板主节奏 */
.license-diagnostics {
  margin-top: var(--hos-space-3);
  padding: var(--hos-space-3) var(--hos-space-4);
  border: var(--hos-line-width) solid var(--hos-line-2);
  border-radius: var(--hos-r-2);
  background: var(--hos-bg-tint-1);
  text-align: left;
}

.license-diagnostics__title {
  margin: 0 0 var(--hos-space-2);
  color: var(--hos-color-fg-2);
  font-size: var(--hos-fs-3);
  letter-spacing: 0.04em;
}

.license-diagnostics__list {
  margin: 0;
  display: grid;
  gap: 4px;
  font-size: var(--hos-fs-3);
}

.license-diagnostics__list > div {
  display: flex;
  gap: var(--hos-space-2);
  justify-content: space-between;
}

.license-diagnostics__list dt {
  color: var(--hos-color-fg-3);
}

.license-diagnostics__list dd {
  margin: 0;
  color: var(--hos-color-fg-2);
  text-align: right;
  word-break: break-all;
}

.license-diagnostics__copy {
  margin-top: var(--hos-space-3);
  min-height: var(--hos-touch-min);
  padding: 0 var(--hos-space-3);
  border: var(--hos-line-width) solid var(--hos-line-2);
  border-radius: var(--hos-r-1);
  background: transparent;
  color: var(--hos-color-accent);
  font-size: var(--hos-fs-3);
  cursor: pointer;
}

.license-diagnostics__copy:focus-visible {
  outline: var(--hos-focus-outline);
  outline-offset: var(--hos-focus-offset);
}
</style>
