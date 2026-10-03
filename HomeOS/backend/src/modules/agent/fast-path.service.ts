/**
 * 快路径解析服务（免 LLM 直接控制）。
 *
 * 所属模块：backend/modules/agent
 * 职责：用规则正则把"打开客厅灯""把空调调到 24 度"这类高频、确定性强的指令，
 *  在不调用 LLM 的情况下直接解析成 control_device / control_room 工具调用，降低延迟与成本；
 *  白名单内的 HA scene.* / script.* 走 activate_scene 快路径。
 *  监听 SYSTEM_CONFIG_UPDATED / HA_ENTITY_REGISTRY_UPDATED 事件清空房间缓存，保证名称变更后及时刷新。
 * 依赖：AgentAreaService（房间/设备查询）、StateStoreService（实体状态）、LangTemplateService（语言模板）、
 *  AgentConfigService（场景语音控制允许清单）、EventEmitter2（事件）。
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AgentAreaService } from './area.service';
import { StateStoreService } from '../state-store/service';
import { LangTemplateService } from './lang-template.service';
import { AgentConfigService } from './config.service';
import { isSceneVoiceAllowed } from './tools/high-risk-denylist';
import type { HaEntity } from '@homeos/shared';
import { getEntityDomain } from '@homeos/shared';
import { HOMEOS_EVENTS } from '../../shared/homeos-events';
import { HA_ENTITY_REGISTRY_UPDATED } from '../../shared/ha/entity-area-enrich.util';
import type { LangTemplate } from './lang-templates';

/**
 * 快路径解析结果。
 * - kind=device：命中单个设备，用 control_device 直接控制
 * - kind=room：命中整房间，用 control_room 批量控制
 * - kind=scene：命中 HA 场景 / 脚本，用 activate_scene 触发（已通过允许清单过滤）
 */
type FastPathResult =
  | {
      kind: 'device';
      service: string;
      entityId: string;
      serviceData?: Record<string, unknown>;
    }
  | {
      kind: 'room';
      service: string;
      roomName: string;
      domain: string;
    }
  | {
      kind: 'scene';
      entityId: string;
      sceneName: string;
      domain: string;
    };

/** 场景 / 脚本快路径意图判定：整句为「晚安」等纯口令 */
const SCENE_WHOLE_PHRASES = /^(晚安|我睡了|出门了|我出门了)$/;
/** 场景 / 脚本快路径意图判定：出现「模式 / 场景 / 脚本」字样 */
const SCENE_INTENT_WORDS = /(模式|场景|脚本)/;
/** 场景 / 脚本快路径意图判定：以执行类动词开头 */
const SCENE_INTENT_VERBS = /^(执行|激活|启动|运行|触发)/;
/** 场景 / 脚本快路径意图判定：动作词 + 常见场景口令词 */
const SCENE_INTENT_PHRASES =
  /^(开启|打开|关闭|关掉|进入)(回家|离家|观影|睡眠|起床|会客|就餐|就寝|离开|晚安|上班|度假)/;
/** 词干提取：剥离句首动作词 */
const SCENE_ACTION_PREFIX =
  /^(执行|激活|启动|运行|触发|开启|打开|关闭|关掉|进入|run|activate|start|execute|turn on)\s*/;
/** 词干提取：剥离句尾「场景 / 模式 / 脚本」等类别后缀 */
const SCENE_CATEGORY_SUFFIX = /(场景|模式|脚本|scene|script|mode)\s*$/;

/**
 * 判断是否具备场景 / 脚本快路径的意图特征。
 * 仅在命中时才去扫描实体表，避免每条指令都做无谓开销。
 */
function looksLikeSceneIntent(text: string): boolean {
  return (
    SCENE_WHOLE_PHRASES.test(text) ||
    SCENE_INTENT_WORDS.test(text) ||
    SCENE_INTENT_VERBS.test(text) ||
    SCENE_INTENT_PHRASES.test(text)
  );
}

/**
 * 快路径服务（@Injectable）。
 * 实现 OnModuleInit，订阅配置 / 实体注册表变更事件以清空房间缓存。
 */
@Injectable()
export class FastPathService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('FastPath');
  /** 房间列表缓存，事件触发后清空以便下次重新拉取 */
  private areaCache: Array<{ id: string; name: string }> = [];

  /** 稳定引用：配置/区域/实体注册表变更时清空房间缓存 */
  private readonly clearAreaCache = () => {
    this.areaCache = [];
  };

  constructor(
    private readonly areaService: AgentAreaService,
    private readonly stateStore: StateStoreService,
    private readonly langTemplates: LangTemplateService,
    private readonly eventEmitter: EventEmitter2,
    private readonly agentConfig: AgentConfigService,
  ) {}

  /** 模块初始化：订阅配置 / 实体注册表更新事件，清空房间缓存 */
  onModuleInit(): void {
    this.eventEmitter.on(HOMEOS_EVENTS.SYSTEM_CONFIG_UPDATED, this.clearAreaCache);
    this.eventEmitter.on(HOMEOS_EVENTS.AREA_UPDATED, this.clearAreaCache);
    this.eventEmitter.on(HA_ENTITY_REGISTRY_UPDATED, this.clearAreaCache);
  }

  onModuleDestroy(): void {
    this.eventEmitter.off(HOMEOS_EVENTS.SYSTEM_CONFIG_UPDATED, this.clearAreaCache);
    this.eventEmitter.off(HOMEOS_EVENTS.AREA_UPDATED, this.clearAreaCache);
    this.eventEmitter.off(HA_ENTITY_REGISTRY_UPDATED, this.clearAreaCache);
  }

  /** 当前语言模板（正则、关键词等） */
  private get L(): LangTemplate {
    return this.langTemplates.current;
  }

  /**
   * 尝试用规则解析用户文本为工具调用。
   * 解析顺序：场景 / 脚本（白名单内）→ 设温度（空调）→ 开/关动作 → 房间 / 全屋 / 全局设备匹配。
   * @param text 用户原话
   * @returns 解析结果，无法确定时返回 null（交由 LLM 兜底）
   */
  async tryParse(text: string): Promise<FastPathResult | null> {
    let t = text.trim();
    // 过短 / 过长的文本不进快路径，避免误匹配
    if (!t || t.length < 2 || t.length > 80) return null;
    // 去掉"帮我 / 请 / 麻烦"等礼貌前缀
    t = t.replace(this.L.politePrefix, '').trim();
    if (!t || t.length < 2) return null;

    // 0) 场景 / 脚本：白名单内的 HA scene.* / script.* 直接触发（约 300ms，二次命中走缓存约 6ms）
    const sceneHit = await this.matchSceneFastPath(t);
    if (sceneHit) return sceneHit;

    // 1) 设温度：提取"调到 24 度"中的数值与前置房间 / 设备描述
    const tempMatch = t.match(this.L.setTemperature);
    if (tempMatch) {
      const before = t
        .substring(0, t.indexOf(tempMatch[0]))
        .replace(this.L.stripPattern, '')
        .trim();
      const tempVal = parseInt(tempMatch[2], 10);
      if (before.length >= 2 && tempVal >= 10 && tempVal <= 35) {
        // 仅在描述命中 climate（空调）关键词时才走设温度
        const acDk = this.L.domainKeywords.find(
          (c) => c.keywords.some((kw) => before.includes(kw)) && c.domain === 'climate',
        );
        if (acDk) {
          const areas = await this.getAreas();
          const room = this.resolveRoom(before, areas);
          if (room) {
            // 取房间内第一个 climate 设备作为控制对象
            const acs = await this.getRoomDevices(room.id, 'climate');
            if (acs.length > 1) {
              this.logger.log(`快路径跳过(多空调消歧): "${text}" → ${acs.length} 台`);
              return null;
            }
            const acEntity = acs[0]?.entityId;
            if (acEntity) {
              this.logger.log(`快路径命中(set_temp): "${text}" → ${acEntity}  ${tempVal}°C`);
              return {
                kind: 'device',
                service: 'set_temperature',
                entityId: acEntity,
                serviceData: { temperature: tempVal },
              };
            }
          }
        }
      }
    }
    // 2) 开 / 关动作判定：优先匹配动作后缀（"灯打开"），再匹配前缀（"打开灯"）
    let isOn: boolean;
    let rest: string;
    const onEnd = t.match(this.L.turnOnEnd);
    const offEnd = t.match(this.L.turnOffEnd);
    if (onEnd) {
      isOn = true;
      rest = t.substring(0, t.lastIndexOf(onEnd[0])).trim();
    } else if (offEnd) {
      isOn = false;
      rest = t.substring(0, t.lastIndexOf(offEnd[0])).trim();
    } else if (this.L.turnOnStart.test(t)) {
      isOn = true;
      rest = t.replace(this.L.turnOnStart, '');
    } else if (this.L.turnOffStart.test(t)) {
      isOn = false;
      rest = t.replace(this.L.turnOffStart, '');
    } else {
      return null;
    }

    // 去掉"把"字宾语标记
    if (this.L.objectMarker && rest.startsWith(this.L.objectMarker)) {
      rest = rest.substring(this.L.objectMarker.length).trim();
    }

    const explicitAll = this.L.allKeywords.test(rest);
    // 复合指令（含"和/然后"等连词）或第二动作交给 LLM，避免误判
    if (this.L.conjunctions.test(rest)) return null;
    if (this.L.secondAction.test(rest)) return null;

    // 3) 按关键词匹配设备域；多域命中（"灯和空调"这种）交给 LLM
    const hitDomains = this.L.domainKeywords.filter((c) =>
      c.keywords.some((kw) => rest.includes(kw)),
    );
    const distinct = new Set(hitDomains.map((c) => c.domain));
    if (distinct.size === 0) return null;
    if (distinct.size > 1) return null;

    const dk = hitDomains[0];
    const service = isOn ? dk.serviceOn : dk.serviceOff;
    const target = rest.replace(this.L.stripPattern, '').trim();

    // 4a) 显式"所有"且无具体目标 → 全屋控制
    if (explicitAll && target.length === 0) {
      this.logger.log(`快路径命中(全屋): "${text}" → 全屋/${dk.domain}/${service}`);
      return { kind: 'room', service, roomName: '全屋', domain: dk.domain };
    }

    if (target.length < 1) return null;

    const areas = await this.getAreas();
    const room = this.resolveRoom(target, areas);
    // 4b) 房间匹配失败：尝试"全屋"兜底或全局精确设备名
    if (!room) {
      if (explicitAll || this.L.wholeHome.test(rest)) {
        this.logger.log(`快路径命中(全屋fallback): "${text}" → 全屋/${dk.domain}/${service}`);
        return { kind: 'room', service, roomName: '全屋', domain: dk.domain };
      }
      if (target.length >= 3) {
        const globalExact = await this.findDeviceGlobally(target, dk.domain);
        if (globalExact) {
          this.logger.log(`快路径命中(全局设备): "${text}" → ${globalExact}/${service}`);
          return { kind: 'device', service, entityId: globalExact };
        }
      }
      return null;
    }

    // 5) 房间内查找该域设备；非"所有"时优先精确匹配设备名
    const devices = await this.getRoomDevices(room.id, dk.domain);
    if (devices.length === 0) return null;

    if (!explicitAll) {
      const exactHits = devices.filter((d) => d.name && d.name === target);
      if (exactHits.length === 1) {
        this.logger.log(`快路径命中(精确设备): "${text}" → ${exactHits[0].name}/${service}`);
        return { kind: 'device', service, entityId: exactHits[0].entityId };
      }
      if (exactHits.length > 1) return null;
    }

    // 6) 兜底：整房间该域设备批量控制
    this.logger.log(`快路径命中(整房间): "${text}" → ${room.name}/${dk.domain}/${service}`);
    return { kind: 'room', service, roomName: room.name, domain: dk.domain };
  }
  /**
   * 场景 / 脚本快路径：把「执行回家模式」「运行晚安脚本」「打开观影模式」这类指令
   * 直接解析为 activate_scene 调用，绕开 LLM。
   *
   * 安全约束（fail-closed）：候选实体必须同时满足
   *  - 在「设置 → 智能管家 → 场景语音」中启用了总开关；
   *  - 实体 ID 在允许清单内。
   * 任一不满足即返回 null，交由 LLM 走拦截路径（不会静默放行）。
   * @param text 已去除礼貌前缀的用户原话
   * @returns kind='scene' 的解析结果，或 null
   */
  private async matchSceneFastPath(text: string): Promise<FastPathResult | null> {
    if (!looksLikeSceneIntent(text)) return null;
    const candidates = this.stateStore
      .getAll()
      .filter((e) => e.entity_id.startsWith('scene.') || e.entity_id.startsWith('script.'));
    if (candidates.length === 0) return null;

    const cfg = await this.agentConfig.getSceneVoiceControl().catch(() => null);
    if (!cfg?.enabled || cfg.allow.length === 0) return null;
    const gate = {
      enabled: true,
      allow: new Set(cfg.allow.map((id) => id.trim().toLowerCase()).filter(Boolean)),
    };

    const allowed = candidates.filter((e) => {
      const domain = getEntityDomain(e.entity_id);
      return isSceneVoiceAllowed(domain, e.entity_id, gate);
    });
    if (allowed.length === 0) return null;

    const hit = this.matchSceneByText(allowed, text);
    if (!hit) return null;
    const domain = getEntityDomain(hit.entity_id) || 'scene';
    if (!isSceneVoiceAllowed(domain, hit.entity_id, gate)) return null;
    this.logger.log(`快路径命中(场景): "${text}" → ${hit.entity_id}`);
    return {
      kind: 'scene',
      entityId: hit.entity_id,
      sceneName: String(hit.attributes?.friendly_name ?? hit.entity_id),
      domain,
    };
  }

  /**
   * 在允许清单内的场景 / 脚本中按名称匹配用户意图。
   * 逐级放宽：整句精确 → 词干精确 → friendly_name 后缀 → friendly_name 包含。
   * @param allowed 已通过白名单过滤的候选实体
   * @param text 用户原话
   * @returns 命中的实体，或 null
   */
  private matchSceneByText(
    allowed: HaEntity[],
    text: string,
  ): HaEntity | null {
    const lower = text.toLowerCase();
    const nameOf = (e: HaEntity) =>
      String(e.attributes?.friendly_name ?? e.entity_id).toLowerCase();
    // 1) 整句即场景名（如「晚安」）
    const whole = allowed.find((e) => nameOf(e) === lower);
    if (whole) return whole;

    // 2) 剥离动作词与类别后缀得到词干
    const stem = lower.replace(SCENE_ACTION_PREFIX, '').replace(SCENE_CATEGORY_SUFFIX, '').trim();
    if (stem.length < 2) return null;
    return (
      allowed.find((e) => nameOf(e) === stem) ??
      allowed.find((e) => e.entity_id.toLowerCase() === stem) ??
      allowed.find((e) => nameOf(e).endsWith(stem)) ??
      allowed.find((e) => stem.endsWith(nameOf(e)) && nameOf(e).length >= 2) ??
      allowed.find((e) => nameOf(e).includes(stem)) ??
      null
    );
  }

  /**
   * 获取房间列表（带缓存）。缓存为空时从 AgentAreaService 拉取并映射为 {id,name}。
   * @returns 房间数组（查询失败时返回空数组）
   */
  private async getAreas(): Promise<Array<{ id: string; name: string }>> {
    if (this.areaCache.length === 0) {
      const areas = (await this.getAreasWithEntities()) ?? [];
      this.areaCache = areas.map((a) => ({
        id: a.id,
        name: String(a.name ?? ''),
      }));
    }
    return this.areaCache;
  }

  /** 带实体的房间缓存，避免 findDeviceGlobally / getRoomDevices 逐房 findOne */
  private areaEntitiesCache: Array<{
    id: string;
    name: string;
    entities?: Array<{ entityId: string }>;
  }> | null = null;

  private async getAreasWithEntities() {
    if (!this.areaEntitiesCache) {
      this.areaEntitiesCache = (await this.areaService.findAll().catch(() => [])) ?? [];
    }
    return this.areaEntitiesCache;
  }

  /**
   * 在房间列表中匹配目标房间。按名称长度倒序，优先匹配长名（避免"卧"误匹配"卧室"）。
   * @param target 用户文本中的房间描述
   * @param areas 房间列表
   * @returns 匹配到的房间，或 null
   */
  private resolveRoom(
    target: string,
    areas: Array<{ id: string; name: string }>,
  ): { id: string; name: string } | null {
    const t = target.toLowerCase();
    const sorted = [...areas].sort((a, b) => b.name.length - a.name.length);
    return (
      sorted.find((a) => a.name.toLowerCase() === t || t.includes(a.name.toLowerCase())) ?? null
    );
  }

  /**
   * 获取某房间内指定域的设备列表（含 friendly_name）。
   * @param roomId 房间 ID
   * @param domain 设备域，如 light / climate
   * @returns 设备数组（entityId + name）
   */
  private async getRoomDevices(
    roomId: string,
    domain: string,
  ): Promise<Array<{ entityId: string; name: string }>> {
    const areas = await this.getAreasWithEntities();
    const full = areas.find((a) => a.id === roomId) ?? null;
    const ids = (full?.entities ?? [])
      .map((ae) => ae.entityId)
      .filter((id) => id.startsWith(`${domain}.`));
    return ids.map((entityId) => {
      const e = this.stateStore.getById(entityId);
      return { entityId, name: String(e?.attributes?.friendly_name ?? '') };
    });
  }

  /**
   * 在所有房间中按名称查找某域的设备（精确 → 包含匹配）。
   * 用于用户直接说出设备名、未指明房间的场景。
   * @param name 设备名
   * @param domain 设备域
   * @returns 实体 ID 或 null
   */
  private async findDeviceGlobally(name: string, domain: string): Promise<string | null> {
    const areas = await this.getAreasWithEntities();
    const exact: string[] = [];
    const fuzzy: string[] = [];
    for (const a of areas) {
      const devices = await this.getRoomDevices(a.id, domain);
      for (const d of devices) {
        if (d.name === name) exact.push(d.entityId);
        else if (d.name && (d.name.includes(name) || name.includes(d.name))) fuzzy.push(d.entityId);
      }
    }
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) return null;
    if (fuzzy.length === 1) return fuzzy[0];
    return null;
  }
}