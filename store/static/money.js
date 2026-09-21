/*
 * 前端唯一的金额 / 积分文案实现（分币整数 → 显示字符串）。
 *
 * 这份文件存在的理由：后台与前台曾各写一份，而且写成了两种呈现 —— 后台用
 * `toLocaleString`（`¥1,299.00`），前台用 `toFixed(2)`（`¥1299.00`）。同一笔金额在
 * 两端显示不同，且哪里都不会因此报错。现在统一成带千分位的写法：订单金额动辄四到六位，
 * 没有分隔符基本读不出量级。
 *
 * 单位：入参一律是**分币整数**（订单的 `amountCents`、积分的厘），不是元、不是浮点。
 * 两个单位都按 1/100 渲染（1 元 = 100 分、1 积分 = 100 厘），所以共用同一个换算。
 * 用法：`const money = HBMoney.formatCents;` / `HBMoney.formatPoints(centi)`。
 *
 * 不碰 DOM，node 可直接 require 单测。
 */
(function (global) {
  // 千分位 + 强制两位小数。缺列（undefined / null / 空串）一律当 0：老数据里常见。
  const GROUPED_NUMBER = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

  function numberText(cents) {
    return (Number(cents || 0) / 100).toLocaleString('zh-CN', GROUPED_NUMBER);
  }

  /** 带货币符号的金额：`¥1,299.00`。 */
  function formatCents(cents) {
    return '¥' + numberText(cents);
  }

  /**
   * 只要数字部分的金额：支付弹窗把「¥」单独排成小一号的符号，运费/预计到账这类
   * 句子里自带「元」字，都不能重复带符号。
   */
  function formatCentsPlain(cents) {
    return numberText(cents);
  }

  /** 积分（入参是厘）：渲染规则与金额相同，只是不带货币符号。 */
  const formatPoints = numberText;

  global.HBMoney = { formatCents, formatCentsPlain, formatPoints };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.HBMoney;
  }
})(typeof window !== 'undefined' ? window : globalThis);
