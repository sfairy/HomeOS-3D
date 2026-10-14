/**
 * `/admin` 的路由级闸门。
 *
 * 为什么判定逻辑抽在这里、而不是直接写在 `router/index.ts` 的 `beforeEach` 里：
 * 商店前端没有组件级测试运行时，守卫的判定只能靠浏览器手点才发现回归。抽成
 * 「入参即依赖」的纯函数之后，`scripts/_store_admin_guard_smoke.mjs` 能用假 store
 * 直接驱动它，把「未登录不放行 / 确认失败回登录屏 / 已验证不重复探针」变成断言。
 *
 * 本模块**不 import 任何东西**（不引 vue / pinia / vue-router，也不读 `location`）：
 * 一旦引入这些，冒烟就得先把浏览器环境搭起来，纯函数的意义就没了。
 */

/** 闸门回落的目标：与前台 `requiresAuth` 的落点一致（同一个登录页、同一套表单）。
 *
 * 导出是**有意的**：`scripts/_store_admin_guard_smoke.mjs` 断言它就是前台登录页，
 * 「闸门改道到别处」这种回归只能靠这条对账发现（私有常量时冒烟只能重抄一遍字面量，
 * 于是两边一起改错也没人知道）。
 */
export const STORE_LOGIN_PATH = "/user/authentication/login";

/** 放行（`true`）或改道（`replace` 为 true 时不往历史里塞一条，避免「后退」回不去）。 */
export type GuardResult = true | { path: string; replace: true };

/**
 * 守卫实际读取的导航目标：只声明 `meta`。
 *
 * 这里的形状是量过的，不是随手写的：`vue-router` 的 `RouteMeta` 是
 * `interface RouteMeta extends Record<PropertyKey, unknown>`，**只带索引签名**。
 * TypeScript 的「弱类型」检查（TS2559）不把索引签名算作「共同属性」，所以
 * 声明成 `{ requiresAuth?: unknown; area?: unknown }` 会让真实的
 * `RouteLocationNormalized` 不可赋值 —— 两个形状都试过，都报 TS2559。
 * 反过来把 `meta` 声明成 `Record<PropertyKey, unknown>`：真 `to` 与冒烟里的
 * 字面量都能赋值（`meta` 这个属性名是两边共有的），也不需要依赖 vue-router 类型。
 */
export interface GuardRoute {
  meta?: Record<PropertyKey, unknown>;
}

/** 闸门依赖的会话能力，由 `stores/admin` 提供（`router/index.ts` 里注入真实现）。 */
export interface AdminGateDeps {
  /** 服务端渲染进外壳的登录态：`guest` 表示服务端已确认这一页没有会话。 */
  serverAuthState(): string;
  /** 后台会话阶段：`boot` | `login` | `ready`。 */
  adminPhase(): string;
  /** 确认后台会话（`/auth/me` + 管理员作用域探针），返回是否可进后台。 */
  bootstrap(): Promise<boolean>;
  /** 会话确认失败时切回登录屏（并抹掉外壳上的登录态）。 */
  showLogin(): void;
}

/**
 * 判定一次导航：放行、还是改道。
 *
 * 三条分支，顺序即优先级：
 * 1. `requiresAuth` + 服务端已判定游客 → 直接换页（沿用改动前的行为，也是「未登录
 *    访问 `/admin` 连后台 chunk 都不下」的那一条）；
 * 2. 非后台路由 → 放行，其它页面的观感不受本闸门影响；
 * 3. 后台路由 → 先确认管理员会话；确认不了就切回登录屏状态并**放行**（就地显示
 *    后台那个登录屏，理由见下方注释）。
 */
export async function resolveAdminGate(
  to: GuardRoute,
  deps: AdminGateDeps,
): Promise<GuardResult> {
  const meta = to.meta ?? {};
  if (meta.requiresAuth === true && deps.serverAuthState() === "guest") {
    return { path: STORE_LOGIN_PATH, replace: true };
  }
  if (meta.area !== "admin") return true;
  // 后台会话已经确认过（用户正在控制台里跳页）：不再重复探针。
  if (deps.adminPhase() === "ready") return true;
  // `bootstrap()` 自己会把失败原因写进 `loginError` 并落到 login 阶段（见 `stores/admin.ts`），
  // 正常路径不抛错；这里的 `catch` 只兜「探针自己炸了」——守卫抛错会让整次导航失败，
  // 而白屏比「回登录屏重来一次」糟糕得多。失败路径统一走下面的确定性回落。
  let ok: boolean;
  try {
    ok = await deps.bootstrap();
  } catch {
    // 探针自身抛错 = 确认失败，交给下面的确定性回落（不留空 catch 的语义债：
    // 失败路径有明确去处，且 store 那边已经把原因写进了 `loginError`）。
    ok = false;
  }
  if (ok) return true;
  // 确认不了后台会话（非管理员账号 / 会话在渲染后被踢掉）→ 切回登录屏状态，**放行**到
  // `/admin` 就地显示后台登录屏。这里刻意不改道：后台自己的登录入口就在 `AdminLayout` 里，
  // 把它也挡掉就等于「一个非管理员账号访问 /admin，从此再也看不到后台登录屏」。
  // 「未登录不下发 console bundle」这条验收由上面 `requiresAuth` 那条分支保证 ——
  // 真正没会话的访客（`data-auth="guest"`）在更早一步就换页了，走不到这里。
  deps.showLogin();
  return true;
}
