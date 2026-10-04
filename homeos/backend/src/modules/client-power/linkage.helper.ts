/**
 * 客户端电量联动辅助函数模块。
 *
 * 职责：
 *  - 基于客户端上报的电量百分比，按滞回阈值（lowPercent / highPercent）计算单开关充电联动动作。
 *  - 输出标准化的 SwitchLinkageAction 列表供 ClientPowerService 执行。
 *
 * 依赖：
 *  - client-power.types 中的 ClientSystemState、ClientPowerClientConfig、SwitchLinkageAction 类型定义。
 */
import type {
  ClientSystemState,
  ClientPowerClientConfig,
  SwitchLinkageAction,
} from './types';
import { DEFAULT_CLIENT_POWER_SELF_CHARGE } from '@homeos/shared';

/**
 * 将电量值归一化为 0–100 之间的两位小数百分比。
 * 契约统一为 0–100 百分比；`<= 1` 启发式已移除（会把整数 1% 误判为 100%）。
 *
 * @param val 原始电量值，可能为 null/undefined/非有限数
 * @returns 归一化后的百分比（保留两位小数），输入无效时返回 null
 */
function clampPercent(val: number | null | undefined): number | null {
  if (val == null || !Number.isFinite(val)) return null;
  return Math.max(0, Math.min(100, Math.round(val * 100) / 100));
}

/** 峰段应急阈值：缺省 lowPercent-5，钳到 [0, lowPercent) */
function resolvePeakCriticalPercent(
  lowPercent: number,
  raw: number | null | undefined,
): number {
  const unclamped = clampPercent(raw) ?? lowPercent - 5;
  const exclusiveHigh = Math.max(0, lowPercent - 0.01);
  return Math.max(0, Math.min(unclamped, exclusiveHigh));
}

/** 峰段应急是否生效（启用分时 + 峰段 + 已配置有效应急阈值） */
function isPeakEmergency(touEnabled: boolean, isPeak: boolean, criticalPercent: number): boolean {
  return touEnabled && isPeak && criticalPercent > 0;
}

function peakDeferAction(
  clientCfg: ClientPowerClientConfig,
  entityId: string,
  level: number,
  criticalPercent: number,
): SwitchLinkageAction {
  return {
    entityId,
    domain: 'switch',
    service: 'turn_off',
    reason: `客户端 ${clientCfg.label} 处于峰电时段，电量 ${level}% 暂缓充电（谷段再充，应急阈值 ${criticalPercent}%）`,
    cooldownKey: `selfCharge:peak:${clientCfg.id}`,
  };
}

/** 单开关滞回充电：低于低阈值开、达到高阈值关，中间区间保持。
 *  支持峰谷错峰（touEnabled）：高峰时段暂缓充电（含滞回带），仅当电量跌破应急阈值 criticalPercent 时强制充电。
 */
export function evaluateSelfChargeActions(
  clientCfg: ClientPowerClientConfig,
  state: ClientSystemState,
  opts?: {
    /** 当前是否处于峰电时段（未启用分时时恒为 false） */
    isPeak?: boolean;
    /** 家庭电价分时是否启用；关闭时峰谷错峰不生效，滞回带保持不变 */
    timeOfUseActive?: boolean;
  },
): SwitchLinkageAction[] {
  const actions: SwitchLinkageAction[] = [];
  // 模块或自充电未启用时直接返回空动作列表，避免无谓计算
  if (!clientCfg.enabled || !clientCfg.selfCharge?.enabled) return actions;

  const entityId = String(clientCfg.chargerSwitchEntityId || '').trim();
  if (!entityId) return actions;

  const level = clampPercent(state.level);
  if (level == null) return actions;

  const lowPercent = clientCfg.selfCharge.lowPercent ?? DEFAULT_CLIENT_POWER_SELF_CHARGE.lowPercent;
  const highPercent =
    clientCfg.selfCharge.highPercent ?? DEFAULT_CLIENT_POWER_SELF_CHARGE.highPercent;
  const touEnabled =
    clientCfg.selfCharge.touEnabled === true && opts?.timeOfUseActive !== false;
  const criticalPercent = resolvePeakCriticalPercent(
    lowPercent,
    clientCfg.selfCharge.criticalPercent,
  );
  const isPeak = opts?.isPeak === true;
  const peakEmergency = isPeakEmergency(touEnabled, isPeak, criticalPercent);

  if (level < lowPercent) {
    // 峰谷错峰：峰段仅当跌破应急阈值时强制充电；处于 [critical, lowPercent) 时保持现状（死区），
    // 避免在应急阈值处反复通断（充过临界点即关、掉回又开，形成震荡）。
    if (peakEmergency && level >= criticalPercent) {
      // 死区：不下发动作，由物理开关维持，直到跌破应急阈值（继续充电）或充到 lowPercent（转下方滞回带关停）
    } else {
      actions.push({
        entityId,
        domain: 'switch',
        service: 'turn_on',
        reason: peakEmergency
          ? `客户端 ${clientCfg.label} 电量 ${level}% 低于应急阈值 ${criticalPercent}%，峰段强制充电`
          : `客户端 ${clientCfg.label} 电量 ${level}% 低于 ${lowPercent}%，打开开关 ${entityId}`,
        cooldownKey: `selfCharge:on:${clientCfg.id}`,
      });
    }
  } else if (level >= highPercent) {
    actions.push({
      entityId,
      domain: 'switch',
      service: 'turn_off',
      reason: `客户端 ${clientCfg.label} 电量 ${level}% 已达 ${highPercent}%，关闭开关 ${entityId}`,
      cooldownKey: `selfCharge:off:${clientCfg.id}`,
    });
  } else if (touEnabled && isPeak) {
    // 滞回带：谷段已打开充电器后进入峰段时仍应关充，避免用峰电充到 high。
    actions.push(peakDeferAction(clientCfg, entityId, level, criticalPercent));
  } else if (touEnabled && !isPeak) {
    // 谷/平段：峰段暂缓后恢复充电，直到 high（「高峰暂缓，谷段再充」）。
    actions.push({
      entityId,
      domain: 'switch',
      service: 'turn_on',
      reason: `客户端 ${clientCfg.label} 处于谷/平段，电量 ${level}% 恢复充电（目标 ${highPercent}%）`,
      cooldownKey: `selfCharge:on:${clientCfg.id}`,
    });
  }

  return actions;
}