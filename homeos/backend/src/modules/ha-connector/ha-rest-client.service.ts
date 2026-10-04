/**
 * HA REST API 客户端。
 *
 * 职责：
 * - 处理历史查询、实体状态获取、媒体代理、REST 降级命令等所有 HTTP 交互。
 * - 提供配置流（Config Flow / Options Flow）的创建、提交、中止。
 * - 内置熔断器（CircuitBreaker）保护 REST 调用，历史查询与全量状态短时缓存 + 单飞去重。
 * - 401/403 认证错误时自动失效配置缓存，便于下次读取最新 Token。
 *
 * 依赖：HaConfigService（HA 地址与 Token）、AppConfigService（缓存 TTL 等配置）。
 */
import { Injectable, Logger } from '@nestjs/common';
import { badRequest } from '../../common/utils/business-exception';
import { HaConfigService } from './ha-config.service';
import { AppConfigService } from '../../shared/app-config/service';
import { getErrorMessage, BusinessException, ErrorCode } from '../../common/utils';
import { CircuitBreaker } from '../../common/resilience/circuit-breaker.helper';
import type { HaFlowStep } from '../../shared/ha/config-flow.util';
import type { HaEntity } from '../../shared/types';
import {
  fetchHaWithTimeout,
  invalidateHaConfigOnAuthError,
} from '../../shared/ha/rest-fetch.util';
import {
  mapHaEntityRegistryRow,
  type HaEntityRegistryEntry,
} from '../../shared/ha/entity-registry.util';
import { HaRestHistoryCache, HaRestAllStatesCache } from './ha-rest-cache.util';
import {
  deleteHaConfigRecord,
  fetchHaConfigRecord,
  haConfigFlowRequest,
  upsertHaConfigRecord,
  upsertTemplateHelperViaFlow,
  validateHaYamlConfig,
} from './ha-rest-config-api.util';
import { fetchHaMediaImage, openHaMediaStream } from './ha-rest-media-proxy.util';

export {
  mapHaEntityRegistryRow,
  type HaEntityRegistryEntry,
} from '../../shared/ha/entity-registry.util';
import { API_ERROR } from '../../common/errors/api-error-messages';

/**
 * HA REST API 客户端（@Injectable）。
 * 处理历史查询、实体状态获取、媒体代理、REST降级命令等所有 HTTP 交互。
 * 内置熔断器与缓存，为 HaConnectorService 提供 REST 降级能力。
 */
@Injectable()
export class HaRestClientService {
  private readonly logger = new Logger(HaRestClientService.name);
  /** REST 调用熔断器：连续失败 5 次后熔断，30s 后尝试恢复 */
  private readonly restCallBreaker: CircuitBreaker;
  /** 历史查询缓存（TTL + 容量上限 + 单飞去重） */
  private readonly historyCache: HaRestHistoryCache;
  /** 全量实体状态缓存（3s TTL + 单飞去重） */
  private readonly allStatesCache = new HaRestAllStatesCache();

  private get HISTORY_CACHE_TTL() {
    return this.appConfig.get('other').haHistoryCacheMin * 60 * 1000;
  }
  private get historyCacheMaxSize() {
    return this.appConfig.get('haConnector').historyCacheMaxSize;
  }

  /**
   * @param config HA 动态配置服务（提供 URL 与 Token）。
   * @param appConfig 应用配置（提供缓存 TTL、容量等参数）。
   */
  constructor(
    private readonly config: HaConfigService,
    private readonly appConfig: AppConfigService,
  ) {
    this.restCallBreaker = new CircuitBreaker('ha-rest-call', {
      failureThreshold: 5,
      recoveryTimeout: 30000,
    });
    this.historyCache = new HaRestHistoryCache(
      () => this.HISTORY_CACHE_TTL,
      () => this.historyCacheMaxSize,
    );
  }

  /** 401/403 表示 Token 失效/无权限：使配置缓存失效，便于下次读取最新 Token */
  private handleAuthError(status: number) {
    invalidateHaConfigOnAuthError(
      status,
      () => this.config.invalidateCache(),
      (msg) => this.logger.warn(msg),
    );
  }

  /** 带超时的 fetch 封装 */
  private fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 10_000): Promise<Response> {
    return fetchHaWithTimeout(url, init, timeoutMs);
  }

  private getHaConfig = () => this.config.getConfig();

  /**
   * 从容器/服务端探测 HA URL 与 Token 是否可达（不写入配置）。
   * @param haUrl HA 地址。
   * @param token HA 访问令牌。
   * @returns 包含 ok（是否成功）、message（描述）、ha_version（HA 版本）的结果对象。
   */
  async testConnection(
    haUrl: string,
    token: string,
  ): Promise<{ ok: boolean; message: string; ha_version?: string }> {
    // 与 WS 建连共用 normalizeHaUrl，避免探测路径漏掉 HOST_IP 替换导致误报局域网不可达
    const base = this.config.normalizeHaUrl(haUrl?.trim() || '');
    if (!base) {
      return { ok: false, message: 'HA 地址不能为空' };
    }
    if (!token?.trim()) {
      return { ok: false, message: '访问令牌不能为空' };
    }

    try {
      const response = await this.fetchWithTimeout(
        `${base}/api/`,
        { headers: { Authorization: `Bearer ${token.trim()}` } },
        8_000,
      );
      if (response.status === 401 || response.status === 403) {
        return { ok: false, message: `认证失败（HTTP ${response.status}），请检查令牌` };
      }
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        return {
          ok: false,
          message: `无法连接 HA（HTTP ${response.status}）${text ? `: ${text.slice(0, 120)}` : ''}`,
        };
      }
      const body = (await response.json().catch(() => ({}))) as {
        message?: string;
        ha_version?: string;
      };
      return {
        ok: true,
        message: body.message || '连接成功',
        ha_version: body.ha_version,
      };
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      if (msg.includes('abort') || msg.includes('AbortError')) {
        return { ok: false, message: '连接超时（8s），请检查地址是否从容器内可达' };
      }
      return { ok: false, message: `连接失败：${msg}` };
    }
  }

  /**
   * 通过 REST API 获取实体历史数据（带缓存与单飞去重）。
   * @param entityIds 实体 ID 列表。
   * @param hours 查询时间范围（小时）。
   * @returns 历史数据数组，失败时返回空数组。
   */
  async fetchHistory(entityIds: string[], hours: number) {
    const sorted = [...entityIds].sort();
    const cacheKey = `${sorted.join(',')}|${hours}`;

    const cached = this.historyCache.getCached(cacheKey);
    if (cached !== undefined) return cached;

    try {
      return await this.historyCache.runDeduped(cacheKey, () => this.doFetchHistory(entityIds, hours));
    } catch {
      // 失败不写入 TTL 缓存，避免 502/超时的空结果把曲线卡死到缓存过期
      return [];
    }
  }

  /**
   * 通过 REST API 调用服务（WebSocket 断连或超时降级）。
   * @param domain HA 服务域。
   * @param service HA 服务名。
   * @param entityId 目标实体 ID（可选）。
   * @param serviceData 服务调用附加参数。
   * @param timeoutMs 超时毫秒数，默认 10s。
   * @returns HA 响应体，失败时抛出 BusinessException。
   * @throws {BusinessException} HA 未配置或 REST 调用失败时抛出。
   */
  async callServiceViaRest(
    domain: string,
    service: string,
    entityId?: string,
    serviceData?: Record<string, unknown>,
    timeoutMs = 10_000,
  ): Promise<unknown> {
    const { haUrl, token } = await this.config.getConfig();
    if (!haUrl || !token) badRequest(API_ERROR.HA_NOT_CONFIGURED);

    const data = { ...(serviceData || {}) };
    const returnResponse = data.return_response === true;
    delete data.return_response;
    const qs = returnResponse ? '?return_response' : '';
    const url = `${haUrl}/api/services/${domain}/${service}${qs}`;
    const body: Record<string, unknown> = { ...data };
    if (entityId) body.entity_id = entityId;
    this.logger.debug(`[REST 命令] ${domain}.${service}${entityId ? ` → ${entityId}` : ''}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.restCallBreaker.fire(() =>
        fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        }),
      );
      if (!response.ok) {
        this.handleAuthError(response.status);
        const text = await response.text().catch(() => '');
        let detail = text || response.statusText;
        try {
          const j = JSON.parse(text) as { message?: string; error?: string };
          detail = j.message || j.error || detail;
        } catch {
          /* 非 JSON 响应 */
        }
        throw new BusinessException(
          ErrorCode.EXTERNAL_ERROR,
          API_ERROR.HA_REST_API_FAILED(response.status, detail),
        );
      }
      const json = (await response.json().catch(() => ({}))) as unknown;
      if (returnResponse && json && typeof json === 'object' && !Array.isArray(json)) {
        const rec = json as Record<string, unknown>;
        if (rec.response == null && rec.service_response != null) {
          return { ...rec, response: rec.service_response };
        }
      }
      return json;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * 获取指定域下所有实体（基于全量 states 过滤）。
   * @param domain 实体域（如 light、switch）。
   * @returns 该域下所有实体数组。
   */
  async fetchEntitiesByDomain(domain: string): Promise<HaEntity[]> {
    const all = await this.fetchAllStates();
    return all.filter((e) => e?.entity_id?.startsWith(`${domain}.`));
  }

  /**
   * REST 拉取全量实体状态（WS 断连降级，3s 短时缓存 + 单飞去重）。
   * @param timeoutMs 超时毫秒数，默认 60s。
   * @returns 全量实体状态数组。
   */
  async fetchAllStates(timeoutMs = 60_000): Promise<HaEntity[]> {
    const fresh = this.allStatesCache.getFresh();
    if (fresh) return fresh;

    const inflight = this.allStatesCache.getInflight();
    if (inflight) return inflight;

    return this.allStatesCache.runDeduped((ms) => this.doFetchAllStates(ms), timeoutMs);
  }

  /** 实际执行 REST 全量 states 拉取，失败时重抛异常供上层单飞去重处理。 */
  private async doFetchAllStates(timeoutMs: number): Promise<HaEntity[]> {
    const { haUrl, token } = await this.config.getConfig();
    if (!haUrl || !token) return [];

    try {
      const response = await this.fetchWithTimeout(
        `${haUrl.replace(/\/$/, '')}/api/states`,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
        timeoutMs,
      );
      if (!response.ok) {
        this.handleAuthError(response.status);
        throw new BusinessException(
          ErrorCode.EXTERNAL_ERROR,
          API_ERROR.HA_REST_RESPONSE_FAILED(response.status),
        );
      }
      const states = await response.json();
      return Array.isArray(states) ? (states as HaEntity[]) : [];
    } catch (err: unknown) {
      this.logger.debug(`REST 全量 states 拉取失败: ${getErrorMessage(err)}`);
      if (err instanceof Error) throw err;
      throw new BusinessException(ErrorCode.EXTERNAL_ERROR, getErrorMessage(err));
    }
  }

  /**
   * 获取 HA 实体注册表（WebSocket 不可用时的 REST 回退）。
   * @param timeoutMs 超时毫秒数，默认 30s。
   * @returns 实体注册表条目数组，失败或 404/405 时返回空数组。
   */
  async fetchEntityRegistry(timeoutMs = 30_000): Promise<HaEntityRegistryEntry[]> {
    const { haUrl, token } = await this.config.getConfig();
    if (!haUrl || !token) return [];

    try {
      const response = await this.fetchWithTimeout(
        `${haUrl}/api/config/entity_registry/list`,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
        timeoutMs,
      );
      if (!response.ok) {
        if (response.status !== 404 && response.status !== 405) {
          this.handleAuthError(response.status);
        }
        return [];
      }
      const rows = await response.json();
      if (!Array.isArray(rows)) return [];
      const mapped = rows
        .map((e: Record<string, unknown>) => mapHaEntityRegistryRow(e))
        .filter(Boolean) as HaEntityRegistryEntry[];
      if (mapped.length) this.logger.log(`实体注册表 REST 成功: ${mapped.length} 条`);
      return mapped;
    } catch (err: unknown) {
      this.logger.debug(`实体注册表 REST 不可用: ${getErrorMessage(err)}`);
      return [];
    }
  }

  /**
   * 获取单个实体状态。
   * @param entityId 实体 ID。
   * @returns 实体状态对象，未找到或出错时返回 null。
   */
  async fetchEntityState(entityId: string): Promise<HaEntity | null> {
    const { haUrl, token } = await this.config.getConfig();
    if (!haUrl || !token) return null;

    try {
      const response = await this.fetchWithTimeout(`${haUrl}/api/states/${entityId}`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        this.handleAuthError(response.status);
        return null;
      }
      return response.json();
    } catch (err: unknown) {
      this.logger.error(`获取实体状态失败 [${entityId}]: ${getErrorMessage(err)}`);
      return null;
    }
  }

  /**
   * 代理 HA 媒体图片（验证路径白名单后透传响应）。
   * @param path HA 媒体路径。
   * @returns 包含 data（Buffer）与 contentType 的对象。
   * @throws {BusinessException} HA 未配置或 REST 调用失败时抛出。
   */
  async fetchMediaImage(path: string) {
    const { haUrl, token } = await this.config.getConfig();
    if (!haUrl || !token) badRequest(API_ERROR.HA_NOT_CONFIGURED);

    try {
      return await fetchHaMediaImage(
        haUrl,
        token,
        path,
        (url, init, timeoutMs) => this.fetchWithTimeout(url, init, timeoutMs),
        (status) => this.handleAuthError(status),
      );
    } catch (e: unknown) {
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      this.logger.error(
        `代理 HA 图像 ${haUrl}${cleanPath} 失败:${getErrorMessage(e)}`,
      );
      throw e;
    }
  }

  /**
   * 打开 HA 媒体流（MJPEG / HLS），供 stream-proxy 管道转发。
   * @param path HA 媒体流路径。
   * @returns HA 响应流（Response 对象），由调用方 pipe 到客户端。
   * @throws {BusinessException} HA 未配置或 REST 调用失败时抛出。
   */
  async openMediaStream(path: string): Promise<Response> {
    const { haUrl, token } = await this.config.getConfig();
    if (!haUrl || !token) badRequest(API_ERROR.HA_NOT_CONFIGURED);

    try {
      return await openHaMediaStream(
        haUrl,
        token,
        path,
        (url, init) => this.fetchWithTimeout(url, init, 0),
        (status) => this.handleAuthError(status),
      );
    } catch (e: unknown) {
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      this.logger.error(
        `打开 HA 媒体流 ${haUrl}${cleanPath} 失败:${getErrorMessage(e)}`,
      );
      throw e;
    }
  }

  /**
   * 通用 HA Config API 读取（automation / script / scene 等）。
   * @param component HA 配置组件名（automation / script / scene）。
   * @param configId 配置 ID。
   * @returns 配置对象，404 或未配置时返回 null。
   */
  async fetchHaConfig(
    component: string,
    configId: string,
  ): Promise<Record<string, unknown> | null> {
    return fetchHaConfigRecord(
      this.getHaConfig,
      (url, init, timeoutMs) => this.fetchWithTimeout(url, init, timeoutMs),
      (status) => this.handleAuthError(status),
      this.logger,
      component,
      configId,
    );
  }

  /**
   * 通用 HA Config API 写入（创建或更新）。
   * @param component HA 配置组件名。
   * @param configId 配置 ID。
   * @param body 配置内容。
   * @returns HA 返回的配置对象。
   * @throws {BusinessException} HA 未配置或 REST 调用失败时抛出。
   */
  async upsertHaConfig(
    component: string,
    configId: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return upsertHaConfigRecord(
      this.getHaConfig,
      (url, init, timeoutMs) => this.fetchWithTimeout(url, init, timeoutMs),
      (status) => this.handleAuthError(status),
      component,
      configId,
      body,
    );
  }

  /**
   * 通用 HA Config API 删除。
   * @param component HA 配置组件名。
   * @param configId 配置 ID。
   * @throws {BusinessException} HA 未配置或删除失败时抛出。404 视为已删除，不抛异常。
   */
  async deleteHaConfig(component: string, configId: string): Promise<void> {
    return deleteHaConfigRecord(
      this.getHaConfig,
      (url, init, timeoutMs) => this.fetchWithTimeout(url, init, timeoutMs),
      (status) => this.handleAuthError(status),
      component,
      configId,
    );
  }

  fetchAutomationConfig = (id: string) => this.fetchHaConfig('automation', id);
  upsertAutomationConfig = (id: string, body: Record<string, unknown>) =>
    this.upsertHaConfig('automation', id, body);
  deleteAutomationConfig = (id: string) => this.deleteHaConfig('automation', id);
  fetchScriptConfig = (id: string) => this.fetchHaConfig('script', id);
  upsertScriptConfig = (id: string, body: Record<string, unknown>) =>
    this.upsertHaConfig('script', id, body);
  deleteScriptConfig = (id: string) => this.deleteHaConfig('script', id);
  fetchSceneConfig = (id: string) => this.fetchHaConfig('scene', id);
  upsertSceneConfig = (id: string, body: Record<string, unknown>) =>
    this.upsertHaConfig('scene', id, body);
  deleteSceneConfig = (id: string) => this.deleteHaConfig('scene', id);
  // Config Entry Flow（模板 Helper 等）

  /**
   * 通用 HA Config Flow 请求（GET / POST / DELETE）。
   * @param method HTTP 方法。
   * @param path 请求路径（相对于 HA base URL）。
   * @param body 请求体（可选）。
   * @returns HA 响应（HaFlowStep 或通用对象）。
   * @throws {BusinessException} HA 未配置或请求失败时抛出。
   */
  private configFlowRequest(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<HaFlowStep | Record<string, unknown>> {
    return haConfigFlowRequest(
      this.getHaConfig,
      (url, init, timeoutMs) => this.fetchWithTimeout(url, init, timeoutMs),
      (status) => this.handleAuthError(status),
      method,
      path,
      body,
    );
  }

  startConfigFlow = (handler: string) =>
    this.configFlowRequest('POST', '/api/config/config_entries/flow', {
      handler,
    }) as Promise<HaFlowStep>;

  submitConfigFlowStep = (flowId: string, data: Record<string, unknown>) =>
    this.configFlowRequest(
      'POST',
      `/api/config/config_entries/flow/${encodeURIComponent(flowId)}`,
      data,
    ) as Promise<HaFlowStep>;

  abortConfigFlow = (flowId: string) =>
    this.configFlowRequest(
      'DELETE',
      `/api/config/config_entries/flow/${encodeURIComponent(flowId)}`,
    );

  startOptionsFlow = (entryId: string) =>
    this.configFlowRequest(
      'POST',
      `/api/config/config_entries/options/flow/${encodeURIComponent(entryId)}`,
    ) as Promise<HaFlowStep>;

  submitOptionsFlowStep = (flowId: string, data: Record<string, unknown>) =>
    this.configFlowRequest(
      'POST',
      `/api/config/config_entries/options/flow/${encodeURIComponent(flowId)}`,
      data,
    ) as Promise<HaFlowStep>;

  /**
   * 列出 HA Config Entry（HA 仅提供列表 GET，单条 resource 只支持 DELETE）。
   * @param domain 可选域过滤。
   * @returns Config Entry 数组。
   */
  listConfigEntries = async (domain?: string): Promise<Record<string, unknown>[]> => {
    const q = domain ? `?domain=${encodeURIComponent(domain)}` : '';
    const result = await this.configFlowRequest('GET', `/api/config/config_entries/entry${q}`);
    return Array.isArray(result) ? (result as Record<string, unknown>[]) : [];
  };

  /**
   * 获取单个 Config Entry（从列表中过滤，404/405 时返回 null）。
   * @param entryId Config Entry ID。
   * @returns Config Entry 对象，未找到返回 null。
   */
  getConfigEntry = async (entryId: string): Promise<Record<string, unknown> | null> => {
    try {
      const entries = await this.listConfigEntries();
      return entries.find((e) => String(e.entry_id) === entryId) || null;
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      if (msg.includes('404') || msg.includes('405')) return null;
      throw err;
    }
  };

  deleteConfigEntry = (entryId: string) =>
    this.configFlowRequest(
      'DELETE',
      `/api/config/config_entries/entry/${encodeURIComponent(entryId)}`,
    );

  /**
   * 通过 Config Entry Flow 创建/更新 template helper。
   * 已有 entry 时走 Options Flow，否则走 Config Flow 创建。
   * @param flowConfig 模板配置。
   * @param entryId 已有 entry ID（更新时传入，创建时省略）。
   * @returns 包含 entry_id 与 title 的结果。
   * @throws {BusinessException} Flow 启动失败或 entry_id 缺失时抛出。
   */
  async upsertTemplateHelper(
    flowConfig: Record<string, unknown>,
    entryId?: string | null,
  ): Promise<{ entry_id: string; title?: string }> {
    return upsertTemplateHelperViaFlow(
      this.logger,
      (id) => this.getConfigEntry(id),
      (id) => this.startOptionsFlow(id),
      (flowId, data) => this.submitOptionsFlowStep(flowId, data),
      (handler) => this.startConfigFlow(handler),
      (flowId, data) => this.submitConfigFlowStep(flowId, data),
      (flowId) => this.abortConfigFlow(flowId),
      flowConfig,
      entryId,
    );
  }

  /** 失效历史查询缓存与全量状态缓存。 */
  invalidateCache(): void {
    this.historyCache.clear();
    this.allStatesCache.clear();
  }

  /**
   * 实际执行历史数据 REST 拉取（30s 超时）。
   * HTTP/网络失败抛错，由 fetchHistory 返回空数组且不写入 TTL 缓存。
   */
  private async doFetchHistory(entityIds: string[], hours: number) {
    const { haUrl, token } = await this.config.getConfig();
    if (!haUrl || !token) badRequest(API_ERROR.HA_NOT_CONFIGURED);

    const startTime = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    const entityFilter = entityIds.join(',');
    const url = `${haUrl}/api/history/period/${startTime}?filter_entity_id=${encodeURIComponent(entityFilter)}&minimal_response=true`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger.warn(`HA 历史获取失败:HTTP ${response.status},${entityIds.length} 个实体`);
        throw new BusinessException(
          ErrorCode.EXTERNAL_ERROR,
          API_ERROR.HA_REST_RESPONSE_FAILED(response.status),
        );
      }
      return await response.json();
    } catch (error: unknown) {
      if (error instanceof BusinessException) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.error(`HA 历史获取超时(30秒),${entityIds.length} 个实体`);
      } else {
        this.logger.error(
          `获取 HA 历史失败:${getErrorMessage(error)}`,
        );
      }
      throw error instanceof Error
        ? error
        : new BusinessException(ErrorCode.EXTERNAL_ERROR, getErrorMessage(error));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** @returns HA URL 与 Token 是否均已配置。 */
  async isConfigured(): Promise<boolean> {
    const { haUrl, token } = await this.config.getConfig();
    return Boolean(haUrl?.trim() && token?.trim());
  }
  /**
   * 将 YAML 发送到 HA /api/config/core/check_config 进行服务端校验。
   * @param yaml 待校验的 YAML 字符串。
   * @returns 包含 valid（是否有效）与 message（校验信息）的结果对象。
   */
  async validateYaml(yaml: string): Promise<{ valid: boolean; message: string }> {
    return validateHaYamlConfig(
      this.getHaConfig,
      (url, init, timeoutMs) => this.fetchWithTimeout(url, init, timeoutMs),
      yaml,
    );
  }
}
