/*
 * 前端唯一的金额 / 积分文案实现（分币整数 → 显示字符串）。
 */
  // 千分位 + 强制两位小数。缺列（undefined / null / 空串）一律当 0：老数据里常见。
  const GROUPED_NUMBER = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

function numberText(cents) {
  return (Number(cents || 0) / 100).toLocaleString('zh-CN', GROUPED_NUMBER);
}

/** 带货币符号的金额：`¥1,299.00`。 */
export function formatCents(cents) {
  return '¥' + numberText(cents);
}

/**
 * 只要数字部分的金额：支付弹窗把「¥」单独排成小一号的符号，运费/预计到账这类
 */
export function formatCentsPlain(cents) {
  return numberText(cents);
}

/** 积分（入参是厘）：渲染规则与金额相同，只是不带货币符号。 */
export const formatPoints = numberText;

