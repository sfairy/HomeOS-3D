/**
 * @file geo.util.ts
 * @module @homeos/shared/earthquake
 * @brief Haversine 大圆距离、S 波倒计时与本地烈度估算（含四川盆地缓衰修正）。
 *
 * 职责：
 *  - 计算震中到家庭坐标的距离（km）；
 *  - 基于发震时间与 S 波速度估算横波到达倒计时；
 *  - 基于震级 + 距离估算本地烈度，并对四川盆地软土放大效应做修正。
 *
 * 关键依赖：
 *  - 后端 earthquake 模块在收到 EEW 推送时调用 refineAlertCountdown 计算 distance / countdown / localIntensity；
 *  - 前端仅在测试 / 调试时直接调用本模块。
 *
 * 约定：
 *  - 距离与倒计时保留 1 位小数；烈度限制在 [1.0, 12.0]；
 *  - 盆地修正仅在家庭坐标落入盆地 bbox 时启用。
 */

/** 地球平均半径（km，Haversine 公式用） */
const EARTH_RADIUS_KM = 6371;
/** S 波平均速度（km/s，用于横波到达倒计时） */
const S_WAVE_SPEED_KM_S = 3.4;

/** 四川盆地近似 bbox（软土放大有感烈度） */
const SICHUAN_BASIN = { latMin: 28, latMax: 33, lonMin: 102, lonMax: 108 };

/**
 * 烈度估算的可选坐标输入。
 * 传入家庭与震中坐标时启用四川盆地缓衰修正。
 */
export type IntensityEstimateOpts = {
  /** 家庭纬度（启用盆地修正时必填） */
  homeLat?: number | null;
  /** 家庭经度（启用盆地修正时必填） */
  homeLon?: number | null;
  /** 震中纬度（判断"震中亦在盆地"时使用） */
  epicenterLat?: number | null;
  /** 震中经度（判断"震中亦在盆地"时使用） */
  epicenterLon?: number | null;
};

/**
 * 计算两个经纬度坐标之间的 Haversine 大圆距离（km）。
 *
 * @param lat1 起点纬度
 * @param lon1 起点经度
 * @param lat2 终点纬度
 * @param lon2 终点经度
 * @returns 距离（km）
 */
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  // Logic fix: 浮点误差可能让 a 略微超出 [0,1]，导致 sqrt(1 - a) 得到 NaN。
  // 夹紧到 [0,1] 保证对跖点等极值场景仍返回有限距离。
  const clamped = Math.min(1, Math.max(0, a));
  const c = 2 * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped));
  return EARTH_RADIUS_KM * c;
}

/**
 * 计算横波到达倒计时（秒）。
 *
 * @param distanceKm  距震中距离（km）
 * @param originTimeMs 发震时间（epoch 毫秒）
 * @param nowMs       当前时间（默认 Date.now()，测试可注入）
 * @returns 倒计时秒数；负值表示横波已到达
 */
export function computeSWaveCountdown(
  distanceKm: number,
  originTimeMs: number,
  nowMs = Date.now(),
): number {
  const travelTime = distanceKm / S_WAVE_SPEED_KM_S;
  const elapsed = (nowMs - originTimeMs) / 1000;
  return travelTime - elapsed;
}

/**
 * 判断坐标是否落在四川盆地近似范围内。
 *
 * @param lat 纬度
 * @param lon 经度
 * @returns true 表示坐标在盆地 bbox 内（非数返回 false）
 */
export function isInSichuanBasin(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return (
    lat >= SICHUAN_BASIN.latMin &&
    lat <= SICHUAN_BASIN.latMax &&
    lon >= SICHUAN_BASIN.lonMin &&
    lon <= SICHUAN_BASIN.lonMax
  );
}

/**
 * 估算本地烈度。家庭位于四川盆地时使用更缓的距离衰减，
 * 震中亦在盆地内时再略增幅，降低有感地震漏报。
 *
 * @param magnitude  震级
 * @param distanceKm 距震中距离（km）
 * @param opts       家庭 / 震中坐标（启用盆地修正）
 * @returns 烈度数值（保留 1 位小数，范围 [1.0, 12.0]）
 */
export function estimateLocalIntensity(
  magnitude: number,
  distanceKm: number,
  opts?: IntensityEstimateOpts,
): number {
  const homeInBasin =
    opts?.homeLat != null &&
    opts?.homeLon != null &&
    isInSichuanBasin(opts.homeLat, opts.homeLon);
  const logCoef = homeInBasin ? 3.15 : 3.49;
  let raw = 0.92 + 1.63 * magnitude - logCoef * Math.log10(Math.max(0, distanceKm) + 6);
  if (homeInBasin) {
    const epiInBasin =
      opts?.epicenterLat != null &&
      opts?.epicenterLon != null &&
      isInSichuanBasin(opts.epicenterLat, opts.epicenterLon);
    raw += epiInBasin ? 0.5 : 0.3;
  }
  return Math.max(1.0, Math.min(12.0, Math.round(raw * 10) / 10));
}

/**
 * 基于 EEW payload 与家庭坐标计算预警所需的距离 / 倒计时 / 本地烈度。
 *
 * @param payload 预警 payload（需含震中坐标 / 发震时间 / 震级）
 * @param homeLat 家庭纬度
 * @param homeLon 家庭经度
 * @returns 距离 / 倒计时 / 本地烈度（均保留 1 位小数）
 *
 * 调用场景：后端收到 EEW 推送后立即调用本函数，把结果合并到 EarthquakeAlertPayload 后下发前端。
 */
export function refineAlertCountdown(
  payload: { latitude: number; longitude: number; originTime: number; magnitude: number },
  homeLat: number,
  homeLon: number,
): { distance: number; countdown: number; localIntensity: number } {
  const distance = haversineDistanceKm(homeLat, homeLon, payload.latitude, payload.longitude);
  const countdown = computeSWaveCountdown(distance, payload.originTime);
  const localIntensity = estimateLocalIntensity(payload.magnitude, distance, {
    homeLat,
    homeLon,
    epicenterLat: payload.latitude,
    epicenterLon: payload.longitude,
  });
  return {
    distance: Math.round(distance * 10) / 10,
    countdown: Math.round(countdown * 10) / 10,
    localIntensity,
  };
}
