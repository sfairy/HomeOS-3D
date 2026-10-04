/**
 * @file client-power.ts
 * @module @homeos/shared/config
 * @brief 客户端智能充放电配置契约（backend app-config clientPower 分区的权威定义）。
 *
 * 前端管理页（@/types/client-power）与后端 AppConfigData.clientPower 均引用本文件，
 * 新增字段时双侧同步修改，避免契约漂移。
 */

/** 客户端自充放电策略（含峰谷错峰与应急充电阈值） */
export interface ClientPowerSelfCharge {
  /** 是否启用自充放电 */
  enabled: boolean;
  /** 低电量阈值（百分比，低于则开始充电） */
  lowPercent: number;
  /** 高电量阈值（百分比，达到则停止充电） */
  highPercent: number;
  /** 峰谷错峰充电：高峰时段暂缓充电（低于 criticalPercent 时仍应急充电） */
  touEnabled?: boolean;
  /** 应急充电阈值：低于该值时即使处于高峰也强制充电 */
  criticalPercent?: number;
}

/** 单个客户端配置 */
export interface ClientPowerClient {
  /** 客户端唯一 ID */
  id: string;
  /** 客户端展示名称 */
  label: string;
  /** 充电开关实体 ID（HA switch，可选表示未绑定） */
  chargerSwitchEntityId?: string;
  /**
   * 人来亮屏：屏保显示时，该充电器开关由关变开则退出屏保。
   * 开关保持开启时仍按空闲超时进入屏保。默认开启；非屏保时不改动开关。
   */
  presenceWakeEnabled?: boolean;
  /** 是否启用该客户端的智能充放电 */
  enabled: boolean;
  /** 客户端电量上报令牌（识别上报来源，首次配置后由后端签发） */
  reportToken?: string;
  /** 自充放电策略 */
  selfCharge: ClientPowerSelfCharge;
}

/** 客户端智能充放电整体设置（对应 AppConfigData.clientPower 分区） */
export interface ClientPowerSettings {
  /** 全局开关 */
  enabled: boolean;
  /** 客户端电量上报间隔（秒） */
  reportIntervalSec: number;
  /** 客户端失联判定超时（秒） */
  staleTimeoutSec: number;
  /** 充放电动作冷却时间（分钟） */
  cooldownMin: number;
  /** 联动动作失败重试次数（默认 2） */
  linkageRetryCount: number;
  /** 联动动作失败重试间隔（毫秒，默认 5000） */
  linkageRetryDelayMs: number;
  /** 已配置的客户端列表 */
  clients: ClientPowerClient[];
}

/**
 * 自充放电默认阈值（前后端共用权威值）。
 * 后端 DEFAULT_APP_CONFIG / client-power 服务阈值兜底与前端表单归一化均引用此常量，避免双侧硬编码漂移。
 */
export const DEFAULT_CLIENT_POWER_SELF_CHARGE: ClientPowerSelfCharge = {
  enabled: true,
  lowPercent: 20,
  highPercent: 80,
  touEnabled: false,
  criticalPercent: 15,
};

/** 客户端智能充放电全局默认（不含客户端列表；enabled 默认关闭，由用户显式启用） */
export const DEFAULT_CLIENT_POWER_SETTINGS: Omit<ClientPowerSettings, 'clients'> = {
  enabled: false,
  reportIntervalSec: 10,
  staleTimeoutSec: 300,
  cooldownMin: 5,
  linkageRetryCount: 2,
  linkageRetryDelayMs: 5000,
};
