/**
 * 客户端系统信息归一化工具模块。
 *
 * 职责：
 *  - 将客户端上报的 DTO 结构归一化为统一的 systemInfo 对象。
 *  - 同时输出扁平化的电量字段（level/charging/chargingTime/dischargingTime/batterySupported），
 *    便于 service 直接消费而无需反复解构 systemInfo.battery。
 *
 * 依赖：
 *  - client-power.types 中的 ClientSystemBatteryInfo、ClientSystemInfo、ClientSystemReportDto 类型。
 */
import type {
  ClientSystemBatteryInfo,
  ClientSystemInfo,
  ClientSystemReportDto,
} from './types';

/** 归一化后的上报结果：systemInfo + 扁平电量字段 */
interface NormalizedClientReport {
  systemInfo: ClientSystemInfo;
  level: number | null;
  charging: boolean | null;
  chargingTime: number | null;
  dischargingTime: number | null;
  batterySupported: boolean;
}

/**
 * 将电量值归一化为 0–100 之间的两位小数百分比。
 * 契约已统一为 0–100 百分比（DTO `@Max(100)`）；浏览器端在采集时已将 0–1 比例
 * 换算为百分比后再上报。此处不再使用 `<= 1` 启发式——它会把整数 1% 误判为 100%，
 * 导致低电告警与充电联动（1% 时反被 turn_off 充电）失效。
 *
 * @param level 原始电量值（0–100 百分比）
 * @returns 归一化后的百分比，输入无效时返回 null
 */
function normalizeLevel(level?: number | null): number | null {
  if (level == null || !Number.isFinite(level)) return null;
  return Math.max(0, Math.min(100, Math.round(level * 100) / 100));
}

/**
 * 从上报 DTO 中提取并归一化电池信息。
 * 若上报未携带 battery 字段，则返回 supported=false 的默认结构。
 *
 * @param dto 客户端上报 DTO
 * @returns 归一化后的电池信息
 */
function batteryFromDto(dto: ClientSystemReportDto): ClientSystemBatteryInfo {
  const b = dto.systemInfo?.battery;
  if (!b) {
    return {
      supported: false,
      level: null,
      charging: null,
      chargingTime: null,
      dischargingTime: null,
    };
  }
  return {
    ...b,
    level: normalizeLevel(b.level),
  };
}

/** 统一上报格式为 systemInfo + 扁平电量字段 */
export function normalizeClientSystemReport(dto: ClientSystemReportDto): NormalizedClientReport {
  const battery = batteryFromDto(dto);
  // 若上报未携带 systemInfo，则用全零/默认值构造一个最小结构，避免后续访问空指针
  const systemInfo: ClientSystemInfo = {
    ...(dto.systemInfo || {
      hardware: { cores: 0, deviceMemory: null, tier: 'unknown', tierReason: '' },
      platform: { userAgent: '', platform: '', language: '', vendor: '', mobile: false },
      display: {
        width: 0,
        height: 0,
        screenWidth: 0,
        screenHeight: 0,
        pixelRatio: 1,
        colorScheme: 'unknown',
        phoneLike: false,
        tabletLike: false,
      },
      capabilities: {
        touch: false,
        standalone: false,
        serviceWorker: false,
        reducedMotion: false,
      },
      network: null,
      reportedAt: new Date().toISOString(),
    }),
    battery,
  };

  return {
    systemInfo,
    level: battery.level,
    charging: battery.charging,
    chargingTime: battery.chargingTime,
    dischargingTime: battery.dischargingTime,
    // 仅当 API 支持且 level 有效时才视为电量支持
    batterySupported: battery.supported && battery.level != null,
  };
}