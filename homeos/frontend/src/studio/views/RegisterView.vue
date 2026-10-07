<script setup lang="ts">
/**
 * 注册页（首次部署唯一账号）：账号 + 密码 + 确认密码 + 邮箱 + 邮箱验证码。
 *
 * 验证码由授权商店代发代验（后端 `/auth/verification` → `/auth/register`）；
 * 注册成功后服务端直接建立登录会话，这里整页跳转让所有 store 按新身份初始化。
 * 版式与商店注册页一致（SceneStage + hos-panel）。
 */
import { computed, onBeforeUnmount, ref } from "vue";

import SceneStage from "@/studio/components/SceneStage.vue";
import PasswordField from "@/studio/components/PasswordField.vue";
import { useAuthStore } from "@/stores/auth.store";
import { useChromeStore } from "@/stores/chrome.store";
import { getApiErrorMessage } from "@/utils/core/error-message";

const authStore = useAuthStore();
const chrome = useChromeStore();

const username = ref("");
const email = ref("");
const code = ref("");
const password = ref("");
const passwordConfirmation = ref("");
const submitting = ref(false);
const sending = ref(false);
const errorMessage = ref("");
const mismatch = computed(() => Boolean(passwordConfirmation.value) && password.value !== passwordConfirmation.value);

/** 发码倒计时（秒）；商店会返回 resendAfter，缺省 120 秒。 */
const cooldown = ref(0);
let cooldownTimer: number | undefined;

function startCooldown(seconds: number): void {
  cooldown.value = Math.max(1, Math.floor(seconds) || 120);
  window.clearInterval(cooldownTimer);
  cooldownTimer = window.setInterval(() => {
    cooldown.value -= 1;
    if (cooldown.value <= 0) window.clearInterval(cooldownTimer);
  }, 1000);
}

onBeforeUnmount(() => window.clearInterval(cooldownTimer));

async function onSendCode(): Promise<void> {
  if (sending.value || cooldown.value > 0) return;
  errorMessage.value = "";
  const target = email.value.trim();
  if (!target) {
    errorMessage.value = "请先填写邮箱。";
    return;
  }
  sending.value = true;
  try {
    const result = await authStore.sendVerificationCode(target);
    startCooldown(Number(result.resendAfter) || 120);
    chrome.notify(result.delivered === false ? "验证码已生成，但邮件投递失败，请联系客服。" : "验证码已发送，请检查邮箱。", result.delivered === false ? "warning" : "success");
  } catch (caughtError) {
    errorMessage.value = getApiErrorMessage(caughtError, "验证码发送失败。");
  } finally {
    sending.value = false;
  }
}

async function onSubmit(): Promise<void> {
  if (submitting.value) return;
  errorMessage.value = "";
  if (mismatch.value) {
    errorMessage.value = "两次输入的密码不一致。";
    return;
  }
  submitting.value = true;
  try {
    await authStore.register({
      username: username.value.trim(),
      email: email.value.trim(),
      code: code.value.trim(),
      password: password.value,
      passwordConfirmation: passwordConfirmation.value,
    });
    window.location.assign("/");
  } catch (caughtError) {
    errorMessage.value = getApiErrorMessage(caughtError, "注册失败。");
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="hos-page hos-tone--accent">
    <SceneStage page="register" />

    <main class="hos-dock">
      <section class="hos-panel hos-rise">
        <span class="hos-panel__edge" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--tl" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--tr" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--bl" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--br" aria-hidden="true"></span>

        <div class="hos-panel__head">
          <div class="hos-eyebrow-row">
            <p class="hos-eyebrow">注册 · 01/03</p>
            <span class="hos-secure"><i class="hos-secure-dot" aria-hidden="true"></i>账号 + 邮箱验证</span>
          </div>
          <h1>创建这台机器的唯一账号</h1>
          <p class="hos-panel__desc">
            账号用于登录，邮箱收验证码；之后填「账号或邮箱」任一个都能进。注册完成后本入口即关闭。
          </p>
        </div>

        <form id="register-form" class="hos-form" @submit.prevent="onSubmit">
          <p v-if="errorMessage" id="message" class="hos-msg is-err" role="alert">{{ errorMessage }}</p>

          <div class="hos-row-id">
            <div class="hos-field">
              <div class="hos-label-row"><label for="register-username">账号</label></div>
              <div class="hos-control">
                <input id="register-username" name="username" v-model="username" :disabled="submitting"
                  placeholder="登录用账号" autocomplete="username" minlength="3" maxlength="64"
                  pattern="[^@\s]{3,64}" title="账号至少 3 位，不能包含 @ 或空格（@ 保留给邮箱登录）" required>
              </div>
            </div>
            <div class="hos-field">
              <div class="hos-label-row"><label for="register-email">邮箱</label></div>
              <div class="hos-control">
                <input id="register-email" name="email" v-model="email" :disabled="submitting"
                  type="email" placeholder="name@example.com" autocomplete="email" required>
              </div>
            </div>
            <div class="hos-field hos-field--action">
              <div class="hos-label-row" aria-hidden="true">&nbsp;</div>
              <button type="button" class="hos-btn-ghost" :disabled="sending || cooldown > 0" @click="onSendCode">
                {{ cooldown > 0 ? `${cooldown} 秒后重发` : sending ? "发送中…" : "获取验证码" }}
              </button>
            </div>
          </div>

          <div class="hos-field">
            <div class="hos-label-row"><label for="register-code">邮箱验证码</label></div>
            <div class="hos-control">
              <input id="register-code" name="code" v-model="code" :disabled="submitting"
                type="text" inputmode="numeric" maxlength="12" placeholder="邮箱收到的验证码" autocomplete="one-time-code" required>
            </div>
          </div>

          <div class="hos-row-2">
            <div class="hos-field">
              <div class="hos-label-row"><label for="register-password">密码</label></div>
              <PasswordField id="register-password" v-model="password" autocomplete="new-password"
                placeholder="至少 8 位，含字母与数字" :minlength="8" />
            </div>
            <div class="hos-field">
              <div class="hos-label-row"><label for="register-confirm">确认密码</label></div>
              <PasswordField id="register-confirm" v-model="passwordConfirmation" autocomplete="new-password"
                placeholder="请再次输入密码" :minlength="8" />
            </div>
          </div>

          <p v-if="mismatch" class="hos-msg is-err" role="alert">两次输入的密码不一致。</p>

          <div class="hos-actions">
            <button class="hos-btn-primary" type="submit" :disabled="submitting">
              {{ submitting ? "注册中…" : "注册并登录" }}
            </button>
          </div>
        </form>

        <div class="hos-panel__copy">
          <div class="hos-panel__meta">
            <span>本机唯一账号</span>
            <i class="hos-panel__meta-sep" aria-hidden="true"></i>
            <span>密码至少 8 位</span>
            <i class="hos-panel__meta-sep" aria-hidden="true"></i>
            <span>注册后进入授权检测</span>
          </div>
          <p>忘记口令时可由管理员按文档删除本机用户行后重新注册。</p>
        </div>
      </section>
    </main>
  </div>
</template>
