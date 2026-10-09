<script setup lang="ts">
import { onMounted, ref } from "vue";
import SceneStage from "../components/SceneStage.vue";
import DeckTiles from "../components/DeckTiles.vue";
import PasswordField from "../components/PasswordField.vue";
import { fromResponse } from "../api-error.js";

const email = ref("");
const password = ref("");
const confirmPassword = ref("");
const setupToken = ref("");
const errorText = ref("");
const submitting = ref(false);
const showRedirect = ref(false);

function tokenFromFragment() {
  const match = /(?:^|[#&])token=([^&]+)/.exec(location.hash || "");
  if (!match) return "";
  try {
    return decodeURIComponent(match[1] ?? "").trim();
  } catch {
    return "";
  }
}

onMounted(async () => {
  const fragmentToken = tokenFromFragment();
  if (fragmentToken) {
    setupToken.value = fragmentToken;
    try {
      history.replaceState(null, "", location.pathname + location.search);
    } catch {
      /* 忽略。 */
    }
  }
  try {
    const response = await fetch("/store/v1/setup/status", {
      method: "GET",
      credentials: "same-origin",
      headers: fragmentToken ? { "X-Setup-Token": fragmentToken } : {},
    });
    const data = (await response.json()) as { initialized?: boolean };
    if (data?.initialized && fragmentToken) {
      showRedirect.value = true;
      window.setTimeout(() => {
        window.location.assign("/admin");
      }, 1500);
    }
  } catch {
    /* 状态读取失败时仍允许尝试初始化。 */
  }
});

function showError(message: string) {
  errorText.value = message;
}

async function submit() {
  errorText.value = "";
  const trimmedEmail = email.value.trim();
  if (!trimmedEmail) {
    showError("请输入管理员邮箱。");
    return;
  }
  if (password.value.length < 8) {
    showError("密码至少需要 8 位。");
    return;
  }
  if (password.value !== confirmPassword.value) {
    showError("两次输入的密码不一致。");
    return;
  }
  submitting.value = true;
  try {
    const response = await fetch("/store/v1/setup/admin", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: trimmedEmail,
        password: password.value,
        confirm_password: confirmPassword.value,
        setup_token: setupToken.value.trim(),
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (response.status === 201) {
      window.location.assign("/admin");
      return;
    }
    if (response.status === 409) {
      showRedirect.value = true;
      window.setTimeout(() => {
        window.location.assign("/admin");
      }, 1500);
      return;
    }
    showError(fromResponse(response, body, "初始化失败，请重试。").message);
    submitting.value = false;
  } catch {
    showError("网络错误，请重试。");
    submitting.value = false;
  }
}
</script>

<template>
  <div class="hb-page-shell hos-page hos-tone--lumen">
    <SceneStage page="setup" />

    <main class="hos-dock">
      <section v-if="!showRedirect" class="hos-panel hos-rise">
        <span class="hos-panel__edge" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--tl" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--tr" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--bl" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--br" aria-hidden="true"></span>
        <div class="hos-panel__head">
          <div class="hos-eyebrow-row">
            <p class="hos-eyebrow">本机初始化 · 01/01</p>
            <span class="hos-secure"><i class="hos-secure-dot" aria-hidden="true"></i>仅无管理员时可用</span>
          </div>
          <h1>给这套授权服务开一个管理员</h1>
          <p class="hos-panel__desc">
            这是商店首次启动后的唯一一次初始化：设置管理员邮箱与密码，创建后自动登录后台，本页随即关闭。
          </p>
        </div>
        <DeckTiles page="setup" />
        <form class="hos-form" autocomplete="off" @submit.prevent="submit">
          <div class="hos-field">
            <div class="hos-label-row"><label for="email">管理员邮箱</label></div>
            <div class="hos-control">
              <input id="email" v-model="email" type="email" placeholder="admin@example.com" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" required />
            </div>
          </div>
          <div class="hos-row-2">
            <div class="hos-field">
              <div class="hos-label-row"><label for="password">密码</label></div>
              <PasswordField id="password" v-model="password" placeholder="至少 8 位" autocomplete="new-password" :minlength="8" />
            </div>
            <div class="hos-field">
              <div class="hos-label-row"><label for="confirm-password">确认密码</label></div>
              <PasswordField id="confirm-password" v-model="confirmPassword" placeholder="再次输入密码" autocomplete="new-password" :minlength="8" />
            </div>
          </div>
          <div class="hos-field">
            <div class="hos-label-row">
              <label for="setup-token">引导密钥</label>
              <span class="hos-hint">本机访问无需填写 · STORE_SETUP_TOKEN</span>
            </div>
            <div class="hos-control">
              <input id="setup-token" v-model="setupToken" type="text" placeholder="从服务启动日志中查找" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" />
            </div>
          </div>
          <p v-if="errorText" class="hos-msg is-err" role="alert">{{ errorText }}</p>
          <div class="hos-actions">
            <button class="hos-btn-primary" type="submit" :disabled="submitting">
              {{ submitting ? "正在创建…" : "创建管理员" }}
            </button>
          </div>
        </form>
        <div class="hos-panel__copy">
          <div class="hos-panel__meta">
            <span>仅首启可用</span>
            <i class="hos-panel__meta-sep" aria-hidden="true"></i>
            <span>远程需引导密钥</span>
            <i class="hos-panel__meta-sep" aria-hidden="true"></i>
            <span>建议走 HTTPS</span>
          </div>
          <p>初始化后本页会自动跳转，请妥善保管管理员密码。</p>
        </div>
      </section>

      <section v-else class="hos-panel hos-rise">
        <span class="hos-panel__edge" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--tl" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--tr" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--bl" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--br" aria-hidden="true"></span>
        <div class="hos-panel__head">
          <div class="hos-eyebrow-row">
            <p class="hos-eyebrow">Already Set Up</p>
            <span class="hos-secure"><i class="hos-secure-dot" aria-hidden="true"></i>无需重复初始化</span>
          </div>
          <h1>管理员已经在了</h1>
          <p class="hos-panel__desc">商店已完成初始化，正在跳转到管理员登录页…</p>
        </div>
        <DeckTiles page="setup" />
        <div class="hos-actions">
          <RouterLink class="hos-btn-primary" to="/admin">前往管理员登录</RouterLink>
        </div>
        <div class="hos-panel__copy">
          <div class="hos-panel__meta">
            <span>已完成初始化</span>
            <i class="hos-panel__meta-sep" aria-hidden="true"></i>
            <span>创建入口已关闭</span>
            <i class="hos-panel__meta-sep" aria-hidden="true"></i>
            <span>如需重置请清空数据</span>
          </div>
          <p>若这不是你的预期，说明该部署已有人完成初始化。</p>
        </div>
      </section>
    </main>
  </div>
</template>
