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
import { useRoute } from 'vue-router'

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
import {
  forgetActivationEmail,
  readActivationEmail,
} from '@/shared/utils/auth/activation-email.util'
import { useStoreLinks } from '@/composables/auth/useStoreLinks'

/** 状态轮询周期：与后端租约心跳同量级，够快但不至于把授权后台打满。 */
const STATUS_POLL_INTERVAL_MS = 5000

/** 商店里「购买授权」与「账号中心」两个入口的路径（与商店路由表一致）。 */
const STORE_PRODUCTS_PATH = '/products'
const STORE_ACCOUNT_PATH = '/user/dashboard/index'

const authStore = useAuthStore()
const route = useRoute()
/** 商店地址用响应式值绑定 `:href`：购买区块会被 `v-if` 重建，DOM 补丁不会跟着重跑。 */
const { storeLinks } = useStoreLinks()
/** 激活 / 重连都要本机会话；未登录时表单可填，但提交会 401。 */
const needsLocalLogin = computed(() => !authStore.isAuthenticated)
const loginHref = '/login?next=/activate'

/**
 * 授权邮箱：默认带上注册页刚填过的那个（`sessionStorage` 交接）。
 *
 * 这一格要的是**商店下单邮箱**，和本机登录账号是两个体系；预填只是省一次手打，
 * 用户可以改 —— 所以是小字说明里的「不是本机登录账号」而不是锁定只读。
 */
const email = ref(readActivationEmail())
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

/** 最近一次读到的授权状态码；购买区块据此决定「购买 / 续费 / 不显示」。 */
const licenseStatus = ref('')

/** 是否从注册页过来（注册页会把它写进地址，并已尝试打开商店页）。 */
const cameFromRegister = computed(() => route.query.from === 'register')
/**
 * 注册页的商店弹窗被浏览器拦掉了。
 *
 * 只会由注册页在「**地址已知、弹窗没开成**」时写入：地址都不知道的那种失败不写这个参数，
 * 因为那时页面上的兜底话（「商店地址当前不可用…」）才是唯一出路，重试弹窗也没用。
 */
const storeBlocked = computed(() => route.query.store === 'blocked')

/**
 * 购买区块要显示哪种货架。
 *
 * - `purchase`：`UNACTIVATED` —— 本机从没激活过，第一件事是买激活码；
 * - `renew`：`ACCESS_EXPIRED` —— 授权到期，文案原本就说「请到商店续费」，这里补上入口；
 * - `inspect`：`DEACTIVATED` —— 授权被停用（退款 / 换机 / 运营处置），**不推销**：
 *   再下一单既不解决根因，也可能造成重复付费；这里只给「去账号中心核对」的路。
 * - 其余一律不显示：`REVOKED` / `INVALID` 该找客服，`INSTANCE_MISMATCH` 该去解绑，
 *   联网告警该等重连 —— 在这些状态下推销只会和页面上的处理步骤打架。
 */
const buyMode = computed<'purchase' | 'renew' | 'inspect' | ''>(() => {
  const status = licenseStatus.value
  if (status === 'UNACTIVATED') return 'purchase'
  if (status === 'ACCESS_EXPIRED') return 'renew'
  if (status === 'DEACTIVATED') return 'inspect'
  return ''
})

/** 购买区块可见：只看状态 —— 不再叠加表单可见性（续费场景表单本来就藏着）。 */
const buyVisible = computed(() => Boolean(buyMode.value))

/** 商店地址解析完成才算「可买」：首帧不能给一个空 href 的按钮。 */
const storeUrl = computed(() => storeLinks.value.storeUrl)
const storeProductsUrl = computed(() => storeLinks.value.pathUrl(STORE_PRODUCTS_PATH))
const storeAccountUrl = computed(() => storeLinks.value.pathUrl(STORE_ACCOUNT_PATH))

/**
 * 主按钮：首次购买去商品列表；续费 / 停用核对都去账号中心 —— 那里能看到自己那张授权，
 * 也是唯一能解除设备绑定、查看停用原因的地方。
 */
const buyPrimaryUrl = computed(() =>
  buyMode.value === 'purchase' ? storeProductsUrl.value : storeAccountUrl.value,
)
const buyPrimaryLabel = computed(() => {
  if (buyMode.value === 'purchase') return '去商店购买授权'
  if (buyMode.value === 'renew') return '去商店续费'
  return '去商店账号中心'
})
const buyTitle = computed(() => {
  if (buyMode.value === 'renew') return '授权已到期，续费即恢复'
  if (buyMode.value === 'inspect') return '授权已停用，先核对这张授权'
  return cameFromRegister.value ? '账号已创建，还差一个激活码' : '还没有激活码？'
})
/** 商店地址取不到时的兜底话：三种货架要办的事不同，不能共用一句「联系厂商拿激活码」。 */
const buyFallbackText = computed(() => {
  if (buyMode.value === 'purchase') {
    return '商店地址当前不可用，请联系厂商获取激活码；若商店暂无在售版本，同样请联系厂商。'
  }
  return '商店地址当前不可用，请联系厂商处理这张授权的续费 / 停用。'
})

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
  // 邮箱交接值只服务「刚注册完那一次」：已经激活就没必要在下次激活时冒出来。
  forgetActivationEmail()
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
  // 购买区块的货架由状态码决定，先记下来（下面是各种文案分支，都会提前 return 一部分）。
  licenseStatus.value = String(payload.status || '')
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
        <!-- 「已绑定其他设备」的处置步骤原文是「打开商店账号中心 → 解除设备绑定」，
             但那一页此前没有任何链接指过去 —— 指路却不给路。这里把入口补上。 -->
        <a v-if="licenseStatus === 'INSTANCE_MISMATCH' && storeAccountUrl" id="license-unbind"
          class="hos-text-button" :href="storeAccountUrl" target="_blank" rel="noopener noreferrer">
          打开商店账号中心（解除设备绑定）
        </a>
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

    <!-- 购买闭环。放在状态句与激活表单之间是刻意的：首次开通的人正是盯着下面两个输入框
         在问「码从哪来」，答案必须就在他眼前，而不是坞脚一行小字里。
         链接一律绑定 `storeLinks`（响应式）而不是走挂载后改写 href：这一段会被 v-if
         重建，写死的 href 重建出来就是死链。 -->
    <section v-if="buyVisible" class="license-buy" aria-labelledby="license-buy-title">
      <p id="license-buy-title" class="license-buy__title">{{ buyTitle }}</p>
      <!-- 停用不是「没买过」：这时给「怎么买」等于鼓励重复下单，只给核对与申诉路径。 -->
      <p v-if="buyMode === 'inspect'" class="license-buy__note" role="note">
        停用一般由退款、换机或运营处置触发，<strong>再买一单不会解除当前这张授权</strong>。
        先去商店账号中心核对这张授权的状态与绑定设备；仍然无法恢复请联系厂商。
      </p>
      <template v-else>
        <ol class="license-buy__steps">
          <li>在商店注册 / 登录<strong>商店账号</strong>（建议与本机账号用同一个邮箱）</li>
          <li>选购版本、下单付款</li>
          <li>激活码发到下单邮箱，也能在商店账号中心随时查看</li>
        </ol>
        <p class="license-buy__warn" role="note">
          激活码按下单邮箱归属：下面「授权邮箱」必须与下单邮箱一致，填本机登录账号是通不过的。
        </p>
      </template>
      <div v-if="storeUrl" class="license-buy__actions">
        <a class="hos-btn-primary" :href="buyPrimaryUrl" target="_blank" rel="noopener noreferrer">
          {{ buyPrimaryLabel }}
        </a>
        <!-- 停用态的主按钮已经是账号中心，不再重复给第二个同样的入口。 -->
        <a v-if="buyMode === 'purchase'" class="hos-btn-ghost" :href="storeAccountUrl"
          target="_blank" rel="noopener noreferrer">商店账号中心</a>
      </div>
      <!-- 地址取不到（APP_STORE_URL 留空且商店不可达）时不给按钮，只给一句能照做的话。 -->
      <p v-else class="license-buy__fallback" role="note">{{ buyFallbackText }}</p>
      <!-- 只在按钮真的存在时解释「被拦截」：地址都取不到时上面那句兜底话才是唯一出路。 -->
      <p v-if="storeBlocked && storeUrl" class="hos-notice hos-tone--eco" role="note">
        商店购买页被浏览器拦截了，请点上面的「{{ buyPrimaryLabel }}」手动打开。
      </p>
    </section>

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
/* 购买区块：与诊断块同一套描边 / 圆角 / 底色，但语气是「待办」而不是「诊断」。
   `flex: 0 0 auto` 必须写：`.hos-panel` 是弹性列，它的「不收缩」白名单里没有新块，
   不加这一句，抬头一长就会把这块压成两行标题。 */
.license-buy {
  flex: 0 0 auto;
  margin-bottom: 16px;
  padding: var(--hos-space-3) var(--hos-space-4);
  border: var(--hos-line-width) solid var(--hos-line-2);
  border-radius: var(--hos-r-2);
  background: var(--hos-bg-tint-1);
  text-align: left;
}

.license-buy__title {
  margin: 0 0 var(--hos-space-2);
  color: var(--hos-fg-1, var(--hos-ink));
  font-size: var(--hos-fs-3);
  font-weight: 700;
  letter-spacing: 0.02em;
}

.license-buy__steps {
  margin: 0 0 var(--hos-space-2);
  padding-left: 1.15em;
  display: grid;
  gap: 4px;
  color: var(--hos-fg-2);
  font-size: var(--hos-fs-3);
  line-height: 1.55;
}

.license-buy__steps strong {
  color: var(--hb-eco);
  font-weight: 600;
}

/* 停用态的说明：与步骤列表同字号，但用中性色而不是暖光强调 —— 这里要说的是
   「别再买一单」，不是「注意这个字段」。 */
.license-buy__note {
  margin: 0 0 var(--hos-space-3);
  color: var(--hos-fg-2);
  font-size: var(--hos-fs-3);
  line-height: 1.6;
}

.license-buy__note strong {
  color: var(--hos-fg-1, var(--hos-ink));
  font-weight: 700;
}

/* 「邮箱必须一致」是这一页最容易踩的一脚：用提示条的暖光底色单独强调，
   不要混进上面的步骤里被读成第四步。 */
.license-buy__warn {
  margin: 0 0 var(--hos-space-3);
  padding: 8px 10px;
  border-radius: var(--hos-r-1);
  background: rgba(var(--hb-lumen-rgb), 0.08);
  color: var(--hb-lumen);
  font-size: 0.78rem;
  line-height: 1.55;
}

.license-buy__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.license-buy__actions .hos-btn-primary,
.license-buy__actions .hos-btn-ghost {
  flex: 1 1 auto;
  text-decoration: none;
}

.license-buy__fallback {
  margin: 0;
  color: rgba(var(--hos-muted-rgb), 0.85);
  font-size: 0.8rem;
  line-height: 1.55;
}

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
  color: var(--hos-fg-2);
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
  color: var(--hos-fg-3);
}

.license-diagnostics__list dd {
  margin: 0;
  color: var(--hos-fg-2);
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
