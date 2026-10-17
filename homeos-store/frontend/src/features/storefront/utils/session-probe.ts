/**
 * 首屏「要不要打一发 `/auth/me`」的判定。
 *
 * 商店外壳由服务端渲染，服务端在渲染这一页时刚解过一次会话，把结论写进
 * `<html data-auth="guest|user|admin">`（见 `backend/src/api/page_shell.py`）。
 * `guest` 不打探针（注定 401）；`user` / `admin` 打一次把账号、授权与订单读下来。
 *
 * 抽成纯函数是为了能断言：本模块不 import 任何东西，也不读 `document`，入参由调用方取好。
 */

/** 判定是否要发会话探针。 */
export function shouldProbeSession(serverAuth: string): boolean {
  return serverAuth === "user" || serverAuth === "admin";
}
