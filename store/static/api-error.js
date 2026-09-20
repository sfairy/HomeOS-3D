/*
 * 前端唯一的「接口失败 → 人话」实现（P10，4.3 D 类）。
 *
 * 为什么单独成一个文件：FastAPI 的参数校验失败（422）返回的 ``detail`` 是**数组**
 * （``[{loc: ["body", "days"], msg: "Input should be a valid integer"}]``），而
 * 「把 detail 归一化成人话」这段知识原先在三处各写各的、能力还不一样：
 *
 *   · ``admin.html`` 的 ``describeApiError()`` 最全 —— 压成「参数 days：原因」；
 *   · ``store.js`` 只认字符串，其余一律退回通用文案 —— 顾客看得到失败了、看不到为什么；
 *   · ``setup.js`` 把 detail 直接塞进 ``textContent`` —— 数组会显示成 ``[object Object]``，
 *     而那恰恰是初始化页最常见的一类失败（邮箱格式、密码太短、引导密钥不对）。
 *
 * 少一种形态不会有任何报错，只会让某一类错误在**某一个页面**上变成看不懂的一句话，
 * 而同一个错误在后台是可读的。所以这里收成一份：形态认全 + 说不出来时用调用方给的兜底文案。
 *
 * 用法（三个消费方都必须接这一份，不要再各写一套）：
 *   admin.html / store.js / setup.js 里 ``ApiError.describe(detail, fallback)``，
 *   或 ``ApiError.fromResponse(response, data, fallback)``（顺带带出 ``status`` / ``payload``）。
 *
 * 契约（``fallback`` 只在「说不出具体原因」时使用，各页按自己的口吻给文案）：
 *
 *   | 输入的 detail | 输出 |
 *   | --- | --- |
 *   | 非空字符串 | 原样（后端写好的中文提示） |
 *   | FastAPI 422 数组 | ``参数 days：Input should be a valid integer``（多条用「；」连） |
 *   | 数组里的字符串条目 | 原样 |
 *   | 数组里说不出来源的条目 | ``取值不合法`` |
 *   | ``{msg}`` / ``{message}`` 对象 | 该文案 |
 *   | 空值 / 其他形态 / 数组里一条可用信息都没有 | ``fallback`` |
 *
 * ``loc`` 里的 ``body`` / ``query`` 是 FastAPI 的固定前缀，对着运营显示「参数 body.x」
 * 没有意义，去掉；剩下的用 ``.`` 拼（``body.items.0.days`` → ``items.0.days``）。
 *
 * 这个文件不碰 DOM、也不发请求，所以 node 可以直接 require 它单测。
 */
(function (global) {
  const DEFAULT_FALLBACK = '请求失败。';

  // 单个 422 条目 → 一行人话。认不出来时给「取值不合法」，不把对象本身泄露出去。
  function describeEntry(entry) {
    if (typeof entry === 'string') return entry;
    const field = Array.isArray(entry && entry.loc)
      ? entry.loc.filter(part => part !== 'body' && part !== 'query').join('.')
      : '';
    const reason = (entry && (entry.msg || entry.message)) || '取值不合法';
    return field ? `参数 ${field}：${reason}` : reason;
  }

  function describe(detail, fallback) {
    const text = fallback || DEFAULT_FALLBACK;
    if (!detail) return text;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      const lines = detail.map(describeEntry).filter(Boolean);
      return lines.length ? lines.join('；') : text;
    }
    if (typeof detail === 'object' && (detail.msg || detail.message)) {
      return String(detail.msg || detail.message);
    }
    return text;
  }

  // 非 2xx 响应 → 带状态码的 Error。调用方据此区分「没登录」（401/403，正常状态）
  // 与「真的坏了」（必须原样报出来），只按文案判断是不可靠的。
  function fromResponse(response, data, fallback) {
    const error = new Error(describe(data && data.detail, fallback));
    error.status = response.status;
    error.payload = data;
    return error;
  }

  global.ApiError = { describe, fromResponse, DEFAULT_FALLBACK };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.ApiError;
  }
})(typeof window !== 'undefined' ? window : globalThis);
