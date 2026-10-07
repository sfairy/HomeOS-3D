<script setup lang="ts">
/**
 * 授权恢复页（单 HTTP 栈）。
 *
 * 每 5 秒自检一次授权可用性；用户点「重新连接」时先走一次 `/license/retry` 再读可用性。
 * 该页也被 `/pair`、`/display/*`、`/3d-studio` 的授权门禁就地复用，因此不假设自身地址。
 */
import { onBeforeUnmount, onMounted, ref } from "vue";

import {
  getLicenseAvailability,
  licenseErrorRetryable,
  licenseErrorMessage,
  licenseMessage,
  retryLicense,
} from "@/services/api/license";
import SceneStage from "@/studio/components/SceneStage.vue";

/** 与页脚「每 5 秒自检」对齐；改动这里要同步改文案。 */
const RECHECK_INTERVAL_MS = 5000;

const statusText = ref("正在读取授权状态…");
const errorMessage = ref("");
const tone = ref<"eco" | "lumen" | "alert">("lumen");
const retryVisible = ref(true);
const retryDisabled = ref(false);

/** 已在跳转途中或已卸载：停止排期，避免旧文档里空转。 */
let done = false;
let inFlight = false;
let recheckTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * 查一次授权可用性。
 * @param manual 为 true 时先显式触发 `/license/retry` 再读可用性
 */
async function check(manual = false): Promise<void> {
  if (inFlight || done) return;
  clearTimeout(recheckTimer);
  inFlight = true;
  if (manual) {
    retryDisabled.value = true;
    statusText.value = "正在重新连接授权后台…";
  }
  try {
    if (manual) await retryLicense();
    const latestState = (await getLicenseAvailability()).data;
    errorMessage.value = "";
    if (latestState.displayAllowed) {
      done = true;
      statusText.value = "授权已恢复，正在进入…";
      tone.value = "eco";
      retryVisible.value = false;
      window.setTimeout(() => window.location.reload(), 600);
      return;
    }
    statusText.value = licenseMessage(latestState);
    tone.value = latestState.status === "INSTANCE_MISMATCH" ? "alert" : "lumen";
    retryVisible.value = Boolean(latestState.canRetry);
  } catch (checkError) {
    errorMessage.value = licenseErrorMessage(
      checkError,
      "暂时连接不到 HomeOS 服务，请检查网络；网络恢复后会自动检查。",
    );
    tone.value = "alert";
    // 后端明确说「重试无意义」时才收起按钮。
    retryVisible.value = licenseErrorRetryable(checkError) !== false;
  } finally {
    inFlight = false;
    retryDisabled.value = false;
    if (!done) recheckTimer = setTimeout(() => void check(), RECHECK_INTERVAL_MS);
  }
}

function onOnline(): void {
  void check();
}
function onPageHide(): void {
  done = true;
  clearTimeout(recheckTimer);
}
function onPageShow(): void {
  done = false;
  void check();
}

onMounted(() => {
  window.addEventListener("online", onOnline);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
  void check();
});

onBeforeUnmount(() => {
  done = true;
  clearTimeout(recheckTimer);
  window.removeEventListener("online", onOnline);
  window.removeEventListener("pagehide", onPageHide);
  window.removeEventListener("pageshow", onPageShow);
});
</script>

<template>
<div class="hos-page hos-tone--alert">
    <SceneStage page="recovery" />

        <main class="hos-dock">
            <section class="hos-panel hos-rise" id="license-recovery">
                <span class="hos-panel__edge" aria-hidden="true"></span>
                <span class="hos-panel__corner hos-panel__corner--tl" aria-hidden="true"></span>
                <span class="hos-panel__corner hos-panel__corner--tr" aria-hidden="true"></span>
                <span class="hos-panel__corner hos-panel__corner--bl" aria-hidden="true"></span>
                <span class="hos-panel__corner hos-panel__corner--br" aria-hidden="true"></span>

                <div class="hos-panel__head">
                    <div class="hos-eyebrow-row">
                        <p class="hos-eyebrow">授权受阻 · 03/05</p>
                        <!-- 这颗点是恒绿的「机制在跑」，不跟页面色调走：在珊瑚色的恢复页上，
                             「自动重连中」会被读成「一切正常」，而这页恰恰是「进不去」。 -->
                        <span class="hos-secure"><i class="hos-secure-dot" aria-hidden="true"></i>每 5 秒自检</span>
                    </div>
                    <h1>正在连接你的家</h1>
                    <p id="recovery-message" class="hos-status" :class="'hos-tone--' + tone" role="status"
                        aria-live="polite">{{ statusText }}</p>
                    <!-- 错误单独一行、单独 role=alert：与「现在处于什么状态」分开报。合成一行时，
                         一次网络抖动会把状态句覆盖掉，用户就看不到后端其实说了什么。 -->
                    <p v-if="errorMessage" id="recovery-error" class="hos-msg is-err" role="alert">{{ errorMessage }}</p>
                </div>

                <div class="hos-actions">
                    <button id="recovery-retry" class="hos-btn-primary" type="button" v-show="retryVisible"
                        :disabled="retryDisabled" @click="check(true)">重新连接授权后台</button>
                </div>

                <div class="hos-panel__copy">
                    <div class="hos-panel__meta">
                        <span>项目与连接信息不清除</span>
                        <i class="hos-panel__meta-sep" aria-hidden="true"></i>
                        <span>租约内照常可用</span>
                    </div>
                    <p>已有项目和连接信息不会被清除。</p>
                    <a class="hos-text-button" href="/license">本机重新激活</a>
                </div>
            </section>
        </main>
    </div>

    <!-- 手持档开关：普通脚本（不导出、不 defer），必须在首帧前跑完给 <html> 挂 .hos-touch。 -->
</template>
