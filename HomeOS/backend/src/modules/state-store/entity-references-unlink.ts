/**
 * 实体反向引用 — 解绑执行器
 *
 * 所属模块：state-store
 * 职责：根据引用类型（automation / script / template / scene / home_mode / alert_rule /
 *       favorite / hotspot / widget / binding / footer / whole_home_off / security_mode /
 *       security_zone / env_sensor / system_config / media）从对应配置中安全移除实体引用，
 *       并在编排资源（自动化/脚本/模板/场景）变更后触发 HA auto-sync。
 * 依赖：PrismaService、AppConfigService、UiConfigService、AlertRuleWatchIndexService，
 *       以及可选的 updateHomeMode / deleteAlertRule / afterOrchestratorUpdate 回调（由 service 注入）。
 */
import type { PrismaService } from '../../shared/prisma/service';
import type { AppConfigService } from '../../shared/app-config/service';
import type { UiConfigService } from '../ui-config/service';
import type { AlertRuleWatchIndexService } from '../../shared/ha/watch-index.services';
import { dumpOrchestratorYaml, parseOrchestratorYaml } from '../../shared/orchestrator/yaml.util';
import { Prisma } from '../../generated/prisma/client';
import type {
  EntityReferenceKind,
  EntityReferenceUnlinkAction,
  EntityReferenceUnlinkRequest,
} from './entity-references.types';
import {
  removeEntityFromJsonValue,
  removeEntityFromSceneEntities,
  removeEntityFromYamlObject,
  safeParseJson,
  yamlReferencesEntity,
} from './entity-references.util';

/** 编排资源类型（用于 afterOrchestratorUpdate 回调触发 HA 同步） */
export type OrchestratorUnlinkKind = 'automation' | 'script' | 'template' | 'scene';

/**
 * 解绑操作所需依赖集合。
 * 由 EntityReferencesService 组装并传入，支持通过可选回调委托给各业务 Service 执行带缓存的写操作。
 */
interface UnlinkDeps {
  prisma: PrismaService;
  appConfig: AppConfigService;
  uiConfig: UiConfigService;
  alertRuleWatchIndex: AlertRuleWatchIndexService;
  /** 可选：家庭模式更新（含触发绑定重载） */
  updateHomeMode?: (
    id: string,
    data: { config?: unknown; triggers?: unknown },
  ) => Promise<unknown>;
  /** 可选：通知服务删除规则（带缓存刷新） */
  deleteAlertRule?: (ruleId: string) => Promise<{ success: boolean }>;
  /** 编排资源写库后触发 HA auto-sync（与 controller 行为对齐） */
  afterOrchestratorUpdate?: (kind: OrchestratorUnlinkKind, id: string) => void;
}

/**
 * 单条解绑操作的结果。
 * ok=false 时 message 描述失败原因；ok=true 时 action 标识执行的动作类型，layoutTouched 表示是否触发布局变更。
 */
interface UnlinkOutcome {
  ok: boolean;
  action?: EntityReferenceUnlinkAction;
  message?: string;
  layoutTouched?: boolean;
}

/** 读取默认项目的布局 JSON 并解析为对象；解析失败返回空对象 */
async function loadLayout(deps: UnlinkDeps): Promise<Record<string, unknown>> {
  const config = await deps.prisma.projectConfig.findUnique({
    where: { projectId: 'default' },
    select: { layout: true },
  });
  return safeParseJson<Record<string, unknown>>(config?.layout) || {};
}

/** 将布局对象写回 UiConfig（projectId=default） */
async function saveLayout(deps: UnlinkDeps, layout: Record<string, unknown>) {
  await deps.uiConfig.saveConfig('default', layout);
}

/** 构造失败结果 */
function fail(message: string): UnlinkOutcome {
  return { ok: false, message };
}

/** 构造成功结果，layoutTouched 标记是否触发布局变更（用于上层决定是否刷新缓存） */
function ok(action: EntityReferenceUnlinkAction, message?: string, layoutTouched = false): UnlinkOutcome {
  return { ok: true, action, message, layoutTouched };
}

/**
 * 从 YAML 编排资源（自动化/脚本/模板）中移除实体引用。
 * @remarks 安全移除策略：先解析 YAML 删除引用列表项，无法自动移除的模板表达式视为 residual 返回失败；
 *          模板实体额外处理 slotMapping；模板输出实体（haEntityId 命中）拒绝移除并提示到联动中心编辑。
 *          写库后通过 afterOrchestratorUpdate 触发 HA auto-sync。
 */
async function unlinkYamlResource(
  deps: UnlinkDeps,
  table: 'automation' | 'script' | 'templateEntity',
  id: string,
  entityId: string,
): Promise<UnlinkOutcome> {
  const row = await (deps.prisma[table] as {
    findUnique: (args: {
      where: { id: string };
      select: { yaml: true; haEntityId?: true; geekGraph?: true };
    }) => Promise<{
      yaml: string;
      haEntityId?: string | null;
      geekGraph?: unknown;
    } | null>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
  }).findUnique({
    where: { id },
    select:
      table === 'templateEntity'
        ? { yaml: true, haEntityId: true }
        : table === 'automation' || table === 'script'
          ? { yaml: true, geekGraph: true }
          : { yaml: true },
  });
  if (!row) return fail('目标不存在');

  if (table === 'templateEntity' && row.haEntityId === entityId) {
    return fail('该实体是模板输出实体，请到联动中心编辑或删除模板');
  }

  const data: Record<string, unknown> = {};
  let yamlChanged = false;
  let slotChanged = false;
  let graphChanged = false;

  const parsed = parseOrchestratorYaml(row.yaml || '');
  if (parsed) {
    const result = removeEntityFromYamlObject(parsed, entityId);
    if (result.changed) {
      if (result.residual) {
        return fail('仍有无法自动移除的引用（如模板表达式），请手动编辑');
      }
      data.yaml = dumpOrchestratorYaml(parsed);
      yamlChanged = true;
    }
  } else if (yamlReferencesEntity(row.yaml || '', entityId)) {
    return fail('YAML 无法安全自动移除，请手动编辑');
  }

  if (table === 'templateEntity') {
    const tmpl = await deps.prisma.templateEntity.findUnique({
      where: { id },
      select: { slotMapping: true },
    });
    if (tmpl?.slotMapping) {
      const slots = removeEntityFromJsonValue(tmpl.slotMapping, entityId);
      if (slots.changed) {
        data.slotMapping = slots.value;
        slotChanged = true;
      }
    }
  }

  // 自动化 / 脚本：YAML 变更时清空 geekGraph，避免打开后把已解绑实体写回；仅图内引用则改写图
  if ((table === 'automation' || table === 'script') && row.geekGraph != null) {
    if (yamlChanged) {
      data.geekGraph = Prisma.DbNull;
      graphChanged = true;
    } else {
      const graphResult = removeEntityFromJsonValue(row.geekGraph, entityId);
      if (graphResult.changed) {
        data.geekGraph =
          graphResult.value == null ? Prisma.DbNull : (graphResult.value as Prisma.InputJsonValue);
        graphChanged = true;
      }
    }
  }

  if (!yamlChanged && !slotChanged && !graphChanged) {
    if (yamlReferencesEntity(row.yaml || '', entityId)) {
      return fail('YAML 无法安全自动移除，请手动编辑');
    }
    return fail('未找到可移除的引用项');
  }

  await (deps.prisma[table] as {
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
  }).update({ where: { id }, data });

  const syncKind: OrchestratorUnlinkKind =
    table === 'automation' ? 'automation' : table === 'script' ? 'script' : 'template';
  deps.afterOrchestratorUpdate?.(syncKind, id);

  let message = '已从 YAML 中移除相关步骤';
  if (slotChanged && !yamlChanged && !graphChanged) message = '已从模板槽位映射中移除';
  else if (graphChanged && !yamlChanged) message = '已从画布中移除相关引用';
  else if (yamlChanged && graphChanged) message = '已从 YAML 中移除相关步骤，并清空画布缓存';

  return ok('updated', message);
}

/** 从场景的 entities 成员列表中移除目标实体，并同步/清空 geekSceneGraph */
async function unlinkScene(deps: UnlinkDeps, id: string, entityId: string): Promise<UnlinkOutcome> {
  const row = await deps.prisma.scene.findUnique({
    where: { id },
    select: { entities: true, geekSceneGraph: true },
  });
  if (!row) return fail('场景不存在');
  const result = removeEntityFromSceneEntities(row.entities, entityId);
  if (!result.changed) return fail('场景中未找到该实体');

  const data: Record<string, unknown> = {
    entities: result.value as Prisma.InputJsonValue,
  };
  // 成员列表已变：优先改写图；改写失败则清空，避免画布与 entities 分叉
  if (row.geekSceneGraph != null) {
    const graphResult = removeEntityFromJsonValue(row.geekSceneGraph, entityId);
    data.geekSceneGraph =
      graphResult.changed && graphResult.value != null
        ? (graphResult.value as Prisma.InputJsonValue)
        : Prisma.DbNull;
  }

  await deps.prisma.scene.update({ where: { id }, data });
  deps.afterOrchestratorUpdate?.('scene', id);
  return ok(
    'filtered',
    row.geekSceneGraph != null
      ? '已从场景成员中移除，并同步画布'
      : '已从场景成员中移除',
  );
}

/**
 * 从家庭模式的 config（动作）与 triggers（触发）中移除实体引用。
 * @remarks 优先委托 updateHomeMode 回调（含绑定重载），无回调时直接写库。
 */
async function unlinkHomeMode(deps: UnlinkDeps, id: string, entityId: string): Promise<UnlinkOutcome> {
  const row = await deps.prisma.homeMode.findUnique({
    where: { id },
    select: { config: true, triggers: true },
  });
  if (!row) return fail('家庭模式不存在');

  const configParsed = safeParseJson(row.config) ?? [];
  const triggersParsed = safeParseJson(row.triggers) ?? [];
  const configNext = removeEntityFromJsonValue(configParsed, entityId);
  const triggersNext = removeEntityFromJsonValue(triggersParsed, entityId);
  if (!configNext.changed && !triggersNext.changed) return fail('家庭模式中未找到该实体');

  if (deps.updateHomeMode) {
    await deps.updateHomeMode(id, {
      config: configNext.value,
      triggers: triggersNext.value,
    });
  } else {
    await deps.prisma.homeMode.update({
      where: { id },
      data: {
        config: configNext.value as Prisma.InputJsonValue,
        triggers: triggersNext.value as Prisma.InputJsonValue,
      },
    });
  }
  return ok('filtered', '已从家庭模式动作/触发中移除');
}

/**
 * 删除告警规则：优先委托 deleteAlertRule 回调（含缓存刷新），无回调时直接删除并重建 AlertRuleWatchIndex。
 * @remarks 告警规则以整条删除方式解绑（非过滤），删除后同步更新监听索引。
 */
async function unlinkAlertRule(deps: UnlinkDeps, id: string): Promise<UnlinkOutcome> {
  if (deps.deleteAlertRule) {
    const res = await deps.deleteAlertRule(id);
    if (!res.success) return fail('删除告警规则失败');
    return ok('deleted_rule', '已删除告警规则');
  }
  try {
    await deps.prisma.alertRule.delete({ where: { id } });
  } catch {
    return fail('告警规则不存在或删除失败');
  }
  const remaining = await deps.prisma.alertRule.findMany({
    where: { enabled: true },
    select: { entityId: true, enabled: true },
    take: 1000,
  });
  deps.alertRuleWatchIndex.updateFromRules(
    remaining.map((r) => ({
      entityId: r.entityId ?? undefined,
      enabled: r.enabled,
    })),
  );
  return ok('deleted_rule', '已删除告警规则');
}

/**
 * 从布局的 favoriteEntities 中移除目标实体。
 * @remarks 支持按域精准移除（id 含 favorite: 前缀）或全局扫描所有域列表。
 */
async function unlinkFavorite(
  deps: UnlinkDeps,
  id: string,
  entityId: string,
): Promise<UnlinkOutcome> {
  const layout = await loadLayout(deps);
  const favorites = (layout.favoriteEntities || {}) as Record<string, unknown>;
  const domain = id.startsWith('favorite:') ? id.slice('favorite:'.length) : '';
  let changed = false;
  if (domain && Array.isArray(favorites[domain])) {
    const list = favorites[domain] as unknown[];
    const next = list.filter((x) => String(x) !== entityId);
    if (next.length !== list.length) {
      favorites[domain] = next;
      changed = true;
    }
  } else {
    for (const [key, list] of Object.entries(favorites)) {
      if (!Array.isArray(list)) continue;
      const next = list.filter((x) => String(x) !== entityId);
      if (next.length !== list.length) {
        favorites[key] = next;
        changed = true;
      }
    }
  }
  if (!changed) return fail('收藏中未找到该实体');
  layout.favoriteEntities = favorites;
  await saveLayout(deps, layout);
  return ok('filtered', '已从收藏移除', true);
}

/**
 * 移除户型图热点组件：支持按 hotspot:floorIdx:widgetIdx 精准定位，
 * 或按 widget.id === entityId 匹配移除。
 */
async function unlinkHotspot(
  deps: UnlinkDeps,
  id: string,
  entityId: string,
): Promise<UnlinkOutcome> {
  const layout = await loadLayout(deps);
  const floors = Array.isArray(layout.floors) ? [...layout.floors] : [];
  let changed = false;
  const match = /^hotspot:(\d+):(\d+)$/.exec(id);
  layout.floors = floors.map((floor, floorIdx) => {
    if (!floor || typeof floor !== 'object') return floor;
    const f = { ...(floor as Record<string, unknown>) };
    const widgets = Array.isArray(f.widgets) ? [...f.widgets] : [];
    const next = widgets.filter((w, wIdx) => {
      if (!w || typeof w !== 'object') return true;
      const widget = w as Record<string, unknown>;
      if (match) {
        const keep = !(floorIdx === Number(match[1]) && wIdx === Number(match[2]));
        if (!keep) changed = true;
        return keep;
      }
      if (String(widget.id || '') === entityId) {
        changed = true;
        return false;
      }
      return true;
    });
    f.widgets = next;
    return f;
  });
  if (!changed) return fail('未找到对应热点');
  await saveLayout(deps, layout);
  return ok('deleted_widget', '已移除户型图热点', true);
}

/**
 * 从布局 JSON 的各类字段中移除实体引用，按 kind 分发：
 *  - widget：右侧面板/浮动组件，按 id 或序号定位后移除或递归清理
 *  - binding：haConfig 绑定（含门铃、统计传感器、离家模拟灯池等）
 *  - footer / whole_home_off：递归清理对应字段
 *  - security_mode：安防模式动作或紧急配置
 *  - security_zone：layout.securityZones 与 haConfig.zones 双源扫描
 */
async function unlinkLayoutJsonField(
  deps: UnlinkDeps,
  kind: EntityReferenceKind,
  id: string,
  entityId: string,
): Promise<UnlinkOutcome> {
  const layout = await loadLayout(deps);
  let changed = false;

  if (kind === 'widget') {
    const widgetIndexMatch = /^widget:(\d+)$/.exec(id);
    let combinedIdx = 0;

    const stripWidgets = (list: unknown[]): unknown[] =>
      list
        .map((w) => {
          const currentIdx = combinedIdx;
          combinedIdx += 1;
          if (!w || typeof w !== 'object') return w;
          const widget = w as Record<string, unknown>;
          const widgetKey = String(widget.id || `widget:${currentIdx}`);
          const targeted =
            widgetKey === id ||
            (widgetIndexMatch != null && currentIdx === Number(widgetIndexMatch[1]));
          if (!targeted) return w;

          if (String(widget.id || '') === entityId) {
            changed = true;
            return null;
          }
          const nested = removeEntityFromJsonValue(widget, entityId);
          if (!nested.changed) return w;
          changed = true;
          return nested.value;
        })
        .filter((w) => w != null);

    if (Array.isArray(layout.rightPanelWidgets)) {
      layout.rightPanelWidgets = stripWidgets(layout.rightPanelWidgets);
    }
    if (Array.isArray(layout.floatingWidgets)) {
      layout.floatingWidgets = stripWidgets(layout.floatingWidgets);
    }
  } else if (kind === 'binding') {
    const ha = { ...((layout.haConfig || {}) as Record<string, unknown>) };
    if (id.startsWith('ha:')) {
      const key = id.slice(3);
      if (key in ha) {
        const nested = removeEntityFromJsonValue(ha[key], entityId);
        if (nested.changed) {
          ha[key] = nested.value;
          changed = true;
        }
      }
    } else if (id.startsWith('doorbell:')) {
      const idx = Number(id.slice('doorbell:'.length));
      const doorbells = Array.isArray(ha.doorbells) ? [...ha.doorbells] : [];
      if (Number.isFinite(idx) && doorbells[idx]) {
        const nested = removeEntityFromJsonValue(doorbells[idx], entityId);
        if (nested.changed) {
          doorbells[idx] = nested.value;
          ha.doorbells = doorbells;
          changed = true;
        }
      }
    } else if (
      id === 'statsSensors' ||
      id === 'awaySimulationLightPool' ||
      id === 'mobileRoomStats'
    ) {
      const nested = removeEntityFromJsonValue(layout[id], entityId);
      if (nested.changed) {
        layout[id] = nested.value;
        changed = true;
      }
    } else {
      const nested = removeEntityFromJsonValue(ha, entityId);
      if (nested.changed) {
        Object.assign(ha, nested.value as object);
        changed = true;
      }
    }
    layout.haConfig = ha;
  } else if (kind === 'footer' && layout.dashboardFooter) {
    const nested = removeEntityFromJsonValue(layout.dashboardFooter, entityId);
    if (nested.changed) {
      layout.dashboardFooter = nested.value;
      changed = true;
    }
  } else if (kind === 'whole_home_off' && layout.wholeHomeOff) {
    const nested = removeEntityFromJsonValue(layout.wholeHomeOff, entityId);
    if (nested.changed) {
      layout.wholeHomeOff = nested.value;
      changed = true;
    }
  } else if (kind === 'security_mode') {
    if (id === 'securityEmergency' && layout.securityEmergency) {
      const nested = removeEntityFromJsonValue(layout.securityEmergency, entityId);
      if (nested.changed) {
        layout.securityEmergency = nested.value;
        changed = true;
      }
    } else {
      const modes = Array.isArray(layout.securityModes) ? [...layout.securityModes] : [];
      layout.securityModes = modes.map((mode) => {
        if (!mode || typeof mode !== 'object') return mode;
        const m = mode as Record<string, unknown>;
        if (String(m.key || '') !== id) return mode;
        const nested = removeEntityFromJsonValue(m, entityId);
        if (nested.changed) {
          changed = true;
          return nested.value;
        }
        return mode;
      });
    }
  } else if (kind === 'security_zone') {
    const ha = { ...((layout.haConfig || {}) as Record<string, unknown>) };
    const zoneSources: Array<{ key: string; list: unknown[] }> = [];
    if (Array.isArray((layout as { securityZones?: unknown[] }).securityZones)) {
      zoneSources.push({
        key: 'layout',
        list: [...((layout as { securityZones: unknown[] }).securityZones)],
      });
    }
    if (Array.isArray(ha.zones)) {
      zoneSources.push({ key: 'ha', list: [...(ha.zones as unknown[])] });
    }
    for (const source of zoneSources) {
      source.list = source.list.map((zone, idx) => {
        if (!zone || typeof zone !== 'object') return zone;
        const z = zone as Record<string, unknown>;
        const zoneKey = String(z.id || z.name || `zone:${idx}`);
        if (zoneKey !== id) return zone;
        const nested = removeEntityFromJsonValue(z, entityId);
        if (nested.changed) {
          changed = true;
          return nested.value;
        }
        return zone;
      });
      if (source.key === 'layout') {
        (layout as { securityZones: unknown[] }).securityZones = source.list;
      } else {
        ha.zones = source.list;
        layout.haConfig = ha;
      }
    }
  }

  if (!changed) return fail('未找到可移除的布局引用');
  await saveLayout(deps, layout);
  return ok(kind === 'hotspot' || kind === 'widget' ? 'deleted_widget' : 'cleared', '已从布局配置移除', true);
}

/**
 * 从系统配置（AppConfigService）中移除实体引用，按 kind 分发：
 *  - env_sensor：环境传感器映射（按房间）
 *  - media：影音播放列表（key 为播放器 entity_id，整条删除）
 *  - system_config：人员在家判定、昼夜天气、用水总阀、能源电表/分路、语音 STT/TTS、客户端电源、事件日志屏蔽等
 */
async function unlinkSystemConfig(
  deps: UnlinkDeps,
  kind: EntityReferenceKind,
  id: string,
  entityId: string,
): Promise<UnlinkOutcome> {
  const cfg = deps.appConfig.getAllRaw();
  const patch: Record<string, unknown> = {};

  if (kind === 'env_sensor' && id.startsWith('env:')) {
    const roomId = id.slice(4);
    const room = { ...(cfg.envSensorMap?.[roomId] || {}) };
    const nested = removeEntityFromJsonValue(room, entityId);
    if (!nested.changed) return fail('环境映射中未找到该实体');
    patch.envSensorMap = {
      ...cfg.envSensorMap,
      [roomId]: nested.value,
    };
  } else if (kind === 'media' && id.startsWith('playlist:')) {
    const playlists = { ...(cfg.mediaPlaylists || {}) };
    if (!(entityId in playlists)) return fail('未找到影音播放列表');
    const { [entityId]: _removed, ...restPlaylists } = playlists;
    void _removed;
    patch.mediaPlaylists = restPlaylists;
  } else if (kind === 'system_config') {
    if (id.startsWith('presence:')) {
      const personId = id.slice('presence:'.length);
      const persons = (cfg.security?.presencePersons || []).map((p) => {
        if (p.id !== personId) return p;
        return {
          ...p,
          entityIds: (p.entityIds || []).filter((x) => x !== entityId),
        };
      });
      patch.security = { ...cfg.security, presencePersons: persons };
    } else if (id === 'circadian-weather') {
      patch.circadian = { ...cfg.circadian, weatherEntityId: '' };
    } else if (id === 'water-main-valve') {
      patch.water = { ...cfg.water, mainValveEntityId: '' };
    } else if (id === 'energy-meter') {
      patch.energy = { ...cfg.energy, meterEntityId: '' };
    } else if (id === 'energy-circuit') {
      patch.energy = {
        ...cfg.energy,
        circuitEntityIds: (cfg.energy?.circuitEntityIds || []).filter((x) => x !== entityId),
      };
    } else if (id === 'voice-stt') {
      patch.voice = { ...cfg.voice, sttEntityId: '' };
    } else if (id.startsWith('tts-alert:')) {
      patch.voice = {
        ...cfg.voice,
        entityTtsAlerts: (cfg.voice?.entityTtsAlerts || []).filter((r) => r.entityId !== entityId),
      };
    } else if (id.startsWith('client-power:')) {
      const clientId = id.slice('client-power:'.length);
      patch.clientPower = {
        ...cfg.clientPower,
        clients: (cfg.clientPower?.clients || []).map((c) =>
          c.id === clientId ? { ...c, chargerSwitchEntityId: '' } : c,
        ),
      };
    } else if (id === 'event-log-block') {
      patch.ops = {
        ...cfg.ops,
        eventLogRecordBlockEntityIds: (cfg.ops?.eventLogRecordBlockEntityIds || []).filter(
          (x) => x !== entityId,
        ),
      };
    } else {
      return fail('暂不支持移除此系统配置项');
    }
  } else {
    return fail('暂不支持移除此引用类型');
  }

  await deps.appConfig.update(patch as Parameters<AppConfigService['update']>[0]);
  return ok('cleared', '已从系统配置移除');
}

/**
 * 执行单条引用移除。
 * @param deps 依赖集合（含可选回调）
 * @param entityId 目标实体 ID（须含域前缀，如 light.xxx）
 * @param req 解绑请求（kind + id + 可选 detail）
 * @returns 解绑结果；参数无效或类型不支持时返回 ok=false
 * @remarks 按 kind switch 分发到具体 unlink 函数；编排资源变更后触发 HA auto-sync。
 */
export async function unlinkEntityReference(
  deps: UnlinkDeps,
  entityId: string,
  req: EntityReferenceUnlinkRequest,
): Promise<UnlinkOutcome> {
  const id = String(req.id || '').trim();
  const kind = req.kind;
  if (!entityId.includes('.') || !id || !kind) return fail('参数无效');

  switch (kind) {
    case 'automation':
      return unlinkYamlResource(deps, 'automation', id, entityId);
    case 'script':
      return unlinkYamlResource(deps, 'script', id, entityId);
    case 'template':
      return unlinkYamlResource(deps, 'templateEntity', id, entityId);
    case 'scene':
      return unlinkScene(deps, id, entityId);
    case 'home_mode':
      return unlinkHomeMode(deps, id, entityId);
    case 'alert_rule':
      return unlinkAlertRule(deps, id);
    case 'favorite':
      return unlinkFavorite(deps, id, entityId);
    case 'hotspot':
      return unlinkHotspot(deps, id, entityId);
    case 'widget':
    case 'binding':
    case 'footer':
    case 'whole_home_off':
    case 'security_mode':
    case 'security_zone':
      return unlinkLayoutJsonField(deps, kind, id, entityId);
    case 'env_sensor':
    case 'system_config':
    case 'media':
      return unlinkSystemConfig(deps, kind, id, entityId);
    default:
      return fail('暂不支持移除此引用类型');
  }
}
