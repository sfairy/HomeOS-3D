/**
 * HA 同步内部实现（合并自 discover / blueprint-discover / template-discover / yaml-helper 四类 helper）。
 *
 * 所属模块：ha-sync
 * 职责：
 * - 通过 HA WebSocket / Config API 发现场景、自动化、脚本、模板实体并转换为本地可用的导入结构。
 * - 扫描 HA 配置目录下的自动化 Blueprint 清单，将 !input 占位符替换为推断实体后输出可编辑草案。
 * - 提供 YAML 校验三套路径：本地结构校验（fast fail）→ 包装后 HA check_config（最终一致）→ 失败降级。
 *
 * 关键依赖：HaConnectorService（HA 交互）、HaRestClientService（REST 校验）、
 * config.util（YAML 转换与本地校验）、path.util（安全路径解析）、map-with-concurrency（并发控制）。
 */
import * as fs from 'fs/promises';
import { API_ERROR } from '../../common/errors/api-error-messages';
import { badRequest, rethrowIfHttpException } from '../../common/utils/business-exception';
import { automationHaConfigToYaml as haConfigToYaml, haSceneMapToEntities, scriptHaConfigToYaml, validateAutomationYamlLocal, validateScriptYamlLocal, validateTemplateYamlLocal, wrapAutomationForHaCheck, wrapScriptForHaCheck, wrapTemplateForHaCheck } from '../../shared/orchestrator/config.util';
import { resolveConfigPath } from '../../common/http-security/path.util';
import type { HaEntity } from '../../shared/types';
import { getErrorMessage } from '../../common/utils';
import { mapWithConcurrency } from '../../common/utils/map-with-concurrency.util';
import type { HaConnectorService } from '../ha-connector/service';
import type { HaEntityRegistryEntry, HaRestClientService } from '../ha-connector/ha-rest-client.service';
import type { HaAutomationImport, HaSceneImport, HaScriptImport } from './service';
import { loadHaYamlObject } from '@homeos/shared';
import { Logger, ServiceUnavailableException } from '@nestjs/common';

// ── ha-sync-discover.helper ──
/** HA 实体发现过程的依赖集合，由 HaSyncService 组装后注入本模块的发现函数。 */
export interface HaSyncDiscoverDeps {
  logger: Logger;
  haConnector: HaConnectorService;
  importConfigConcurrency: number;
}

/**
 * HA Config API 单飞缓存类型。
 * 同一组件+id 的并发请求复用同一 Promise，避免在多实体并发发现时重复打 HA。
 */
type HaConfigCache = {
  fetch: (
    component: 'automation' | 'script' | 'scene',
    id: string,
  ) => Promise<Record<string, unknown> | null>;
};

/**
 * 创建 HA Config API 单飞缓存。
 * 场景/自动化/脚本发现阶段会并发读取大量实体配置，本缓存将同 id 的请求合并为单个 Promise。
 * @param haConnector - HA 连接器，按组件类型分发到 fetchAutomationConfig / fetchScriptConfig / fetchSceneConfig
 */
function createHaConfigCache(haConnector: HaConnectorService): HaConfigCache {
  const cache = new Map<string, Promise<Record<string, unknown> | null>>();
  const fetch = (
    component: 'automation' | 'script' | 'scene',
    id: string,
  ): Promise<Record<string, unknown> | null> => {
    const key = `${component}:${id}`;
    let pending = cache.get(key);
    if (!pending) {
      const loader =
        component === 'automation'
          ? haConnector.fetchAutomationConfig(id)
          : component === 'script'
            ? haConnector.fetchScriptConfig(id)
            : haConnector.fetchSceneConfig(id);
      pending = loader;
      cache.set(key, pending);
    }
    return pending;
  };
  return { fetch };
}

/**
 * 解析场景实体的 Config API id。
 * 优先用 attributes.id，其次尝试 entity_id 去除 scene. 前缀后的 slug。
 * 通过缓存探测：若 primaryId 在 Config API 不存在而 slug 存在，则返回 slug，否则返回 primaryId 保留原状供后续报警。
 */
async function resolveSceneConfigId(
  entity: HaEntity,
  cache: HaConfigCache,
): Promise<string> {
  const props = (entity.attributes || {}) as Record<string, unknown>;
  const primaryId = String(props.id || entity.entity_id.replace('scene.', ''));
  if (await cache.fetch('scene', primaryId)) return primaryId;
  const slug = entity.entity_id.includes('.')
    ? entity.entity_id.split('.').slice(1).join('.')
    : entity.entity_id;
  if (slug && slug !== primaryId && (await cache.fetch('scene', slug))) return slug;
  return primaryId;
}

/**
 * 通用 HA 域实体发现入口。
 * 校验连接 → 按 domain 拉取实体列表 → 通过单飞缓存并发调用 Config API 解析每个实体配置。
 * @param params.mapEntity - 实体到导入结构的映射函数（场景/自动化/脚本各一份）
 * @param params.failError - 业务异常消息构造器，HA 调用失败时通过 badRequest 抛出
 */
async function discoverHaDomainEntities<T>(
  deps: HaSyncDiscoverDeps,
  params: {
    domain: 'scene' | 'automation' | 'script';
    disconnectedLog: string;
    failError: (errMsg: string) => string;
    logLabel: string;
    mapEntity: (entity: HaEntity, cache: HaConfigCache) => Promise<T>;
  },
): Promise<T[]> {
  const status = await deps.haConnector.getStatus();
  if (!status.connected) {
    deps.logger.warn(params.disconnectedLog);
    return [];
  }

  try {
    const states = await deps.haConnector.fetchEntitiesByDomain(params.domain);
    const cache = createHaConfigCache(deps.haConnector);
    const entities = (states || []).filter((entity) => entity?.entity_id);
    const result = await mapWithConcurrency(entities, deps.importConfigConcurrency, (entity) =>
      params.mapEntity(entity, cache),
    );

    deps.logger.log(`从 HA 发现了 ${result.length} 个${params.logLabel}`);
    return result;
  } catch (err: unknown) {
    rethrowIfHttpException(err);
    const errMsg = getErrorMessage(err);
    deps.logger.error(`从 HA 发现${params.logLabel}失败: ${errMsg}`);
    badRequest(params.failError(errMsg));
  }
}

/**
 * 从 HA 发现场景实体并解析为导入结构。
 * 场景 entities 配置经 haSceneMapToEntities 转换为前端兼容的 JSON 字符串。
 * Config API 读取失败时跳过该场景的实体配置但保留实体基本信息。
 */
export async function discoverScenesFromHa(
  deps: HaSyncDiscoverDeps,
  failError: (errMsg: string) => string,
): Promise<HaSceneImport[]> {
  return discoverHaDomainEntities(deps, {
    domain: 'scene',
    disconnectedLog: 'HA 未连接，跳过场景发现',
    failError,
    logLabel: '场景',
    mapEntity: async (entity, cache) => {
      const name =
        (entity.attributes?.friendly_name as string) || entity.entity_id.replace('scene.', '');
      const configId = await resolveSceneConfigId(entity, cache);
      let entitiesJson = '[]';
      try {
        const sceneConfig = await cache.fetch('scene', configId);
        if (sceneConfig?.entities && typeof sceneConfig.entities === 'object') {
          // 发现接口仍返回 JSON 字符串，保持与前端导入契约兼容
          entitiesJson = JSON.stringify(
            haSceneMapToEntities(
              sceneConfig.entities as Record<string, Record<string, unknown>>,
            ),
          );
        } else {
          deps.logger.warn(`场景 ${entity.entity_id} 无法从 Config API 读取,跳过实体配置`);
        }
      } catch (err: unknown) {
        deps.logger.warn(`场景 ${entity.entity_id} 配置读取失败: ${getErrorMessage(err)}`);
      }
      return { entity_id: entity.entity_id, name, entities: entitiesJson, ha_config_id: configId };
    },
  });
}

/**
 * 从 HA 发现自动化实体并生成 YAML 模板。
 * Config API 可读时通过 haConfigToYaml 输出完整 YAML；不可读时输出仅含 alias/mode 的最小模版，
 * 并标记 incomplete=true 提示前端引导用户走 syncFromHA 完整导入。
 */
export async function discoverAutomationsFromHa(
  deps: HaSyncDiscoverDeps,
  failError: (errMsg: string) => string,
): Promise<HaAutomationImport[]> {
  return discoverHaDomainEntities(deps, {
    domain: 'automation',
    disconnectedLog: 'HA 未连接，跳过自动化发现',
    failError,
    logLabel: '自动化',
    mapEntity: async (entity, cache) => {
      const name =
        (entity.attributes?.friendly_name as string) ||
        (entity.attributes?.alias as string) ||
        entity.entity_id.replace('automation.', '');

      const props = (entity.attributes || {}) as Record<string, unknown>;
      const configId = String(props.id || entity.entity_id.replace('automation.', ''));
      const config = await cache.fetch('automation', configId);
      const incomplete = !config;
      let yaml = '';
      if (config) {
        yaml = haConfigToYaml(config);
      } else {
        yaml =
          'alias: "' +
          name +
          '"\nmode: ' +
          String(props.mode || 'single') +
          '\n# 无法读取完整配置，请使用「从 HA 导入」';
      }

      return {
        entity_id: entity.entity_id,
        name,
        state: entity.state || 'off',
        last_triggered: (props.last_triggered as string) || null,
        mode: String(props.mode || 'single'),
        yaml,
        ha_config_id: configId,
        incomplete,
      };
    },
  });
}

/**
 * 从 HA 发现脚本实体并生成 YAML 模板。
 * Config API 可读时通过 scriptHaConfigToYaml 输出完整 YAML；
 * 不可读时输出 alias + description + mode + 空 sequence 的最小模版供前端编辑。
 */
export async function discoverScriptsFromHa(
  deps: HaSyncDiscoverDeps,
  failError: (errMsg: string) => string,
): Promise<HaScriptImport[]> {
  return discoverHaDomainEntities(deps, {
    domain: 'script',
    disconnectedLog: 'HA 未连接，跳过脚本发现',
    failError,
    logLabel: '脚本',
    mapEntity: async (entity, cache) => {
      const name =
        (entity.attributes?.friendly_name as string) || entity.entity_id.replace('script.', '');

      const props = (entity.attributes || {}) as Record<string, unknown>;
      const configId = String(props.id || entity.entity_id.replace('script.', ''));
      const config = await cache.fetch('script', configId);
      let yaml = '';
      if (config) {
        yaml = scriptHaConfigToYaml(config);
      } else {
        yaml =
          'alias: "' +
          name +
          '"\n' +
          (props.description ? 'description: "' + String(props.description) + '"\n' : '') +
          'mode: ' +
          String(props.mode || 'single') +
          '\n\n' +
          'sequence:';
      }

      return {
        entity_id: entity.entity_id,
        name,
        state: entity.state || 'off',
        last_triggered: (props.last_triggered as string) || null,
        yaml,
        ha_config_id: configId,
      };
    },
  });
}

// ── ha-sync-blueprint-discover.helper ──
/** Blueprint 导入行：来自 HA 配置目录 blueprints/automation 的 YAML 清单。 */
export interface HaBlueprintImportRow {
  id: string;
  name: string;
  description: string;
  filename: string;
  inputKeys: string[];
}

/**
 * 从 Blueprint YAML 文档中提取 input 字段名清单。
 * Blueprint 的 input 节定义了占位符到实体的映射，前端可据此生成选择器。
 */
function inputKeysFromBlueprint(doc: Record<string, unknown>): string[] {
  const bp = doc.blueprint as Record<string, unknown> | undefined;
  const input = bp?.input as Record<string, unknown> | undefined;
  if (!input || typeof input !== 'object') return [];
  return Object.keys(input);
}

/** 扫描 HA 配置目录 blueprints/automation 下的 Blueprint 清单 */
export async function discoverAutomationBlueprints(
  configDir: string | undefined,
): Promise<HaBlueprintImportRow[]> {
  if (!configDir) return [];
  const dir = resolveConfigPath(configDir, 'blueprints', 'automation');
  if (!dir) return [];
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  const yamlNames = names.filter((name) => /\.ya?ml$/i.test(name));
  const rows = await mapWithConcurrency(yamlNames, 8, async (name) => {
    const filePath = resolveConfigPath(configDir, 'blueprints', 'automation', name);
    if (!filePath) return null;
    try {
      const text = await fs.readFile(filePath, 'utf8');
      const doc = loadHaYamlObject(text);
      if (!doc || typeof doc !== 'object') return null;
      const bp = doc.blueprint as Record<string, unknown> | undefined;
      if (!bp || bp.domain !== 'automation') return null;
      const id = name.replace(/\.ya?ml$/i, '');
      return {
        id,
        filename: name,
        name: String(bp.name || id),
        description: String(bp.description || ''),
        inputKeys: inputKeysFromBlueprint(doc as Record<string, unknown>),
      } satisfies HaBlueprintImportRow;
    } catch {
      return null;
    }
  });
  return rows
    .filter((row): row is HaBlueprintImportRow => row != null)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
}

/** 读取 Blueprint 原始 YAML */
export async function readAutomationBlueprintYaml(
  configDir: string | undefined,
  filename: string,
): Promise<string | null> {
  if (!configDir || !filename) return null;
  const safeName = filename.replace(/[/\\]/g, '');
  const filePath = resolveConfigPath(configDir, 'blueprints', 'automation', safeName);
  if (!filePath) return null;
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Blueprint input 字段名到 HA 域的推断表。
 * 当 !input 占位符的变量名包含某些关键字（motion/light/cover 等）时，
 * 推断出对应的 HA 域，生成 plausible 的占位实体 ID 供前端选择器初始化。
 */
const INPUT_DOMAIN_HINT: Record<string, string> = {
  motion: 'binary_sensor',
  sensor: 'binary_sensor',
  light: 'light',
  switch: 'switch',
  climate: 'climate',
  cover: 'cover',
  person: 'person',
  zone: 'zone',
  entity: 'binary_sensor',
};

/** 将 Blueprint YAML 转为 HomeOS 可编辑草案（!input → 占位实体） */
export function blueprintYamlToDraft(rawYaml: string, alias: string): string {
  let body = rawYaml.replace(
    /^blueprint:[\s\S]*?(?=^(?:trigger|triggers|condition|conditions|action|actions):)/m,
    '',
  );
  body = body.replace(/!input\s+([\w.-]+)/g, (_, key: string) => {
    const lower = key.toLowerCase();
    let domain = 'binary_sensor';
    for (const [hint, d] of Object.entries(INPUT_DOMAIN_HINT)) {
      if (lower.includes(hint)) {
        domain = d;
        break;
      }
    }
    const slug = lower.replace(/[^a-z0-9_]+/g, '_').slice(0, 32);
    return `${domain}.${slug || 'placeholder'}`;
  });
  const trimmed = body.trim();
  if (/^alias:/m.test(trimmed)) return trimmed;
  return `alias: "${alias.replace(/"/g, '\\"')}"\n${trimmed}`;
}

// ── ha-sync-template-discover.helper ──
/** 模板实体发现依赖集合，比通用发现多了 getHaConfigDir 用于解析 YAML 来源路径。 */
interface HaTemplateDiscoverDeps {
  logger: Logger;
  haConnector: HaConnectorService;
  importConfigConcurrency: number;
  getHaConfigDir: () => string | undefined | undefined;
}

/**
 * 模板实体导入行。
 * 模板实体通常没有 Config API 直读路径，YAML 来源通过 haConnector.resolveTemplateYaml 在
 * 配置目录 / Config Entry / attributes 之间推断；yaml_complete=false 时前端提示"不完整"。
 */
interface HaTemplateImportRow {
  entity_id: string;
  name: string;
  ha_config_id?: string;
  yaml?: string;
  platform?: string;
  yaml_source?: string;
  yaml_complete?: boolean;
  config_entry_id?: string;
  trigger_entity_id?: string;
}

/**
 * 从 HA 实体注册表发现 platform=template 的实体。
 * 仅保留含 unique_id 的条目以排除临时模板。注册表为空时延时 2.5s 后强制刷新一次。
 * @param forceRefresh - true 时强制刷新实体注册表
 * @param options.resolveYaml - true 时通过 Config API / 配置目录解析 YAML 源，否则只返回基础信息
 */
export async function discoverTemplatesFromHa(
  deps: HaTemplateDiscoverDeps,
  forceRefresh = false,
  options?: { resolveYaml?: boolean },
): Promise<HaTemplateImportRow[]> {
  const status = await deps.haConnector.getStatus();
  if (!status.connected) return [];

  let registry = forceRefresh
    ? await deps.haConnector.refreshEntityRegistry()
    : await deps.haConnector.fetchEntityRegistry();
  if (!registry.length) {
    await new Promise((r) => setTimeout(r, 2500));
    registry = await deps.haConnector.refreshEntityRegistry();
  }
  const templateEntries = registry.filter((e) => e.platform === 'template' && e.unique_id);
  const resolveYaml = options?.resolveYaml === true;
  deps.logger.log(
    `模板发现:注册表 ${registry.length} 条,template+unique_id ${templateEntries.length} 条,解析YAML=${resolveYaml}`,
  );
  const cfgDir = deps.getHaConfigDir();
  const result: HaTemplateImportRow[] = [];
  const seen = new Set<string>();
  const pendingYaml: Array<{
    entry: HaEntityRegistryEntry;
    configId: string;
  }> = [];

  for (const entry of templateEntries) {
    const configId = String(entry.unique_id || '');
    if (!configId || seen.has(configId)) continue;
    seen.add(configId);

    if (!resolveYaml) {
      result.push({
        entity_id: entry.entity_id,
        name: entry.name || entry.entity_id,
        ha_config_id: configId,
        platform: entry.platform,
        config_entry_id: entry.config_entry_id,
      });
      continue;
    }

    pendingYaml.push({ entry, configId });
  }

  const yamlResults = await mapWithConcurrency(
    pendingYaml,
    deps.importConfigConcurrency,
    async ({ entry, configId }) => {
      const entity = await deps.haConnector.fetchEntityState(entry.entity_id);
      const attrs = (entity?.attributes || {}) as Record<string, unknown>;
      const name = entry.name || (attrs.friendly_name as string) || entry.entity_id;
      const yamlResolved = await deps.haConnector.resolveTemplateYaml(
        {
          ...entry,
          name,
        },
        cfgDir,
      );
      return {
        entity_id: entry.entity_id,
        name,
        ha_config_id: configId,
        yaml: yamlResolved.yaml,
        platform: entry.platform,
        yaml_source: yamlResolved.source,
        yaml_complete: yamlResolved.complete,
        config_entry_id: entry.config_entry_id,
        trigger_entity_id: yamlResolved.trigger_entity_id,
      };
    },
  );
  result.push(...yamlResults);

  deps.logger.log(
    `从 HA 发现了 ${result.length} 个 template 实体(注册表共 ${templateEntries.length} 条)`,
  );
  return result;
}

// ── ha-sync-yaml-helper ──
/** YAML 校验依赖集合，仅注入 HaRestClientService 用于最终的 HA check_config 调用。 */
interface HaSyncYamlValidateDeps {
  haRestClient: HaRestClientService;
}

/**
 * 通用 YAML 校验：直接提交至 HA 的 check_config 端点。
 * HA 未配置时抛 ServiceUnavailableException 提示用户先完成 HA 配置。
 */
export async function validateYaml(
  deps: HaSyncYamlValidateDeps,
  yaml: string,
): Promise<{ valid: boolean; message: string }> {
  const configured = await deps.haRestClient.isConfigured();
  if (!configured) throw new ServiceUnavailableException(API_ERROR.HA_NOT_CONFIGURED);
  return deps.haRestClient.validateYaml(yaml);
}

/**
 * 脚本 YAML 校验：先本地结构校验快失败，再 wrap 后提交 HA check_config。
 * HA 校验失败但本地通过时视为有效——推送阶段会回退到 Config API，不阻塞用户保存。
 */
export async function validateScriptYaml(
  deps: HaSyncYamlValidateDeps,
  yamlStr: string,
): Promise<{ valid: boolean; message: string }> {
  const local = validateScriptYamlLocal(yamlStr);
  if (!local.valid) return local;
  const ha = await validateYaml(deps, wrapScriptForHaCheck(yamlStr));
  if (ha.valid) return ha;
  return { valid: true, message: '本地校验通过（HA check_config 未通过，推送将使用 Config API）' };
}

/**
 * 模板实体 YAML 校验：本地结构校验 + HA check_config 双重路径。
 * 失败降级行为同脚本校验：本地通过即视为有效，HA 端可在推送时回退。
 */
export async function validateTemplateYaml(
  deps: HaSyncYamlValidateDeps,
  yamlStr: string,
): Promise<{ valid: boolean; message: string }> {
  const local = validateTemplateYamlLocal(yamlStr);
  if (!local.valid) return local;
  const ha = await validateYaml(deps, wrapTemplateForHaCheck(yamlStr));
  if (ha.valid) return ha;
  return { valid: true, message: '本地校验通过（HA check_config 未通过，推送将使用 Config API）' };
}

/**
 * 自动化 YAML 校验：本地结构校验 + HA check_config 双重路径。
 * 失败降级行为同脚本/模板：HA 校验失败不阻塞保存，推送时改走 Config API。
 */
export async function validateAutomationYaml(
  deps: HaSyncYamlValidateDeps,
  yamlStr: string,
): Promise<{ valid: boolean; message: string }> {
  const local = validateAutomationYamlLocal(yamlStr);
  if (!local.valid) return local;
  const ha = await validateYaml(deps, wrapAutomationForHaCheck(yamlStr));
  if (ha.valid) return ha;
  return { valid: true, message: '本地校验通过（HA check_config 未通过，推送将使用 Config API）' };
}
