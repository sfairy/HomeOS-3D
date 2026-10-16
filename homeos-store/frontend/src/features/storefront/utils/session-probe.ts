/**
 * 首屏「要不要打一发 `/auth/me`」的判定（登录态提示的优先级链）。
 *
 * 商店外壳是服务端渲染的，服务端在渲染这一页时**刚解过一次会话**，把结论写进
 * `<html data-auth="guest|user|admin">`（见 `backend/src/api/page_shell.py`）。客户端挂载后
 * 还要不要再探一次，取决于三个信号谁更权威：
 *
 * 1. `data-auth="guest"` —— 服务端已确认这一页没有会话，探针注定 401，直接不打；
 * 2. `data-auth` 缺失（`unknown`，老模板 / 静态托管）—— 退回「按 hint 猜」的老行为：
 *    `hb-auth-hint` 类（客户端上次已知的登录态）在，或者这一页**必须**登录，就打；
 * 3. `user` / `admin` —— 有会话，探一次把账号、授权与订单读下来。
 *
 * 抽成纯函数是为了能断言：这条链以前内联在 `StoreLayout.vue` 的 `onMounted` 里，
 * 而商店前端没有组件级测试运行时 —— 判定写错了（比如把 `unknown` 当成 `guest`）
 * 只会表现为「白打一发 401」或「已登录用户看到游客外壳」，手点很难分清。
 *
 * 本模块**不 import 任何东西**，且不读 `document`：入参由调用方取好，判定才是纯的。
 * 登录态取值与 `stores/session.ts` 的 `ServerAuthState` 一致，但这里收 `string`
 * （纯函数不引入 store 的类型依赖，与 `router/admin-guard.ts` 同一口径）。
 */

interface SessionProbeInputs {
  /** `<html data-auth>` 的取值：`guest` | `user` | `admin`，缺失时归一化成 `unknown`。 */
  serverAuth: string;
  /** 是否有 `hb-auth-hint` 类：客户端上次已知「已登录」的提示。 */
  hinted: boolean;
  /** 当前这一页是否必须要会话（账号中心 / 邀请有礼）。 */
  requiresAuth: boolean;
}

/** 判定是否要发会话探针。信号优先级见模块 docstring：服务端结论 > hint > 页面要求。 */
export function shouldProbeSession({
  serverAuth,
  hinted,
  requiresAuth,
}: SessionProbeInputs): boolean {
  if (serverAuth === "guest") return false;
  if (serverAuth === "user" || serverAuth === "admin") return true;
  // 认不出的取值（含属性缺失）一律按 `unknown` 处理，不按「已登录」猜：
  // 服务端将来加了新的登录态取值时，宁可多发一发探针，也不要拿旧结论冒充新会话。
  return hinted || requiresAuth;
}
