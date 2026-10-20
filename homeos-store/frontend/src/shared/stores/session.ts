/** 前台会话与账号数据。 */

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api } from "@store/shared/api/http";
import type { StoreLicense, StoreOrder, StoreAccount, StoreProduct } from "@store/shared/types/store";
import { logAndIgnore } from "@store/shared/utils/best-effort";

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

  /** 并发加载（布局与页面同时 refresh）共用一个 /account 请求。 */
  let loading: Promise<AccountPayload> | null = null;
  /** 登出 / 会话失效时自增：在途请求回来后若 epoch 变了，绝不能再写回旧账号数据。 */
  let sessionEpoch = 0;

  async function loadOnce() {
    const epoch = sessionEpoch;
    const payload = await api<AccountPayload>("/account");
    if (epoch === sessionEpoch) applyAccount(payload);
    return payload;
  }

  function load(): Promise<AccountPayload> {
    if (!loading) {
      loading = loadOnce().finally(() => {
        loading = null;
      });
    }
    return loading;
  }

  /**
   * 清空本地会话态（登出 / 会话失效共用）。
   *
   * 只清 `account` 是不够的：license 标志、许可列表、订单、设备释放策略都会留下来，
   * 会话过期或被踢下线后 UI 仍会显示「已授权」、甚至渲染上一个账号的订单与功能码。
   */
  function resetSession() {
    sessionEpoch += 1;
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
    // 失败可降级（me 的 flags 已经写进 store），但要留痕。
    await load().catch(logAndIgnore("账号中心 /account（保留 /auth/me 的 flags）"));
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

  /** 认证接口已通过但「会话没存住」时回滚本地态并抛错，绝不让调用方提示成功。 */
  async function requirePersistedSession(action: "登录" | "注册"): Promise<void> {
    if ((await sessionPersisted()) === false) {
      resetSession();
      throw new Error(sessionNotPersistedMessage(action));
    }
  }

  async function login(account: string, password: string) {
    const result = await api<AccountPayload>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ account: account.trim(), password }),
    });
    applyAccount(result);
    await requirePersistedSession("登录");
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
    await requirePersistedSession("注册");
    return result;
  }

  async function logout() {
    // 同一个口径：接口失败也要把本地会话清干净（可降级 + 留痕），否则用户退不出去。
    await api("/auth/logout", { method: "DELETE" }).catch(logAndIgnore("退出登录接口"));
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

/**
 * 认证成功后确认「会话真的被浏览器收下了」。
 *
 * 服务端在登录 / 注册的响应里 `Set-Cookie`，但浏览器**可能直接丢弃**：例如入口把请求
 * 误标成 https（`X-Forwarded-Proto` 与实际不符）—— 带 `Secure` 的 Cookie 在明文地址下
 * 不会被保存（localhost / 127.0.0.1 除外）；也可能是浏览器策略（禁 Cookie、无痕、
 * 第三方 Cookie 限制）拦下了它。
 *
 * 注意 Secure 属性本身是**按本次请求实际用的那层**判定的（见后端
 * `secure_cookies_required`）：内网 `http://<IP>:8802` 直连与公网 https 入口并存时，
 * 明文那条不会被写成 Secure，所以「配了 STORE_COOKIE_SECURE 就必然存不住」不再成立。
 * 此时接口是 200，前端若照常提示「登录成功」，紧接着 StoreLayout 的 `/auth/me` 探针
 * 就会 401，界面又退回游客：用户看到的就是「提示登录成功，但前端仍是未登录」。
 *
 * 这里用一次 `/auth/me` 做确定性判定：
 * - 200 且带 `account` → 会话确实可用；
 * - 401 / 403 → Cookie 没落盘，调用方必须**按失败处理**，绝不能提示成功；
 * - 其它错误（网络抖动 / 5xx）→ 无法判定，返回 `null` 不阻断，交给页面里的探针
 *   按既有口径降级（探针自己会把 401 当未登录）。
 *
 * 放在模块级而不是 store 里：后台登录页（`features/admin/stores/admin.ts`）与
 * `/setup` 初始化页也要做同一条确认，它们不需要 store 实例。
 */
export async function sessionPersisted(): Promise<boolean | null> {
  try {
    const payload = await api<AccountPayload>("/auth/me");
    return Boolean(payload?.account);
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 401 || status === 403) return false;
    return null;
  }
}

/**
 * 「接口通过但会话没存住」的提示语。
 *
 * 必须把处置写出来：这不是账号密码错误，重试多少次都一样；根因在访问方式 / 浏览器策略。
 */
export function sessionNotPersistedMessage(action: "登录" | "注册"): string {
  return (
    `${action}请求已通过，但浏览器没有保存登录会话（Cookie 被丢弃），仍按未登录处理。` +
    "请检查浏览器是否禁用了 Cookie（无痕模式 / 第三方 Cookie 限制也会这样）；" +
    "若站点由反向代理或内网穿透提供，还要确认入口透传了 X-Forwarded-Proto。" +
    "重试无效时把这条提示和当前访问地址一起报给运维。"
  );
}

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
type ServerAuthState = "guest" | "user" | "admin" | "unknown";

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
