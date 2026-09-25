/**
 * 接口响应的「鉴权判定」与「可上抛错误」：编辑器、舞台页、展示端、授权页与日志引导共用一套口径。
 *
 * 为什么必须是同一处：后端门禁（`backend/core/dependencies.py` 的 licensed_user / licensed_viewer，
 * 以及 `backend/api/assets.py` 的素材读取）在 403 的 `detail.code` 里回 LICENSE_RESTRICTED，前端据此
 * 把人引到授权页。这个字面量原先在五个请求入口里各比一次 —— 后端一旦按能力分码（例如「素材受限」
 * 与「接口受限」拆成两个码），只有改到的那几处会引走用户，其余页面会把它当普通业务错误弹句提示
 * 就算了。这种故障最难发现的地方在于：页面没坏，只是不再把人送去能解决问题的页面。
 *
 * 这里只收「怎么判」与「怎么造错」。**落点与续行语义仍归调用方**，因为各处确实不同且有理由：
 * 编辑器 401 → /login 后抛出；展示端 401 → /pair 后返回 null（墙面屏前没人能填激活码）；
 * 403 的落点编辑器是 /license、展示端是就地 reload 自愈；3D 授权探测那一路（bridge/bridge.js）
 * 根本不跳转，只把状态码翻成人话。把这些差异参数化进一个公共函数，只会得到一个每个调用点都在
 * 用不同开关组合的壳子 —— 那比重复更难读。
 */
import { apiErrorMessage } from "./api-error.js?v=2609251754";

/**
 * 后端在 403 `detail.code` 里回的授权受限码。
 *
 * 刻意不导出：本模块是它在前端的唯一比较点，消费方一律走下面的 `apiAuthChallenge` 拿结论，
 * 而不是自己拿这个值去比 ——
 * 多一个出口就等于多一种「有人按它自己解释」的可能。
 */
const LICENSE_RESTRICTED_CODE = "LICENSE_RESTRICTED";

/**
 * 判定一次响应属于哪一种「鉴权类失败」。
 *
 * 403 必须连 `detail.code` 一起看：403 也可能是「这个账号没这个权限」之类与授权无关的拒绝，
 * 那种情况该走普通错误分支显示原因，而不是把人跳去授权页。
 *
 * @param {number} status HTTP 状态码。
 * @param {unknown} responsePayload 已解析的响应体，可能是 null（204 / 非 JSON 错误页）。
 * @returns {"session-expired" | "license-restricted" | null} 需要调用方处理的类别；null 表示不是鉴权问题。
 */
export function apiAuthChallenge(status, responsePayload) {
  if (status === 401) return "session-expired";
  if (status === 403 && responsePayload?.detail?.code === LICENSE_RESTRICTED_CODE) {
    return "license-restricted";
  }
  return null;
}

/**
 * 构造可上抛的接口错误：一次把「人话文案 + code + status + 原始响应体」挂齐，并交给日志桥关联响应。
 *
 * 文案优先级：手写的 `message` 优先（用于「登录状态已失效」这类与响应体无关的固定说法），
 * 否则交给 `apiErrorMessage(payload, fallback)` —— 它认得后端写好的中文 `detail`、顶层 `message`
 * 与 FastAPI 422 的数组形态。
 *
 * 字段齐一整套是刻意的：调用方要按状态码分支（例如 409 冲突）、要从 `payload.detail.code` 读
 * 业务码时，不该取决于「这个入口当时挂了哪几个字段」。
 *
 * @param {unknown} responsePayload 已解析的响应体。
 * @param {{ status?: number, message?: string, fallback?: string,
 *           response?: Response|null, link?: boolean }} [options]
 *   status 为 0 时不挂该字段；response 与 link 用于把错误关联到「已经上报过的那次响应」，避免同一
 *   错误被日志桥记两遍 —— 唯一传 `link: false` 的是日志桥自己的传输层（见 global-log-boot.js）。
 * @returns {Error} 已挂好字段的错误对象。**不抛出**：由调用方决定是 throw 还是只记一笔（展示端 401）。
 */
export function apiRequestError(responsePayload, options = {}) {
  const {
    status = 0,
    message = "",
    fallback = "",
    response = null,
    link = true
  } = options;
  const requestError = new Error(message || apiErrorMessage(responsePayload, fallback));
  if (status) requestError.status = status;
  const businessCode = responsePayload?.detail?.code;
  if (typeof businessCode === "string" && businessCode) requestError.code = businessCode;
  // 原始响应体一起带上：上层可能需要它里面的业务字段（例如导出一致性冲突时的既有 id）。
  requestError.payload = responsePayload ?? null;
  if (!link) return requestError;
  return window.HABridgeLog?.linkError(requestError, response) || requestError;
}
