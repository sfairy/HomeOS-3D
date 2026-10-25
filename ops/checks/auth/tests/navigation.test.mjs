/**
 * 路由守卫的纯函数：`homeos/frontend/src/router/auth.util.ts`。
 *
 * 为什么用 `node --test` 而不是 Vitest：前端没有测试框架（也不需要为一条纯函数引一套），
 * 而 Node 24+ 能直接 strip 掉 `.ts` 的类型注解来 import —— 这个文件只含类型 import，
 * 没有 `@/` 运行时依赖，因此零构建即可跑。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

/** 用 import.meta.url 定位被测模块：不依赖跑测试时的 cwd。 */
const AUTH_UTIL = fileURLToPath(
  new URL("../../../../homeos/frontend/src/router/auth.util.ts", import.meta.url),
);
const { resolveNavigationTarget, resolveZeroUserTarget } = await import(AUTH_UTIL);

/** 构造一个「已初始化 + 已登录 + 已授权」的基线上下文，用例只覆写关心的字段。 */
function ctx(overrides = {}) {
  return {
    systemInitialized: true,
    isAuthenticated: true,
    licenseActivated: true,
    settingsLockEnabled: false,
    isSettingsUnlocked: true,
    ...overrides,
  };
}

/** 构造一个目标路由。`meta.requiresAuth` 用真值模拟需要登录的业务页。 */
function to(name, { path = `/${name}`, requiresAuth = false } = {}) {
  return { name, path, meta: requiresAuth ? { requiresAuth: true } : {} };
}

/**
 * 表驱动用例：每一行是「上下文 + 目标 → 期望决策」。
 *
 * 期望值口径：`null` = 放行；`false` = 取消导航；`undefined` = 暂停（等状态确定）；
 * 字符串 = 重定向目标。
 */
const CASES = [
  // ── 1. 初始化状态未知：一律暂停，既不跳也不放行 ──
  {
    title: "初始化状态未知时暂停导航",
    context: ctx({ systemInitialized: null, isAuthenticated: false }),
    target: to("login"),
    expected: undefined,
  },

  // ── 2. 后端离线：只放行入户页 ──
  {
    title: "离线时放行登录页",
    context: ctx({ systemInitialized: "offline", isAuthenticated: false }),
    target: to("login"),
    expected: null,
  },
  {
    title: "离线时放行注册页",
    context: ctx({ systemInitialized: "offline", isAuthenticated: false }),
    target: to("register"),
    expected: null,
  },
  {
    title: "离线时放行激活页",
    context: ctx({ systemInitialized: "offline", isAuthenticated: true }),
    target: to("activation"),
    expected: null,
  },
  {
    title: "离线时阻断业务页（不假装已授权）",
    context: ctx({ systemInitialized: "offline", isAuthenticated: true }),
    target: to("settings"),
    expected: false,
  },

  // ── 3. 零用户：登录页 / 注册页放行，其余一律去登录页 ──
  {
    title: "零用户停留登录页（页内给注册入口）",
    context: ctx({ systemInitialized: false, isAuthenticated: false, licenseActivated: null }),
    target: to("login"),
    expected: null,
  },
  {
    title: "零用户停留注册页",
    context: ctx({ systemInitialized: false, isAuthenticated: false, licenseActivated: null }),
    target: to("register"),
    expected: null,
  },
  {
    title: "零用户访问激活页先去登录页",
    context: ctx({ systemInitialized: false, isAuthenticated: false, licenseActivated: false }),
    target: to("activation"),
    expected: "/login",
  },
  {
    title: "零用户访问业务页先去登录页",
    context: ctx({ systemInitialized: false, isAuthenticated: false, licenseActivated: null }),
    target: to("settings", { requiresAuth: true }),
    expected: "/login",
  },
  {
    title: "零用户访问未命名路由也去登录页",
    context: ctx({ systemInitialized: false, isAuthenticated: false, licenseActivated: null }),
    target: { name: undefined, path: "/whatever", meta: {} },
    expected: "/login",
  },

  // ── 4. 已初始化仍在注册页：注册入口已关闭 ──
  {
    title: "已初始化且已登录访问注册页回首页",
    context: ctx(),
    target: to("register"),
    expected: "/",
  },
  {
    title: "已初始化但未登录访问注册页去登录页",
    context: ctx({ isAuthenticated: false }),
    target: to("register"),
    expected: "/login",
  },

  // ── 5. 需认证但未登录 ──
  {
    title: "未登录访问需要认证的页面去登录页",
    context: ctx({ isAuthenticated: false }),
    target: to("settings", { requiresAuth: true }),
    expected: "/login",
  },
  {
    title: "未登录访问公开展示页放行",
    context: ctx({ isAuthenticated: false }),
    target: to("public-display", { requiresAuth: false }),
    expected: null,
  },

  // ── 6. 授权状态未探测：暂停 ──
  {
    title: "已登录但授权状态未知时暂停",
    context: ctx({ licenseActivated: null }),
    target: to("settings", { requiresAuth: true }),
    expected: undefined,
  },

  // ── 7. 未激活 ──
  {
    title: "未激活且已登录 → 激活页",
    context: ctx({ licenseActivated: false }),
    target: to("settings", { requiresAuth: true }),
    expected: "/activate",
  },
  {
    title: "未激活且未登录 → 登录页（激活页要求本机会话）",
    context: ctx({ isAuthenticated: false, licenseActivated: false }),
    target: to("settings", { requiresAuth: true }),
    expected: "/login",
  },
  {
    title: "未激活时登录页放行（否则与激活页互踢）",
    context: ctx({ isAuthenticated: false, licenseActivated: false }),
    target: to("login"),
    expected: null,
  },
  {
    title: "未激活时找回密码页放行",
    context: ctx({ isAuthenticated: false, licenseActivated: false }),
    target: to("reset-password"),
    expected: null,
  },
  {
    title: "未激活时激活页放行",
    context: ctx({ isAuthenticated: true, licenseActivated: false }),
    target: to("activation"),
    expected: null,
  },

  // ── 8. 已登录且已授权仍停在入户页 ──
  {
    title: "已登录访问登录页回首页",
    context: ctx(),
    target: to("login"),
    expected: "/",
  },
  {
    title: "未登录停留登录页放行（否则 /login → / → /login 死循环）",
    context: ctx({ isAuthenticated: false }),
    target: to("login"),
    expected: null,
  },
  {
    title: "已登录访问找回密码页回首页",
    context: ctx(),
    target: to("reset-password"),
    expected: "/",
  },
  {
    title: "已授权访问激活页回首页",
    context: ctx(),
    target: to("activation"),
    expected: "/",
  },
  {
    title: "已授权但未登录访问激活页去登录页",
    context: ctx({ isAuthenticated: false }),
    target: to("activation"),
    expected: "/login",
  },

  // ── 9. 设置锁 ──
  {
    title: "设置锁未解锁时拦截设置页",
    context: ctx({ settingsLockEnabled: true, isSettingsUnlocked: false }),
    target: to("settings", { requiresAuth: true }),
    expected: "/",
  },
  {
    title: "设置锁未解锁时拦截编辑器",
    context: ctx({ settingsLockEnabled: true, isSettingsUnlocked: false }),
    target: to("builder", { requiresAuth: true }),
    expected: "/",
  },
  {
    title: "设置锁已解锁时放行设置页",
    context: ctx({ settingsLockEnabled: true, isSettingsUnlocked: true }),
    target: to("settings", { requiresAuth: true }),
    expected: null,
  },
  {
    title: "未启用设置锁时不拦截",
    context: ctx({ settingsLockEnabled: false, isSettingsUnlocked: false }),
    target: to("settings", { requiresAuth: true }),
    expected: null,
  },

  // ── 10. 默认放行 ──
  {
    title: "已授权访问业务页放行",
    context: ctx(),
    target: to("dashboard", { requiresAuth: true }),
    expected: null,
  },
];

for (const { title, context, target, expected } of CASES) {
  test(title, () => {
    assert.equal(resolveNavigationTarget(target, context), expected);
  });
}

test("resolveZeroUserTarget 只放行登录页与注册页", () => {
  assert.equal(resolveZeroUserTarget("login"), null);
  assert.equal(resolveZeroUserTarget("register"), null);
  assert.equal(resolveZeroUserTarget("activation"), "/login");
  assert.equal(resolveZeroUserTarget("settings"), "/login");
  assert.equal(resolveZeroUserTarget(undefined), "/login");
});

test("零用户规则与完整决策同口径", () => {
  // 两处手抄条件会漂：这里把「守卫放行 login/register、其余去 /login」这条规则
  // 与 resolveNavigationTarget 的第 3 步绑定在一起，任何一边改动都会在这里红。
  for (const name of ["login", "register", "activation", "settings"]) {
    assert.equal(
      resolveNavigationTarget(to(name), ctx({ systemInitialized: false, isAuthenticated: false, licenseActivated: null })),
      resolveZeroUserTarget(name),
      `零用户时 ${name} 的落点应由 resolveZeroUserTarget 单点决定`,
    );
  }
});
