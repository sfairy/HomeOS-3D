/**
 * HA Config API REST 工具（纯函数，便于单测）
 *
 * 职责：封装 HA KeyBased Config View 的 CRUD 与 Config Flow 交互 ——
 *  - fetchHaConfigRecord / upsertHaConfigRecord / deleteHaConfigRecord：automation/script/template/scene 等配置读写。
 *  - validateHaYamlConfig：core/check_config 校验 YAML 语法。
 *  - haConfigFlowRequest：Config Flow 通用 GET/POST/DELETE。
 *  - upsertTemplateHelperViaFlow：template 集成经 Options/Config Flow 创建或更新（HA 模板必须走 flow，无 KeyBased 直写）。
 * 兼容性：script body 不含 id（id 仅在 URL 路径），其他组件 body 含 id。
 * 关键依赖：API_ERROR、config-flow.util、rest-fetch.util、BusinessException、Logger。
 */
import { API_ERROR } from '../../common/errors/api-error-messages';
import type { HaFlowStep } from '../../shared/ha/config-flow.util';
import { runHaConfigFlow } from '../../shared/ha/config-flow.util';
import { parseHaRestErrorResponse } from '../../shared/ha/rest-fetch.util';
import { BusinessException, ErrorCode, getErrorMessage } from '../../common/utils';
import type { Logger } from '@nestjs/common';

/** 带超时的 fetch 函数类型（由 HaRestClientService 注入） */
type HaConfigFetcher = (
  url: string,
  init: RequestInit,
  timeoutMs?: number,
) => Promise<Response>;

/** HA 连接配置获取器（返回 haUrl + token） */
type HaConfigGetter = () => Promise<{ haUrl: string; token: string }>;

/**
 * 构建 HA Config API 请求体。
 * script 使用 KeyBased Config View，body 中不允许含 id（id 仅在 URL 路径中）；
 * 其他组件在 body 中包含 id 字段。
 * @param component HA 配置组件名。
 * @param configId 配置 ID。
 * @param body 原始请求体。
 * @returns 处理后的请求体。
 */
function buildHaConfigPayload(
  component: string,
  configId: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  if (component === 'script') {
    return Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'id')) as Record<
      string,
      unknown
    >;
  }
  return { ...body, id: configId };
}

/**
 * 拉取单条 HA Config 记录（GET /api/config/{component}/config/{id}）。
 * 404 视为「无此配置」返回 null；鉴权失败回调 onAuthError，其余异常仅告警并返回 null（不抛出）。
 *
 * @param getConfig HA 连接配置获取器。
 * @param fetchWithTimeout 带超时的 fetch。
 * @param onAuthError 鉴权失败回调。
 * @param logger 日志实例。
 * @param component HA 配置组件名。
 * @param configId 配置 ID。
 * @returns 配置记录对象，未配置/不存在/失败时返回 null。
 */
export async function fetchHaConfigRecord(
  getConfig: HaConfigGetter,
  fetchWithTimeout: HaConfigFetcher,
  onAuthError: (status: number) => void,
  logger: Logger,
  component: string,
  configId: string,
): Promise<Record<string, unknown> | null> {
  const { haUrl, token } = await getConfig();
  if (!haUrl || !token) return null;
  try {
    const response = await fetchWithTimeout(
      `${haUrl}/api/config/${component}/config/${encodeURIComponent(configId)}`,
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
    );
    if (response.status === 404) return null;
    if (!response.ok) {
      onAuthError(response.status);
      throw new BusinessException(
        ErrorCode.EXTERNAL_ERROR,
        API_ERROR.HA_REST_RESPONSE_FAILED(response.status),
      );
    }
    return await response.json();
  } catch (err: unknown) {
    logger.warn(`获取 HA ${component} 配置失败 [${configId}]: ${getErrorMessage(err)}`);
    return null;
  }
}

/**
 * 校验 HA YAML 配置语法（POST /api/config/core/check_config）。
 * 未配置 HA URL/Token 时直接返回 invalid；HA 返回非 ok 时拼接响应体作为错误信息。
 *
 * @param getConfig HA 连接配置获取器。
 * @param fetchWithTimeout 带超时的 fetch。
 * @param yaml 待校验的 YAML 文本。
 * @returns 校验结果与提示信息。
 */
export async function validateHaYamlConfig(
  getConfig: HaConfigGetter,
  fetchWithTimeout: HaConfigFetcher,
  yaml: string,
): Promise<{ valid: boolean; message: string }> {
  const { haUrl, token } = await getConfig();
  if (!haUrl || !token) {
    return { valid: false, message: 'HA URL/Token 未配置' };
  }

  try {
    const base = haUrl.replace(/\/$/, '');
    const resp = await fetchWithTimeout(`${base}/api/config/core/check_config`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
      body: yaml,
    });
    if (!resp.ok) return { valid: false, message: 'HA 配置检查失败: ' + (await resp.text()) };
    const r = (await resp.json()) as { result?: string; errors?: string };
    return {
      valid: r.result === 'valid',
      message: r.result === 'valid' ? 'YAML 配置有效' : r.errors || '验证未通过',
    };
  } catch (err: unknown) {
    return { valid: false, message: '验证请求失败: ' + getErrorMessage(err) };
  }
}

/**
 * 创建/更新 HA Config 记录（POST /api/config/{component}/config/{id}，15s 超时）。
 * 经 buildHaConfigPayload 处理 body（script 去 id）；失败时解析 HA 错误响应体并抛 HA_CONFIG_SYNC_FAILED。
 *
 * @param getConfig HA 连接配置获取器。
 * @param fetchWithTimeout 带超时的 fetch。
 * @param onAuthError 鉴权失败回调。
 * @param component HA 配置组件名。
 * @param configId 配置 ID。
 * @param body 请求体（将被 buildHaConfigPayload 规范化）。
 * @returns HA 返回的配置对象；JSON 解析失败时回退返回提交的 payload。
 */
export async function upsertHaConfigRecord(
  getConfig: HaConfigGetter,
  fetchWithTimeout: HaConfigFetcher,
  onAuthError: (status: number) => void,
  component: string,
  configId: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { haUrl, token } = await getConfig();
  if (!haUrl || !token) {
    throw new BusinessException(ErrorCode.VALIDATION_FAILED, API_ERROR.HA_NOT_CONFIGURED);
  }
  const payload = buildHaConfigPayload(component, configId, body);
  const response = await fetchWithTimeout(
    `${haUrl}/api/config/${component}/config/${encodeURIComponent(configId)}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    15000,
  );
  if (!response.ok) {
    onAuthError(response.status);
    const detail = await parseHaRestErrorResponse(response);
    throw new BusinessException(
      ErrorCode.EXTERNAL_ERROR,
      API_ERROR.HA_CONFIG_SYNC_FAILED(component, response.status, detail),
    );
  }
  return await response.json().catch(() => payload);
}

/**
 * 删除 HA Config 记录（DELETE /api/config/{component}/config/{id}）。
 * 404 视为已删除直接返回；失败时拼接响应体片段抛 HA_CONFIG_DELETE_FAILED。
 *
 * @param getConfig HA 连接配置获取器。
 * @param fetchWithTimeout 带超时的 fetch。
 * @param onAuthError 鉴权失败回调。
 * @param component HA 配置组件名。
 * @param configId 配置 ID。
 */
export async function deleteHaConfigRecord(
  getConfig: HaConfigGetter,
  fetchWithTimeout: HaConfigFetcher,
  onAuthError: (status: number) => void,
  component: string,
  configId: string,
): Promise<void> {
  const { haUrl, token } = await getConfig();
  if (!haUrl || !token) {
    throw new BusinessException(ErrorCode.VALIDATION_FAILED, API_ERROR.HA_NOT_CONFIGURED);
  }
  const response = await fetchWithTimeout(
    `${haUrl}/api/config/${component}/config/${encodeURIComponent(configId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (response.status === 404) return;
  if (!response.ok) {
    onAuthError(response.status);
    const detail = await response.text().catch(() => '');
    const hint = detail ? `: ${detail.slice(0, 240)}` : '';
    throw new BusinessException(
      ErrorCode.EXTERNAL_ERROR,
      API_ERROR.HA_CONFIG_DELETE_FAILED(component, response.status, hint),
    );
  }
}

/**
 * 通用 Config Flow 请求（GET/POST/DELETE），20s 超时。
 * 失败时优先解析 HA JSON 错误体（message / errors 字段拼接），无法解析则用原文。
 *
 * @param getConfig HA 连接配置获取器。
 * @param fetchWithTimeout 带超时的 fetch。
 * @param onAuthError 鉴权失败回调。
 * @param method HTTP 方法。
 * @param path HA API 路径（含 /api/config/...）。
 * @param body 请求体（可选）。
 * @returns Config Flow 步骤或原始 JSON 对象。
 */
export async function haConfigFlowRequest(
  getConfig: HaConfigGetter,
  fetchWithTimeout: HaConfigFetcher,
  onAuthError: (status: number) => void,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: Record<string, unknown>,
): Promise<HaFlowStep | Record<string, unknown>> {
  const { haUrl, token } = await getConfig();
  if (!haUrl || !token) {
    throw new BusinessException(ErrorCode.VALIDATION_FAILED, API_ERROR.HA_NOT_CONFIGURED);
  }
  const response = await fetchWithTimeout(
    `${haUrl}${path}`,
    {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
    20000,
  );
  if (!response.ok) {
    onAuthError(response.status);
    const text = await response.text().catch(() => '');
    let message = text;
    try {
      const parsed = JSON.parse(text) as { message?: string; errors?: Record<string, string> };
      if (parsed.message) message = parsed.message;
      else if (parsed.errors) {
        message = Object.entries(parsed.errors)
          .map(([k, v]) => `${k}: ${v}`)
          .join('; ');
      }
    } catch {
      /* 保留原文 */
    }
    throw new BusinessException(
      ErrorCode.EXTERNAL_ERROR,
      API_ERROR.HA_FLOW_FAILED(response.status, message),
    );
  }
  return await response.json();
}

/**
 * 通过 Config Flow 创建或更新 template 集成（HA 模板必须走 flow，无 KeyBased 直写）。
 *
 * 策略：
 *  - 已有 entryId 且域为 template → 走 Options Flow 更新（失败中止 flow 并抛出）。
 *  - 否则走新建 Config Flow（handler=template），完成后返回新 entry_id。
 *  - 两条路径均通过 runHaConfigFlow 推进多步表单；任一步抛出会触发 abortConfigFlow 兜底中止。
 *
 * @param logger 日志实例。
 * @param getConfigEntry 按 entryId 取已有配置项。
 * @param startOptionsFlow 启动 Options Flow（更新已有 entry）。
 * @param submitOptionsFlowStep 提交 Options Flow 步骤。
 * @param startConfigFlow 启动新建 Config Flow。
 * @param submitConfigFlowStep 提交 Config Flow 步骤。
 * @param abortConfigFlow 中止 flow 兜底（失败时不阻断原错误）。
 * @param flowConfig template 表单数据。
 * @param entryId 已有 entryId（可选，提供时优先走更新路径）。
 * @returns entry_id 与标题。
 */
export async function upsertTemplateHelperViaFlow(
  logger: Logger,
  getConfigEntry: (entryId: string) => Promise<Record<string, unknown> | null>,
  startOptionsFlow: (entryId: string) => Promise<HaFlowStep>,
  submitOptionsFlowStep: (flowId: string, data: Record<string, unknown>) => Promise<HaFlowStep>,
  startConfigFlow: (handler: string) => Promise<HaFlowStep>,
  submitConfigFlowStep: (flowId: string, data: Record<string, unknown>) => Promise<HaFlowStep>,
  abortConfigFlow: (flowId: string) => Promise<unknown>,
  flowConfig: Record<string, unknown>,
  entryId?: string | null,
): Promise<{ entry_id: string; title?: string }> {
  if (entryId) {
    const existing = await getConfigEntry(entryId);
    if (existing?.domain === 'template') {
      const initial = await startOptionsFlow(entryId);
      const flowId = initial.flow_id;
      if (!flowId) {
        throw new BusinessException(
          ErrorCode.EXTERNAL_ERROR,
          API_ERROR.HA_TEMPLATE_OPTIONS_FLOW_START_FAILED,
        );
      }
      try {
        const result = await runHaConfigFlow(flowId, initial, flowConfig, (id, data) =>
          submitOptionsFlowStep(id, data),
        );
        return { entry_id: entryId, title: result.title };
      } catch (e) {
        await abortConfigFlow(flowId).catch((abortErr) => {
          logger.warn(`中止 template options flow ${flowId} 失败: ${getErrorMessage(abortErr)}`);
        });
        throw e;
      }
    }
  }
  const initial = await startConfigFlow('template');
  const flowId = initial.flow_id;
  if (!flowId) {
    throw new BusinessException(
      ErrorCode.EXTERNAL_ERROR,
      API_ERROR.HA_TEMPLATE_CONFIG_FLOW_START_FAILED,
    );
  }
  try {
    const result = await runHaConfigFlow(flowId, initial, flowConfig, (id, data) =>
      submitConfigFlowStep(id, data),
    );
    const newId = result.entry_id;
    if (!newId) {
      throw new BusinessException(ErrorCode.EXTERNAL_ERROR, API_ERROR.HA_TEMPLATE_ENTRY_ID_MISSING);
    }
    return { entry_id: newId, title: result.title };
  } catch (e) {
    await abortConfigFlow(flowId).catch((abortErr) => {
      logger.warn(`中止 template config flow ${flowId} 失败: ${getErrorMessage(abortErr)}`);
    });
    throw e;
  }
}
