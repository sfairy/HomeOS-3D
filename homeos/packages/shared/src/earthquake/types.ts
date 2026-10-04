/**
 * @file types.ts
 * @module @homeos/shared/earthquake
 * @brief 地震预警 / 全球震情目录线协议类型（前后端共用）。
 *
 * 职责：
 *  - 定义本地预警推送 payload 与全球目录查询 / 返回结构；
 *  - 收敛预警形态（early / confirmation）与数据源标识枚举。
 *
 * 关键依赖：
 *  - 后端 earthquake 模块按本类型推送 WS 事件、暴露 REST 查询；
 *  - 前端预警弹窗与震情列表共用本类型。
 *
 * 约定：
 *  - originTime / updatedTime / fetchedAt 为 epoch 毫秒；
 *  - 缺省 alertKind 按 early 处理（前端兼容旧数据）；
 *  - distance / distanceKm / localIntensity 由后端按家庭坐标计算后下发，前端不再二次估算。
 */

/**
 * 预警形态。
 *  - early：横波到达前的全屏预警（抢占屏保，倒计时大字）；
 *  - confirmation：迟到确认通报（横波已到达或已过，不全屏，仅通知）。
 */
export type EarthquakeAlertKind = 'early' | 'confirmation';

/**
 * EEW / 本地预警数据源标识。
 *  - wolfx：第三方 WebSocket 推送；
 *  - sc_eew：四川地震局 SC·CENC EEW；
 *  - cenc_eew / cenc：中国地震台网中心 EEW / 目录；
 *  - usgs：USGS 兜底；
 *  - test：模拟演练事件（前缀 test_）。
 */
export type EarthquakeEewSource = 'wolfx' | 'sc_eew' | 'cenc_eew' | 'cenc' | 'usgs' | 'test';

/**
 * 单次地震预警推送 payload（WS event: earthquake_alert）。
 */
export interface EarthquakeAlertPayload {
  /** 事件 ID（同一地震多源可能不同；test_ 前缀表示演练） */
  eventId: string;
  /** 震中纬度 */
  latitude: number;
  /** 震中经度 */
  longitude: number;
  /** 发震时间（epoch 毫秒） */
  originTime: number;
  /** 震级 */
  magnitude: number;
  /** 震源深度（km） */
  depth: number;
  /** 震中地名（中文） */
  epicenter: string;
  /** 距家庭坐标距离（km，已由后端计算） */
  distance: number;
  /** 横波到达倒计时（秒；可为负表示已到达） */
  countdown: number;
  /** 估算本地烈度（已由后端计算） */
  localIntensity: number;
  /** 最大烈度（如 "VII"），可选 */
  maxIntensity?: string;
  /** 前端展示用；服务端推送时可选附带 */
  timestamp?: string;
  /** early | confirmation；缺省按 early 处理 */
  alertKind?: EarthquakeAlertKind;
  /** 来源：wolfx WS / SC·CENC 主动查询 / USGS 兜底 */
  source?: EarthquakeEewSource | string;
}

/** 全球震情目录查询周期 */
export type GlobalEarthquakePeriod = 'hour' | 'day' | 'week' | 'month';

/** 全球震情目录数据源（CENC 中国地震台网 / USGS） */
export type GlobalEarthquakeSource = 'cenc' | 'usgs';

/**
 * 单条全球震情目录事件。
 */
export interface GlobalEarthquakeEvent {
  /** 事件 ID（数据源 + originTime + 坐标生成） */
  id: string;
  /** 震级 */
  magnitude: number;
  /** 震级类型（如 "ml" / "mw"） */
  magType: string;
  /** 中文地名（已本地化） */
  place: string;
  /** USGS 原始英文地名（place 已本地化为中文时保留） */
  placeEn?: string | null;
  latitude: number;
  longitude: number;
  depth: number;
  /** 发震时间（epoch 毫秒） */
  originTime: number;
  /** 数据源最近更新时间（epoch 毫秒） */
  updatedTime: number;
  /** 详情页 URL（数据源页面） */
  url: string;
  /** 是否引发海啸预警 */
  tsunami: boolean;
  /** 数据源状态（如 "reviewed" / "automatic"） */
  status: string;
  /** CENC 最大烈度，USGS 源为 null */
  intensity: number | null;
  /** 距家庭坐标（km），未配置坐标时为 null */
  distanceKm: number | null;
}

/**
 * 全球震情目录批量返回（含缓存元信息）。
 */
export interface GlobalEarthquakeFeedResult {
  /** 数据源 */
  source: GlobalEarthquakeSource;
  /** 查询周期 */
  period: GlobalEarthquakePeriod;
  /** 最低震级过滤阈值 */
  minMagnitude: number;
  /** 抓取时间（epoch 毫秒） */
  fetchedAt: number;
  /** 是否命中缓存 */
  cached: boolean;
  /** 外源失败时返回的过期缓存（仍可用浏览） */
  stale?: boolean;
  /** 家庭坐标（用于计算 distanceKm；未配置为 null） */
  homeCoordinates: { lat: number; lon: number } | null;
  /** 事件列表 */
  items: GlobalEarthquakeEvent[];
}

/**
 * 全球震情目录查询参数（REST 查询串）。
 */
export interface GlobalEarthquakeQuery {
  /** 数据源（缺省由后端选默认） */
  source?: GlobalEarthquakeSource;
  /** 查询周期 */
  period?: GlobalEarthquakePeriod;
  /** 最低震级过滤 */
  minMagnitude?: number;
  /** 返回条数上限 */
  limit?: number;
}
