/**
 * 客户端系统信息与电量联动 类型定义模块。
 *
 * 职责：
 *  - 定义客户端系统信息上报、运行时状态、待配对记录、联动动作等数据结构。
 *  - 复用 AppConfigData 中的 clientPower 配置类型，避免重复定义。
 *
 * 依赖：
 *  - AppConfigData：提供 clientPower 全局配置类型。
 */
import type { AppConfigData } from '../../shared/app-config/types';

/** 客户端电池信息（来自浏览器 Battery API） */
export interface ClientSystemBatteryInfo {
  /** 是否支持 Battery API */
  supported: boolean;
  /** 电量百分比（0–100），不支持时为 null */
  level: number | null;
  /** 是否正在充电，不支持时为 null */
  charging: boolean | null;
  /** 距离充满的秒数，不支持时为 null */
  chargingTime: number | null;
  /** 距离耗尽的秒数，不支持时为 null */
  dischargingTime: number | null;
  /** insecure-context | safari | api-unavailable */
  unsupportedReason?: string;
}

/** 客户端系统信息（硬件、平台、显示、能力、网络、电量等聚合结构） */
export interface ClientSystemInfo {
  /** 硬件信息：CPU 核心数、设备内存、性能分级与分级依据 */
  hardware: {
    cores: number;
    deviceMemory: number | null;
    tier: string;
    tierReason: string;
  };
  /** 平台信息：UA、平台、语言、厂商、是否移动端 */
  platform: {
    userAgent: string;
    platform: string;
    language: string;
    vendor: string;
    mobile: boolean;
  };
  /** 显示信息：分辨率、屏幕尺寸、像素比、配色方案、是否手机/平板形态 */
  display: {
    width: number;
    height: number;
    screenWidth: number;
    screenHeight: number;
    pixelRatio: number;
    colorScheme: 'dark' | 'light' | 'unknown';
    phoneLike: boolean;
    tabletLike: boolean;
  };
  /** 设备能力：触控、独立模式、ServiceWorker、减少动画 */
  capabilities: {
    touch: boolean;
    standalone: boolean;
    serviceWorker: boolean;
    reducedMotion: boolean;
  };
  /** 网络信息（来自 Network Information API，不支持时为 null） */
  network: {
    effectiveType?: string | null;
    downlink?: number | null;
    rtt?: number | null;
    saveData?: boolean;
  } | null;
  battery: ClientSystemBatteryInfo;
  /** 客户端上报时间（ISO 字符串） */
  reportedAt: string;
}

/** 客户端系统信息上报（电量在 systemInfo.battery 内） */
export interface ClientSystemReportDto {
  clientId: string;
  systemInfo?: ClientSystemInfo;
  reportToken?: string;
}

/** 客户端运行时状态：归一化后的电量字段 + 在线/待配对/鉴权等运行时标志 */
export interface ClientSystemState {
  clientId: string;
  systemInfo: ClientSystemInfo | null;
  /** 归一化后的电量百分比（0–100），不支持电量 API 时为 null */
  level: number | null;
  charging: boolean | null;
  chargingTime: number | null;
  dischargingTime: number | null;
  batterySupported: boolean;
  /** 最近一次上报时间（ISO 字符串） */
  lastReportAt: string;
  /** 是否在线（基于 staleTimeoutSec 判定） */
  online: boolean;
  /** 客户端显示名（取自配置的 label） */
  label?: string;
  /** 是否为待配对终端（未在配置中注册） */
  pending?: boolean;
  /** 已持有有效 reportToken（运行时） */
  reportTokenAcknowledged?: boolean;
  /** 上次确认时所匹配的 expected reportToken 哈希，用于检测 token 轮换 */
  reportTokenHash?: string;
}

/** 待配对终端的发现记录（未在配置中注册但已上报系统信息） */
export interface PendingClientState {
  clientId: string;
  systemInfo: ClientSystemInfo | null;
  /** 首次发现时间（ISO 字符串） */
  firstSeenAt: string;
  /** 最近上报时间（ISO 字符串） */
  lastReportAt: string;
}

/** 开关联动动作：由 helper 计算后交给 service 执行 */
export interface SwitchLinkageAction {
  entityId: string;
  domain: 'switch';
  service: 'turn_on' | 'turn_off';
  /** 触发原因（用于日志与审计） */
  reason: string;
  /** 冷却键，避免短时间内重复触发同一动作 */
  cooldownKey: string;
}

/** clientPower 全局配置类型（来自 AppConfigData） */
type ClientPowerConfig = AppConfigData['clientPower'];
/** 单个客户端配置类型（取自 clients 数组元素） */
export type ClientPowerClientConfig = ClientPowerConfig['clients'][number];

/** 持久化到 RuntimeKv 的运行时配置 ID */
export const CLIENT_POWER_RUNTIME_CONFIG_ID = 'client-power-runtime';

/** 持久化运行时状态结构（不含在线标志，重启后重建） */
export interface ClientPowerRuntimePersist {
  states: Record<string, Omit<ClientSystemState, 'online'>>;
  pending: Record<string, PendingClientState>;
}