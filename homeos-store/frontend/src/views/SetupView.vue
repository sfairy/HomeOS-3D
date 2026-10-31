<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import SceneStage from "@store/shared/components/SceneStage.vue";
import DeckTiles from "@store/shared/components/DeckTiles.vue";
import EntryShell from "@homeos/shared/components/EntryShell.vue";
import PasswordField from "@homeos/shared/components/PasswordField.vue";
import { fromResponse } from "@store/shared/api/error";
import { isPasswordPolicyCompliant, PASSWORD_POLICY_MESSAGE } from "@homeos/shared/security/password-policy";
import { sessionPersisted } from "@store/shared/stores/session";
import { reportBestEffort, runBestEffort } from "@store/shared/utils/best-effort";
import {
  peekSetupStatus,
  probeSetupStatus,
  setupTokenFromHash,
  type SetupState,
} from "@store/shared/utils/setup-status";

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
 * 初始化状态的四态判定（由服务端 /setup/status 给出，不再由前端猜）：
 * - open：库中没有管理员，可以初始化（requiresToken 表示这次访问是否必须带引导密钥）；
 * - initialized：已有管理员，本页只负责跳转；
 * - unreachable：状态都没读到（服务未起 / 装配异常返回 503），照实说明而不是假装可初始化。
 *
 * 「检查中」这一态已经没有了：探测上移到路由守卫（`shared/utils/setup-status.ts`），
 * 视图 setup 时拿到的是终态，首帧即最终布局。
 */
const snapshot = peekSetupStatus();
const state = ref<SetupState>(snapshot?.state ?? "unreachable");
const requiresToken = ref(snapshot?.requiresToken ?? false);
const statusHint = ref(snapshot?.hint ?? "");
const statusError = ref(snapshot?.error ?? "");

/**
 * 坞体的抬头与坞脚文字，按形态收成四处。
 *
 * 改造前这四种形态（会话丢失 / 检查中 / 可初始化 / 已初始化）各自把
 * 「边缘光 + 四角 + eyebrow + secure + h1 + desc + DeckTiles + copy」写了一遍 ——
 * 结构一模一样，只有文字不同。文字归这里，结构归 EntryShell，模板只剩「本形态独有的内容」。
 */
const panelView = computed(() => {
  if (sessionLost.value) {
    return {
      key: "session-lost",
      eyebrow: "已创建 · 会话未保存",
      secure: "无需重复初始化",
      title: "管理员已创建，但登录状态没存住",
      desc: "账号已写入数据库，可以直接登录。浏览器丢弃了登录 Cookie，通常是浏览器策略（无痕模式 / 禁用 Cookie / 第三方 Cookie 限制）。",
      meta: ["账号已写入", "检查浏览器 Cookie 设置", "确认入口透传 X-Forwarded-Proto"],
      note: "若浏览器允许本站 Cookie 仍出现此提示，请让运维核对入口的 X-Forwarded-Proto 与 STORE_COOKIE_SECURE。",
    };
  }
  if (!showRedirect.value && state.value !== "initialized") {
    return {
      key: "open",
      eyebrow: "本机初始化 · 01/01",
      secure: "仅无管理员时可用",
      title: "给这套授权服务开一个管理员",
      desc: "这是商店首次启动后的唯一一次初始化：设置账号、邮箱与密码，创建后自动登录后台，本页随即关闭。管理员同时也是商店用户，可以像普通客户一样登录前台、下单与管理自己的授权。",
      meta: ["仅首启可用", "远程需引导密钥", "建议走 HTTPS"],
      note: "初始化后本页会自动跳转，请妥善保管管理员密码。",
    };
  }
  return {
    key: "initialized",
    eyebrow: "Already Set Up",
    secure: "无需重复初始化",
    title: "管理员已经在了",
    desc: "商店已完成初始化，正在跳转到管理员登录页…",
    meta: ["已完成初始化", "创建入口已关闭", "如需重置请清空数据"],
    note: "若这不是你的预期，说明该部署已有人完成初始化。",
  };
});

function tokenFromFragment() {
  return setupTokenFromHash(location.hash);
}

/**
 * 引导密钥在 setup 阶段就取值并抹掉地址栏：`setup()` 比 `onMounted` 早一步，
 * 既能保证首帧输入框里已经有值（不再「空框 → 预填」闪一下），也少一次历史记录残留。
 */
const fragmentToken = tokenFromFragment();
/** 首帧就把引导密钥写进输入框：不再「空框 → 预填」闪一下。 */
if (fragmentToken) setupToken.value = fragmentToken;

onMounted(() => {
  if (fragmentToken) {
    // 把 token 从地址栏抹掉（避免留在历史/截图里）。可降级：抹不掉不影响初始化。
    runBestEffort("清理地址栏中的引导密钥", () => {
      history.replaceState(null, "", location.pathname + location.search);
    });
  }
  // 已有管理员：这一页从此刻起**不再提供创建入口**（服务端 `/setup` 本身也已经 302 到
  // `/admin`，这里兜住「客户端直接进 SPA 路由」与「页面已渲染后才完成初始化」两种情形）。
  if (state.value === "initialized") {
    showRedirect.value = true;
    window.setTimeout(() => {
      window.location.replace("/admin");
    }, 800);
    return;
  }
  // 兜底：守卫没跑或没拿到快照（老入口 / 直接调用）时补一次探测。正常情况下这里不再发请求。
  if (!snapshot) {
    void probeSetupStatus(fragmentToken, { force: true }).then((next) => {
      state.value = next.state;
      requiresToken.value = next.requiresToken;
      statusHint.value = next.hint;
      statusError.value = next.error;
      if (next.state === "initialized") {
        showRedirect.value = true;
        window.setTimeout(() => {
          window.location.replace("/admin");
        }, 800);
      }
    }).catch((error) => {
      reportBestEffort("初始化状态 /setup/status", error);
    });
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
  <!-- 外壳（.hos-page / 背景 / .hos-dock / .hos-panel / 边缘光 / 四角）来自共享 EntryShell；
       引导轨、抬头、坞脚文字由 panelView 提供，本页只写「当前形态独有的内容」。
       `:panel-key` 让形态变化（会话丢失 → 表单…）时重放一次 180ms 入场，而不是整页重建。 -->
  <EntryShell
    class="hb-page-shell"
    tone="lumen"
    :eyebrow="panelView.eyebrow"
    :secure="panelView.secure"
    :title="panelView.title"
    :description="panelView.desc"
    :panel-key="panelView.key"
  >
    <template #scene><SceneStage page="setup" /></template>

    <DeckTiles page="setup" />

    <!-- 会话丢失：Cookie 级故障。处置细节含代码标识，放在正文里而不是 description
         （后者是纯文本槽），避免把 <code> 塞进数据对象。 -->
    <template v-if="sessionLost">
      <p class="hos-panel__desc">
        也可能是 <code>STORE_COOKIE_SECURE</code> 被写死成 <code>true</code>，而你是用
        <code>http://</code> 打开的 —— 带 <code>Secure</code> 的 Cookie 在明文下会被丢弃。
        改回默认的 <code>auto</code> 即可（它按本次请求的实际协议判定）。
        若你走的是 HTTPS 入口，还要确认入口透传了 <code>X-Forwarded-Proto: https</code>。
      </p>
      <div class="hos-actions">
        <RouterLink class="hos-btn-primary" to="/admin">前往管理员登录</RouterLink>
      </div>
    </template>

    <template v-else-if="!showRedirect && state !== 'initialized'">
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
    </template>

    <template v-else>
      <div class="hos-actions">
        <RouterLink class="hos-btn-primary" to="/admin">前往管理员登录</RouterLink>
      </div>
    </template>

    <template #copy>
      <div class="hos-panel__meta">
        <template v-for="(item, index) in panelView.meta" :key="item">
          <i v-if="index > 0" class="hos-panel__meta-sep" aria-hidden="true"></i>
          <span>{{ item }}</span>
        </template>
      </div>
      <p>{{ panelView.note }}</p>
    </template>
  </EntryShell>
</template>
