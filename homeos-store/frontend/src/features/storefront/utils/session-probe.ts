/**
 * 首屏「要不要打一发 `/auth/me`」的判定。
 *
 * 商店外壳由服务端渲染，服务端在渲染这一页时刚解过一次会话，把结论写进
 * `<html data-auth="guest|user|admin">`（见 `backend/src/api/page_shell.py`）。
 * `guest` 不打探针（注定 401）；`user` / `admin` 打一次把账号、授权与订单读下来。
 *
 * 抽成纯函数是为了能断言：本模块不 import 任何东西，也不读 `document`，入参由调用方取好。
 */

/** 判定是否要发会话探针。
 *
 * 只有服务端**明确**判定 guest 才跳过（那一定 401）。
 * `unknown` 必须探：Vite 开发索引不经过 page_shell 渲染，没有 data-auth 属性，
 * 若按「不认识就不探」处理，硬刷新 `/user/referrals` 会在 StoreLayout 里读到
 * `session.account === null`，被误判为未登录并踢回登录页 —— 而会话 cookie 其实是好的。
 */
export function shouldProbeSession(serverAuth: string): boolean {
  return serverAuth !== "guest";
}
