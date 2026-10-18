<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import SceneStage from "@store/shared/components/SceneStage.vue";
import DeckTiles from "@store/shared/components/DeckTiles.vue";
import PasswordField from "@homeos/shared/components/PasswordField.vue";
import { api } from "@store/shared/api/http";
import { retryAfterSeconds } from "@store/shared/api/error";
import { errorMessage } from "@store/shared/types/store";
import { useSessionStore } from "@store/shared/stores/session";
import { useSiteStore } from "@store/shared/stores/site";
import { useStoreToast } from "@store/shared/stores/toast";
import { useCooldown } from "@store/features/storefront/composables/useCooldown";
import { clearInvite, readInvite } from "@store/features/storefront/utils/invite";
import { isPasswordPolicyCompliant, PASSWORD_POLICY_MESSAGE } from "@store/shared/utils/password";

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

/**
 * 账号访问的三步：编号只在这条轨道里出现一次。
 *
 * 改造前三页各自手写「账号 · 01/03」「账号 · 02/03」「账号 · 03/03」，而「找回密码」占掉了
 * 登录的下一号，注册反而是最后一步 —— 但注册才是新客户的第一个动作。现在注册与登录并列为
 * 入口，找回密码作为登录的兜底排在最后，编号与语义对齐；视觉来自 scene/panel.css 的
 * .hos-steps（与主应用认证页同一套轨道）。
 */
const AUTH_FLOW_STEPS = [
  { key: "login", label: "登录" },
  { key: "register", label: "注册" },
  { key: "forget", label: "找回密码" },
] as const;

const stepList = computed(() => {
  const activeIndex = AUTH_FLOW_STEPS.findIndex((step) => step.key === mode.value);
  return AUTH_FLOW_STEPS.map((step, index) => ({
    key: step.key,
    label: step.label,
    ordinal: String(index + 1).padStart(2, "0"),
    state: index === activeIndex ? "current" : index < activeIndex ? "done" : "todo",
  }));
});

/**
 * 三页共用一套坞体（描边、四角、开通轨、抬头），只有表单不同 —— 抬头文案随模式取。
 * 文案与改造前逐字一致，只是从模板搬进数据里，省掉三份重复的面板骨架。
 */
const PANEL_COPY = {
  login: {
    eyebrow: "登录",
    secure: "账号或邮箱登录",
    title: "登录后取回你的授权",
    desc: "用账号或邮箱登录均可。订单、激活码与设备绑定仍挂在注册邮箱下；换设备登录，购买记录跟人走。",
  },
  register: {
    eyebrow: "注册",
    secure: "账号 + 邮箱验证",
    title: "开一个订单跟着你的账号",
    desc: "账号用于登录，邮箱用于购买与发码；验证通过后即可下单。",
  },
  forget: {
    eyebrow: "找回密码",
    secure: "验证码发到邮箱",
    title: "换一个能记住的密码",
    desc: "验证码只会发送到已注册的邮箱，重置成功后请用新密码重新登录。",
  },
} as const;

const panelCopy = computed(() => {
  const current = mode.value;
  if (current === "forget") return PANEL_COPY.forget;
  if (current === "register") return PANEL_COPY.register;
  return PANEL_COPY.login;
});

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
  if (!isPasswordPolicyCompliant(password)) {
    errorText.value = PASSWORD_POLICY_MESSAGE;
    return false;
  }
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
    // 等待时间由 `api-error` 统一解析（`errorMessage` 也会把它拼进提示语），
    // 这里额外读一次是为了让发送按钮就地进入冷却，而不是让用户反复点。
    const wait = retryAfterSeconds(error);
    if (wait) cooldown.start(wait);
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
      <!-- 单一坞体：描边 / 四角 / 开通轨 / 抬头只写一次，表单按 mode 切换（改造前是三个
           section 块各写一遍同样的外壳）。:key="mode" 让切换重建元素，hos-rise 入场动画
           才会重放；:data-store-page 仍随页写出（页面样式与文档约定依赖它）。 -->
      <section :key="mode" class="hos-panel hos-rise" :data-store-page="mode">
        <span class="hos-panel__edge" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--tl" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--tr" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--bl" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--br" aria-hidden="true"></span>

        <!-- 开通轨放在抬头之上（.hos-panel > .hos-steps 自带一条分隔底边）。
             读屏听到的是「第 N 步」，而不是「账号 · 02/03」这种裸数字。 -->
        <ol class="hos-steps" aria-label="账号访问进度">
          <li
            v-for="step in stepList"
            :key="step.key"
            class="hos-steps__item"
            :class="`is-${step.state}`"
            :aria-current="step.state === 'current' ? 'step' : undefined"
          >
            <i class="hos-steps__dot" aria-hidden="true"></i>
            <span>{{ step.ordinal }} {{ step.label }}</span>
          </li>
        </ol>

        <div class="hos-panel__head">
          <div class="hos-eyebrow-row">
            <p class="hos-eyebrow">{{ panelCopy.eyebrow }}</p>
            <span class="hos-secure">
              <i class="hos-secure-dot" aria-hidden="true"></i>{{ panelCopy.secure }}
            </span>
          </div>
          <h1>{{ panelCopy.title }}</h1>
          <p class="hos-panel__desc">{{ panelCopy.desc }}</p>
        </div>

        <DeckTiles page="store" />

        <template v-if="mode === 'login'">
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
                  placeholder="账号或邮箱"
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
        </template>

        <template v-else-if="mode === 'forget'">
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
                <PasswordField id="store-forget-password" v-model="forget.password" autocomplete="new-password" placeholder="至少 8 位，含字母与数字" :minlength="8" />
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
              <span>新密码至少 8 位，含字母与数字</span>
              <i class="hos-panel__meta-sep" aria-hidden="true"></i>
              <span>不影响已授权设备</span>
            </div>
            <p>已登录客户端的授权不受密码重置影响。</p>
          </div>
        </template>

        <template v-else>
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
                <PasswordField id="store-register-password" v-model="register.password" autocomplete="new-password" placeholder="至少 8 位，含字母与数字" :minlength="8" />
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
        </template>
      </section>
    </main>
  </div>
</template>
