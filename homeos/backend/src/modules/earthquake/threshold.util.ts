/**
 * 职责：
 *  - 地震阈值与用户偏好匹配工具；
 * 关键依赖：
 *  - AppConfigService；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import {
  estimateLocalIntensity,
  haversineDistanceKm,
  type IntensityEstimateOpts,
} from '@homeos/shared';

type LocalQuakeThresholdConfig = {
  minMagnitude: number;
  maxDistanceKm: number;
  minLocalIntensity: number;
  homeLat: number;
  homeLon: number;
};

type LocalQuakeThresholdInput = {
  magnitude: number;
  latitude: number;
  longitude: number;
  /** 已算好的震中距；缺省时按家庭坐标重算 */
  distanceKm?: number | null;
};

type LocalQuakeThresholdResult =
  | {
      pass: true;
      distanceKm: number;
      localIntensity: number;
    }
  | {
      pass: false;
      distanceKm: number;
      localIntensity: number;
      reason: string;
    };

/**
 * 判定事件是否达到本地关注阈值（三项同时满足）。
 * 烈度使用与 EEW 相同的本地预估公式，而非台网公布的震中烈度。
 */
export function evaluateLocalQuakeThresholds(
  input: LocalQuakeThresholdInput,
  cfg: LocalQuakeThresholdConfig,
): LocalQuakeThresholdResult {
  const mag = Number(input.magnitude);
  const distanceKm =
    input.distanceKm != null && Number.isFinite(input.distanceKm)
      ? Number(input.distanceKm)
      : haversineDistanceKm(cfg.homeLat, cfg.homeLon, input.latitude, input.longitude);

  const intensityOpts: IntensityEstimateOpts = {
    homeLat: cfg.homeLat,
    homeLon: cfg.homeLon,
    epicenterLat: input.latitude,
    epicenterLon: input.longitude,
  };
  const localIntensity = estimateLocalIntensity(mag, distanceKm, intensityOpts);

  if (!Number.isFinite(mag) || mag < cfg.minMagnitude) {
    return {
      pass: false,
      distanceKm,
      localIntensity,
      reason: `震级 M${Number.isFinite(mag) ? mag : '?'} 低于下限 M${cfg.minMagnitude}`,
    };
  }
  if (distanceKm > cfg.maxDistanceKm) {
    return {
      pass: false,
      distanceKm,
      localIntensity,
      reason: `距离 ${distanceKm.toFixed(1)}km 超过上限 ${cfg.maxDistanceKm}km`,
    };
  }
  if (localIntensity < cfg.minLocalIntensity) {
    return {
      pass: false,
      distanceKm,
      localIntensity,
      reason: `烈度 ${localIntensity} 低于下限 ${cfg.minLocalIntensity}`,
    };
  }
  return { pass: true, distanceKm, localIntensity };
}
