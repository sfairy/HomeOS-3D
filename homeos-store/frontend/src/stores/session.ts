/** 前台会话与账号数据。 */

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api } from "../api/http.js";
import type { StoreLicense, StoreOrder, StoreAccount, StoreProduct } from "../store-types.js";

interface AccountPayload {
  account?: StoreAccount;
  licenses?: StoreLicense[];
  entitlements?: Array<Record<string, unknown>>;
  orders?: StoreOrder[];
  ordersTotal?: number;
  deviceReleasePolicy?: {
    cooldownSeconds?: number;
    nextAllowedAt?: string | null;
    remainingSeconds?: number;
  };
  hasLicense?: boolean;
  hasTemporaryLicense?: boolean;
  hasPermanentLicense?: boolean;
  hasUsedTrial?: boolean;
}

export const useSessionStore = defineStore("session", () => {
  const account = ref<StoreAccount | null>(null);
  const hasLicense = ref(false);
  const hasTemporaryLicense = ref(false);
  const hasPermanentLicense = ref(false);
  const hasUsedTrial = ref(false);

  const licenses = ref<StoreLicense[]>([]);
  const entitlements = ref<Array<Record<string, unknown>>>([]);
  const orders = ref<StoreOrder[]>([]);
  const ordersTotal = ref(0);
  const ordersLoaded = ref(0);

  const deviceReleasePolicy = ref<AccountPayload["deviceReleasePolicy"] | null>(null);

  const ownedFeatureCodes = computed(
    () =>
      new Set(
        entitlements.value
          .filter((item) => item.active)
          .map((item) => item.featureCode as string)
          .filter(Boolean),
      ),
  );

  const pendingOrders = computed(() => orders.value.filter((item) => item.status === "pending"));

  function applyAccount(payload: AccountPayload, { appendOrders = false } = {}) {
    account.value = payload.account || account.value;
    if (payload.hasLicense !== undefined) hasLicense.value = Boolean(payload.hasLicense);
    if (payload.hasTemporaryLicense !== undefined)
      hasTemporaryLicense.value = Boolean(payload.hasTemporaryLicense);
    if (payload.hasPermanentLicense !== undefined)
      hasPermanentLicense.value = Boolean(payload.hasPermanentLicense);
    if (payload.hasUsedTrial !== undefined) hasUsedTrial.value = Boolean(payload.hasUsedTrial);
    licenses.value = payload.licenses || [];
    entitlements.value = payload.entitlements || [];
    deviceReleasePolicy.value = payload.deviceReleasePolicy || null;
    const incoming = payload.orders || [];
    if (appendOrders) {
      const seen = new Set(orders.value.map((item) => item.orderNo));
      orders.value = [...orders.value, ...incoming.filter((item) => !seen.has(item.orderNo))];
    } else {
      orders.value = incoming;
    }
    ordersLoaded.value = orders.value.length;
    ordersTotal.value = Number(payload.ordersTotal ?? orders.value.length);
    syncAuthHint();
  }

  /**
   * 按当前 `account` 重算外壳登录态：hint cookie + `<html>` 上的类 + `data-auth`。
   *
   * 三处必须一起写，少一处就会出现「导航说已登录、外壳说游客」这类自相矛盾的状态，
   * 进而白打一发注定 401 的探针。
   */
  function syncAuthHint() {
    const current = account.value as (StoreAccount & { isAdmin?: boolean }) | null;
    setAuthHint(Boolean(current), hasPermanentLicense.value, hasTemporaryLicense.value);
    if (current) setServerAuthState(current.isAdmin ? "admin" : "user");
  }

  async function load() {
    const payload = await api<AccountPayload>("/account");
    applyAccount(payload);
    return payload;
  }

  /**
   * 清空本地会话态（登出 / 会话失效共用）。
   *
   * 只清 `account` 是不够的：license 标志、许可列表、订单、设备释放策略都会留下来，
   * 会话过期或被踢下线后 UI 仍会显示「已授权」、甚至渲染上一个账号的订单与功能码。
   */
  function resetSession() {
    account.value = null;
    hasLicense.value = false;
    hasTemporaryLicense.value = false;
    hasPermanentLicense.value = false;
    hasUsedTrial.value = false;
    licenses.value = [];
    entitlements.value = [];
    orders.value = [];
    ordersTotal.value = 0;
    ordersLoaded.value = 0;
    deviceReleasePolicy.value = null;
    syncAuthHint();
  }

  async function fetchMe() {
    let payload: (AccountPayload & { account?: StoreAccount }) | null = null;
    try {
      payload = await api<AccountPayload>("/auth/me");
    } catch (error) {
      const status = (error as { status?: number }).status;
      // 会话已失效（过期 / 被踢出 / 库被重置）时，服务端会回 401/403。
      // 此时必须清掉遗留的 hint cookie 与全部本地会话数据：否则外壳一直把访客当已登录，
      // 每次进店都白打一发注定 401 的 /auth/me，还挂着已登录的导航与上一个账号的 license / 订单。
      if (status === 401 || status === 403) {
        resetSession();
      }
      return null;
    }
    if (!payload) return null;
    account.value = payload.account || null;
    hasLicense.value = Boolean(payload.hasLicense);
    hasTemporaryLicense.value = Boolean(payload.hasTemporaryLicense);
    hasPermanentLicense.value = Boolean(payload.hasPermanentLicense);
    hasUsedTrial.value = Boolean(payload.hasUsedTrial);
    syncAuthHint();
    // /auth/me 不含 licenses；结账/Addon 依赖完整 /account 会话。
    try {
      await load();
    } catch {
      /* 账号中心失败时仍保留 me 的 flags */
    }
    return payload;
  }

  async function loadMoreOrders() {
    const data = await api<{ items?: StoreOrder[]; ordersTotal?: number }>(
      `/orders?offset=${ordersLoaded.value}&limit=20`,
    );
    const items = data.items || [];
    const seen = new Set(orders.value.map((item) => item.orderNo));
    orders.value = [...orders.value, ...items.filter((item) => !seen.has(item.orderNo))];
    ordersLoaded.value = orders.value.length;
    ordersTotal.value = Number(data.ordersTotal ?? ordersTotal.value);
  }

  async function login(account: string, password: string) {
    const result = await api<AccountPayload>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ account: account.trim(), password }),
    });
    applyAccount(result);
    return result;
  }

  async function register(payload: {
    username: string;
    email: string;
    code: string;
    password: string;
    confirmPassword: string;
    referralCode?: string | null;
  }) {
    const result = await api<AccountPayload & { referralNote?: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        username: payload.username.trim(),
        email: payload.email.trim(),
      }),
    });
    applyAccount(result);
    return result;
  }

  async function logout() {
    await api("/auth/logout", { method: "DELETE" }).catch(() => {});
    resetSession();
  }

  const eligiblePermanentLicenses = computed(() =>
    licenses.value.filter((item) => item.active && !item.validityDays && !item.accessExpiresAt),
  );

  function ownedPermanentLicense(product: StoreProduct | null | undefined) {
    if (!account.value || !product || product.validityDays) return null;
    const now = Date.now();
    return (
      licenses.value.find((item) => {
        if (!item.active || item.productId !== product.id) return false;
        if (item.validityDays) return false;
        if (item.accessExpiresAt && new Date(item.accessExpiresAt).getTime() <= now) return false;
        return true;
      }) || null
    );
  }

  return {
    account,
    hasLicense,
    hasTemporaryLicense,
    hasPermanentLicense,
    hasUsedTrial,
    licenses,
    entitlements,
    orders,
    ordersTotal,
    ordersLoaded,
    deviceReleasePolicy,
    ownedFeatureCodes,
    pendingOrders,
    eligiblePermanentLicenses,
    applyAccount,
    load,
    fetchMe,
    loadMoreOrders,
    login,
    register,
    logout,
    ownedPermanentLicense,
  };
});

/** `homeos_store_hint` cookie：给首屏之前的外壳读，刷新后仍记得登录态。 */
export function setAuthHint(
  authenticated: boolean,
  hasPermanentLicense = false,
  hasTemporaryLicense = false,
) {
  document.documentElement.classList.toggle("hb-auth-hint", authenticated);
  document.documentElement.classList.toggle(
    "hb-license-hint",
    authenticated && hasPermanentLicense,
  );
  document.documentElement.classList.toggle(
    "hb-unlicensed-hint",
    authenticated && !hasPermanentLicense,
  );
  document.cookie = authenticated
    ? `homeos_store_hint=${
        hasPermanentLicense ? "permanent" : hasTemporaryLicense ? "temporary" : "unlicensed"
      }; Max-Age=${60 * 60 * 24 * 30}; Path=/; SameSite=Lax${
        location.protocol === "https:" ? "; Secure" : ""
      }`
    : "homeos_store_hint=; Max-Age=0; Path=/; SameSite=Lax";
  setServerAuthState(authenticated ? "user" : "guest");
}

/**
 * 服务端渲染外壳时给出的登录态（见 `backend/src/api/page_shell.py` 的 `data-auth`）。
 *
 * 这比 `homeos_store_hint` cookie 更可靠：cookie 由前端自己维护，会话在服务端失效
 * （过期 / 被踢下线 / 库被重置）时它仍然在，会让外壳打一发注定 401 的探针。
 * 属性是这一份 HTML 渲染时服务端刚解出来的结论，游客页面读它就是「确实没登录」。
 *
 * 取不到属性时回 `"unknown"`：调用方按「可能需要探针」处理，退回旧行为。
 */
export type ServerAuthState = "guest" | "user" | "admin" | "unknown";

export function serverAuthState(): ServerAuthState {
  const value = document.documentElement.dataset.auth;
  return value === "guest" || value === "user" || value === "admin" ? value : "unknown";
}

/** 客户端完成登录 / 退出后同步外壳属性，后续挂载的路由才不会拿到过期结论。 */
export function setServerAuthState(state: "guest" | "user" | "admin"): void {
  // 游客也要显式写 "guest"，不要 `delete`：删掉之后属性变回「不知道」，
  // 客户端跳到下一个路由时又会退回「打一发探针再说」的老行为。
  document.documentElement.dataset.auth = state;
}
