/**
 * @file client-power-wake.util.ts
 * @module @homeos/shared/config
 * @brief 终端充电器开关「人来亮屏」屏保唤醒判定与公开配置抽取。
 *
 * 职责：
 *  - 判定充电器开关由关变开（isSwitchOffToOn，仅认明确 off→on）；
 *  - 判定屏保可见且非预览时是否应因充电器开关 off→on 退出屏保；
 *  - 从完整客户端电源配置抽取公开（无密钥）的"人来亮屏"绑定子集；
 *  - 按 clientId 解析其充电器开关 entity_id（精确匹配；单机可回退）。
 *
 * 关键依赖：
 *  - config/client-power 提供完整 ClientPowerSettings 结构（含 reportToken 等私密字段）；
 *  - 后端屏保管理器按本模块决定是否退出屏保，并按 buildClientPowerWakePublic 暴露给前端。
 *
 * 约定：
 *  - 不写入 reportToken；非屏保时不产生任何开关控制动作；
 *  - 首次快照 / unavailable / 保持 on 都不算 off→on；
 *  - presenceWakeEnabled 显式为 false 的客户端在抽取时被过滤；
 *  - 本机 clientId 对不上且仅一台启用了人来亮屏时，回退订阅那台的开关。
 */
import type { ClientPowerSettings } from './client-power';

/** 抽取人来亮屏公开配置时只需 id / 充电器实体 / 开关；其余字段可缺省 */
export type ClientPowerWakeSourceClient = {
  id?: string;
  chargerSwitchEntityId?: string;
  presenceWakeEnabled?: boolean;
};

/** 完整 ClientPowerSettings.clients，或仅含唤醒字段的宽松结构 */
export type ClientPowerWakeSource = Pick<ClientPowerSettings, 'clients'> | {
  clients?: ClientPowerWakeSourceClient[] | null;
};

/** 公开配置中的人来亮屏绑定（无密钥） */
export interface ClientPowerWakeClientPublic {
  id: string;
  chargerSwitchEntityId: string;
  presenceWakeEnabled: boolean;
}

/**
 * 对外公开的「人来亮屏」绑定配置（剔除 reportToken 等私密字段）。
 * 后端下发给前端做屏保唤醒判断的只读结构；clients 已按 presenceWakeEnabled=false 过滤。
 */
export interface ClientPowerWakePublic {
  /** 客户端人来亮屏绑定列表（空数组表示未配置任何客户端） */
  clients: ClientPowerWakeClientPublic[];
}

function normState(state: string | null | undefined): string {
  return String(state || '').trim().toLowerCase();
}

/** 仅认明确的关 → 开；首次快照 / unavailable / 保持 on 都不算 */
export function isSwitchOffToOn(
  oldState: string | null | undefined,
  newState: string | null | undefined,
): boolean {
  return normState(oldState) === 'off' && normState(newState) === 'on';
}

/**
 * 屏保可见且非预览时，充电器开关由关变开则应退出屏保。
 * 开关保持开启时返回 false，空闲超时仍按原逻辑进入屏保。
 */
export function shouldDismissScreensaverOnChargerSwitch(opts: {
  screensaverVisible: boolean;
  previewActive?: boolean;
  oldState?: string | null;
  newState?: string | null;
}): boolean {
  if (!opts.screensaverVisible) return false;
  if (opts.previewActive) return false;
  return isSwitchOffToOn(opts.oldState, opts.newState);
}

/**
 * 从完整的客户端电源配置中抽取对外公开（无密钥）的人来亮屏绑定子集。
 * 过滤掉 presenceWakeEnabled 显式为 false 的客户端，以及 id 或充电器实体缺失的无效项。
 *
 * @param clientPower 完整 ClientPowerSettings 的 clients 子集，或仅含唤醒字段的宽松结构
 * @returns 公开的 ClientPowerWakePublic（clients 数组永不为 null；空时返回 { clients: [] }）
 * @throws 不抛异常；任何非法输入均返回空 clients 的结构
 */
export function buildClientPowerWakePublic(
  clientPower: ClientPowerWakeSource | null | undefined,
): ClientPowerWakePublic {
  const clients: ClientPowerWakeClientPublic[] = [];
  for (const row of clientPower?.clients || []) {
    const id = String(row?.id || '').trim();
    const chargerSwitchEntityId = String(row?.chargerSwitchEntityId || '').trim();
    if (!id || !chargerSwitchEntityId) continue;
    if (row.presenceWakeEnabled === false) continue;
    clients.push({
      id,
      chargerSwitchEntityId,
      presenceWakeEnabled: true,
    });
  }
  return { clients };
}

/**
 * 按 clientId 解析其绑定的充电器开关 entity_id（用于屏保唤醒订阅）。
 * 客户端不存在或 presenceWakeEnabled === false 时返回空串。
 */
export function resolveChargerSwitchWakeEntityId(
  wake: ClientPowerWakePublic | null | undefined,
  clientId: string,
): string {
  const id = String(clientId || '').trim();
  if (!id) return '';
  const row = (wake?.clients || []).find((c) => c.id === id);
  if (!row || row.presenceWakeEnabled === false) return '';
  return String(row.chargerSwitchEntityId || '').trim();
}

/** 本机人来亮屏开关解析结果（精确匹配 / 单机回退 / 未匹配） */
export type ChargerWakeResolveKind = 'exact' | 'single_client_fallback' | 'unmatched';

/** 本机人来亮屏绑定解析：entityId 为空时不应订阅 */
export interface ChargerWakeResolveResult {
  entityId: string;
  kind: ChargerWakeResolveKind;
}

function wakeEnabledClients(
  wake: ClientPowerWakePublic | null | undefined,
): ClientPowerWakeClientPublic[] {
  const out: ClientPowerWakeClientPublic[] = [];
  for (const row of wake?.clients || []) {
    if (row.presenceWakeEnabled === false) continue;
    const chargerSwitchEntityId = String(row.chargerSwitchEntityId || '').trim();
    if (!chargerSwitchEntityId) continue;
    out.push({ ...row, chargerSwitchEntityId, presenceWakeEnabled: true });
  }
  return out;
}

/**
 * 解析本机应订阅的人来亮屏充电器开关。
 * 先按 clientId 精确匹配；对不上且仅一台启用了人来亮屏时回退到那台（墙屏清缓存/换 kiosk 常见）。
 * 多台终端不回退，避免客厅开关误亮卧室屏。
 */
export function resolveChargerSwitchWakeForDevice(
  wake: ClientPowerWakePublic | null | undefined,
  clientId: string,
): ChargerWakeResolveResult {
  const exact = resolveChargerSwitchWakeEntityId(wake, clientId);
  if (exact) return { entityId: exact, kind: 'exact' };
  const enabled = wakeEnabledClients(wake);
  if (enabled.length === 1) {
    return { entityId: enabled[0].chargerSwitchEntityId, kind: 'single_client_fallback' };
  }
  return { entityId: '', kind: 'unmatched' };
}

/**
 * 按本机 clientId 解析人来亮屏开关 entity_id（含单机回退）。
 * 多终端且 ID 对不上时返回空串。
 */
export function resolveChargerSwitchWakeEntityIdForDevice(
  wake: ClientPowerWakePublic | null | undefined,
  clientId: string,
): string {
  return resolveChargerSwitchWakeForDevice(wake, clientId).entityId;
}
