/**
 * 所属模块：backend/modules/earthquake
 * 职责：
 *  - 地震模块内部类型；
 * 关键依赖：
 *  - -；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import type { EarthquakeAlertPayload } from '@homeos/shared';

export type { EarthquakeAlertPayload };

/** EEW 事件名常量，用于事件总线广播 */
export const EEW_EVENTS = {
  /** 早期预警（全屏 + 通知） */
  ALERT: 'earthquake.alert',
  /** 确认通报（仅通知，不全屏） */
  CONFIRMATION: 'earthquake.confirmation',
} as const;

/**
 * CENC 目录事件通知的冷却键前缀（模块内私有）。
 *
 * notification 模块的 `handleEarthquakeEewConfirmation` 与
 * earthquake 模块的 `EarthquakeCatalogNotifyService` 共用同一冷却键，
 * 保证「目录轮询直投」与「确认通报事件」两条链路对同一 eventId 只投递一条通知。
 */
const EEW_CATALOG_COOLDOWN_PREFIX = 'earthquake_cenc:';

/**
 * 构造 CENC 目录事件的通知冷却键。
 *
 * @param eventId 地震事件唯一标识
 * @returns 形如 `earthquake_cenc:20260921xxxx` 的冷却键
 */
export function eewCatalogCooldownKey(eventId: string): string {
  return `${EEW_CATALOG_COOLDOWN_PREFIX}${eventId}`;
}

/**
 * EEW 原始消息：由 WolfX WebSocket JSON 解析归一化而来。
 * 字段保留英文以与上游 API 对齐（magnitude/depth/lat/lon/originTime 等）。
 */
export interface EewRawMessage {
  /** 消息类型（如 eew / jma_eew），用于区分来源与发震区域时区 */
  type?: string;
  /** 归一化数据源：wolfx / sc_eew / cenc_eew / usgs / test */
  source?: string;
  /** 事件唯一标识，同次地震的多次上报共享同一 eventId */
  eventId: string;
  /** 上报序号（第 N 报），同一事件随修正递增 */
  reportId?: number;
  /** 发震时刻（UTC 毫秒时间戳） */
  originTime: number;
  /** 震中纬度 latitude */
  latitude: number;
  /** 震中经度 longitude */
  longitude: number;
  /** 震级 magnitude（M） */
  magnitude: number;
  /** 震源深度 depth（千米） */
  depth: number;
  /** 震中地点描述 epicenter */
  epicenter: string;
  /** 最大烈度 maxIntensity（字符串形式，如 "5+"） */
  maxIntensity?: string;
}

/**
 * EEW 运行时配置：由项目 layout 解析而来，控制预警开关与各项阈值。
 */
export interface EarthquakeRuntimeConfig {
  /** 是否启用 EEW 预警 */
  enabled: boolean;
  /** 家庭坐标纬度 latitude，null 表示未配置 */
  homeLat: number | null;
  /** 家庭坐标经度 longitude，null 表示未配置 */
  homeLon: number | null;
  /** 关注的最大震中距（千米），超过则不触发预警 */
  maxDistance: number;
  /** 最低震级 magnitude 下限，低于则不触发预警 */
  minMagnitude: number;
  /** 最低本地烈度下限，低于则不触发预警 */
  minLocalIntensity: number;
  /** 模拟演练全屏预警显示阈值（秒）；0=横波已到达。真实预警不受此项影响 */
  countdownLeadSec: number;
}
