<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSiteStore } from "../../stores/site.js";
import { useCatalogStore } from "../../stores/catalog.js";
import { serverAuthState, useSessionStore } from "../../stores/session.js";
import { useStoreToast } from "../../stores/toast.js";
import PaymentDialog from "../../components/PaymentDialog.vue";
import PendingOrderDialog from "../../components/PendingOrderDialog.vue";

const site = useSiteStore();
const catalog = useCatalogStore();
const session = useSessionStore();
const toast = useStoreToast();
const route = useRoute();
const router = useRouter();

const storePage = computed(() => (route.meta.storePage as string) || "home");
const maintenance = computed(() => site.maintenanceMode);

const navActive = computed(() => {
  const page = storePage.value;
  if (page === "home") return "home";
  if (page === "products" || page === "item") return "purchase";
  if (page === "referrals") return "referrals";
  return "account";
});

const isAdmin = computed(() => Boolean((session.account as { isAdmin?: boolean } | null)?.isAdmin));

const requiresAuth = computed(() => ["account", "referrals"].includes(storePage.value));

watch(storePage, (page) => {
  document.title = page === "home" ? site.siteTitle : `${site.siteName}`;
});

watch(maintenance, (enabled) => {
  document.body.classList.toggle("hb-maintenance-active", enabled);
});

onMounted(async () => {
  await site.load();
  if (site.announcement) toast.show(site.announcement);
  if (site.maintenanceMode) {
    document.body.classList.remove("hb-store-loading");
    return;
  }
  await catalog.ensureLoaded().catch(() => {});
  // 首屏之前 auth-bootstrap 已按 `homeos_store_hint` cookie 给 <html> 打过登录态类。
  // 服务端渲染这一页时给出的 `data-auth` 更权威：
  //   guest   —— 确实没有会话。既不必打一发注定 401 的 `/auth/me`，
  //              需要登录的页面也可以直接转登录。
  //   user/admin —— 有会话，探一次把账号、授权与订单读下来。
  //   unknown —— 外壳没注入（老模板），退回「按 hint 猜」的老行为。
  const state = serverAuthState();
  const hinted = document.documentElement.classList.contains("hb-auth-hint");
  const probe = state === "guest" ? false : state === "unknown" ? hinted || requiresAuth.value : true;
  if (probe) {
    await session.fetchMe().catch(() => {});
  }
  if (requiresAuth.value && !session.account) {
    router.replace("/user/authentication/login");
    return;
  }
  document.body.classList.remove("hb-store-loading");
});
</script>

<template>
  <div class="hb-store-shell">
    <header class="hb-topbar">
      <div class="hb-container hb-topbar__inner">
        <RouterLink class="hb-brand" to="/" aria-label="HomeOS 授权中心 首页">
          <span class="hb-brand-mark">
            <img class="hb-store-brand-mark" :src="site.logoUrl" alt="" />
          </span>
          <span class="hb-brand__text"><strong>HomeOS</strong><small>授权服务中心</small></span>
        </RouterLink>
        <nav id="navbarNav" class="hb-nav" aria-label="主导航">
          <RouterLink class="hb-nav__link" :class="{ active: navActive === 'home' }" data-hb-nav="home" to="/">首页</RouterLink>
          <RouterLink class="hb-nav__link" :class="{ active: navActive === 'purchase' }" data-hb-nav="purchase" to="/products">购买授权</RouterLink>
          <RouterLink class="hb-nav__link hb-auth-only" :class="{ active: navActive === 'account' }" data-hb-nav="account" to="/user/dashboard/index">账号中心</RouterLink>
          <RouterLink class="hb-nav__link hb-auth-only" :class="{ active: navActive === 'referrals' }" data-hb-nav="referrals" to="/user/referrals">邀请有礼</RouterLink>
          <RouterLink v-if="isAdmin" class="hb-nav__link" data-hb-nav="admin" to="/admin">管理后台</RouterLink>
        </nav>
        <div class="hb-topbar__actions">
          <RouterLink class="hb-button hb-button--secondary hb-button--sm hb-auth-only" to="/user/dashboard/index"><i class="fa-duotone fa-regular fa-user"></i> 我的账号</RouterLink>
          <RouterLink class="hb-button hb-button--primary hb-button--sm hb-guest-only" to="/user/authentication/login"><i class="fa-duotone fa-regular fa-right-to-bracket"></i> 登录</RouterLink>
          <button class="hb-store-nav-toggle" type="button" aria-label="展开导航" aria-expanded="false"><i class="fa-duotone fa-regular fa-bars"></i></button>
        </div>
      </div>
    </header>

    <main v-if="maintenance" class="hb-maintenance-page" aria-labelledby="store-maintenance-title">
      <section class="hb-maintenance-card">
        <div class="hb-maintenance-brand">
          <span class="hb-brand-mark"><img class="hb-store-brand-mark" :src="site.logoUrl" alt="" /></span>
          <span><strong>{{ site.siteName }}</strong><small>授权服务中心</small></span>
        </div>
        <div class="hb-maintenance-visual" aria-hidden="true">
          <span class="hb-maintenance-orbit"></span>
          <span class="hb-maintenance-orbit hb-maintenance-orbit--inner"></span>
          <span class="hb-maintenance-icon"><i class="fa-duotone fa-regular fa-screwdriver-wrench"></i></span>
        </div>
        <span class="hb-kicker hb-kicker--plain">Service Notice</span>
        <h1 id="store-maintenance-title">商城正在维护</h1>
        <p>{{ site.maintenanceMessage }}</p>
        <div class="hb-maintenance-status"><span class="hb-dot hb-dot--idle"></span>购买与账号服务已暂时关闭</div>
        <small>给您带来不便，敬请谅解</small>
      </section>
    </main>

    <RouterView v-else />

    <PaymentDialog v-if="!maintenance" />
    <PendingOrderDialog v-if="!maintenance" />

    <footer v-if="!maintenance" class="hb-site-footer">
      <div class="hb-container hb-site-footer__inner">
        <div class="hb-site-footer__brand">
          <span class="hb-brand-mark"><img class="hb-store-brand-mark" :src="site.logoUrl" alt="" /></span>
          <div>
            <strong>{{ site.siteName }}</strong>
            <p>安全支付，自动发码，账号统一管理。</p>
          </div>
        </div>
        <div class="hb-site-footer__meta">
          <nav class="hb-site-footer__links">
            <RouterLink to="/">首页</RouterLink>
            <RouterLink to="/products">购买授权</RouterLink>
            <RouterLink class="hb-guest-only" to="/user/authentication/login">账号登录</RouterLink>
            <RouterLink class="hb-auth-only" to="/user/dashboard/index">账号中心</RouterLink>
          </nav>
          <div class="hb-site-footer__bottom"><span>支付结果以服务端异步通知为准</span></div>
        </div>
      </div>
    </footer>

    <div
      id="store-toast"
      class="hb-toast"
      :class="{ show: toast.visible, 'is-err': toast.tone === 'err' }"
      :role="toast.tone === 'err' ? 'alert' : 'status'"
      :aria-live="toast.tone === 'err' ? 'assertive' : 'polite'"
    >
      {{ toast.message }}
    </div>
  </div>
</template>
