/**
 * 实体反向引用：布局 / 系统配置扫描器（从 EntityReferencesService 抽离）。
 *
 * 职责：扫描 projectConfig.layout 与 AppConfig 系统配置中对某实体的引用。
 * 本地资源（告警规则/家庭模式）由 entity-references-index.ts 的倒排索引覆盖，不在此处扫描。
 */
import { getErrorMessage } from '../../common/utils';
import type { Logger } from '@nestjs/common';
import type { PrismaService } from '../../shared/prisma/service';
import type { AppConfigService } from '../../shared/app-config/service';
import type {
  EntityReferenceItem,
  EntityReferenceKind,
} from './entity-references.types';
import {
  collectEntityPaths,
  pathLooksLikeAction,
  safeParseJson,
} from './entity-references.util';

interface EntityReferenceScannerDeps {
  prisma: PrismaService;
  appConfig: AppConfigService;
  logger: Logger;
}

/** 按 kind:id:role:detail 去重后推入 items */
function pushReference(
  items: EntityReferenceItem[],
  item: EntityReferenceItem,
  dedupeKeys = new Set<string>(),
) {
  const key = `${item.kind}:${item.id}:${item.role}:${item.detail || ''}`;
  if (dedupeKeys.has(key)) return;
  dedupeKeys.add(key);
  items.push(item);
}

/** 扫描布局配置（projectConfig.layout）与系统配置（AppConfigService）中的实体引用 */
export async function scanLayoutAndSystem(
  deps: EntityReferenceScannerDeps,
  entityId: string,
  items: EntityReferenceItem[],
) {
  const seen = new Set<string>();
  try {
    const config = await deps.prisma.projectConfig.findUnique({
      where: { projectId: 'default' },
      select: { layout: true },
    });
    const layout = safeParseJson<Record<string, unknown>>(config?.layout);
    if (layout) scanLayoutObject(entityId, layout, items, seen);
  } catch (err) {
    deps.logger.warn(
      `扫描布局引用失败: ${getErrorMessage(err)}`,
    );
  }

  try {
    scanSystemConfig(deps, entityId, items, seen);
  } catch (err) {
    deps.logger.warn(
      `扫描系统配置引用失败: ${getErrorMessage(err)}`,
    );
  }
}

/**
 * 解析布局 JSON 各字段，收集实体引用并推入 items。
 * @remarks 覆盖：收藏、户型图热点、右侧/浮动面板组件、HA 绑定、页脚、全屋关闭、安防模式、
 *          紧急配置/离家模拟灯池/统计传感器、安防区域（layout.securityZones + haConfig.zones 双源）。
 */
function scanLayoutObject(
  entityId: string,
  layout: Record<string, unknown>,
  items: EntityReferenceItem[],
  seen: Set<string>,
) {
  // 收藏
  const favorites = layout.favoriteEntities;
  if (favorites && typeof favorites === 'object') {
    for (const [domain, list] of Object.entries(favorites as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue;
      if (list.some((x) => String(x) === entityId)) {
        pushReference(
          items,
          {
            kind: 'favorite',
            id: `favorite:${domain}`,
            name: `收藏 · ${domain}`,
            role: 'favorite',
            path: '/settings?tab=favorites',
          },
          seen,
        );
      }
    }
  }

  // 户型图热点（widget.id = entity_id）
  const floors = Array.isArray(layout.floors) ? layout.floors : [];
  floors.forEach((floor, floorIdx) => {
    if (!floor || typeof floor !== 'object') return;
    const f = floor as Record<string, unknown>;
    const floorName = String(f.name || f.id || `楼层${floorIdx + 1}`);
    const widgets = Array.isArray(f.widgets) ? f.widgets : [];
    widgets.forEach((w, wIdx) => {
      if (!w || typeof w !== 'object') return;
      const widget = w as Record<string, unknown>;
      if (String(widget.id || '') !== entityId) return;
      pushReference(
        items,
        {
          kind: 'hotspot',
          id: `hotspot:${floorIdx}:${wIdx}`,
          name: `${floorName} · 热点`,
          role: 'display',
          detail: String(widget.label || entityId),
          path: '/settings?tab=layout',
        },
        seen,
      );
    });
  });

  // 右侧/浮动面板组件
  const panelWidgets = [
    ...(Array.isArray(layout.rightPanelWidgets) ? layout.rightPanelWidgets : []),
    ...(Array.isArray(layout.floatingWidgets) ? layout.floatingWidgets : []),
  ];
  panelWidgets.forEach((w, idx) => {
    if (!w || typeof w !== 'object') return;
    const widget = w as Record<string, unknown>;
    const paths = collectEntityPaths(widget, entityId);
    if (!paths.length) return;
    const type = String(widget.type || 'widget');
    const configTitle =
      widget.config && typeof widget.config === 'object'
        ? String((widget.config as Record<string, unknown>).title || '')
        : '';
    pushReference(
      items,
      {
        kind: 'widget',
        id: String(widget.id || `widget:${idx}`),
        name: configTitle || type,
        role: 'display',
        detail: paths[0],
        path: '/settings?tab=widgets',
      },
      seen,
    );
  });

  // HA 绑定
  const haConfig = (layout.haConfig || {}) as Record<string, unknown>;
  scanHaBindings(entityId, haConfig, items, seen);

  // 页脚
  const footer = layout.dashboardFooter;
  if (footer) {
    const paths = collectEntityPaths(footer, entityId);
    if (paths.length) {
      pushReference(
        items,
        {
          kind: 'footer',
          id: 'dashboard-footer',
          name: '仪表盘页脚',
          role: 'display',
          detail: paths[0],
          path: '/settings?tab=general&section=footer',
        },
        seen,
      );
    }
  }

  // 全屋关闭
  const wholeHomeOff = layout.wholeHomeOff;
  if (wholeHomeOff) {
    const paths = collectEntityPaths(wholeHomeOff, entityId);
    if (paths.length) {
      pushReference(
        items,
        {
          kind: 'whole_home_off',
          id: 'whole-home-off',
          name: '全屋关闭',
          role: 'config',
          detail: paths[0],
          path: '/settings?tab=general',
        },
        seen,
      );
    }
  }

  // 安防模式动作
  const securityModes = Array.isArray(layout.securityModes) ? layout.securityModes : [];
  securityModes.forEach((mode, idx) => {
    if (!mode || typeof mode !== 'object') return;
    const m = mode as Record<string, unknown>;
    const paths = collectEntityPaths(m, entityId);
    if (!paths.length) return;
    pushReference(
      items,
      {
        kind: 'security_mode',
        id: String(m.key || `security-mode:${idx}`),
        name: String(m.name || m.key || '安防模式'),
        role: pathLooksLikeAction(paths[0] || '') ? 'action' : 'config',
        detail: paths[0],
        path: '/settings?tab=security-modes',
      },
      seen,
    );
  });

  // 紧急配置 / 离家模拟灯池
  for (const [key, label, path] of [
    ['securityEmergency', '紧急配置', '/settings?tab=security-modes'],
    ['awaySimulationLightPool', '离家模拟灯池', '/settings?tab=params'],
    ['statsSensors', '统计传感器', '/settings?tab=bindings'],
    ['mobileRoomStats', '移动端房间统计', '/settings?tab=rooms'],
  ] as const) {
    const value = layout[key];
    if (!value) continue;
    const paths = collectEntityPaths(value, entityId);
    if (!paths.length) continue;
    pushReference(
      items,
      {
        kind: key === 'securityEmergency' ? 'security_mode' : 'binding',
        id: key,
        name: label,
        role: 'config',
        detail: paths[0],
        path,
      },
      seen,
    );
  }

  // 安防区域：layout.securityZones 与 haConfig.zones 都扫（空数组不挡住另一源）
  const layoutZones = Array.isArray((layout as { securityZones?: unknown }).securityZones)
    ? ((layout as { securityZones: unknown[] }).securityZones)
    : [];
  const haZones = Array.isArray((haConfig as { zones?: unknown }).zones)
    ? ((haConfig as { zones: unknown[] }).zones)
    : [];
  const zones =
    layoutZones.length > 0 ? layoutZones : haZones.length > 0 ? haZones : [];
  // 若两侧都有内容，合并扫描（按 id 去重）
  const zoneLists =
    layoutZones.length > 0 && haZones.length > 0 ? [layoutZones, haZones] : [zones];
  for (const list of zoneLists) {
    list.forEach((zone, idx) => {
      if (!zone || typeof zone !== 'object') return;
      const z = zone as Record<string, unknown>;
      const paths = collectEntityPaths(z, entityId);
      if (!paths.length) return;
      pushReference(
        items,
        {
          kind: 'security_zone',
          id: String(z.id || z.name || `zone:${idx}`),
          name: String(z.name || z.id || `安防区域 ${idx + 1}`),
          role: 'watch',
          detail: paths[0],
          path: '/settings?tab=bindings&section=security',
        },
        seen,
      );
    });
  }
}

/** 扫描 haConfig 中的实体绑定：摄像头、天气、传感器、烟感/燃气/水浸、阀门、排风、门铃等 */
function scanHaBindings(
  entityId: string,
  haConfig: Record<string, unknown>,
  items: EntityReferenceItem[],
  seen: Set<string>,
) {
  const bindingLabels: Array<{ keys: string[]; label: string }> = [
    { keys: ['securityCamera', 'securityCameras'], label: '安防摄像头' },
    { keys: ['weatherEntityId'], label: '天气实体' },
    { keys: ['motionSensorEntityId'], label: '人体传感器' },
    { keys: ['hazardSmokeEntityIds'], label: '烟感绑定' },
    { keys: ['hazardGasEntityIds'], label: '燃气绑定' },
    { keys: ['hazardLeakEntityIds'], label: '水浸绑定' },
    { keys: ['hazardGasValveEntityId'], label: '燃气阀' },
    { keys: ['hazardWaterValveEntityId'], label: '水阀' },
    { keys: ['hazardExhaustFanEntityIds'], label: '排风' },
  ];

  for (const binding of bindingLabels) {
    for (const key of binding.keys) {
      const value = haConfig[key];
      const paths = collectEntityPaths(value, entityId);
      if (!paths.length && typeof value === 'string' && value === entityId) {
        paths.push(key);
      }
      if (!paths.length) continue;
      pushReference(
        items,
        {
          kind: 'binding',
          id: `ha:${key}`,
          name: binding.label,
          role: 'binding',
          detail: key,
          path: '/settings?tab=bindings',
        },
        seen,
      );
      break;
    }
  }

  const doorbells = Array.isArray(haConfig.doorbells) ? haConfig.doorbells : [];
  doorbells.forEach((bell, idx) => {
    const paths = collectEntityPaths(bell, entityId);
    if (!paths.length) return;
    const b = (bell || {}) as Record<string, unknown>;
    pushReference(
      items,
      {
        kind: 'binding',
        id: `doorbell:${idx}`,
        name: String(b.name || `门铃 ${idx + 1}`),
        role: 'binding',
        detail: paths[0],
        path: '/settings?tab=bindings',
      },
      seen,
    );
  });
}

/**
 * 扫描系统配置中的实体引用：环境传感器映射、人员在家判定、昼夜天气、用水总阀、
 * 能源电表/分路、语音 STT/TTS、客户端电源、影音播放列表、事件日志屏蔽列表。
 */
function scanSystemConfig(
  deps: EntityReferenceScannerDeps,
  entityId: string,
  items: EntityReferenceItem[],
  seen: Set<string>,
) {
  const cfg = deps.appConfig.getAllRaw();

  // 环境传感器映射
  for (const [roomId, room] of Object.entries(cfg.envSensorMap || {})) {
    if (!room || typeof room !== 'object') continue;
    const paths = collectEntityPaths(room, entityId);
    if (!paths.length) continue;
    const label = room.label || roomId;
    pushReference(
      items,
      {
        kind: 'env_sensor',
        id: `env:${roomId}`,
        name: `环境映射 · ${label}`,
        role: 'binding',
        detail: paths[0],
        path: '/settings?tab=bindings&section=environment',
      },
      seen,
    );
  }

  // 人员在家判定
  for (const person of cfg.security?.presencePersons || []) {
    if (!person?.entityIds?.includes(entityId)) continue;
    pushReference(
      items,
      {
        kind: 'system_config',
        id: `presence:${person.id}`,
        name: `在家判定 · ${person.name || person.id}`,
        role: 'watch',
        path: '/settings?tab=bindings&section=security',
      },
      seen,
    );
  }

  const simpleBindings: Array<{
    hit: boolean;
    id: string;
    name: string;
    path: string;
    kind?: EntityReferenceKind;
  }> = [
    {
      hit: cfg.circadian?.weatherEntityId === entityId,
      id: 'circadian-weather',
      name: '昼夜节律 · 天气',
      path: '/settings?tab=bindings',
    },
    {
      hit: cfg.water?.mainValveEntityId === entityId,
      id: 'water-main-valve',
      name: '用水 · 总阀',
      path: '/settings?tab=bindings',
    },
    {
      hit: cfg.energy?.meterEntityId === entityId,
      id: 'energy-meter',
      name: '能源 · 主电表',
      path: '/settings?tab=bindings',
    },
    {
      hit: (cfg.energy?.circuitEntityIds || []).includes(entityId),
      id: 'energy-circuit',
      name: '能源 · 分路',
      path: '/settings?tab=bindings',
    },
    {
      hit: cfg.voice?.sttEntityId === entityId,
      id: 'voice-stt',
      name: '语音 · STT',
      path: '/settings?tab=voice',
    },
  ];

  for (const item of simpleBindings) {
    if (!item.hit) continue;
    pushReference(
      items,
      {
        kind: item.kind || 'system_config',
        id: item.id,
        name: item.name,
        role: 'binding',
        path: item.path,
      },
      seen,
    );
  }

  for (const rule of cfg.voice?.entityTtsAlerts || []) {
    if (rule?.entityId !== entityId) continue;
    pushReference(
      items,
      {
        kind: 'system_config',
        id: `tts-alert:${rule.entityId}`,
        name: '语音 · 实体播报',
        role: 'watch',
        path: '/settings?tab=voice',
      },
      seen,
    );
  }

  for (const client of cfg.clientPower?.clients || []) {
    if (client?.chargerSwitchEntityId !== entityId) continue;
    pushReference(
      items,
      {
        kind: 'system_config',
        id: `client-power:${client.id}`,
        name: `客户端电源 · ${client.label || client.id}`,
        role: 'binding',
        path: '/settings?tab=smart-charge',
      },
      seen,
    );
  }

  // 影音播放列表 key = player entity
  if (cfg.mediaPlaylists && Object.prototype.hasOwnProperty.call(cfg.mediaPlaylists, entityId)) {
    pushReference(
      items,
      {
        kind: 'media',
        id: `playlist:${entityId}`,
        name: '影音播放列表',
        role: 'config',
        path: '/settings?tab=widgets',
      },
      seen,
    );
  }

  // 事件日志屏蔽列表
  const blockList = cfg.ops?.eventLogRecordBlockEntityIds;
  if (Array.isArray(blockList) && blockList.includes(entityId)) {
    pushReference(
      items,
      {
        kind: 'system_config',
        id: 'event-log-block',
        name: '事件日志屏蔽',
        role: 'config',
        path: '/settings?tab=connection',
      },
      seen,
    );
  }
}
