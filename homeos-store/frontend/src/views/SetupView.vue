<script setup lang="ts">
import { onMounted, ref } from "vue";
import SceneStage from "@store/shared/components/SceneStage.vue";
import DeckTiles from "@store/shared/components/DeckTiles.vue";
import PasswordField from "@homeos/shared/components/PasswordField.vue";
import { fromResponse } from "@store/shared/api/error";
import { isPasswordPolicyCompliant, PASSWORD_POLICY_MESSAGE } from "@store/shared/utils/password";
import { sessionPersisted } from "@store/shared/stores/session";
import { reportBestEffort, runBestEffort } from "@store/shared/utils/best-effort";

const username = ref("");
const email = ref("");
const password = ref("");
const confirmPassword = ref("");
const setupToken = ref("");
const errorText = ref("");
const submitting = ref(false);
const showRedirect = ref(false);
/**
 * 管理员已创建，但浏览器把登录 Cookie 丢了（典型：浏览器策略，或商店在明文入口上下发了
 * 带 Secure 的 Cookie —— 例如 STORE_COOKIE_SECURE 写死成 true）。此时再跳 `/admin`
 * 只会看到登录屏，用户会以为初始化失败 —— 单独一屏说明。
 */
const sessionLost = ref(false);
/**
 * 初始化状态的三态判定（由服务端 /setup/status 给出，不再由前端猜）：
 * - checking：还在问服务端；
 * - open：库中没有管理员，可以初始化（requiresToken 表示这次访问是否必须带引导密钥）；
 * - initialized：已有管理员，本页只负责跳转；
 * - unreachable：状态都没读到（服务未起 / 装配异常返回 503），照实说明而不是假装可初始化。
 */
type SetupState = "checking" | "open" | "initialized" | "unreachable";
type SetupStatus = {
  initialized?: boolean;
  canInitialize?: boolean;
  requiresSetupToken?: boolean;
  setupTokenHint?: string;
  detail?: string;
};
const state = ref<SetupState>("checking");
const requiresToken = ref(false);
const statusHint = ref("");
const statusError = ref("");

function tokenFromFragment() {
  const match = /(?:^|[#&])token=([^&]+)/.exec(location.hash || "");
  if (!match) return "";
  try {
    return decodeURIComponent(match[1] ?? "").trim();
  } catch (error) {
    // 片段里的 token 被手工改坏（非法 % 转义）时会抛。可降级：当作没带 token，
    // 用户仍可手填。留痕以便区分「没带 token」与「token 坏了」。
    reportBestEffort("解析引导密钥片段", error);
    return "";
  }
}

onMounted(async () => {
  const fragmentToken = tokenFromFragment();
  if (fragmentToken) {
    setupToken.value = fragmentToken;
    // 把 token 从地址栏抹掉（避免留在历史/截图里）。可降级：抹不掉不影响初始化。
    runBestEffort("清理地址栏中的引导密钥", () => {
      history.replaceState(null, "", location.pathname + location.search);
    });
  }
  try {
    const response = await fetch("/store/v1/setup/status", {
      method: "GET",
      credentials: "same-origin",
      headers: fragmentToken ? { "X-Setup-Token": fragmentToken } : {},
    });
    const data = (await response.json().catch(() => ({}))) as SetupStatus;
    if (!response.ok) {
      // 服务端暂不能给状态（如 503 装配异常）：既不能装作可初始化，更不能谎报已初始化。
      state.value = "unreachable";
      statusError.value = fromResponse(response, data, "无法读取初始化状态，请确认商店服务已启动。").message;
      return;
    }
    // 已有管理员：这一页从此刻起**不再提供创建入口**（服务端 `/setup` 本身也已经 302 到
    // `/admin`，这里兜住「客户端直接进 SPA 路由」与「页面已渲染后才完成初始化」两种情形）。
    if (data?.initialized) {
      state.value = "initialized";
      showRedirect.value = true;
      window.setTimeout(() => {
        window.location.replace("/admin");
      }, 800);
      return;
    }
    requiresToken.value = Boolean(data?.requiresSetupToken);
    statusHint.value = (data?.setupTokenHint || "").trim();
    state.value = "open";
  } catch (error) {
    // 读不到状态：照常允许尝试（服务端仍是权威判定），但要把「读到状态失败」说出来。
    state.value = "unreachable";
    statusError.value = "网络错误：读不到初始化状态。请确认商店服务已启动后重试。";
    reportBestEffort("初始化状态 /setup/status", error);
  }
});

function showError(message: string) {
  errorText.value = message;
}

async function submit() {
  errorText.value = "";
  const trimmedUsername = username.value.trim();
  const trimmedEmail = email.value.trim();
  if (!trimmedUsername) {
    showError("请输入管理员账号。");
    return;
  }
  if (trimmedUsername.length < 3) {
    showError("账号至少需要 3 位，且不能包含 @ 或空格。");
    return;
  }
  if (!trimmedEmail) {
    showError("请输入管理员邮箱。");
    return;
  }
  if (!isPasswordPolicyCompliant(password.value)) {
    showError(PASSWORD_POLICY_MESSAGE);
    return;
  }
  if (password.value !== confirmPassword.value) {
    showError("两次输入的密码不一致。");
    return;
  }
  if (requiresToken.value && !setupToken.value.trim()) {
    // 本机直连以外必须带引导密钥：先在本地说清楚，别等一次 403 再解释。
    showError(
      "当前不是本机直连访问：初始化必须填写服务端启动日志里的引导密钥（SETUP-TOKEN= 行），或用 STORE_SETUP_TOKEN 指定后重启服务。",
    );
    return;
  }
  submitting.value = true;
  try {
    const response = await fetch("/store/v1/setup/admin", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: trimmedUsername,
        email: trimmedEmail,
        password: password.value,
        confirm_password: confirmPassword.value,
        setup_token: setupToken.value.trim(),
      }),
    });
    // 空体或 HTML 错误页时保持空对象：只为了拿到 `detail`，真正的判定看状态码。
    const body = await response.json().catch(() => ({}));
    if (response.status === 201) {
      // 与登录同一条判据：接口成功不代表会话被浏览器收下了（http + Secure Cookie 会丢）。
      // 会话没存住时**不要**跳 `/admin`（那里只会显示登录屏），改为就地说明怎么修。
      if ((await sessionPersisted()) === false) {
        sessionLost.value = true;
        submitting.value = false;
        return;
      }
      window.location.assign("/admin");
      return;
    }
    if (response.status === 409) {
      state.value = "initialized";
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
      <section v-if="sessionLost" class="hos-panel hos-rise">
        <span class="hos-panel__edge" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--tl" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--tr" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--bl" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--br" aria-hidden="true"></span>
        <div class="hos-panel__head">
          <div class="hos-eyebrow-row">
            <p class="hos-eyebrow">已创建 · 会话未保存</p>
            <span class="hos-secure"><i class="hos-secure-dot" aria-hidden="true"></i>无需重复初始化</span>
          </div>
          <h1>管理员已创建，但登录状态没存住</h1>
          <p class="hos-panel__desc">
            账号已写入数据库，可以直接登录。浏览器丢弃了登录 Cookie，通常是浏览器策略
            （无痕模式 / 禁用 Cookie / 第三方 Cookie 限制）；也可能是
            <code>STORE_COOKIE_SECURE</code> 被写死成 <code>true</code>，而你是用
            <code>http://</code> 打开的 —— 带 <code>Secure</code> 的 Cookie 在明文下会被丢弃。
            改回默认的 <code>auto</code> 即可（它按本次请求的实际协议判定）。
            若你走的是 HTTPS 入口，还要确认入口透传了
            <code>X-Forwarded-Proto: https</code>。
          </p>
        </div>
        <DeckTiles page="setup" />
        <div class="hos-actions">
          <RouterLink class="hos-btn-primary" to="/admin">前往管理员登录</RouterLink>
        </div>
        <div class="hos-panel__copy">
          <div class="hos-panel__meta">
            <span>账号已写入</span>
            <i class="hos-panel__meta-sep" aria-hidden="true"></i>
            <span>检查浏览器 Cookie 设置</span>
            <i class="hos-panel__meta-sep" aria-hidden="true"></i>
            <span>确认入口透传 X-Forwarded-Proto</span>
          </div>
          <p>若浏览器允许本站 Cookie 仍出现此提示，请让运维核对入口的 X-Forwarded-Proto 与 STORE_COOKIE_SECURE。</p>
        </div>
      </section>

      <section v-else-if="state === 'checking'" class="hos-panel hos-rise" aria-busy="true">
        <span class="hos-panel__edge" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--tl" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--tr" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--bl" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--br" aria-hidden="true"></span>
        <div class="hos-panel__head">
          <div class="hos-eyebrow-row">
            <p class="hos-eyebrow">初始化 · 检查中</p>
            <span class="hos-secure"><i class="hos-secure-dot" aria-hidden="true"></i>只读检查</span>
          </div>
          <h1>正在检查初始化状态…</h1>
          <p class="hos-panel__desc">正在向商店服务确认是否已设置管理员，确认之前不会显示创建入口。</p>
        </div>
        <DeckTiles page="setup" />
        <div class="hos-panel__copy">
          <div class="hos-panel__meta">
            <span>不写入任何数据</span>
            <i class="hos-panel__meta-sep" aria-hidden="true"></i>
            <span>通常不到一秒</span>
          </div>
          <p>若长时间停在这里，请确认商店服务已启动，然后刷新本页。</p>
        </div>
      </section>

      <section v-else-if="!showRedirect && state !== 'initialized'" class="hos-panel hos-rise">
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
            这是商店首次启动后的唯一一次初始化：设置账号、邮箱与密码，创建后自动登录后台，本页随即关闭。
            管理员同时也是商店用户，可以像普通客户一样登录前台、下单与管理自己的授权。
          </p>
        </div>
        <DeckTiles page="setup" />
        <p v-if="state === 'unreachable'" class="hos-msg is-err" role="status">{{ statusError }}</p>
        <form class="hos-form" autocomplete="off" @submit.prevent="submit">
          <div class="hos-row-2">
            <div class="hos-field">
              <div class="hos-label-row"><label for="username">账号</label></div>
              <div class="hos-control">
                <input
                  id="username"
                  v-model="username"
                  autocomplete="username"
                  placeholder="登录用账号"
                  minlength="3"
                  maxlength="64"
                  pattern="[^@\s]{3,64}"
                  title="账号至少 3 位，不能包含 @ 或空格（@ 保留给邮箱登录）"
                  autocapitalize="off"
                  autocorrect="off"
                  spellcheck="false"
                  required
                />
              </div>
            </div>
            <div class="hos-field">
              <div class="hos-label-row"><label for="email">管理员邮箱</label></div>
              <div class="hos-control">
                <input id="email" v-model="email" type="email" placeholder="admin@example.com" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" required />
              </div>
            </div>
          </div>
          <div class="hos-row-2">
            <div class="hos-field">
              <div class="hos-label-row"><label for="password">密码</label></div>
              <PasswordField id="password" v-model="password" placeholder="至少 8 位，含字母与数字" autocomplete="new-password" :minlength="8" />
            </div>
            <div class="hos-field">
              <div class="hos-label-row"><label for="confirm-password">确认密码</label></div>
              <PasswordField id="confirm-password" v-model="confirmPassword" placeholder="再次输入密码" autocomplete="new-password" :minlength="8" />
            </div>
          </div>
          <div class="hos-field">
            <div class="hos-label-row">
              <label for="setup-token">引导密钥</label>
              <span class="hos-hint">
                {{ requiresToken ? "远程访问必填 · STORE_SETUP_TOKEN" : "本机访问无需填写 · STORE_SETUP_TOKEN" }}
              </span>
            </div>
            <div class="hos-control">
              <input
                id="setup-token"
                v-model="setupToken"
                type="text"
                placeholder="从服务启动日志中查找"
                autocomplete="off"
                autocapitalize="off"
                autocorrect="off"
                spellcheck="false"
                :required="requiresToken"
                :aria-required="requiresToken ? 'true' : undefined"
                aria-describedby="setup-token-policy"
              />
            </div>
            <p id="setup-token-policy" class="hos-hint">
              {{
                requiresToken
                  ? statusHint ||
                    "当前不是本机直连访问：初始化必须填写服务启动日志里的引导密钥（SETUP-TOKEN= 行），或用 STORE_SETUP_TOKEN 指定后重启服务。"
                  : "从本机 localhost / 127.0.0.1 直接打开本页时无需填写引导密钥。"
              }}
            </p>
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
