/**
 * 智能管家工具集服务。
 *
 * 所属模块：backend/modules/agent/tools
 * 职责：实现 LLM 可调用的全部家居工具（search_entities / get_entity_state / control_device /
 *  list_areas / get_area_snapshot / control_room / activate_scene …），并统一执行入口。
 *  - 仅在 HomeOS 白名单（房间映射 + 常用监控列表）内搜索设备
 *  - 控制前用 isHighRisk 做安全校验，高危设备（门锁 / 安防 / 燃气阀 / 车库门）拦截
 *  - HA 的 scene.* / script.* 走「场景语音控制」允许清单闸门，默认全禁（fail-closed）
 *  - control_room 支持“全屋”语义，自动遍历所有房间
 * 依赖：StateStoreService（状态）、CommandProxyService（下发 HA 调用）、AgentAreaService（房间）、
 *  UiConfigService（布局）、AppConfigService（环境传感器映射）。
 */
import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { StateStoreService } from '../../state-store/service';
import { CommandProxyService } from '../../command-proxy/service';
import { assertCommandProxyAuthorized } from '../../command-proxy/authorization.util';
import { HaConnectorService } from '../../ha-connector/service';
import { ChildModeService } from '../../child-mode/service';
import { UiConfigService } from '../../ui-config/service';
import { AppConfigService } from '../../../shared/app-config/service';
import { getErrorMessage } from '../../../common/utils';
import { AgentAreaService, type AgentAreaSummary } from '../area.service';
import { AGENT_CONTROL_TOOLS, type AgentActor } from '../agent-actor';
import { isHighRisk, isSceneVoiceAllowed, SAFE_BULK_CONTROL_DOMAINS, type SceneVoiceControlGate } from './high-risk-denylist';
import { getEntityDomain, isChildRestrictedDomain } from '@homeos/shared';
import type { HaEntity } from '@homeos/shared';
import { collectEntityIdsFromHaYaml } from '../../scene/scene-execute-acl.util';
import {
  validateEntityId,
  extractDomain,
  sanitizeServiceData,
} from './tool-args-validator';
import type { LlmToolSchema } from '../providers/llm-provider.interface';
import { buildHomeToolSchemas } from './home-tools-schemas';
import { SceneService } from '../../scene/service';
import { AgentConfigService } from '../config.service';
import {
  HOME_MODE_LOOKUP,
  type HomeModeLookup,
} from '../../home-mode/home-mode.tokens';
import { EnergyBudgetService } from '../../energy/budget.service';
import { PrismaService } from '../../../shared/prisma/service';
import { ExternalApiService } from '../../system/ops/external-api.service';
import {
  excerptAutomationYaml,
  formatAutomationExplanation,
  summarizeAutomationYaml,
} from './explain-automation.util';

/**
 * 实体属性中含凭证/密钥特征的字段：返回给 LLM 前剔除，避免敏感信息外泄。
 * HA 部分集成（媒体播放器 / 摄像头等）会在 attributes 暴露 access_token 等字段。
 */
const SENSITIVE_ATTRIBUTE_KEYS = new Set([
  'access_token',
  'refresh_token',
  'auth_token',
  'api_token',
  'api_key',
  'apikey',
  'token',
  'secret',
  'password',
  'passwd',
  'private_key',
  'certificate',
  'credentials',
]);

/** 单个属性值序列化后允许的最大长度：超出截断，防止大列表属性撑爆 LLM 上下文 */
const MAX_ATTRIBUTE_VALUE_LENGTH = 500;

/** 清理实体属性：剔除凭证字段，截断超长值 */
function sanitizeEntityAttributes(
  attrs: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!attrs) return attrs;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (SENSITIVE_ATTRIBUTE_KEYS.has(k)) continue;
    const serialized = JSON.stringify(v);
    if (serialized && serialized.length > MAX_ATTRIBUTE_VALUE_LENGTH) {
      out[k] = `${serialized.slice(0, MAX_ATTRIBUTE_VALUE_LENGTH)}…(截断)`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * 家居工具集服务（@Injectable）。
 * 暴露 getToolSchemas（供 LLM 选择工具）与 execute（统一执行入口）。
 */
@Injectable()
export class HomeToolsService {
  private readonly logger = new Logger('HomeTools');

  constructor(
    private readonly stateStore: StateStoreService,
    private readonly commandProxy: CommandProxyService,
    private readonly areaService: AgentAreaService,
    private readonly uiConfig: UiConfigService,
    private readonly appConfig: AppConfigService,
    private readonly childMode: ChildModeService,
    private readonly haConnector: HaConnectorService,
    private readonly sceneService: SceneService,
    @Inject(forwardRef(() => HOME_MODE_LOOKUP))
    private readonly homeMode: HomeModeLookup,
    private readonly energyBudget: EnergyBudgetService,
    private readonly prisma: PrismaService,
    private readonly externalApi: ExternalApiService,
    private readonly agentConfig: AgentConfigService,
  ) {}

  /**
   * 构造场景 / 脚本语音控制白名单闸门。
   * 配置读取失败时返回 `undefined`，调用方据此按全禁处理（fail-closed）。
   * @returns 白名单闸门；未启用或读取异常时可能为 undefined
   */
  private async sceneVoiceGate(): Promise<SceneVoiceControlGate | undefined> {
    try {
      const cfg = await this.agentConfig.getSceneVoiceControl();
      if (!cfg.enabled) return { enabled: false, allow: new Set<string>() };
      return {
        enabled: true,
        allow: new Set(cfg.allow.map((id) => id.trim().toLowerCase()).filter(Boolean)),
      };
    } catch (e: unknown) {
      this.logger.warn(`读取场景语音控制配置失败,按全禁处理: ${getErrorMessage(e)}`);
      return undefined;
    }
  }

  private commandProxyTargetResolver() {
    return {
      getRegistry: () => this.haConnector.fetchEntityRegistry(),
      findEntityIds: (predicate: (attrs: Record<string, unknown>) => boolean) =>
        this.stateStore.scanEntities((e) => predicate(e.attributes ?? {})),
    };
  }

  /**
   * 与 HTTP /services/call 对齐的实体 ACL；无执行身份时拒绝控制类工具。
   */
  private async assertActorMayControl(
    actor: AgentActor | undefined,
    dto: {
      domain: string;
      service: string;
      entity_id: string;
      service_data?: Record<string, unknown>;
    },
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    if (!actor?.role) {
      return {
        ok: false,
        message: '未绑定执行身份，禁止通过智能管家控制设备。请在通道配置中绑定 HomeOS 用户。',
      };
    }
    try {
      await assertCommandProxyAuthorized(
        dto,
        actor,
        this.childMode,
        this.commandProxyTargetResolver(),
      );
      return { ok: true };
    } catch (e: unknown) {
      return { ok: false, message: getErrorMessage(e) || '无权控制该设备' };
    }
  }

  /**
   * 返回暴露给 LLM 的工具 schema 列表（定义见 home-tools-schemas.ts）。
   * 包含搜索、查状态、控制设备、列房间、房间快照、按房间批量控制六类工具。
   * @returns 工具 schema 数组
   */
  getToolSchemas(): LlmToolSchema[] {
    return buildHomeToolSchemas();
  }

  /**
   * 统一工具执行入口，按 name 分发到对应私有方法。
   * 对控制类工具（control_device / control_room）先做参数安全校验与实体 ACL。
   * @param name 工具名
   * @param args 工具参数
   * @param actor 执行身份（JWT 用户 / 渠道绑定用户 / MCP 网关）
   */
  async execute(
    name: string,
    args: Record<string, unknown>,
    actor?: AgentActor,
  ): Promise<Record<string, unknown>> {
    if (AGENT_CONTROL_TOOLS.has(name)) {
      if (name === 'control_device') {
        const idCheck = validateEntityId(String(args.entity_id ?? ''));
        if (!idCheck.valid) {
          this.logger.warn(`工具参数校验失败: ${idCheck.error}`);
          return { success: false, error: idCheck.error };
        }
      }
      // activate_scene 可选用 entity_id 精确指定；显式给出时必须格式合法，
      // 避免把「scene 名称」误当实体 ID 拼进 service 调用
      if (name === 'activate_scene' && args.entity_id != null && String(args.entity_id).trim()) {
        const idCheck = validateEntityId(String(args.entity_id));
        if (!idCheck.valid) {
          this.logger.warn(`工具参数校验失败: ${idCheck.error}`);
          return { success: false, error: idCheck.error };
        }
      }
      if (args.service_data) {
        args = {
          ...args,
          service_data: sanitizeServiceData(args.service_data as Record<string, unknown>),
        };
      }
    }
    switch (name) {
      case 'search_entities':
        return this.searchEntities(String(args.query ?? ''));
      case 'get_entity_state':
        return this.getEntityState(String(args.entity_id ?? ''));
      case 'control_device':
        return this.controlDevice(args, actor);
      case 'list_areas':
        return this.listAreas();
      case 'get_area_snapshot':
        return this.getAreaSnapshot(String(args.area_id ?? ''));
      case 'control_room':
        return this.controlRoom(args, actor);
      case 'execute_scene':
        return this.executeScene(String(args.name ?? ''), actor);
      case 'activate_scene':
        return this.activateScene(args, actor);
      case 'activate_home_mode':
        return this.activateHomeMode(String(args.name ?? ''), actor);
      case 'query_energy':
        return this.queryEnergy();
      case 'get_home_status':
        return this.getHomeStatus();
      case 'get_weather':
        return this.getWeather();
      case 'get_calendar':
        return this.getCalendar();
      case 'list_scenes':
        return this.listScenesDetailed();
      case 'list_home_modes':
        return { modes: await this.listModeNames() };
      case 'set_light_brightness':
        return this.setLightBrightness(args, actor);
      case 'set_cover_position':
        return this.setCoverPosition(args, actor);
      case 'media_control':
        return this.mediaControl(args, actor);
      case 'query_camera':
        return this.queryCamera(String(args.entity_id ?? ''));
      case 'explain_automation':
        return this.explainAutomation(String(args.query ?? ''));
      default:
        return { error: `未知工具: ${name}` };
    }
  }
  /**
   * 搜索设备：仅在 HomeOS 白名单内匹配（房间映射 + 常用监控列表 favoriteEntities）。
   * @param query 搜索关键词（按 entity_id 与 friendly_name 模糊匹配）
   * @returns 匹配设备列表（最多 12 条）+ 总白名单数；未匹配时给出提示
   */
  private async searchEntities(query: string): Promise<Record<string, unknown>> {
    const lower = query.toLowerCase();
    let areas: Awaited<ReturnType<typeof this.areaService.findAll>>;
    try {
      areas = await this.areaService.findAll();
    } catch (e: unknown) {
      return { error: `房间列表加载失败: ${getErrorMessage(e)}` };
    }
    const whitelist = new Set<string>();
    const entityRoom = new Map<string, string>();

    // findAll 已带 entities，避免逐房 findOne N+1
    for (const a of areas) {
      for (const ae of a.entities ?? []) {
        whitelist.add(ae.entityId);
        if (!entityRoom.has(ae.entityId)) entityRoom.set(ae.entityId, a.name);
      }
    }

    // 追加常用监控列表 favoriteEntities 到白名单
    const favorites: string[] = [];
    try {
      const layout = await this.readLayout();
      const fe = (layout?.favoriteEntities ?? {}) as Record<string, string[]>;
      for (const ids of Object.values(fe)) {
        if (!Array.isArray(ids)) continue;
        for (const id of ids) {
          whitelist.add(id);
          favorites.push(id);
        }
      }
    } catch {
      /* 忽略 */
    }

    // 在白名单内按关键词匹配
    const all = this.stateStore.getAll();
    const matched = all
      .filter(
        (e) =>
          whitelist.has(e.entity_id) &&
          (e.entity_id.toLowerCase().includes(lower) ||
            String(e.attributes?.friendly_name || '')
              .toLowerCase()
              .includes(lower)),
      )
      .slice(0, 12)
      .map((e) => ({
        entity_id: e.entity_id,
        name: e.attributes?.friendly_name ?? e.entity_id,
        state: e.state,
        room: entityRoom.get(e.entity_id) ?? '',
        source: favorites.includes(e.entity_id) ? 'monitored' : 'room',
      }));

    return {
      count: matched.length,
      total_whitelisted: whitelist.size,
      hint:
        matched.length === 0
          ? `HomeOS 已配置的设备中未找到匹配"${query}"的设备。请将设备绑定到房间或加入常用监控列表。`
          : undefined,
      entities: matched,
    };
  }

  /**
   * 查询单个设备的当前状态。
   * @param entityId 实体 ID
   * @returns 状态对象；未找到返回 error
   */
  private getEntityState(entityId: string): Record<string, unknown> {
    const e = this.stateStore.getById(entityId);
    if (!e) return { error: `未找到设备 ${entityId}` };
    return {
      entity_id: e.entity_id,
      name: e.attributes?.friendly_name ?? e.entity_id,
      state: e.state,
      // 剔除凭证类属性并截断超长值，避免敏感信息外泄 / 上下文膨胀
      attributes: sanitizeEntityAttributes(e.attributes),
    };
  }

  /**
   * 控制单个设备。高危 denylist → 实体 ACL → CommandProxy。
   */
  private async controlDevice(
    args: Record<string, unknown>,
    actor?: AgentActor,
  ): Promise<Record<string, unknown>> {
    const domain = String(args.domain ?? '');
    const service = String(args.service ?? '');
    const entity_id = String(args.entity_id ?? '');
    const actualDomain = extractDomain(entity_id) || domain;
    const service_data = (args.service_data as Record<string, unknown>) ?? undefined;
    // scene / script 内部动作无法静态审计：仅在用户白名单内才放行（automation 永久拦截）
    const sceneVoice =
      actualDomain === 'scene' || actualDomain === 'script'
        ? await this.sceneVoiceGate()
        : undefined;
    const risk = isHighRisk(actualDomain, service, entity_id, service_data, sceneVoice);
    if (risk.blocked) {
      this.logger.warn(
        `已拦截高危语音控制: ${actualDomain}.${service} ${entity_id} (${risk.reason})`,
      );
      return {
        success: false,
        blocked: true,
        message: `出于安全考虑，「${risk.reason}」不支持语音直接控制，请通过手机 App 二次确认。`,
      };
    }
    const auth = await this.assertActorMayControl(actor, {
      domain: actualDomain,
      service,
      entity_id,
      service_data,
    });
    if (!auth.ok) {
      this.logger.warn(`Agent ACL 拒绝: ${actualDomain}.${service} ${entity_id} (${auth.message})`);
      return { success: false, blocked: true, message: auth.message };
    }
    try {
      const result = await this.commandProxy.callService({
        domain: actualDomain,
        service,
        entity_id,
        service_data,
      });
      return result as Record<string, unknown>;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '控制失败';
      return { success: false, message: msg };
    }
  }

  /**
   * 列出所有房间。
   * @returns areas 数组（id / name / icon）
   */
  private async listAreas(): Promise<Record<string, unknown>> {
    try {
      const areas = await this.areaService.findAll();
      return {
        areas: (areas ?? []).map((a) => ({
          id: a.id,
          name: a.name,
          icon: a.icon,
        })),
      };
    } catch (e: unknown) {
      return { error: `房间列表加载失败: ${getErrorMessage(e)}` };
    }
  }
  /**
   * 获取房间内所有设备的当前状态快照。
   * 温度 / 湿度传感器来源优先级：布局 mobileRoomStats → AppConfig 的 envSensorMap。
   * @param areaIdOrName 房间 ID 或名称（支持模糊匹配）
   * @returns 房间信息 + 设备列表 + 温湿度传感器；未找到房间返回 error
   */
  private async getAreaSnapshot(areaIdOrName: string): Promise<Record<string, unknown>> {
    let area = await this.areaService.findOne(areaIdOrName).catch(() => null);
    // 精确 / 模糊名称匹配兜底
    if (!area) {
      let areas: Awaited<ReturnType<typeof this.areaService.findAll>>;
      try {
        areas = await this.areaService.findAll();
      } catch (e: unknown) {
        return { error: `房间列表加载失败: ${getErrorMessage(e)}` };
      }
      const lower = areaIdOrName.toLowerCase().trim();
      area =
        areas.find(
          (a) =>
            String(a.name).toLowerCase() === lower ||
            String(a.name).toLowerCase().includes(lower),
        ) ?? null;
      if (area) {
        area = await this.areaService.findOne(area.id).catch(() => area);
      }
    }
    if (!area) return { error: `未找到房间「${areaIdOrName}」` };

    const devices = (area.entities ?? []).map((ae) => {
      const e = this.stateStore.getById(ae.entityId);
      return {
        entity_id: ae.entityId,
        name: e?.attributes?.friendly_name ?? ae.entityId,
        state: e?.state ?? 'unknown',
      };
    });

    // 1) 先读布局里的 mobileRoomStats 配置的温度 / 湿度传感器
    let temp: { entity_id: string; value: string } | null = null;
    let humidity: { entity_id: string; value: string } | null = null;
    try {
      const layout = await this.readLayout();
      const stats = (layout?.mobileRoomStats ?? {}) as Record<
        string,
        { temp?: string; humidity?: string }
      >;
      const roomStats = stats[area.id];
      if (roomStats?.temp) {
        const te = this.stateStore.getById(roomStats.temp);
        if (te) temp = { entity_id: roomStats.temp, value: te.state };
      }
      if (roomStats?.humidity) {
        const he = this.stateStore.getById(roomStats.humidity);
        if (he) humidity = { entity_id: roomStats.humidity, value: he.state };
      }
    } catch {
      /* 忽略 */
    }

    // 2) 缺失时回退到 AppConfig 的 envSensorMap（按 area_id / label / 房间名匹配）
    if (!temp || !humidity) {
      const fromEnv = this.resolveEnvSensors(area.id, area.name);
      if (!temp && fromEnv.temp) temp = fromEnv.temp;
      if (!humidity && fromEnv.humidity) humidity = fromEnv.humidity;
    }

    return {
      area: { id: area.id, name: area.name },
      devices,
      sensors: { temperature: temp, humidity },
    };
  }

  /**
   * 从 AppConfig 的 envSensorMap 解析房间的温湿度传感器。
   * 匹配顺序：area_id → label → key（房间名）。
   * @param areaId 房间 ID
   * @param areaName 房间名
   * @returns 温度 / 湿度传感器实体与读数，未找到对应字段为 null
   */
  private resolveEnvSensors(
    areaId: string,
    areaName: string,
  ): {
    temp: { entity_id: string; value: string } | null;
    humidity: { entity_id: string; value: string } | null;
  } {
    try {
      const map = this.appConfig.get('envSensorMap') || {};
      const lowerName = areaName.toLowerCase().trim();
      type EnvRow = {
        label?: string;
        temperature?: string;
        humidity?: string;
      };
      const entries = Object.entries(map) as Array<[string, EnvRow]>;
      const byId = map[areaId] as EnvRow | undefined;
      const byLabel = entries.find(([, row]) => {
        const label = String(row?.label || '')
          .toLowerCase()
          .trim();
        return label && (label === lowerName || lowerName.includes(label) || label.includes(lowerName));
      })?.[1];
      const byKey = entries.find(([k]) => k.toLowerCase() === lowerName)?.[1];
      const entry = byId || byLabel || byKey;
      if (!entry) return { temp: null, humidity: null };

      let temp: { entity_id: string; value: string } | null = null;
      let humidity: { entity_id: string; value: string } | null = null;
      if (entry.temperature) {
        const te = this.stateStore.getById(entry.temperature);
        if (te) temp = { entity_id: entry.temperature, value: te.state };
      }
      if (entry.humidity) {
        const he = this.stateStore.getById(entry.humidity);
        if (he) humidity = { entity_id: entry.humidity, value: he.state };
      }
      return { temp, humidity };
    } catch {
      return { temp: null, humidity: null };
    }
  }
  /**
   * 按房间批量控制设备。支持“全屋”语义（遍历所有房间），单房间按名称 / ID 匹配。
   * @param args 含 room（房间名或“全屋”）、domain（可选）、service、可选 service_data
   * @returns 控制结果：affected / total / 逐设备 results；全屋时聚合 rooms；未找到房间返回 error
   */
  private async controlRoom(
    args: Record<string, unknown>,
    actor?: AgentActor,
  ): Promise<Record<string, unknown>> {
    const roomQuery = String(args.room ?? '').trim();
    const domain = args.domain ? String(args.domain) : '';
    const service = String(args.service ?? '');
    const serviceData = (args.service_data as Record<string, unknown>) ?? undefined;

    if (!roomQuery || !service) {
      return { error: 'control_room 需要 room 和 service 参数' };
    }

    let areas: Awaited<ReturnType<typeof this.areaService.findAll>>;
    try {
      areas = await this.areaService.findAll();
    } catch (e: unknown) {
      return { error: `房间列表加载失败: ${getErrorMessage(e)}` };
    }
    if (
      /全屋|整屋|全家|所有房间|全部房间|整个家|全部区域|所有区域|whole house|whole home|all rooms|everywhere|entire house|entire home/i.test(
        roomQuery,
      )
    ) {
      const rooms: Array<{ room: string; affected: number; total: number }> = [];
      let affected = 0;
      let total = 0;
      for (const a of areas) {
        const r = await this.controlOneArea(a, domain, service, serviceData, actor);
        affected += Number(r.affected || 0);
        total += Number(r.total || 0);
        if (Number(r.total) > 0) {
          rooms.push({
            room: a.name,
            affected: Number(r.affected),
            total: Number(r.total),
          });
        }
      }
      return {
        scope: '全屋',
        domain: domain || 'all',
        service,
        affected,
        total,
        rooms,
      };
    }

    const lower = roomQuery.toLowerCase();
    const area =
      areas.find((a) => a.id === roomQuery) ??
      areas.find((a) => String(a.name).toLowerCase() === lower) ??
      areas.find(
        (a) =>
          String(a.name).toLowerCase().includes(lower) ||
          lower.includes(String(a.name).toLowerCase()),
      );

    if (!area) {
      return {
        error: `未找到房间「${roomQuery}」`,
        available_rooms: areas.map((a) => a.name),
      };
    }
    return this.controlOneArea(area, domain, service, serviceData, actor);
  }

  /**
   * 控制单个房间内的设备（按 domain 过滤），逐个下发并收集结果。
   * @param area 房间摘要
   * @param domain 设备域（为空则控制全部可控设备）
   * @param service 服务名
   * @param serviceData 附加参数
   * @returns affected（成功数）/ total（总数）/ 逐设备 results；高危设备被跳过并标记 blocked
   */
  private async controlOneArea(
    area: AgentAreaSummary,
    domain: string,
    service: string,
    serviceData?: Record<string, unknown>,
    actor?: AgentActor,
  ): Promise<Record<string, unknown>> {
    // 调用方 findAll 已带 entities 时直接用；缺失再补一次 findOne
    let entityIds = (area.entities ?? []).map((ae) => ae.entityId);
    if (!entityIds.length) {
      const full = await this.areaService.findOne(area.id).catch((err) => {
        this.logger.warn(`控制房间时加载区域失败 ${area.id}: ${getErrorMessage(err)}`);
        return null;
      });
      entityIds = (full?.entities ?? []).map((ae) => ae.entityId);
    }
    if (domain) {
      entityIds = entityIds.filter((id) => id.startsWith(`${domain}.`));
    } else {
      // 空 domain（“打开书房所有设备”）仅放行安全域，避免误触 switch / cover / 插座等潜在危险设备
      entityIds = entityIds.filter((id) => SAFE_BULK_CONTROL_DOMAINS.has(getEntityDomain(id)));
    }
    if (entityIds.length === 0) {
      return { room: area.name, affected: 0, total: 0, results: [] };
    }

    const results: Array<Record<string, unknown>> = [];
    const sceneVoice =
      domain === 'scene' || domain === 'script' ? await this.sceneVoiceGate() : undefined;
    for (const entity_id of entityIds) {
      const d = getEntityDomain(entity_id);
      const risk = isHighRisk(d, service, entity_id, serviceData, sceneVoice);
      if (risk.blocked) {
        this.logger.warn(`房间控制中跳过高危设备: ${entity_id} (${risk.reason})`);
        results.push({
          entity_id,
          ok: false,
          blocked: true,
          message: risk.reason,
        });
        continue;
      }
      const auth = await this.assertActorMayControl(actor, {
        domain: d,
        service,
        entity_id,
        service_data: serviceData,
      });
      if (!auth.ok) {
        results.push({ entity_id, ok: false, blocked: true, message: auth.message });
        continue;
      }
      try {
        const r = await this.commandProxy.callService({
          domain: d,
          service,
          entity_id,
          service_data: serviceData,
        });
        results.push({ entity_id, ok: !!(r as { success?: boolean })?.success });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : '失败';
        results.push({ entity_id, ok: false, message: msg });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    return {
      room: area.name,
      domain: domain || 'all',
      service,
      affected: okCount,
      total: entityIds.length,
      results,
    };
  }

  /**
   * 读取当前激活方案的布局配置并解析 layout 字段。
   * @returns layout 对象（含 favoriteEntities / mobileRoomStats 等）
   */
  private async readLayout(): Promise<Record<string, unknown>> {
    const cfg = await this.uiConfig.getConfig(this.uiConfig.resolveActiveProjectId());
    const { layout } = this.uiConfig.parseLayoutField(cfg.layout);
    return layout;
  }

  /**
   * 执行场景工具。支持按名称（模糊）或 ID 解析场景。
   * 需要有效执行身份；场景内的实体级 ACL 由 SceneService 自身校验。
   * @param nameOrId 场景名称或 ID
   * @param actor 执行身份
   * @returns 执行结果摘要
   */
  private async executeScene(
    nameOrId: string,
    actor?: AgentActor,
  ): Promise<Record<string, unknown>> {
    if (!nameOrId?.trim()) return { error: 'execute_scene 需要场景名称或 ID' };
    if (!actor?.role) {
      return {
        success: false,
        blocked: true,
        message: '未绑定执行身份，禁止通过智能管家执行场景。',
      };
    }
    const scene = await this.resolveSceneByNameOrId(nameOrId.trim());
    if (!scene) {
      return { error: `未找到场景「${nameOrId}」`, available_scenes: await this.listSceneNames() };
    }
    // 高危拦截：LLM/语音链路执行场景前扫描场景内容（yaml + entities），
    // 命中门锁/安防/警笛/燃气阀等受限域时拦截并要求手机 App 二次确认，
    // 与 high-risk-denylist「scene 内部动作无法静态审计，语音/LLM 一律拦截」的意图对齐
    try {
      const sceneDetail = await this.prisma.scene.findUnique({
        where: { id: scene.id },
        select: { yaml: true, entities: true },
      });
      const rawText = `${String(sceneDetail?.yaml ?? '')}\n${JSON.stringify(sceneDetail?.entities ?? {})}`;
      const risky = collectEntityIdsFromHaYaml(rawText).filter((id) => {
        const domain = getEntityDomain(id);
        return isChildRestrictedDomain(domain) || isHighRisk(domain, 'turn_on', id).blocked;
      });
      if (risky.length > 0) {
        return {
          success: false,
          blocked: true,
          message:
            '该场景包含高危动作（门锁/安防/警笛/燃气阀等），请通过手机 App 二次确认后执行。',
        };
      }
    } catch (err: unknown) {
      // fail-closed：扫描失败即拦截，绝不因解析错误而放行可能含高危动作的场景
      this.logger.error(`场景高危扫描失败，已拒绝执行: ${getErrorMessage(err)}`);
      return {
        success: false,
        blocked: true,
        message: '场景安全扫描失败，已拒绝执行，请稍后重试或通过手机 App 执行。',
      };
    }
    try {
      const result = await this.sceneService.execute(scene.id, actor);
      const executed = Array.isArray((result as { results?: unknown[] })?.results)
        ? (result as { results: Array<{ success?: boolean }> }).results
        : [];
      const okCount = executed.filter((r) => r.success).length;
      return {
        success: true,
        scene: { id: scene.id, name: scene.name },
        executed: okCount,
        total: executed.length,
      };
    } catch (e: unknown) {
      return { success: false, message: getErrorMessage(e) || '场景执行失败' };
    }
  }

  /**
   * 切换家庭模式工具。支持按名称（模糊）或 ID 解析模式。
   * @param nameOrId 模式名称或 ID
   * @param actor 执行身份
   * @returns 切换结果
   */
  private async activateHomeMode(
    nameOrId: string,
    actor?: AgentActor,
  ): Promise<Record<string, unknown>> {
    if (!nameOrId?.trim()) return { error: 'activate_home_mode 需要模式名称或 ID' };
    if (!actor?.role) {
      return {
        success: false,
        blocked: true,
        message: '未绑定执行身份，禁止通过智能管家切换家庭模式。',
      };
    }
    const mode = await this.resolveModeByNameOrId(nameOrId.trim());
    if (!mode) {
      return { error: `未找到家庭模式「${nameOrId}」`, available_modes: await this.listModeNames() };
    }
    try {
      await this.homeMode.activate(mode.id, {
        source: 'agent',
        reason: `智能管家指令: ${nameOrId.trim()}`,
        actor,
      });
      return { success: true, mode: { id: mode.id, name: mode.name } };
    } catch (e: unknown) {
      return { success: false, message: getErrorMessage(e) || '模式切换失败' };
    }
  }

  /** 按名称（精确/包含）或 ID 解析场景 */
  private async resolveSceneByNameOrId(
    nameOrId: string,
  ): Promise<{ id: string; name: string } | null> {
    const direct = await this.sceneService.findOne(nameOrId).catch(() => null);
    if (direct) return { id: String((direct as { id?: string }).id ?? ''), name: String((direct as { name?: string }).name ?? nameOrId) };
    const lower = nameOrId.toLowerCase();
    const rows = await this.prisma.scene.findMany({
      where: { name: { contains: nameOrId, mode: 'insensitive' } },
      select: { id: true, name: true },
      take: 5,
    });
    const hit =
      rows.find((r) => r.name.toLowerCase() === lower) ||
      rows.find((r) => r.name.toLowerCase().includes(lower));
    if (hit) return { id: hit.id, name: hit.name };
    return null;
  }

  /** 按名称（精确/包含）或 ID 解析家庭模式 */
  private async resolveModeByNameOrId(
    nameOrId: string,
  ): Promise<{ id: string; name: string } | null> {
    const direct = await this.homeMode.findOne(nameOrId).catch(() => null);
    if (direct) return { id: String((direct as { id?: string }).id ?? ''), name: String((direct as { name?: string }).name ?? nameOrId) };
    const lower = nameOrId.toLowerCase();
    const rows = await this.prisma.homeMode.findMany({
      where: { name: { contains: nameOrId, mode: 'insensitive' } },
      select: { id: true, name: true },
      take: 5,
    });
    const hit =
      rows.find((r) => r.name.toLowerCase() === lower) ||
      rows.find((r) => r.name.toLowerCase().includes(lower));
    if (hit) return { id: hit.id, name: hit.name };
    return null;
  }

  private async listSceneNames(): Promise<string[]> {
    const rows = await this.prisma.scene.findMany({
      select: { name: true },
      take: 20,
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => r.name);
  }

  /**
   * list_scenes 工具实现：在原有 HomeOS 场景名之外，附带 HA 侧 scene.* / script.* 清单。
   *
   * 保持向后兼容：`scenes` 字段语义与结构不变（仍是 HomeOS 场景名数组），
   * 新增 `ha_scenes` 供 LLM 判断哪些场景可经 activate_scene 执行（allowed 标记）。
   * @returns { scenes, ha_scenes }
   */
  private async listScenesDetailed(): Promise<Record<string, unknown>> {
    const scenes = await this.listSceneNames();
    const gate = await this.sceneVoiceGate();
    const haScenes = this.stateStore
      .getAll()
      .filter((e) => e.entity_id.startsWith('scene.') || e.entity_id.startsWith('script.'))
      .map((e) => {
        const type = e.entity_id.startsWith('script.') ? 'script' : 'scene';
        return {
          entity_id: e.entity_id,
          name: String(e.attributes?.friendly_name ?? e.entity_id),
          type,
          allowed: isSceneVoiceAllowed(type, e.entity_id, gate),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return { scenes, ha_scenes: haScenes };
  }

  /**
   * activate_scene 工具实现：触发 HA 的 scene.* / script.*。
   *
   * 安全闸门（fail-closed）：配置未启用或实体不在允许清单内时直接返回拦截结果，
   * 不落到 HA，也不降级为控制设备，避免绕过用户在设置中的显式授权。
   *
   * 解析顺序对齐上游：显式 entity_id 精确匹配 → friendly_name / entity_id 精确 →
   * 剥离「场景 / 模式 / 脚本 / 执行 / 开启 / 打开 / 激活 / 启动 / 运行」后的关键词包含 → 原始包含。
   * @param args 含 scene（名称或关键词）与可选 entity_id
   * @param actor 执行身份（缺失时拒绝）
   * @returns 执行结果；未命中返回 available_scenes 候选
   */
  private async activateScene(
    args: Record<string, unknown>,
    actor?: AgentActor,
  ): Promise<Record<string, unknown>> {
    const query = String(args.scene ?? '').trim();
    const explicitId = String(args.entity_id ?? '').trim();
    if (!query && !explicitId) {
      return { success: false, error: 'activate_scene 需要 scene（名称）或 entity_id 参数' };
    }
    if (!actor?.role) {
      return {
        success: false,
        blocked: true,
        message: '未绑定执行身份，禁止通过智能管家执行场景。请在通道配置中绑定 HomeOS 用户。',
      };
    }

    const candidates = this.stateStore
      .getAll()
      .filter((e) => e.entity_id.startsWith('scene.') || e.entity_id.startsWith('script.'));

    const hit = this.matchSceneEntity(candidates, query, explicitId);
    if (!hit) {
      return {
        success: false,
        error: `未找到场景「${query || explicitId}」`,
        available_scenes: candidates
          .slice(0, 10)
          .map((e) => String(e.attributes?.friendly_name ?? e.entity_id)),
      };
    }

    const domain = getEntityDomain(hit.entity_id) || 'scene';
    const gate = await this.sceneVoiceGate();
    if (!isSceneVoiceAllowed(domain, hit.entity_id, gate)) {
      this.logger.warn(`场景未在允许清单中,已拦截: ${hit.entity_id}`);
      return {
        success: false,
        blocked: true,
        entity_id: hit.entity_id,
        message:
          '该场景未在「场景语音控制」允许清单中，出于安全考虑不能通过语音执行。请到「设置 → 智能管家 → 场景语音」中启用并勾选该场景。',
      };
    }

    const auth = await this.assertActorMayControl(actor, {
      domain,
      service: 'turn_on',
      entity_id: hit.entity_id,
    });
    if (!auth.ok) {
      this.logger.warn(`Agent ACL 拒绝: activate_scene ${hit.entity_id} (${auth.message})`);
      return { success: false, blocked: true, message: auth.message };
    }

    try {
      const result = await this.commandProxy.callService({
        domain,
        service: 'turn_on',
        entity_id: hit.entity_id,
      });
      return {
        success: true,
        entity_id: hit.entity_id,
        name: String(hit.attributes?.friendly_name ?? hit.entity_id),
        type: domain,
        result: result as Record<string, unknown>,
      };
    } catch (e: unknown) {
      return { success: false, message: getErrorMessage(e) || '场景执行失败' };
    }
  }

  /**
   * 在候选场景 / 脚本实体中解析用户意图，逐级放宽匹配条件。
   * @param candidates scene.* / script.* 实体列表
   * @param query 用户 / LLM 给出的名称或关键词
   * @param explicitId 显式 entity_id（最高优先级）
   * @returns 命中的实体；未命中返回 null
   */
  private matchSceneEntity(
    candidates: HaEntity[],
    query: string,
    explicitId: string,
  ): HaEntity | null {
    if (explicitId) {
      const exact = candidates.find(
        (e) => e.entity_id.toLowerCase() === explicitId.toLowerCase(),
      );
      if (exact) return exact;
    }
    if (!query) return null;
    const lower = query.toLowerCase();
    const nameOf = (e: HaEntity) =>
      String(e.attributes?.friendly_name ?? e.entity_id).toLowerCase();
    // 1) 实体 ID / friendly_name 精确匹配
    const exact =
      candidates.find((e) => e.entity_id.toLowerCase() === lower) ??
      candidates.find((e) => nameOf(e) === lower);
    if (exact) return exact;
    // 2) 剥离动作词与「场景 / 模式 / 脚本」后缀得到词干，再做包含匹配
    const stem = lower
      .replace(/^(执行|激活|启动|运行|开启|打开|触发|触发一下|run|activate|start|execute|turn on)\s*/g, '')
      .replace(/(场景|模式|脚本|scene|script|mode)\s*$/g, '')
      .trim();
    if (stem) {
      const byStem =
        candidates.find((e) => nameOf(e).endsWith(stem)) ??
        candidates.find((e) => nameOf(e).includes(stem));
      if (byStem) return byStem;
    }
    // 3) 原始关键词包含匹配
    return candidates.find((e) => nameOf(e).includes(lower)) ?? null;
  }

  private async listModeNames(): Promise<string[]> {
    const rows = await this.prisma.homeMode.findMany({
      select: { name: true },
      take: 20,
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((r) => r.name);
  }

  /** 查询本月用电与预算状态 */
  private async queryEnergy(): Promise<Record<string, unknown>> {
    try {
      const s = await this.energyBudget.getStatus();
      return {
        meter_bound: s.meterBound,
        month_usage_kwh: s.monthUsage,
        month_cost: s.monthCost,
        budget: s.budget,
        kwh_used_pct: s.kwhUsedPct,
        cost_used_pct: s.costUsedPct,
        projected_over_budget: s.projectedOverBudget,
        warnings: s.warnings,
        forecast: s.forecast,
      };
    } catch (e: unknown) {
      return { error: `能耗查询失败: ${getErrorMessage(e)}` };
    }
  }

  /** 全屋整体状态概览 */
  private async getHomeStatus(): Promise<Record<string, unknown>> {
    try {
      const active = await this.homeMode.getActive().catch((err) => {
        this.logger.warn(`状态概览读取家庭模式失败: ${getErrorMessage(err)}`);
        return null;
      });
      const [automationCount, sceneCount] = await Promise.all([
        this.prisma.automation.count({ where: { enabled: true } }),
        this.prisma.scene.count(),
      ]);
      const energy = await this.energyBudget.getStatus().catch((err) => {
        this.logger.warn(`状态概览读取能耗预算失败: ${getErrorMessage(err)}`);
        return null;
      });
      return {
        active_mode: active ? { id: active.id, name: active.name } : null,
        enabled_automations: automationCount,
        scenes: sceneCount,
        energy: energy
          ? {
              meter_bound: energy.meterBound,
              month_usage_kwh: energy.monthUsage,
              kwh_used_pct: energy.kwhUsedPct,
              projected_over_budget: energy.projectedOverBudget,
              warnings: energy.warnings,
            }
          : null,
      };
    } catch (e: unknown) {
      return { error: `状态概览获取失败: ${getErrorMessage(e)}` };
    }
  }

  /**
   * 查询室外当前天气：优先读取 HA weather 实体（circadian.weatherEntityId 配置），
   * 未配置时回退 OpenWeather 外部数据源。
   */
  private getWeather(): Promise<Record<string, unknown>> {
    const haId = String(this.appConfig.get('circadian').weatherEntityId || '').trim();
    if (haId) {
      const e = this.stateStore.getById(haId);
      if (e) {
        const attrs = e.attributes ?? {};
        return Promise.resolve({
          source: 'ha',
          condition: String(e.state ?? ''),
          temperature:
            typeof attrs.temperature === 'number'
              ? (attrs.temperature as number)
              : typeof attrs.temperature === 'string'
                ? parseFloat(attrs.temperature)
                : null,
          humidity:
            typeof attrs.humidity === 'number'
              ? (attrs.humidity as number)
              : typeof attrs.humidity === 'string'
                ? parseFloat(attrs.humidity)
                : null,
        });
      }
    }
    return this.externalApi.getCurrentWeather();
  }

  /** 查询日历外出安排（来自外部日历源，含 HA 天气实体优先 / 外部数据回退） */
  private getCalendar(): Record<string, unknown> {
    try {
      return this.externalApi.getCalendarSummary();
    } catch (e: unknown) {
      return { error: `日历查询失败: ${getErrorMessage(e)}` };
    }
  }

  private async setLightBrightness(
    args: Record<string, unknown>,
    actor?: AgentActor,
  ): Promise<Record<string, unknown>> {
    const entity_id = String(args.entity_id ?? '');
    const brightness = Number(args.brightness);
    if (!entity_id.startsWith('light.')) return { error: 'entity_id 须为 light.*' };
    if (!Number.isFinite(brightness) || brightness < 0 || brightness > 100) {
      return { error: 'brightness 须为 0-100' };
    }
    return this.controlDevice(
      {
        domain: 'light',
        service: 'turn_on',
        entity_id,
        service_data: { brightness_pct: Math.round(brightness) },
      },
      actor,
    );
  }

  private async setCoverPosition(
    args: Record<string, unknown>,
    actor?: AgentActor,
  ): Promise<Record<string, unknown>> {
    const entity_id = String(args.entity_id ?? '');
    const position = Number(args.position);
    if (!entity_id.startsWith('cover.')) return { error: 'entity_id 须为 cover.*' };
    if (!Number.isFinite(position) || position < 0 || position > 100) {
      return { error: 'position 须为 0-100' };
    }
    return this.controlDevice(
      {
        domain: 'cover',
        service: 'set_cover_position',
        entity_id,
        service_data: { position: Math.round(position) },
      },
      actor,
    );
  }

  private async mediaControl(
    args: Record<string, unknown>,
    actor?: AgentActor,
  ): Promise<Record<string, unknown>> {
    const entity_id = String(args.entity_id ?? '');
    const action = String(args.action ?? '').toLowerCase();
    if (!entity_id.startsWith('media_player.')) return { error: 'entity_id 须为 media_player.*' };
    const map: Record<string, string> = {
      play: 'media_play',
      pause: 'media_pause',
      stop: 'media_stop',
      next: 'media_next_track',
      previous: 'media_previous_track',
      volume: 'volume_set',
    };
    const service = map[action];
    if (!service) return { error: 'action 须为 play/pause/stop/next/previous/volume' };
    const service_data =
      action === 'volume'
        ? { volume_level: Math.max(0, Math.min(1, Number(args.volume) || 0)) }
        : undefined;
    return this.controlDevice({ domain: 'media_player', service, entity_id, service_data }, actor);
  }

  private queryCamera(entityId: string): Record<string, unknown> {
    if (!entityId.startsWith('camera.')) return { error: 'entity_id 须为 camera.*' };
    return this.getEntityState(entityId);
  }

  private async explainAutomation(query: string): Promise<Record<string, unknown>> {
    try {
      const rows = await this.prisma.automation.findMany({
        select: { id: true, name: true, enabled: true, runOnHa: true, yaml: true },
        take: 30,
        orderBy: { name: 'asc' },
      });
      const q = query.trim().toLowerCase();
      const matched = q
        ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.yaml.toLowerCase().includes(q))
        : rows;
      const automations = matched.map((r) => {
        const summary = summarizeAutomationYaml(r.yaml);
        const explanation = formatAutomationExplanation(summary);
        return {
          name: r.name,
          enabled: r.enabled,
          run_on_ha: r.runOnHa,
          hint: r.enabled ? '已启用' : '已停用',
          explanation: explanation || undefined,
          triggers: summary.triggers,
          actions: summary.actions,
          yaml: r.yaml,
          summary,
        };
      });
      const one = automations.length === 1 ? automations[0] : null;
      return {
        count: automations.length,
        automations: automations.map(({ yaml: _y, summary: _s, ...rest }) => rest),
        ...(one
          ? {
              yaml_excerpt: excerptAutomationYaml(one.yaml),
              conditions: one.summary.conditions,
              description: one.summary.description,
              mode: one.summary.mode,
            }
          : {}),
        note: '创建或修改自动化请在设置「联动」中人工确认。',
      };
    } catch (e: unknown) {
      return { error: `自动化查询失败: ${getErrorMessage(e)}` };
    }
  }
}