/*
 * 前端唯一的金额 / 积分文案实现（分币整数 → 显示字符串）。
 */
// 千分位 + 强制两位小数。
const GROUPED_NUMBER: Intl.NumberFormatOptions = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
};

function numberText(cents: number | null | undefined): string {
  return ((cents ?? 0) / 100).toLocaleString('zh-CN', GROUPED_NUMBER);
}

/** 带货币符号的金额：`¥1,299.00`。 */
export function formatCents(cents: number | null | undefined): string {
  return '¥' + numberText(cents);
}

/**
 * 只要数字部分的金额：支付弹窗把「¥」单独排成小一号的符号，运费/预计到账这类
 */
export function formatCentsPlain(cents: number | null | undefined): string {
  return numberText(cents);
}

/** 积分（入参是厘）：渲染规则与金额相同，只是不带货币符号。 */
export const formatPoints = numberText;
