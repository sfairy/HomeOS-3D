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
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";

import {
  LICENSE_INSTANCE_MISMATCH_HINT,
  LICENSE_TERMINAL_STATUSES,
  activateLicense,
  getLicenseAvailability,
  licenseErrorMessage,
  licenseMessage,
  retryLicense,
  type LicenseMessageState,
} from "@/services/api/license";
import { useAuthStore } from "@/stores/auth.store";
import { isUnauthorizedError } from "@/utils/core/error-message";
import SceneStage from "@/studio/components/SceneStage.vue";

/** 状态轮询周期：与后端租约心跳同量级，够快但不至于把授权后台打满。 */
const STATUS_POLL_INTERVAL_MS = 5000;

const authStore = useAuthStore();
/** 激活 / 重连都要本机会话；未登录时表单可填，但提交会 401。 */
const needsLocalLogin = computed(() => !authStore.isAuthenticated);
const loginHref = "/login?next=/activate";

const email = ref("");
const activationCode = ref("");
const emailInput = ref<HTMLInputElement | null>(null);

const statusText = ref("正在读取授权状态…");
/** 状态句的语气：需要用户动手时（绑定冲突）用珊瑚色，其余用常规色。 */
const statusTone = ref<"lumen" | "alert">("lumen");
const recoveryHint = ref("");
const errorMessage = ref("");

const loadingStatus = ref(false);
const formVisible = ref(false);
const reactivateVisible = ref(false);
const retryVisible = ref(false);
/** 用户点过「重新激活」后，表单必须一直留着，即使状态码不是终态。 */
let reactivateRequested = false;

let navigating = false;
let pageHidden = false;
let statusTimer: ReturnType<typeof setTimeout> | undefined;

/** 已进入编辑器：停止一切轮询与跳转竞争。 */
function enterEditor(): void {
  if (navigating) return;
  navigating = true;
  clearTimeout(statusTimer);
  window.location.replace("/");
}

/**
 * 只有「已绑定其他设备」需要一段可执行的处理步骤，其余状态靠状态码文案即可说明白。
 */
function setRecoveryHint(statusCode: string): void {
  recoveryHint.value = statusCode === "INSTANCE_MISMATCH" ? LICENSE_INSTANCE_MISMATCH_HINT : "";
}

/** 把一次状态响应渲染成界面：文案、语气、表单/按钮可见性。 */
function applyStatus(payload: LicenseMessageState & { allowed?: boolean; editorAllowed?: boolean; canRetry?: boolean }): void {
  if (payload.status === "ACTIVE" && payload.editorAllowed) {
    enterEditor();
    return;
  }
  if (payload.editorAllowed) {
    statusText.value =
      (payload.lastError || "").trim() || "授权连接异常，请重新连接授权后台后再进入编辑器。";
    statusTone.value = "lumen";
    setRecoveryHint(String(payload.status || ""));
  } else if (payload.allowed) {
    statusText.value = "当前授权有效，但未包含编辑器权益，请联系授权管理员。";
    statusTone.value = "lumen";
    setRecoveryHint("");
  } else {
    statusText.value = licenseMessage(payload, (payload.lastError || "").trim());
    statusTone.value = payload.status === "INSTANCE_MISMATCH" ? "alert" : "lumen";
    setRecoveryHint(String(payload.status || ""));
  }

  const isTerminalStatus = LICENSE_TERMINAL_STATUSES.has(String(payload.status || ""));
  formVisible.value = reactivateRequested || isTerminalStatus;
  reactivateVisible.value = !formVisible.value;
  retryVisible.value = Boolean(payload.canRetry);
}

/** 下一拍轮询；页面隐藏或已跳转时不再排期。 */
function scheduleStatusPoll(): void {
  clearTimeout(statusTimer);
  if (!pageHidden && !navigating) {
    statusTimer = setTimeout(() => void refreshStatus(), STATUS_POLL_INTERVAL_MS);
  }
}

/**
 * 拉取授权状态。
 * @param manual 为 true 时先走 `/license/retry`（显式重试），随后都读公开可用性
 */
async function refreshStatus(manual = false): Promise<void> {
  if (loadingStatus.value || pageHidden || navigating) return;
  loadingStatus.value = true;
  clearTimeout(statusTimer);
  if (manual) statusText.value = "正在重新连接授权后台…";
  try {
    if (manual) await requestRetry();
    applyStatus((await getLicenseAvailability()).data);
  } catch (statusError) {
    statusText.value = licenseErrorMessage(statusError, "读取授权状态失败，请稍后重试。");
    statusTone.value = "alert";
    retryVisible.value = true;
    formVisible.value = true;
    reactivateVisible.value = false;
  } finally {
    loadingStatus.value = false;
    scheduleStatusPoll();
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
    await retryLicense();
  } catch (retryError) {
    if (!isUnauthorizedError(retryError)) throw retryError;
    errorMessage.value = "请先登录本机账号，再点「重新连接授权后台」。";
    statusTone.value = "alert";
    window.setTimeout(() => window.location.assign(loginHref), 600);
  }
}

async function onSubmit(): Promise<void> {
  if (loadingStatus.value || navigating) return;
  if (needsLocalLogin.value) {
    errorMessage.value = "此操作需要先登录本机管理员账号。";
    window.location.assign(loginHref);
    return;
  }
  loadingStatus.value = true;
  clearTimeout(statusTimer);
  errorMessage.value = "";
  try {
    const payload = (await activateLicense(email.value.trim(), activationCode.value.trim())).data;
    if (payload.status !== "ACTIVE" || !payload.editorAllowed) {
      throw new Error(
        payload.allowed || payload.editorAllowed
          ? payload.status === "ACTIVE"
            ? "激活成功，但当前商品未包含编辑器权益。"
            : "激活后授权仍未就绪，请点击重新激活或稍后再试。"
          : "激活后授权状态尚未生效，请稍后再试。",
      );
    }
    enterEditor();
  } catch (activateError) {
    errorMessage.value = licenseErrorMessage(activateError, "激活失败，请稍后重试。");
    if (isUnauthorizedError(activateError)) {
      window.setTimeout(() => window.location.assign(loginHref), 600);
    }
  } finally {
    loadingStatus.value = false;
    scheduleStatusPoll();
  }
}

/** 「重新激活」只是把表单交还给用户：真正的无码重激活入口在编辑器首页。 */
function onReactivate(): void {
  reactivateRequested = true;
  reactivateVisible.value = false;
  formVisible.value = true;
  void nextTick(() => emailInput.value?.focus());
}

/** 退出的是本机登录会话，不等于解绑商店授权。未登录时改为去登录页（带回激活页）。 */
async function onAccountAction(): Promise<void> {
  if (needsLocalLogin.value) {
    window.location.assign(loginHref);
    return;
  }
  await authStore.logout();
  window.location.replace(loginHref);
}

function onOnline(): void {
  void refreshStatus();
}
function onPageHide(): void {
  pageHidden = true;
  clearTimeout(statusTimer);
}
function onPageShow(): void {
  pageHidden = false;
  void refreshStatus();
}

onMounted(() => {
  window.addEventListener("online", onOnline);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
  void refreshStatus();
});

onBeforeUnmount(() => {
  navigating = true;
  clearTimeout(statusTimer);
  window.removeEventListener("online", onOnline);
  window.removeEventListener("pagehide", onPageHide);
  window.removeEventListener("pageshow", onPageShow);
});
</script>

<template>
<div class="hos-page hos-tone--eco">
    <SceneStage page="activate" />

        <main class="hos-dock">
            <section class="hos-panel hos-rise">
                <span class="hos-panel__edge" aria-hidden="true"></span>
                <span class="hos-panel__corner hos-panel__corner--tl" aria-hidden="true"></span>
                <span class="hos-panel__corner hos-panel__corner--tr" aria-hidden="true"></span>
                <span class="hos-panel__corner hos-panel__corner--bl" aria-hidden="true"></span>
                <span class="hos-panel__corner hos-panel__corner--br" aria-hidden="true"></span>

                <div class="hos-panel__head">
                    <div class="hos-eyebrow-row">
                        <p class="hos-eyebrow">授权激活 · 03/05</p>
                        <span class="hos-secure"><i class="hos-secure-dot" aria-hidden="true"></i>一机一码</span>
                    </div>
                    <h1>绑定这台机器</h1>
                    <p id="license-status-text" class="hos-panel__desc" :class="'hos-tone--' + statusTone">{{ statusText }}</p>
                    <!-- 提示条留在抬头块里：它说的是「当前授权状态要你做什么」，
                         与上面的状态句是同一件事的两句，隔开会被读成两件事。 -->
                    <p id="license-recovery-hint" class="hos-notice" :class="'hos-tone--' + statusTone" role="note"
                        v-show="recoveryHint">{{ recoveryHint }}</p>
                </div>

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

                <div class="hos-panel__copy">
                    <div class="hos-panel__meta">
                        <span>首次激活绑定本机指纹</span>
                        <i class="hos-panel__meta-sep" aria-hidden="true"></i>
                        <span>激活后自动进编辑器</span>
                    </div>
                    <button id="logout" class="hos-text-button" type="button" @click="onAccountAction">
                        {{ needsLocalLogin ? "登录本机账号" : "退出本机登录" }}
                    </button>
                </div>
            </section>
        </main>
    </div>

    <!-- 手持档开关：普通脚本（不导出、不 defer），必须在首帧前跑完给 <html> 挂 .hos-touch。 -->
</template>
