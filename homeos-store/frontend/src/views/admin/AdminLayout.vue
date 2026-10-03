<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, reactive, ref, watch, type Component } from "vue";
import { useRoute, useRouter } from "vue-router";
import SceneStage from "../../components/SceneStage.vue";
import DeckTiles from "../../components/DeckTiles.vue";
import PasswordField from "../../components/PasswordField.vue";
import AdjustDialog from "../../components/admin/AdjustDialog.vue";
import PurgeDialog from "../../components/admin/PurgeDialog.vue";
import { useAdminStore } from "../../stores/admin.js";
import { api, onAdminUnauthorized } from "../../api/http.js";
import { errorMessage } from "../../store-types.js";
import { localZoneLabel } from "../../utils/format.js";
import { useToastStore } from "../../stores/toast.js";

interface NavItem {
  page: string;
  label: string;
  paths: string[];
}
interface NavGroup {
  key: string;
  domain: string;
  label: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    key: "operations",
    domain: "operations",
    label: "业务运营",
    items: [
      { page: "overview", label: "概览", paths: ["M3 3h7.4v7.4H3z", "M13.6 3h7.4v7.4h-7.4z", "M3 13.6h7.4v7.4H3z", "M13.6 13.6h7.4v7.4h-7.4z"] },
      { page: "orders", label: "订单", paths: ["M5 3h14v18H5z", "M9 8.5h6M9 12.5h6M9 16.5h3.5"] },
      { page: "withdrawals", label: "提现审核", paths: ["M3 8.2A2.7 2.7 0 0 1 5.7 5.5H18a2 2 0 0 1 2 2v1", "M3 8.2h18v10.8H3z"] },
    ],
  },
  {
    key: "catalog",
    domain: "catalog",
    label: "商品营销",
    items: [
      { page: "products", label: "商品", paths: ["M12 3.2 20.3 7.5v9L12 20.8 3.7 16.5v-9z", "M3.7 7.5 12 11.8l8.3-4.3M12 11.8v9"] },
      { page: "coupons", label: "优惠码", paths: ["M3.6 12.7V4.7a1.1 1.1 0 0 1 1.1-1.1h8l7.7 7.7a1.6 1.6 0 0 1 0 2.2l-6.7 6.7a1.6 1.6 0 0 1-2.2 0z", "M8.1 8.1h.01"] },
    ],
  },
  {
    key: "licensing",
    domain: "licensing",
    label: "授权用户",
    items: [
      { page: "licenses", label: "激活码", paths: ["M8.2 12a4.3 4.3 0 1 0 0-.01", "M12.5 12H20M17.4 12v3.3M20 12v2.5"] },
      { page: "bindings", label: "设备绑定", paths: ["M3 4.6h18v12H3z", "M9 20h6M12 16.6V20"] },
      { page: "accounts", label: "账号", paths: ["M9.4 8.4a3.5 3.5 0 1 0 0-.01", "M3.5 19.6c0-3.3 2.6-5.5 5.9-5.5s5.9 2.2 5.9 5.5", "M16.6 5.3a3.5 3.5 0 0 1 0 6.2M17.6 14.3c2 .8 3.4 2.5 3.4 4.7"] },
    ],
  },
  {
    key: "records",
    domain: "data",
    label: "数据资产",
    items: [
      { page: "entitlements", label: "功能权益", paths: ["M12 3.4 19.4 6v6.2c0 4.3-3 7.4-7.4 8.4-4.4-1-7.4-4.1-7.4-8.4V6z", "m9.4 12 1.9 1.9 3.6-3.7"] },
      { page: "ledger", label: "积分流水", paths: ["M5 6.4h14M5 11.4h8M5 16.4h5", "M17.4 13.6a2.4 2.4 0 1 0 0 .01", "M17.4 14v2.4l1.6 1"] },
      { page: "customers", label: "客户档案", paths: ["M3 5h18v14H3z", "M9 11a2.2 2.2 0 1 0 0-.01", "M5.6 16.4c0-1.9 1.5-3.1 3.4-3.1s3.4 1.2 3.4 3.1", "M15.4 10h3M15.4 13.4h3"] },
      { page: "diagnostics", label: "诊断数据", paths: ["M3.4 12.4h3.9l2.1-4.7 3 9.2 2-6.1 1.7 3.1h4.5"] },
    ],
  },
  {
    key: "system",
    domain: "system",
    label: "系统设置",
    items: [
      { page: "settings", label: "站点配置", paths: ["M4 7h9M18.4 7H20M4 12h3.6M13 12h7M4 17h8M17.6 17H20", "M15.7 4.9a2.1 2.1 0 1 0 0 .01", "M10.4 9.9a2.1 2.1 0 1 0 0 .01", "M15 14.9a2.1 2.1 0 1 0 0 .01"] },
      { page: "audits", label: "审计日志", paths: ["M5 5h14v16H5z", "M9 5V3.9A1.4 1.4 0 0 1 10.4 2.5h3.2A1.4 1.4 0 0 1 15 3.9V5", "M9 11.2h6M9 15.2h4"] },
    ],
  },
];

const route = useRoute();
const router = useRouter();
const admin = useAdminStore();
const toast = useToastStore();

/** 面板按 `:page` 懒加载；未知 page 渲染空白（与旧 hash 路由的容错一致）。 */
const PANELS: Record<string, Component> = {
  overview: defineAsyncComponent(() => import("./OverviewView.vue")),
  products: defineAsyncComponent(() => import("./ProductsView.vue")),
  orders: defineAsyncComponent(() => import("./OrdersView.vue")),
  licenses: defineAsyncComponent(() => import("./LicensesView.vue")),
  bindings: defineAsyncComponent(() => import("./BindingsView.vue")),
  coupons: defineAsyncComponent(() => import("./CouponsView.vue")),
  withdrawals: defineAsyncComponent(() => import("./WithdrawalsView.vue")),
  accounts: defineAsyncComponent(() => import("./AccountsView.vue")),
  settings: defineAsyncComponent(() => import("./SettingsView.vue")),
  audits: defineAsyncComponent(() => import("./AuditsView.vue")),
  entitlements: defineAsyncComponent(() => import("./EntitlementsView.vue")),
  ledger: defineAsyncComponent(() => import("./LedgerView.vue")),
  customers: defineAsyncComponent(() => import("./CustomersView.vue")),
  diagnostics: defineAsyncComponent(() => import("./DiagnosticsView.vue")),
};

const loginEmail = ref("");
const loginPassword = ref("");
const openGroups = reactive<Record<string, boolean>>(
  Object.fromEntries(GROUPS.map((group) => [group.key, true])),
);

const pwOpen = ref(false);
const pwForm = reactive({ oldPassword: "", newPassword: "", confirmPassword: "" });
const pwError = ref("");
const pwDialog = ref<HTMLDialogElement | null>(null);

const activePage = computed(() => String(route.params.page || "overview"));
const activePanel = computed(() => PANELS[activePage.value] || null);

function toggleGroup(key: string) {
  openGroups[key] = !openGroups[key];
}

async function submitLogin() {
  try {
    await admin.login(loginEmail.value, loginPassword.value);
    loginPassword.value = "";
    toast.push("已登录后台");
    if (!route.params.page) await router.replace("/admin/overview");
  } catch (error) {
    admin.loginError = errorMessage(error);
    toast.push(errorMessage(error), "danger");
  }
}

async function logout() {
  await admin.logout();
  await router.replace("/admin");
}

async function submitPassword() {
  pwError.value = "";
  if (!pwForm.oldPassword) {
    pwError.value = "请输入当前密码。";
    return;
  }
  if (pwForm.newPassword.length < 8) {
    pwError.value = "新密码至少 8 位。";
    return;
  }
  if (pwForm.newPassword !== pwForm.confirmPassword) {
    pwError.value = "两次输入的新密码不一致。";
    return;
  }
  if (pwForm.newPassword === pwForm.oldPassword) {
    pwError.value = "新密码与当前密码相同。";
    return;
  }
  try {
    await api("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({
        oldPassword: pwForm.oldPassword,
        newPassword: pwForm.newPassword,
        confirmPassword: pwForm.confirmPassword,
      }),
    });
    toast.push("密码修改成功。其它设备上的会话已被踢出。");
    pwDialog.value?.close();
    pwForm.oldPassword = "";
    pwForm.newPassword = "";
    pwForm.confirmPassword = "";
  } catch (error) {
    pwError.value = errorMessage(error, "修改失败，请稍后重试。");
  }
}

watch(
  () => admin.phase,
  (phase) => {
    if (phase === "ready" && activePage.value) {
      const group = GROUPS.find((item) => item.items.some((entry) => entry.page === activePage.value));
      if (group) openGroups[group.key] = true;
    }
  },
);

onMounted(async () => {
  await admin.bootstrap();
  if (admin.phase === "ready" && !route.params.page) {
    await router.replace("/admin/overview");
  }
});

let offUnauthorized: (() => void) | null = null;
onMounted(() => {
  offUnauthorized = onAdminUnauthorized(() => admin.showLogin());
});
onBeforeUnmount(() => {
  offUnauthorized?.();
});
</script>

<template>
  <!-- 启动中 -->
  <div v-if="admin.phase === 'boot'" class="admin-boot">
    <div class="admin-boot__spinner"></div>
    <div class="admin-boot__text">正在加载…</div>
  </div>

  <!-- 登录 -->
  <div v-else-if="admin.phase === 'login'" id="admin-login" class="hb-page-shell hos-page hos-tone--accent">
    <SceneStage page="admin" />
    <main class="hos-dock">
      <section class="hos-panel hos-rise">
        <span class="hos-panel__edge" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--tl" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--tr" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--bl" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--br" aria-hidden="true"></span>
        <div class="hos-panel__head">
          <div class="hos-eyebrow-row">
            <p class="hos-eyebrow">Admin Console</p>
            <span class="hos-secure"><i class="hos-secure-dot" aria-hidden="true"></i>管理员专用</span>
          </div>
          <h1>进后台，处理今天的事</h1>
          <p class="hos-panel__desc">
            商品上架、订单履约、激活码签发与设备解绑都在后台完成，请用具有管理员权限的账号登录。
          </p>
        </div>
        <DeckTiles page="admin" />
        <form class="hos-form" autocomplete="off" @submit.prevent="submitLogin">
          <div class="hos-field">
            <div class="hos-label-row"><label for="admin-login-email">管理员邮箱</label></div>
            <div class="hos-control">
              <input
                id="admin-login-email"
                v-model="loginEmail"
                type="email"
                name="email"
                placeholder="admin@example.com"
                autocomplete="off"
                autocapitalize="off"
                autocorrect="off"
                spellcheck="false"
                data-lpignore="true"
                data-1p-ignore
                data-bwignore
                required
              />
            </div>
          </div>
          <div class="hos-field">
            <div class="hos-label-row"><label for="admin-login-password">密码</label></div>
            <PasswordField
              id="admin-login-password"
              v-model="loginPassword"
              placeholder="请输入密码"
              required
            />
          </div>
          <p v-if="admin.loginError" class="hos-msg is-err" role="alert">{{ admin.loginError }}</p>
          <div class="hos-actions">
            <button class="hos-btn-primary" type="submit">登录后台</button>
          </div>
        </form>
        <p class="hos-switch"><RouterLink to="/">返回商店前台</RouterLink></p>
        <div class="hos-panel__copy">
          <div class="hos-panel__meta">
            <span>订单与退款</span>
            <i class="hos-panel__meta-sep" aria-hidden="true"></i>
            <span>激活码与绑定</span>
            <i class="hos-panel__meta-sep" aria-hidden="true"></i>
            <span>站点配置与审计</span>
          </div>
          <p>运营后台的每一步操作都会留下审计记录。</p>
        </div>
      </section>
    </main>
  </div>

  <!-- 工作台 -->
  <div v-else class="admin-shell">
    <aside class="admin-side">
      <div class="brand">
        <span class="brand__mark"><img src="/store-static/homeos-mark-light.svg" alt="" /></span>
        <div class="brand__text"><strong>HomeOS</strong><small>授权商店后台</small></div>
      </div>
      <nav class="admin-nav">
        <div
          v-for="group in GROUPS"
          :key="group.key"
          class="nav-group"
          :class="{ open: openGroups[group.key] }"
          :data-domain="group.domain"
        >
          <button class="nav-group__toggle" type="button" :aria-expanded="openGroups[group.key]" @click="toggleGroup(group.key)">
            <span class="nav-group__text">{{ group.label }}</span>
            <span class="nav-badge nav-group__badge"></span>
            <svg class="nav-group__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8.4 10.2 3.6 3.6 3.6-3.6" /></svg>
          </button>
          <div class="nav-group__items">
            <div class="nav-group__items-inner">
              <RouterLink
                v-for="item in group.items"
                :key="item.page"
                class="nav-link"
                :class="{ active: activePage === item.page }"
                :to="`/admin/${item.page}`"
              >
                <svg class="nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                  <path v-for="(d, index) in item.paths" :key="index" :d="d" />
                </svg>
                <span class="nav-label">{{ item.label }}</span>
                <span class="nav-badge">{{ admin.navBadges[item.page] || "" }}</span>
              </RouterLink>
            </div>
          </div>
        </div>
      </nav>
      <div class="admin-side__foot">
        <div class="who">
          <span class="who__avatar">{{ admin.initial }}</span>
          <span class="who__email">{{ admin.email }}</span>
        </div>
      </div>
    </aside>

    <main class="admin-main">
      <header class="admin-topbar">
        <div class="admin-topbar__left">
          <span class="who__avatar">{{ admin.initial }}</span>
          <span class="admin-topbar__email">{{ admin.email }}</span>
          <span class="admin-topbar__tz">时间按 {{ localZoneLabel() }} 显示</span>
        </div>
        <div class="admin-topbar__right">
          <button class="hb-button hb-button--ghost hb-button--sm" @click="pwDialog?.showModal()">修改密码</button>
          <RouterLink class="hb-button hb-button--ghost hb-button--sm" to="/" target="_blank" rel="noreferrer">查看商店</RouterLink>
          <button class="hb-button hb-button--ghost hb-button--sm" @click="logout">退出登录</button>
        </div>
      </header>

      <component :is="activePanel" v-if="activePanel" :key="activePage" />
    </main>

    <dialog ref="pwDialog" class="confirm-dialog" @cancel.prevent="pwDialog?.close()">
      <div class="confirm-dialog__body">
        <div class="confirm-dialog__icon">🔒</div>
        <h2>修改密码</h2>
        <p>改密后会踢掉其它设备上的登录会话，只保留当前这个。</p>
        <label class="hb-field">
          <span>当前密码</span>
          <input v-model="pwForm.oldPassword" class="hb-input" type="password" autocomplete="current-password" placeholder="请输入当前密码" />
        </label>
        <label class="hb-field">
          <span>新密码（至少 8 位）</span>
          <input v-model="pwForm.newPassword" class="hb-input" type="password" autocomplete="new-password" placeholder="至少 8 位" />
        </label>
        <label class="hb-field">
          <span>确认新密码</span>
          <input v-model="pwForm.confirmPassword" class="hb-input" type="password" autocomplete="new-password" placeholder="再次输入新密码" />
        </label>
        <div v-if="pwError" class="admin-alert">{{ pwError }}</div>
      </div>
      <div class="confirm-dialog__actions">
        <button class="hb-button hb-button--secondary hb-button--sm" type="button" @click="pwDialog?.close()">取消</button>
        <button class="hb-button hb-button--primary hb-button--sm" type="button" @click="submitPassword">确认修改</button>
      </div>
    </dialog>
  </div>

  <!-- 确认弹窗与栈式提示由 App.vue 统一挂载（它已经按路由切到 admin 变体），
       这里只补后台独有的两个带输入弹窗，避免同一实例被挂两遍。 -->
  <AdjustDialog />
  <PurgeDialog />
</template>
