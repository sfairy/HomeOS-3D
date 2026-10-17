<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSiteStore } from "@store/shared/stores/site";
import { useCatalogStore } from "@store/features/storefront/stores/catalog";
import { serverAuthState, useSessionStore } from "@store/shared/stores/session";
import { useStoreToast } from "@store/shared/stores/toast";
import { errorMessage } from "@store/shared/types/store";
import { logAndIgnore } from "@store/shared/utils/best-effort";
import { shouldProbeSession } from "@store/features/storefront/utils/session-probe";
import PaymentDialog from "@store/features/storefront/components/PaymentDialog.vue";
import PendingOrderDialog from "@store/features/storefront/components/PendingOrderDialog.vue";

const site = useSiteStore();
const catalog = useCatalogStore();
const session = useSessionStore();
const toast = useStoreToast();
const route = useRoute();
const router = useRouter();
const mobileNavOpen = ref(false);

function toggleMobileNav() {
  mobileNavOpen.value = !mobileNavOpen.value;
}

watch(
  () => route.fullPath,
  () => {
    mobileNavOpen.value = false;
  },
);

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
  await catalog.ensureLoaded().catch((error) => {
    // 首屏商品目录拉不下来 = 首页看着像「没上架」，属于用户可感知，必须说话。
    toast.show(errorMessage(error, "商品目录加载失败，请刷新重试。"), "err");
  });
  // 服务端渲染这一页时给出的 `data-auth` 是登录态的唯一来源：
  //   guest —— 确实没有会话，不打注定 401 的 `/auth/me`；
  //   user/admin —— 有会话，探一次把账号、授权与订单读下来。
  const probe = shouldProbeSession(serverAuthState());
  if (probe) {
    // 会话探针失败是**可降级**的：拿不到账号就按未登录处理（下面会转登录页），
    // 但必须留痕 —— 否则「会话过期」与「网络抖动」在日志里长得一模一样。
    await session.fetchMe().catch(logAndIgnore("会话探针 /auth/me"));
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
        <nav id="navbarNav" class="hb-nav" :class="{ 'mobile-open': mobileNavOpen }" aria-label="主导航">
          <RouterLink class="hb-nav__link" :class="{ active: navActive === 'home' }" data-hb-nav="home" to="/">首页</RouterLink>
          <RouterLink class="hb-nav__link" :class="{ active: navActive === 'purchase' }" data-hb-nav="purchase" to="/products">购买授权</RouterLink>
          <RouterLink class="hb-nav__link hb-auth-only" :class="{ active: navActive === 'account' }" data-hb-nav="account" to="/user/dashboard/index">账号中心</RouterLink>
          <RouterLink class="hb-nav__link hb-auth-only" :class="{ active: navActive === 'referrals' }" data-hb-nav="referrals" to="/user/referrals">邀请有礼</RouterLink>
          <RouterLink v-if="isAdmin" class="hb-nav__link" data-hb-nav="admin" to="/admin">管理后台</RouterLink>
        </nav>
        <div class="hb-topbar__actions">
          <RouterLink class="hb-button hb-button--secondary hb-button--sm hb-auth-only" to="/user/dashboard/index"><i class="fa-duotone fa-regular fa-user"></i> 我的账号</RouterLink>
          <RouterLink class="hb-button hb-button--primary hb-button--sm hb-guest-only" to="/user/authentication/login"><i class="fa-duotone fa-regular fa-right-to-bracket"></i> 登录</RouterLink>
          <button
            class="hb-store-nav-toggle"
            type="button"
            aria-label="展开导航"
            :aria-expanded="mobileNavOpen ? 'true' : 'false'"
            @click="toggleMobileNav"
          ><i class="fa-duotone fa-regular fa-bars"></i></button>
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
  </div>
</template>
