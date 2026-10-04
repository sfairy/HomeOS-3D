/**
 * 地震早期预警（EEW）评估工具。
 *
 * 职责：
 *  - 根据家庭坐标、震级、距离、烈度、倒计时等多维度阈值判定是否应触发预警。
 *  - 处理同一事件的重复上报与跨源（SC/CENC/Wolfx/USGS）指纹去重。
 *  - countdown < -60 时改为「确认通报」而非丢弃。
 */
import { computeSWaveCountdown, haversineDistanceKm } from '@homeos/shared';
import type {
  EarthquakeAlertPayload,
  EarthquakeRuntimeConfig,
  EewRawMessage,
} from './types';
import { evaluateLocalQuakeThresholds } from './threshold.util';

/** 同一事件两次预警之间震级变化的最小阈值（单位：震级 M） */
const MAGNITUDE_MERGE_THRESHOLD = 0.5;
/** 跨源指纹：发震时刻窗口（秒） */
const CROSS_SOURCE_TIME_WINDOW_SEC = 120;
/** 跨源指纹：震中距上限（km） */
const CROSS_SOURCE_DIST_KM = 50;
/** 保留的最近指纹条数 */
const RECENT_FINGERPRINT_MAX = 12;

export type EewEventFingerprint = {
  eventId: string;
  originTime: number;
  latitude: number;
  longitude: number;
  magnitude: number;
};

/** EEW 去重状态：当前激活事件 + 最近跨源指纹 */
export type EewDedupeState = {
  activeEventId: string;
  lastMagnitude: number;
  recent?: EewEventFingerprint[];
};

type EewEvalResult =
  | { kind: 'skip'; message: string }
  | { kind: 'suppress_duplicate'; message: string; nextDedupe: EewDedupeState }
  | { kind: 'alert'; message: string; alert: EarthquakeAlertPayload; nextDedupe: EewDedupeState };

function matchesCrossSourceFingerprint(
  eew: EewRawMessage,
  fp: EewEventFingerprint,
): boolean {
  if (fp.eventId === eew.eventId) return false;
  const dtSec = Math.abs(eew.originTime - fp.originTime) / 1000;
  if (dtSec > CROSS_SOURCE_TIME_WINDOW_SEC) return false;
  if (Math.abs(eew.magnitude - fp.magnitude) > MAGNITUDE_MERGE_THRESHOLD) return false;
  const dist = haversineDistanceKm(eew.latitude, eew.longitude, fp.latitude, fp.longitude);
  return dist <= CROSS_SOURCE_DIST_KM;
}

function pushFingerprint(recent: EewEventFingerprint[] | undefined, fp: EewEventFingerprint) {
  const next = [...(recent || []).filter((r) => r.eventId !== fp.eventId), fp];
  return next.slice(-RECENT_FINGERPRINT_MAX);
}

function fingerprintOf(eew: EewRawMessage): EewEventFingerprint {
  return {
    eventId: eew.eventId,
    originTime: eew.originTime,
    latitude: eew.latitude,
    longitude: eew.longitude,
    magnitude: eew.magnitude,
  };
}

/**
 * 评估 EEW 是否应触发预警（不含 Redis/已关闭事件等外部状态）。
 */
export function evaluateEewForAlert(
  eew: EewRawMessage,
  cfg: EarthquakeRuntimeConfig,
  dedupe: EewDedupeState,
  magnitudeMergeThreshold = MAGNITUDE_MERGE_THRESHOLD,
): EewEvalResult {
  if (!Number.isFinite(eew.originTime) || eew.originTime <= 0) {
    return { kind: 'skip', message: `⚠️ EEW originTime 无效 eventId=${eew.eventId}` };
  }

  if (cfg.homeLat == null || cfg.homeLon == null) {
    return { kind: 'skip', message: '⚠️ 收到 EEW 但未设置家庭坐标' };
  }

  const prevMagnitude = dedupe.lastMagnitude;
  const magnitudeDelta = Math.abs(eew.magnitude - prevMagnitude);

  if (eew.eventId === dedupe.activeEventId) {
    if (magnitudeDelta <= magnitudeMergeThreshold) {
      // 保留既有 activeEventId 与「上次预警震级」：抑制上报不得污染震级升级基线，
      // 否则单调递增的震级序列（如 +0.4/次）每次都只比上次上报高 <=0.5，将永远无法重新触发预警。
      return {
        kind: 'suppress_duplicate',
        message: '[去重] 震级变化 <= 0.5,抑制重复预警',
        nextDedupe: dedupe,
      };
    }
  }

  for (const fp of dedupe.recent || []) {
    if (matchesCrossSourceFingerprint(eew, fp)) {
      return {
        kind: 'suppress_duplicate',
        message: `[跨源去重] 与 ${fp.eventId} 时空相近,抑制重复预警(source=${eew.source || eew.type || '?'})`,
        // 保留原事件为 activeEventId（不把去重状态改绑到重复源），仅并入本事件指纹，
        // 避免原事件的后续/重传上报失去同事件去重而重复预警。
        nextDedupe: {
          activeEventId: dedupe.activeEventId,
          lastMagnitude: dedupe.lastMagnitude,
          recent: pushFingerprint(dedupe.recent, fingerprintOf(eew)),
        },
      };
    }
  }

  const gate = evaluateLocalQuakeThresholds(
    {
      magnitude: eew.magnitude,
      latitude: eew.latitude,
      longitude: eew.longitude,
    },
    {
      minMagnitude: cfg.minMagnitude,
      maxDistanceKm: cfg.maxDistance,
      minLocalIntensity: cfg.minLocalIntensity,
      homeLat: cfg.homeLat,
      homeLon: cfg.homeLon,
    },
  );
  const distance = gate.distanceKm;
  const localIntensity = gate.localIntensity;
  const countdown = computeSWaveCountdown(distance, eew.originTime);

  const analysisLog = `📊 EEW 分析:距离=${distance.toFixed(1)}km 倒计时=${countdown.toFixed(1)}s 烈度=${localIntensity}`;

  if (!gate.pass) {
    return {
      kind: 'skip',
      message: `${gate.reason},已跳过`,
    };
  }

  // 迟到台网数据：不再丢弃，改为确认通报（不全屏倒计时）
  const alertKind = countdown < -60 ? 'confirmation' : 'early';
  const lateLog =
    alertKind === 'confirmation'
      ? `确认通报:倒计时 ${countdown.toFixed(1)}s 已过 -60s(台网延迟到达)`
      : '';

  const source = eew.source || (eew.type?.includes('cenc') ? 'cenc_eew' : eew.type?.includes('sc') ? 'sc_eew' : 'wolfx');

  const alertPayload: EarthquakeAlertPayload = {
    eventId: eew.eventId,
    latitude: eew.latitude,
    longitude: eew.longitude,
    originTime: eew.originTime,
    magnitude: eew.magnitude,
    depth: eew.depth,
    epicenter: eew.epicenter,
    distance: Math.round(distance * 10) / 10,
    countdown: Math.round(countdown * 10) / 10,
    localIntensity,
    maxIntensity: eew.maxIntensity || undefined,
    alertKind,
    source,
  };

  const dedupeLog =
    eew.eventId === dedupe.activeEventId && magnitudeDelta > magnitudeMergeThreshold
      ? `[去重] 震级变化 > 0.5(${prevMagnitude} → ${eew.magnitude}),重新触发预警`
      : '';

  const message = [dedupeLog, lateLog, analysisLog].filter(Boolean).join('\n');

  const fingerprint: EewEventFingerprint = {
    eventId: eew.eventId,
    originTime: eew.originTime,
    latitude: eew.latitude,
    longitude: eew.longitude,
    magnitude: eew.magnitude,
  };

  return {
    kind: 'alert',
    message,
    alert: alertPayload,
    nextDedupe: {
      activeEventId: eew.eventId,
      lastMagnitude: eew.magnitude,
      recent: pushFingerprint(dedupe.recent, fingerprint),
    },
  };
}
