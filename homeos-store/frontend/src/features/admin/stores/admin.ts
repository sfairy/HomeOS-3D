/** 后台会话与导航徽标。 */

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { adminApi, api } from "@store/shared/api/http";
import { errorMessage } from "@store/shared/types/store";
import {
  serverAuthState,
  sessionNotPersistedMessage,
  sessionPersisted,
  setAuthHint,
  setServerAuthState,
} from "@store/shared/stores/session";
import { useSiteStore } from "@store/shared/stores/site";
import { logAndIgnore } from "@store/shared/utils/best-effort";

interface MePayload {
  account?: { email?: string; isAdmin?: boolean };
  hasPermanentLicense?: boolean;
  hasTemporaryLicense?: boolean;
}

export const useAdminStore = defineStore("admin", () => {
  const account = ref<{ email?: string } | null>(null);
  const phase = ref<"boot" | "login" | "ready">("boot");
  const loginError = ref("");
  const loading = ref(false);
  const navBadges = ref<Record<string, number>>({});

  const email = computed(() => account.value?.email || "");
  const initial = computed(() => (email.value || "A").trim().charAt(0).toUpperCase());

  function setNavBadge(page: string, count: unknown) {
    const value = Number(count) || 0;
    if (value) navBadges.value[page] = value;
    else delete navBadges.value[page];
  }

  async function resolveSession(): Promise<boolean> {
    const site = useSiteStore();
    let me: MePayload | null = null;
    try {
      me = await api<MePayload>("/auth/me");
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 401 || status === 403) {
        // 会话已经不在服务端了：把外壳上的登录态一起抹掉，否则每次打开后台
        // 都要先打一发注定 401 的探针才肯回登录屏。
        clearAuthState();
        return false;
      }
      throw new Error(`无法确认登录状态：${errorMessage(error)}`);
    }
    if (!me?.account) {
      clearAuthState();
      return false;
    }
    try {
      // 会话探针走后台作用域：`/store-admin/v1/overview` 只对管理员放行，
      // 普通商店账号在这里就会被挡回登录屏。
      await adminApi("/overview");
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 401 || status === 403) {
        clearAuthState();
        return false;
      }
      throw error;
    }
    account.value = me.account;
    markAdminAuth(me);
    void site.load();
    return true;
  }

  /** 后台登入后同步外壳登录态：商店前台复用同一份 hint，导航才不会闪成游客。 */
  function markAdminAuth(me?: MePayload | null) {
    setAuthHint(
      true,
      Boolean(me?.hasPermanentLicense),
      Boolean(me?.hasTemporaryLicense),
    );
    setServerAuthState("admin");
  }

  function clearAuthState() {
    account.value = null;
    setAuthHint(false);
  }

  async function bootstrap(): Promise<boolean> {
    // 已经确认过管理员会话就别再探一次：路由闸门（`router/admin-guard.ts`）放行
    // 到这一页之前刚跑过 bootstrap，而 `AdminLayout` 挂载时还会再叫一次 ——
    // 没有这一句，每次进入控制台都要白打两发 `/auth/me` + `/store-admin/v1/overview`。
    // 会话在控制台里失效由 `adminApi` 的 401/403 兜底（`showLogin()`），不靠这里复查。
    if (phase.value === "ready" && account.value) return true;
    // 这一页的 HTML 就是服务端刚渲染的，`data-auth="guest"` 等于服务端已经确认
    // 没有会话 —— 直接给登录屏，省掉一发注定 401 的 `/auth/me`。
    if (serverAuthState() === "guest") {
      clearAuthState();
      phase.value = "login";
      return false;
    }
    loading.value = true;
    try {
      const ok = await resolveSession();
      phase.value = ok ? "ready" : "login";
      if (!ok) account.value = null;
      return ok;
    } catch (error) {
      loginError.value = errorMessage(error);
      phase.value = "login";
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function login(emailValue: string, password: string) {
    loginError.value = "";
    await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ account: emailValue.trim(), password }),
    });
    // 先确认会话真的存住了：Cookie 被丢弃时 `resolveSession` 只会得到 401，
    // 沿用下面的「检查账号权限」会把人往错误方向带（见 sessionPersisted 的注释）。
    if ((await sessionPersisted()) === false) {
      clearAuthState();
      throw new Error(sessionNotPersistedMessage("登录"));
    }
    const ok = await resolveSession();
    phase.value = ok ? "ready" : "login";
    if (!ok) throw new Error("登录成功但无法进入后台，请检查账号权限。");
  }

  async function logout() {
    // 退出登录接口打不通也必须继续清本地会话：否则用户「退不出去」。
    // 失败留痕（可降级），但绝不阻断。
    await api("/auth/logout", { method: "DELETE" }).catch(logAndIgnore("后台退出登录接口"));
    account.value = null;
    navBadges.value = {};
    // 后台退出同样要清掉前台那份登录态：否则接着点「返回商店前台」时，
    // 外壳还按已登录处理，商店会白探一发 /auth/me 再收一个 401。
    setAuthHint(false);
    phase.value = "login";
  }

  function showLogin(message = "") {
    // 走到这里说明后台会话已经失效（`adminApi` 收到 401/403），
    // 顺带抹掉外壳上的登录态，下次挂载就不必再探一发。
    clearAuthState();
    loginError.value = message;
    phase.value = "login";
  }

  return {
    account,
    phase,
    loginError,
    loading,
    navBadges,
    email,
    initial,
    setNavBadge,
    bootstrap,
    login,
    logout,
    showLogin,
  };
});
