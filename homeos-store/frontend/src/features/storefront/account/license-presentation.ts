/**
 * 账号中心的**展示口径**：授权状态、有效期文案、解绑冷却倒计时、订单状态。
 *
 * 这些函数原先散在 `AccountView.vue` 的 script 里，只能靠读模板猜语义；抽出来之后
 * 它们是纯函数（时间一律可注入），既能在单测里钉住边界，也让「同一状态在列表与详情
 * 里说法一致」成为可检查的事实。
 *
 * 约定：
 * - 「现在」默认取 `Date.now()`，调用方需要响应式刷新时传入固定值；
 * - 所有日期解析失败一律回落到「永久 / 未知」而不是抛错 —— 账号中心不能因为一条脏
 * 数据显示整页错误。
 */

import type { StoreLicense, StoreOrder } from "@store/shared/types/store";

export function activationCode(item: StoreLicense): string {
  return String(item.activationCode || item.codeHint || "");
}

export function isExpired(item: StoreLicense, nowMs: number = Date.now()): boolean {
  return Boolean(item.accessExpiresAt) && new Date(String(item.accessExpiresAt)).getTime() <= nowMs;
}

export function stateVariant(item: StoreLicense, nowMs: number = Date.now()): "danger" | "warning" | "success" {
  if (!item.active) return "danger";
  return isExpired(item, nowMs) ? "warning" : "success";
}

export function stateText(item: StoreLicense, nowMs: number = Date.now()): string {
  if (!item.active) return "已停用";
  return isExpired(item, nowMs) ? "已到期" : "有效";
}

export function licenseTitle(item: StoreLicense, index: number, total: number): string {
  return item.userLabel || `主授权 #${total - index}`;
}

export function licensePeriod(item: StoreLicense): string {
  if (!item.accessExpiresAt) return item.validityDays ? `${item.validityDays} 天` : "永久授权";
  const start = item.accessStartedAt ? new Date(String(item.accessStartedAt)).toLocaleDateString("zh-CN") : "发卡日";
  const end = new Date(String(item.accessExpiresAt)).toLocaleDateString("zh-CN");
  return `${start} 至 ${end}`;
}

export function entitlementStatus(item: Record<string, unknown>, nowMs: number = Date.now()): string {
  const expired = Boolean(item.expiresAt) && new Date(String(item.expiresAt)).getTime() <= nowMs;
  if (!item.active) return "已停用";
  return expired ? "已到期" : "有效";
}

export function entitlementTarget(item: Record<string, unknown>, licenses: StoreLicense[]): string {
  const target = licenses.find((license) => license.activationCodeId === item.licenseId);
  return target ? `${target.userLabel || target.productName} · 激活码尾号 ${target.codeHint}` : "原主授权";
}

export function orderStatusLabel(item: StoreOrder): string {
  if (item.status === "paid" && item.fulfillmentMode === "manual") return "待人工发卡";
  return item.statusLabel || item.status || "";
}

export function policyDeadlineMs(policy: NonNullable<StoreLicense["deviceReleasePolicy"]>): number | null {
  if (policy.nextAllowedAt != null && policy.nextAllowedAt !== "") {
    const parsed =
      typeof policy.nextAllowedAt === "number" ? policy.nextAllowedAt : Date.parse(String(policy.nextAllowedAt));
    if (Number.isFinite(parsed)) return parsed;
  }
  if (policy.lastReleasedAt && policy.cooldownSeconds) {
    const start = Date.parse(String(policy.lastReleasedAt));
    if (Number.isFinite(start)) return start + Number(policy.cooldownSeconds) * 1000;
  }
  return null;
}

export function releaseRemaining(item: StoreLicense | null, nowMs: number = Date.now()): number {
  if (!item?.deviceReleasePolicy) return 0;
  const policy = item.deviceReleasePolicy;
  const deadline = policyDeadlineMs(policy);
  if (deadline != null) {
    return Math.max(0, Math.ceil((deadline - nowMs) / 1000));
  }
  return Math.max(0, Math.floor(Number(policy.remainingSeconds) || 0));
}

export function formatReleaseWait(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours} 时 ${minutes} 分 ${seconds} 秒`;
}
