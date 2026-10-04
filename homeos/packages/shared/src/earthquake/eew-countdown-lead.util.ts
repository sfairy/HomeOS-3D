/**
 * @file eew-countdown-lead.util.ts
 * @module @homeos/shared/earthquake
 * @brief 模拟演练全屏预警倒计时阈值与演练事件判定。
 *
 * 职责：
 *  - 维护模拟演练可选的倒计时阈值（60s / 30s / 0=横波已到达）；
 *  - 判定 eventId 是否为演练事件（前缀 test_）；
 *  - 提供倒计时阈值 → 中文展示标签。
 *
 * 关键依赖：
 *  - 后端 /earthquake/test 接口生成 test_ 前缀 eventId；
 *  - 前端预警弹窗用 shouldShowEewCountdown 决定是否全屏倒计时。
 *
 * 约定：
 *  - 真实 EEW 不受 leadSec 阈值限制，仅模拟演练场景使用本阈值；
 *  - 横波到达模式（leadSec=0）仅在 countdown ≤ 0 时展示，避免提前误报。
 */

/** 模拟演练全屏预警倒计时形态：60s / 30s 倒计时，或横波已到达（真实预警不受此限制） */
export const EEW_COUNTDOWN_LEAD_OPTIONS = [60, 30, 0] as const;

/** 模拟演练 lead 秒数（与 EEW_COUNTDOWN_LEAD_OPTIONS 对齐） */
export type EewCountdownLeadSec = (typeof EEW_COUNTDOWN_LEAD_OPTIONS)[number];

/**
 * 规范化演练 lead 秒数。
 *
 * @param raw 原始值（任意类型）
 * @returns 合法的 EewCountdownLeadSec；非法值回退为 60
 */
export function normalizeEewCountdownLead(raw: unknown): EewCountdownLeadSec {
  // Logic fix: null/undefined/false/空串不应被 Number() 归一为 0（0 表示"横波已到达"），
  // 缺失值统一回退为默认 60，避免误把"未配置"当成"横波已到达"。
  if (raw == null || raw === false) return 60;
  if (typeof raw === 'string' && raw.trim() === '') return 60;
  const n = Number(raw);
  if (n === 0 || n === 30 || n === 60) return n;
  return 60;
}

/**
 * 判断 eventId 是否为模拟演练事件（前缀 test_，由后端 /earthquake/test 生成）。
 *
 * @param eventId 事件 ID
 * @returns true 表示该事件为演练，前端可标注"演练"角标
 */
export function isEewSimulationEventId(eventId: string | null | undefined): boolean {
  return Boolean(
    String(eventId || '')
      .trim()
      .startsWith('test_'),
  );
}

/**
 * 判定当前倒计时是否应进入全屏预警展示。
 *
 * @param countdown 横波到达倒计时（秒，可为负）
 * @param leadSec   阈值秒数
 * @returns true 表示应展示全屏预警
 *
 * 规则：
 *  - leadSec === 0：仅在横波已到达（countdown ≤ 0）时展示；
 *  - 其余：countdown ≤ leadSec 时展示。
 */
export function shouldShowEewCountdown(countdown: number, leadSec: EewCountdownLeadSec): boolean {
  if (leadSec === 0) return countdown <= 0;
  return countdown <= leadSec;
}

/**
 * 把演练 lead 秒数转为中文展示标签。
 *
 * @param leadSec 阈值秒数
 * @returns 形如"60s倒计时"或"横波已到达"
 */
export function eewCountdownLeadLabel(leadSec: EewCountdownLeadSec): string {
  if (leadSec === 0) return '横波已到达';
  return `${leadSec}s倒计时`;
}
