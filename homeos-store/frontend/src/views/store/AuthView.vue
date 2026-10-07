<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import SceneStage from "../../components/SceneStage.vue";
import DeckTiles from "../../components/DeckTiles.vue";
import PasswordField from "../../components/PasswordField.vue";
import { api } from "../../api/http.js";
import { errorMessage } from "../../store-types.js";
import { useSessionStore } from "../../stores/session.js";
import { useSiteStore } from "../../stores/site.js";
import { useStoreToast } from "../../stores/toast.js";
import { useCooldown } from "../../composables/useCooldown.js";
import { clearInvite, readInvite } from "../../utils/invite.js";

const props = defineProps<{ mode: string }>();
const router = useRouter();
const session = useSessionStore();
const site = useSiteStore();
const toast = useStoreToast();

const login = reactive({ account: "", password: "" });
const register = reactive({
  username: "",
  email: "",
  code: "",
  referralCode: "",
  password: "",
  confirmPassword: "",
});
const forget = reactive({ email: "", code: "", password: "", confirmPassword: "" });

const submitting = ref(false);
const mismatch = ref(false);
const errorText = ref("");
const registerCooldown = useCooldown();
const forgetCooldown = useCooldown();

const mode = computed(() => props.mode);

onMounted(async () => {
  await site.load();
  register.referralCode = readInvite();
});

watch(mode, () => {
  errorText.value = "";
  mismatch.value = false;
});

function validatePasswords(password: string, confirmation: string) {
  mismatch.value = Boolean(confirmation) && password !== confirmation;
  return !mismatch.value;
}

async function applyVerification(
  result: {
    resendAfter?: number;
    delivered?: boolean;
    deliveryError?: string;
    deliveryMode?: string;
  },
  cooldown: { start: (n: number) => void },
) {
  cooldown.start(Number(result.resendAfter) || 120);
  if (result.delivered === true) {
    toast.show("验证码已发送，请检查邮箱。");
    return;
  }
  if (result.deliveryError) {
    toast.show(result.deliveryError, "err");
    return;
  }
  toast.show(
    `验证码未能通过邮件发出（当前投递方式：${result.deliveryMode || "未知"}），请联系客服。`,
    "err",
  );
}

async function sendCode(purpose: "register" | "reset") {
  errorText.value = "";
  const target = purpose === "register" ? register : forget;
  const cooldown = purpose === "register" ? registerCooldown : forgetCooldown;
  const email = target.email.trim();
  if (!email) {
    errorText.value = "请先填写邮箱。";
    return;
  }
  try {
    const result = await api<{
      resendAfter?: number;
      delivered?: boolean;
      deliveryError?: string;
      deliveryMode?: string;
    }>("/verifications", { method: "POST", body: JSON.stringify({ email, purpose }) });
    await applyVerification(result, cooldown);
  } catch (error) {
    const err = error as { retryAfter?: number };
    if (err.retryAfter) cooldown.start(err.retryAfter);
    errorText.value = errorMessage(error);
  }
}

function afterAuth() {
  const target = session.hasPermanentLicense ? "/user/dashboard/index" : "/products";
  window.setTimeout(() => router.push(target), 350);
}

async function submitLogin() {
  errorText.value = "";
  submitting.value = true;
  try {
    await session.login(login.account, login.password);
    toast.show(
      session.hasPermanentLicense ? "登录成功，正在进入账号中心。" : "登录成功，正在进入购买页。",
    );
    afterAuth();
  } catch (error) {
    errorText.value = errorMessage(error);
  } finally {
    submitting.value = false;
  }
}

async function submitRegister() {
  errorText.value = "";
  if (!validatePasswords(register.password, register.confirmPassword)) return;
  submitting.value = true;
  try {
    const result = await session.register({
      username: register.username,
      email: register.email,
      code: register.code,
      password: register.password,
      confirmPassword: register.confirmPassword,
      referralCode: register.referralCode.trim() || null,
    });
    clearInvite();
    const note = (result as { referralNote?: string }).referralNote;
    toast.show(
      note
        ? `注册成功。${note}`
        : session.hasPermanentLicense
          ? "注册成功，正在进入账号中心。"
          : "注册成功，正在进入购买页。",
    );
    afterAuth();
  } catch (error) {
    errorText.value = errorMessage(error);
  } finally {
    submitting.value = false;
  }
}

async function submitForget() {
  errorText.value = "";
  if (!validatePasswords(forget.password, forget.confirmPassword)) return;
  submitting.value = true;
  try {
    await api("/auth/password/reset", {
      method: "POST",
      body: JSON.stringify({
        email: forget.email.trim(),
        code: forget.code.trim(),
        password: forget.password,
        confirmPassword: forget.confirmPassword,
      }),
    });
    toast.show("密码已重置，请重新登录。");
    window.setTimeout(() => router.push("/user/authentication/login"), 500);
  } catch (error) {
    errorText.value = errorMessage(error);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="hb-auth-stage hos-page hos-tone--accent">
    <SceneStage page="store" />

    <main class="hos-dock">
      <section v-if="mode === 'login'" class="hos-panel hos-rise" data-store-page="login">
        <span class="hos-panel__edge" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--tl" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--tr" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--bl" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--br" aria-hidden="true"></span>
        <div class="hos-panel__head">
          <div class="hos-eyebrow-row">
            <p class="hos-eyebrow">账号 · 01/03</p>
            <span class="hos-secure"><i class="hos-secure-dot" aria-hidden="true"></i>账号或邮箱登录</span>
          </div>
          <h1>登录后取回你的授权</h1>
          <p class="hos-panel__desc">
            用账号或邮箱登录均可。订单、激活码与设备绑定仍挂在注册邮箱下；换设备登录，购买记录跟人走。
          </p>
        </div>
        <DeckTiles page="store" />
        <form class="hos-form" @submit.prevent="submitLogin">
          <p v-if="errorText" class="hos-msg is-err" role="alert">{{ errorText }}</p>
          <div class="hos-field">
            <div class="hos-label-row"><label for="store-login-account">账号或邮箱</label></div>
            <div class="hos-control">
              <input
                id="store-login-account"
                v-model="login.account"
                inputmode="email"
                autocomplete="username"
                placeholder="账号或 name@example.com"
                required
              />
            </div>
          </div>
          <div class="hos-field">
            <div class="hos-label-row">
              <label for="store-login-password">密码</label>
              <RouterLink class="hos-hint" to="/user/authentication/forget">忘记密码？</RouterLink>
            </div>
            <PasswordField id="store-login-password" v-model="login.password" />
          </div>
          <div class="hos-actions">
            <button class="hos-btn-primary" type="submit" :disabled="submitting">
              {{ submitting ? "登录中…" : "登录" }}
            </button>
          </div>
        </form>
        <p class="hos-switch">还没有账号？<RouterLink to="/user/authentication/register">立即注册</RouterLink></p>
        <div class="hos-panel__copy">
          <div class="hos-panel__meta">
            <span>登录态失效可重登</span>
            <i class="hos-panel__meta-sep" aria-hidden="true"></i>
            <span>已授权设备不因重登解绑</span>
          </div>
          <p>换浏览器只是重新登录一次，激活码与已绑定的设备仍挂在账号上。</p>
        </div>
      </section>

      <section v-else-if="mode === 'forget'" class="hos-panel hos-rise" data-store-page="forget">
        <span class="hos-panel__edge" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--tl" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--tr" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--bl" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--br" aria-hidden="true"></span>
        <div class="hos-panel__head">
          <div class="hos-eyebrow-row">
            <p class="hos-eyebrow">账号 · 02/03</p>
            <span class="hos-secure"><i class="hos-secure-dot" aria-hidden="true"></i>验证码发到邮箱</span>
          </div>
          <h1>换一个能记住的密码</h1>
          <p class="hos-panel__desc">验证码只会发送到已注册的邮箱，重置成功后请用新密码重新登录。</p>
        </div>
        <DeckTiles page="store" />
        <form class="hos-form" @submit.prevent="submitForget">
          <p v-if="errorText" class="hos-msg is-err" role="alert">{{ errorText }}</p>
          <div class="hos-field">
            <div class="hos-label-row"><label for="store-forget-email">注册邮箱</label></div>
            <div class="hos-control">
              <input id="store-forget-email" v-model="forget.email" type="email" autocomplete="email" placeholder="name@example.com" required />
            </div>
          </div>
          <div class="hos-row-2">
            <div class="hos-field">
              <div class="hos-label-row"><label for="store-forget-code">邮箱验证码</label></div>
              <div class="hos-control">
                <input id="store-forget-code" v-model="forget.code" type="text" inputmode="numeric" maxlength="6" placeholder="6 位验证码" required />
              </div>
            </div>
            <div class="hos-field hos-field--action">
              <div class="hos-label-row" aria-hidden="true">&nbsp;</div>
              <button type="button" class="hos-btn-ghost" :disabled="forgetCooldown.seconds.value > 0" @click="sendCode('reset')">
                {{ forgetCooldown.seconds.value > 0 ? `${forgetCooldown.seconds.value} 秒后重发` : "获取验证码" }}
              </button>
            </div>
          </div>
          <div class="hos-row-2">
            <div class="hos-field">
              <div class="hos-label-row"><label for="store-forget-password">新密码</label></div>
              <PasswordField id="store-forget-password" v-model="forget.password" autocomplete="new-password" placeholder="至少 8 位" :minlength="8" />
            </div>
            <div class="hos-field">
              <div class="hos-label-row"><label for="store-forget-confirm">确认新密码</label></div>
              <PasswordField id="store-forget-confirm" v-model="forget.confirmPassword" autocomplete="new-password" placeholder="请再次输入密码" :minlength="8" />
            </div>
          </div>
          <p v-if="mismatch" class="hos-msg is-err" role="alert">两次输入的密码不一致。</p>
          <div class="hos-actions">
            <button class="hos-btn-primary" type="submit" :disabled="submitting">
              {{ submitting ? "重置中…" : "重置密码" }}
            </button>
          </div>
        </form>
        <p class="hos-switch"><RouterLink to="/user/authentication/login">返回登录</RouterLink></p>
        <div class="hos-panel__copy">
          <div class="hos-panel__meta">
            <span>验证码有时效</span>
            <i class="hos-panel__meta-sep" aria-hidden="true"></i>
            <span>新密码至少 8 位</span>
            <i class="hos-panel__meta-sep" aria-hidden="true"></i>
            <span>不影响已授权设备</span>
          </div>
          <p>已登录客户端的授权不受密码重置影响。</p>
        </div>
      </section>

      <section v-else class="hos-panel hos-rise" data-store-page="register">
        <span class="hos-panel__edge" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--tl" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--tr" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--bl" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--br" aria-hidden="true"></span>
        <div class="hos-panel__head">
          <div class="hos-eyebrow-row">
            <p class="hos-eyebrow">账号 · 03/03</p>
            <span class="hos-secure"><i class="hos-secure-dot" aria-hidden="true"></i>账号 + 邮箱验证</span>
          </div>
          <h1>开一个订单跟着你的账号</h1>
          <p class="hos-panel__desc">
            账号用于登录，邮箱用于购买与发码；验证通过后即可下单。
          </p>
        </div>
        <DeckTiles page="store" />
        <form class="hos-form" @submit.prevent="submitRegister">
          <p v-if="errorText" class="hos-msg is-err" role="alert">{{ errorText }}</p>
          <div class="hos-row-id">
            <div class="hos-field">
              <div class="hos-label-row"><label for="store-register-username">账号</label></div>
              <div class="hos-control">
                <input
                  id="store-register-username"
                  v-model="register.username"
                  autocomplete="username"
                  placeholder="登录用账号"
                  minlength="3"
                  maxlength="64"
                  pattern="[^@\s]{3,64}"
                  title="账号至少 3 位，不能包含 @ 或空格（@ 保留给邮箱登录）"
                  required
                />
              </div>
            </div>
            <div class="hos-field">
              <div class="hos-label-row"><label for="store-register-email">邮箱</label></div>
              <div class="hos-control">
                <input id="store-register-email" v-model="register.email" type="email" autocomplete="email" placeholder="name@example.com" required />
              </div>
            </div>
            <div class="hos-field hos-field--action">
              <div class="hos-label-row" aria-hidden="true">&nbsp;</div>
              <button type="button" class="hos-btn-ghost" :disabled="registerCooldown.seconds.value > 0" @click="sendCode('register')">
                {{ registerCooldown.seconds.value > 0 ? `${registerCooldown.seconds.value} 秒后重发` : "获取验证码" }}
              </button>
            </div>
          </div>
          <div class="hos-row-2">
            <div class="hos-field">
              <div class="hos-label-row"><label for="store-register-code">邮箱验证码</label></div>
              <div class="hos-control">
                <input id="store-register-code" v-model="register.code" type="text" inputmode="numeric" maxlength="6" placeholder="6 位验证码" required />
              </div>
            </div>
            <div class="hos-field">
              <div class="hos-label-row">
                <label for="store-register-referral">邀请码（选填）</label>
                <span class="hos-hint">仅邀请绑定 · 无折扣</span>
              </div>
              <div class="hos-control">
                <input id="store-register-referral" v-model="register.referralCode" type="text" maxlength="8" pattern="[0-9]{6}|[0-9A-Za-z]{8}" placeholder="6 位数字 / 8 位邀请码" />
              </div>
            </div>
          </div>
          <div class="hos-row-2">
            <div class="hos-field">
              <div class="hos-label-row"><label for="store-register-password">密码</label></div>
              <PasswordField id="store-register-password" v-model="register.password" autocomplete="new-password" placeholder="至少 8 位" :minlength="8" />
            </div>
            <div class="hos-field">
              <div class="hos-label-row"><label for="store-register-confirm">确认密码</label></div>
              <PasswordField id="store-register-confirm" v-model="register.confirmPassword" autocomplete="new-password" placeholder="请再次输入密码" :minlength="8" />
            </div>
          </div>
          <p v-if="mismatch" class="hos-msg is-err" role="alert">两次输入的密码不一致。</p>
          <div class="hos-actions">
            <button class="hos-btn-primary" type="submit" :disabled="submitting">
              {{ submitting ? "注册中…" : "注册" }}
            </button>
          </div>
        </form>
        <p class="hos-switch">已有账号？<RouterLink to="/user/authentication/login">立即登录</RouterLink></p>
        <div class="hos-panel__copy">
          <div class="hos-panel__meta">
            <span>账号用于登录</span>
            <i class="hos-panel__meta-sep" aria-hidden="true"></i>
            <span>邮箱用于购买与发码</span>
            <i class="hos-panel__meta-sep" aria-hidden="true"></i>
            <span>邀请码选填</span>
          </div>
          <p>账号创建后即可下单，激活码会进入账号中心。</p>
        </div>
      </section>
    </main>
  </div>
</template>
