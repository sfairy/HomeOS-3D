/**
 * @file bindings-gaps.util.ts
 * @module @homeos/shared/setup
 * @brief 首装绑定缺口检测与子域归类（集成绑定 / 能源与环境 / 安防）。
 *
 * 职责：
 *  - 汇总各类绑定缺口项（天气 / 摄像头 / 门铃 / 危险传感器 / 燃气与漏水关阀 /
 *    环境房间 / 紧急场景 / 能源账户等）；
 *  - 提供缺口 id → 子域（BindingGapSection）归类，仅供展示过滤；
 *  - 支持按子域过滤缺口列表或返回全量（section=overview）。
 *
 * 关键依赖：
 *  - account-binding-categories.util 提供账户类别标签 / 路由 / 完整性检查；
 *  - energy-config.util 提供 hasEnergyConfig 判断；
 *  - hazard-config.util 提供危险传感器绑定摘要 / 冲突检测。
 *
 * 约定：
 *  - resolveBindingGapSection 不改检测语义，仅按 id 前缀映射展示子域；
 *  - 缺口 severity：warn（影响核心功能）/ info（可选增强）。
 */
import {
  collectRequiredAccountBindingCategories,
  formatAccountBindingLabel,
  resolveAccountBindingSettingsRoute,
} from './account-binding-categories.util';
import { hasEnergyConfig, type StatsSensorsLike } from './energy-config.util';
import {
  detectHazardBindingConflicts,
  hasAnyHazardSensorBinding,
  parseHazardEntityIdList,
} from './hazard-config.util';

/** 绑定缺口项（集成绑定 / 能源与环境 / 首装健康检查） */
export interface BindingGapItem {
  id: string;
  label: string;
  route: string;
  severity: 'warn' | 'info';
}

/** 集成绑定页子域；external 表示跳转到其他设置页 */
export type BindingGapSection = 'weather' | 'cameras' | 'security' | 'external';

/** 按缺口 id 解析归属子域（不改检测语义，仅供展示过滤） */
export function resolveBindingGapSection(gapId: string): BindingGapSection {
  const id = String(gapId || '').trim();
  if (id === 'weather') return 'weather';
  if (id === 'cameras') return 'cameras';
  if (id === 'env' || id.startsWith('energy-')) return 'external';
  if (
    id === 'doorbell' ||
    id === 'hazard' ||
    id.startsWith('hazard-')
  ) {
    return 'security';
  }
  return 'external';
}

/** 过滤某子域缺口；section=overview 返回全量 */
export function filterBindingGapsBySection(
  gaps: BindingGapItem[],
  section: BindingGapSection | 'overview',
): BindingGapItem[] {
  if (section === 'overview') return [...gaps];
  return gaps.filter((g) => resolveBindingGapSection(g.id) === section);
}

/**
 * 首装绑定缺口收集的最小输入形状（含 HA 配置 / 环境映射 / 底栏 / 能源 / 扫地机 等字段；全部可选以便前端按需注入）。
 */
export interface CollectBindingGapsInput {
  haConfig?: Record<string, unknown>;
  statsSensors?: StatsSensorsLike;
  envSensorMap?: Record<string, unknown>;
  dashboardFooterItems?: Array<{
    enabled?: boolean;
    kind?: string;
    primaryField?: string;
    source?: string;
  }>;
  requiredAccountCategories?: string[];
  hasEnergyConfig?: (cat: string) => boolean;
  formatEnergyLabel?: (cat: string) => string;
}

/**
 * 检测当前配置下的各类首装绑定缺口（天气/摄像头/门铃/危险传感器/关阀/环境房间/紧急场景/能源账户）。
 *
 * @param input 检测输入（haConfig + statsSensors + envSensorMap + dashboardFooterItems 等）
 * @returns BindingGapItem 数组，按检测顺序排列；无缺口返回空数组
 */
export function collectBindingGaps(input: CollectBindingGapsInput): BindingGapItem[] {
  const gaps: BindingGapItem[] = [];
  const hc = input.haConfig || {};
  const stats = input.statsSensors || {};
  const pick = (k: string) => String(hc[k] ?? '').trim();
  const formatEnergyLabel = input.formatEnergyLabel || formatAccountBindingLabel;
  const checkEnergy = input.hasEnergyConfig || ((cat: string) => hasEnergyConfig(cat, stats));

  if (!pick('weatherEntityId')) {
    gaps.push({
      id: 'weather',
      label: '天气实体',
      route: '/settings?tab=bindings&section=weather',
      severity: 'warn',
    });
  }

  const categories =
    input.requiredAccountCategories ??
    collectRequiredAccountBindingCategories(input.dashboardFooterItems);

  for (const cat of categories) {
    if (!checkEnergy(cat)) {
      gaps.push({
        id: `energy-${cat}`,
        label: `${formatEnergyLabel(cat)}账户`,
        route: resolveAccountBindingSettingsRoute(cat),
        severity: 'info',
      });
    }
  }

  const cameras = Array.isArray(hc.securityCameras) ? hc.securityCameras : [];
  if (!cameras.length && !pick('securityCamera')) {
    gaps.push({
      id: 'cameras',
      label: '安防摄像头',
      route: '/settings?tab=bindings&section=cameras',
      severity: 'info',
    });
  }

  const doorbells = Array.isArray(hc.doorbells) ? hc.doorbells : [];
  const hasDoorbell = doorbells.some((d: { triggerEntityId?: string }) =>
    String(d?.triggerEntityId || '').trim(),
  );
  if (!hasDoorbell) {
    gaps.push({
      id: 'doorbell',
      label: '门铃触发实体',
      route: '/settings?tab=bindings&section=security',
      severity: 'warn',
    });
  }

  if (!hasAnyHazardSensorBinding(hc)) {
    gaps.push({
      id: 'hazard',
      label: '危险传感器（烟/气/水浸）',
      route: '/settings?tab=bindings&section=security',
      severity: 'warn',
    });
  }

  const hasSmokeOrGas =
    parseHazardEntityIdList(hc, 'hazardSmokeEntityIds').length > 0 ||
    parseHazardEntityIdList(hc, 'hazardGasEntityIds').length > 0;
  const hasLeak = parseHazardEntityIdList(hc, 'hazardLeakEntityIds').length > 0;
  if (hasSmokeOrGas && !pick('hazardGasValveEntityId')) {
    gaps.push({
      id: 'hazard-gas-valve',
      label: '燃气紧急关阀实体',
      route: '/settings?tab=bindings&section=security',
      severity: 'info',
    });
  }
  if (hasLeak && !pick('hazardWaterValveEntityId')) {
    gaps.push({
      id: 'hazard-water-valve',
      label: '漏水紧急关阀实体',
      route: '/settings?tab=bindings&section=security',
      severity: 'info',
    });
  }

  if (detectHazardBindingConflicts(hc).length) {
    gaps.push({
      id: 'hazard-conflict',
      label: '危险传感器绑定冲突',
      route: '/settings?tab=bindings&section=security',
      severity: 'warn',
    });
  }

  const envMap = input.envSensorMap || {};
  const envRooms = Object.values(envMap).filter((e) => {
    const row = e as { _hidden?: boolean; temperature?: string; humidity?: string };
    return (
      row &&
      !row._hidden &&
      (String(row.temperature || '').trim() || String(row.humidity || '').trim())
    );
  }).length;
  if (envRooms < 1) {
    gaps.push({
      id: 'env',
      label: '环境传感器房间',
      route: '/settings?tab=env-health',
      severity: 'info',
    });
  }

  if (!pick('hazardEmergencySceneId') && hasAnyHazardSensorBinding(hc)) {
    gaps.push({
      id: 'hazard-scene',
      label: '紧急场景 ID',
      route: '/settings?tab=bindings&section=security',
      severity: 'info',
    });
  }

  return gaps;
}
