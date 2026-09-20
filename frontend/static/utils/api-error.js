/**
 * 主应用侧唯一的「接口失败 → 人话」实现（P12，契约对齐商店侧 `store/static/api-error.js`）。
 *
 * 为什么要有这个文件：FastAPI 的参数校验失败（422）返回的 `detail` 是**数组**
 * （`[{loc: ["body","activationCode"], msg: "String should have at least 8 characters"}]`），
 * 而「把失败响应归一化成人话」这段知识在主应用里原先有 **9 份**各写各的、能力还不一样：
 *
 *   · `static/home.js` 的 `requestJson`、`static/license.js` 的 `errorMessage`、
 *     `static/display.js`、`static/global-log-boot.js`、`static/3d-studio/studio-app.js`、
 *     `static/renderer/renderer.js`、`modules/interaction3d/runtime.js` —— 七份只认
 *     「字符串」与 `detail.message`，**没有一个认数组**；
 *   · `static/setup.js` 那一份认数组（`detail[0]?.msg`），于是同一类错误只有初始化页可读；
 *   · `static/modules/interaction3d/editor.js` 那一份只认字符串，连 `detail.message`
 *     都不认 —— 户型载入失败时一律退成页面自己的重试文案。
 *
 * 少一种形态不会有任何报错，只会让某一类错误在**某一个页面**上变成看不懂的一句话。
 * 这不是假设：授权激活页输入短于 8 字符的激活码时，七个不认数组的调用点里就有一个当场
 * 把「参数 activationCode 长度不足（至少 8 个字符）」显示成 `请求失败：/license/activate
 * （HTTP 422）`。
 *
 * 与商店那份的关系：**刻意是镜像，不是重复**。两棵树是两个独立部署（`store/` 有自己的
 * 镜像、自己的静态目录），加载方式也不同 —— 商店页面是经典 `<script>`
 * （那份用全局名 `ApiError` + 可选 CJS 尾巴），主应用这一份的消费方**全是 ES module**
 * （见各 `*.html` 的 `type="module"`），所以这里用命名导出。两边无法共用一个文件，
 * 契约则逐条对齐，于是「同一份知识只有一处」在**每棵树的范围内**成立。
 *
 * 对外只有 `apiErrorMessage` 一个入口：8 个消费点手上都有**整个响应体**，而「从任意载荷里
 * 挑出最能说明问题的那句话」正是这一份知识；拆出更细的函数只会多几个没人用的导出。
 * 契约（`fallback` 只在「说不出具体原因」
 * 时使用，各调用点按自己的口吻给文案）：
 *
 *   | 输入的 payload | 输出 |
 *   | --- | --- |
 *   | `detail` 是非空字符串 | 原样（后端写好的中文业务提示） |
 *   | 顶层 `message` 是非空字符串 | 原样（后端给的中文校验摘要，见下） |
 *   | `detail` 是 FastAPI 422 数组 | `参数 days：Input should be a valid integer`（多条用「；」连） |
 *   | 数组里的字符串条目 | 原样 |
 *   | 数组里说不出来源的条目 | `取值不合法` |
 *   | `detail` 是 `{msg}` / `{message}` 对象 | 该文案 |
 *   | 空值 / 其他形态 / 一条可用信息都没有 | `fallback` |
 *
 * `loc` 里的 `body` / `query` 是 FastAPI 的固定前缀，对着用户显示「参数 body.x」没有意义，
 * 去掉；剩下的用 `.` 拼（`body.items.0.days` → `items.0.days`）。
 *
 * 与后端的**分工**（刻意不重叠，免得同一份知识又变成两份）：
 *   · 后端负责「**这一次校验为什么没过、该怎么改**」—— `backend/app/main.py` 的
 *     `RequestValidationError` 处理器在标准 422 体上**追加**一个顶层 `message`：中文摘要，
 *     且知道约束值（例如「参数 activationCode 长度不足（至少 8 个字符）。」）。它只在
 *     校验失败时出现。
 *   · 这里负责「**从任意错误载荷里挑出最能说明问题的那句话、并保证永远不出现
 *     `[object Object]` / `undefined`**」—— 包括没有 `message` 的载荷（别的接口、
 *     更旧的后端、第三方错误），那些情况下数组形态仍要能读出人话。
 *
 * 边界如实写在这里：只认 `detail` 与顶层 `message` 两个位置。别处塞进来的错误结构
 * （例如某个接口把原因放在 `error` 字段）不在这份契约里 —— 那需要改的是接口，不是这里。
 */

/**
 * 说不出具体原因时使用的兜底文案。
 *
 * @type {string}
 */
const DEFAULT_API_ERROR_TEXT = "请求失败。";

/**
 * 单个 422 条目 → 一行人话。
 *
 * 认不出来时给「取值不合法」，**不把对象本身泄露出去** —— `String(entry)` 会产出
 * `[object Object]`，那正是这份知识要终结的形态（商店侧 P10 把它列为红线）。
 *
 * @param {unknown} entry FastAPI 校验错误数组里的一条，或任意形态的条目。
 * @returns {string} 可直接展示的一句话。
 */
function describeEntry(entry) {
  if (typeof entry === "string") return entry;
  const field = Array.isArray(entry?.loc)
    ? entry.loc.filter(part => part !== "body" && part !== "query").join(".")
    : "";
  const reason = entry?.msg || entry?.message || "取值不合法";
  return field ? `参数 ${field}：${reason}` : reason;
}

/**
 * 把 ``detail`` 归一化成人话（不懂顶层 `message`，那是 `apiErrorMessage` 的事）。
 *
 * @param {unknown} detail 响应体里的 `detail` 字段。
 * @param {string} text 说不出具体原因时使用的文案（调用方已保证非空）。
 * @returns {string} 可直接展示的一句话。
 */
function describeApiErrorDetail(detail, text) {
  if (!detail) return text;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const lines = detail.map(describeEntry).filter(Boolean);
    return lines.length ? lines.join("；") : text;
  }
  if (typeof detail === "object" && (detail.msg || detail.message)) {
    return String(detail.msg || detail.message);
  }
  return text;
}

/**
 * 从整个响应体里挑出最能说明问题的一句话。
 *
 * 优先顺序是**刻意**的：
 *   1. `detail` 是非空字符串 —— 业务错误，后端已经写好了面向用户的中文（例如
 *      「激活码已被使用」），比任何摘要都准；
 *   2. 顶层 `message` —— 校验失败的中文摘要（`main.py` 给的，知道约束值）；
 *   3. 其余形态交给 `describeApiErrorDetail` 兜底（数组 / `{message}` / 认不出来 → fallback）。
 *
 * 为什么第 2 条排在第 3 条前面：数组里的 `msg` 是 pydantic 的英文原句，而 `message`
 * 是后端按同一份错误算出来的中文摘要 —— 两者信息量相同，可读性差一个量级。
 *
 * @param {unknown} payload 已解析的响应体（解析失败时给 `null` / `{}`）。
 * @param {string} [fallback] 说不出具体原因时使用的文案。
 * @returns {string} 永远非空 —— 空串会被调用方当成「没写文案」而显示出空白提示。
 */
export function apiErrorMessage(payload, fallback) {
  const detail = payload?.detail;
  if (typeof detail === "string" && detail) return detail;
  const summary = payload?.message;
  if (typeof summary === "string" && summary) return summary;
  return describeApiErrorDetail(detail, fallback || DEFAULT_API_ERROR_TEXT);
}
