/**
 * 联动引擎 REST API 封装：automation / scene / script / template-entity / ha-sync
 *
 * 所属模块：前端服务层（services/api/）
 * 职责：覆盖自动化、场景、脚本、模板实体的 CRUD、触发/执行、HA 双向同步（含漂移修复、批量同步）、
 *       试运行（dry-run）、查重、占位符替换、YAML 校验、Blueprint 草稿、执行历史与 HA WebRTC 信令。
 * 依赖：../api-client 提供的 apiGet / apiPost / apiPut / apiDelete。
 * 端点范围：/automation、/scene、/script、/template-entity、/ha-sync、/ha/webrtc、
 *           /system/execution-history、/ha-sync/blueprints、/automation/variables 等。
 */
import type { AxiosRequestConfig } from 'axios'
import { apiDelete, apiGet, apiPost, apiPut } from '../api-client'

/** 联动引擎条目类型：自动化 / 场景 / 脚本 / 模板实体。 */
export type OrchestratorKind = 'automation' | 'scene' | 'script' | 'template-entity'

/** HA 导入端点路径映射表（按 kind 区分）。 */
const HA_IMPORT_PATHS: Record<OrchestratorKind, string> = {
  automation: '/ha-sync/automations/import',
  scene: '/ha-sync/scenes/import',
  script: '/ha-sync/scripts/import',
  'template-entity': '/ha-sync/templates/import',
}

/** 生成列表端点路径：/{kind}。 */
function orchestratorListPath(kind: OrchestratorKind) {
  return `/${kind}`
}

/** 生成 HA 导入端点路径（按 kind 查表）。 */
function orchestratorHaImportPath(kind: OrchestratorKind) {
  return HA_IMPORT_PATHS[kind]
}

/** 生成单条同步预览端点：/{apiPrefix}/{id}/sync-preview。 */
function orchestratorSyncPreviewPath(apiPrefix: string, id: string) {
  return `/${apiPrefix}/${id}/sync-preview`
}

/** 生成单条漂移修复端点：/{apiPrefix}/{id}/repair-drift?direction={direction}。 */
function orchestratorRepairDriftPath(apiPrefix: string, id: string, direction: string) {
  return `/${apiPrefix}/${id}/repair-drift?direction=${direction}`
}

/**
 * 获取联动条目列表。
 * 对应后端 endpoint：GET /{kind}
 * @param kind 联动类型
 * @returns 条目数组
 */
export function fetchOrchestratorList(kind: OrchestratorKind, config?: AxiosRequestConfig) {
  return apiGet(orchestratorListPath(kind), config)
}

/**
 * 创建联动条目。
 * 对应后端 endpoint：POST /{kind}
 * @param kind 联动类型
 * @param payload 条目配置
 * @returns 创建结果
 */
export function createOrchestratorItem(
  kind: OrchestratorKind,
  payload: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiPost(orchestratorListPath(kind), payload, config)
}

/**
 * 更新联动条目。
 * 对应后端 endpoint：PUT /{kind}/{id}
 * @param kind 联动类型
 * @param id 条目标识
 * @param payload 待更新字段
 * @returns 操作结果
 */
export function updateOrchestratorItem(
  kind: OrchestratorKind,
  id: string,
  payload: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiPut(`/${kind}/${id}`, payload, config)
}

/**
 * 删除联动条目。
 * 对应后端 endpoint：DELETE /{kind}/{id}
 * @param kind 联动类型
 * @param id 条目标识
 * @returns 操作结果
 */
export function deleteOrchestratorItem(
  kind: OrchestratorKind,
  id: string,
  config?: AxiosRequestConfig,
) {
  return apiDelete(`/${kind}/${id}`, config)
}

/**
 * 手动触发联动条目（自动化执行/场景运行/脚本执行）。
 * 对应后端 endpoint：POST /{kind}/{id}/trigger
 * @param kind 联动类型
 * @param id 条目标识
 * @returns 操作结果
 */
export function triggerOrchestratorItem(
  kind: OrchestratorKind,
  id: string,
  config?: AxiosRequestConfig,
) {
  return apiPost(`/${kind}/${id}/trigger`, undefined, config)
}

/**
 * 自动化试运行（dry-run）：按当前状态评估触发就绪与条件满足，不执行动作。
 * 对应后端 endpoint：POST /automation/dry-run
 * @param payload.id 已存自动化 ID；payload.yaml 待评估 YAML（二选一）
 * @returns 试运行结果
 */
export function dryRunAutomation(
  payload: { id?: string; yaml?: string },
  config?: AxiosRequestConfig,
) {
  return apiPost('/automation/dry-run', payload, config)
}

/**
 * 执行指定场景。
 * 对应后端 endpoint：POST /scene/{id}/execute
 * @param id 场景标识
 * @returns 操作结果
 */
export function executeScene(id: string, config?: AxiosRequestConfig) {
  return apiPost(`/scene/${id}/execute`, undefined, config)
}

/**
 * 取消正在运行的场景。
 * 对应后端 endpoint：POST /scene/{id}/cancel
 * @param id 场景标识
 * @returns 操作结果
 */
export function cancelScene(id: string, config?: AxiosRequestConfig) {
  return apiPost(`/scene/${id}/cancel`, undefined, config)
}

/**
 * 获取指定联动类型的内置模板列表。
 * 对应后端 endpoint：GET /{kind}/builtin/templates
 * @param kind 联动类型
 * @returns 模板数组
 */
export function fetchOrchestratorBuiltinTemplates(
  kind: OrchestratorKind,
  config?: AxiosRequestConfig,
) {
  return apiGet(`/${kind}/builtin/templates`, config)
}

/**
 * 安装指定内置模板。
 * 对应后端 endpoint：POST /{kind}/builtin/install/{templateId}
 * @param kind 联动类型
 * @param templateId 模板标识
 * @returns 安装结果
 */
export function installOrchestratorBuiltinTemplate(
  kind: OrchestratorKind,
  templateId: string,
  config?: AxiosRequestConfig,
) {
  return apiPost(`/${kind}/builtin/install/${templateId}`, undefined, config)
}

/**
 * 发现 HA 中可导入的联动条目。
 * 对应后端 endpoint：GET /ha-sync/{kind}s/import
 * @param kind 联动类型
 * @param params 过滤参数
 * @returns HA 端条目数组
 */
export function discoverHaOrchestratorItems(
  kind: OrchestratorKind,
  params?: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiGet(orchestratorHaImportPath(kind), {
    ...config,
    params: { ...config?.params, ...params },
  })
}

/**
 * 获取单条联动条目同步到 HA 的预览（差异/冲突）。
 * 对应后端 endpoint：GET /{apiPrefix}/{id}/sync-preview
 * @param apiPrefix 联动类型前缀
 * @param id 条目标识
 * @returns 同步预览
 */
export function fetchOrchestratorSyncPreview(
  apiPrefix: string,
  id: string,
  config?: AxiosRequestConfig,
) {
  return apiGet(orchestratorSyncPreviewPath(apiPrefix, id), config)
}

/**
 * 将单条联动条目同步至 HA。
 * 对应后端 endpoint：POST /{apiPrefix}/{id}/sync-to-ha
 * @param apiPrefix 联动类型前缀
 * @param id 条目标识
 * @returns 操作结果
 */
export function syncOrchestratorItemToHa(
  apiPrefix: string,
  id: string,
  config?: AxiosRequestConfig,
) {
  return apiPost(`/${apiPrefix}/${id}/sync-to-ha`, undefined, config)
}

/**
 * 修复单条联动条目与 HA 的漂移（按 direction 指定方向）。
 * 对应后端 endpoint：POST /{apiPrefix}/{id}/repair-drift?direction={direction}
 * @param apiPrefix 联动类型前缀
 * @param id 条目标识
 * @param direction 同步方向（to-ha / from-ha 等）
 * @returns 操作结果
 */
export function repairOrchestratorDrift(
  apiPrefix: string,
  id: string,
  direction: string,
  config?: AxiosRequestConfig,
) {
  return apiPost(orchestratorRepairDriftPath(apiPrefix, id, direction), undefined, config)
}

/**
 * 将指定类型全部条目同步到 HA。
 * 对应后端 endpoint：POST /{apiPrefix}/sync/all-to-ha
 * @param apiPrefix 联动类型前缀
 * @returns 操作结果
 */
export function syncAllOrchestratorToHa(apiPrefix: string, config?: AxiosRequestConfig) {
  return apiPost(`/${apiPrefix}/sync/all-to-ha`, undefined, config)
}

/**
 * 批量修复指定类型的全部漂移。
 * 对应后端 endpoint：POST /{apiPrefix}/sync/repair-all-drift?direction={direction}
 * @param apiPrefix 联动类型前缀
 * @param direction 同步方向
 * @returns 操作结果
 */
export function repairAllOrchestratorDrift(
  apiPrefix: string,
  direction: string,
  config?: AxiosRequestConfig,
) {
  return apiPost(`/${apiPrefix}/sync/repair-all-drift?direction=${direction}`, undefined, config)
}

/**
 * 从 HA 拉取条目到本地（覆盖式同步）。
 * 对应后端 endpoint：POST /{apiPrefix}/sync/pull-from-ha
 * @param apiPrefix 联动类型前缀
 * @param params 过滤参数
 * @returns 操作结果
 */
export function pullOrchestratorFromHa(
  apiPrefix: string,
  params?: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiPost(`/${apiPrefix}/sync/pull-from-ha`, null, {
    ...config,
    params: { ...config?.params, ...params },
  })
}

/**
 * 按 HA 配置 ID 同步单条联动条目到本地。
 * 对应后端 endpoint：POST /{apiPrefix}/sync/from-ha
 * @param apiPrefix 联动类型前缀
 * @param haConfigId HA 配置标识
 * @param extra 附加参数
 * @returns 操作结果
 */
export function syncOrchestratorFromHa(
  apiPrefix: string,
  haConfigId: string,
  extra?: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiPost(`/${apiPrefix}/sync/from-ha`, { haConfigId, ...extra }, config)
}

/**
 * 从 HA 移除联动条目（同步删除）。
 * 对应后端 endpoint：POST /{apiPrefix}/sync/remove-from-ha
 * @param apiPrefix 联动类型前缀
 * @param payload 标识载荷
 * @returns 操作结果
 */
export function removeOrchestratorFromHa(
  apiPrefix: string,
  payload: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiPost(`/${apiPrefix}/sync/remove-from-ha`, payload, config)
}

/**
 * 获取单条联动条目详情。
 * 对应后端 endpoint：GET /{kind}/{id}
 * @param kind 联动类型
 * @param id 条目标识
 * @returns 条目详情
 */
export function fetchOrchestratorItem(
  kind: OrchestratorKind,
  id: string,
  config?: AxiosRequestConfig,
) {
  return apiGet(`/${kind}/${id}`, config)
}

/**
 * 切换自动化启用状态。
 * 对应后端 endpoint：POST /automation/{id}/toggle
 * @param id 自动化标识
 * @returns 操作结果
 */
export function toggleAutomation(id: string, config?: AxiosRequestConfig) {
  return apiPost(`/automation/${id}/toggle`, undefined, config)
}

/**
 * 批量切换自动化启用状态。
 * 对应后端 endpoint：POST /automation/batch-toggle
 * @param ids 自动化 ID 数组
 * @param enabled 目标状态
 * @returns 操作结果
 */
export function batchToggleAutomations(
  ids: string[],
  enabled: boolean,
  config?: AxiosRequestConfig,
) {
  return apiPost('/automation/batch-toggle', { ids, enabled }, config)
}

/**
 * 自动化规则查重：按触发器/条件/动作签名检测语义重复。
 * 对应后端 endpoint：POST /automation/check-duplicate
 * @param payload.yaml 待检测 YAML；payload.excludeId 排除已存 ID
 * @returns 重复检测结果
 */
export function checkAutomationDuplicate(
  payload: { yaml?: string; excludeId?: string },
  config?: AxiosRequestConfig,
) {
  return apiPost('/automation/check-duplicate', payload, config)
}

/**
 * 执行脚本（可携带参数）。
 * 对应后端 endpoint：POST /script/{id}/execute
 * @param id 脚本标识
 * @param payload 执行参数
 * @returns 执行结果
 */
export function executeScript(
  id: string,
  payload?: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiPost(`/script/${id}/execute`, payload, config)
}

/**
 * 获取联动条目占位符列表（用于模板填充）。
 * 对应后端 endpoint：GET /{kind}/{id}/placeholders
 * @param kind 联动类型
 * @param id 条目标识
 * @returns 占位符数组
 */
export function fetchOrchestratorPlaceholders(
  kind: OrchestratorKind,
  id: string,
  config?: AxiosRequestConfig,
) {
  return apiGet(`/${kind}/${id}/placeholders`, config)
}

/**
 * 替换联动条目占位符为实际值（一次性回写）。
 * 对应后端 endpoint：POST /{kind}/{id}/replace-placeholders
 * @param kind 联动类型
 * @param id 条目标识
 * @param replacements 占位符到实际值的映射
 * @returns 操作结果
 */
export function replaceOrchestratorPlaceholders(
  kind: OrchestratorKind,
  id: string,
  replacements: Record<string, string>,
  config?: AxiosRequestConfig,
) {
  return apiPost(`/${kind}/${id}/replace-placeholders`, { replacements }, config)
}

/**
 * 校验联动 YAML：按 payload.type 路由到 /{type}/validate-yaml，否则走 /ha-sync/validate-yaml。
 * @param payload.type 联动类型（automation/script/scene）；payload.yaml 待校验内容
 * @returns 校验结果
 */
export function validateOrchestratorYaml(
  payload: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  const type = String(payload?.type || '').trim()
  if (type === 'automation' || type === 'script' || type === 'scene') {
    return apiPost(`/${type}/validate-yaml`, { yaml: payload.yaml }, config)
  }
  return apiPost('/ha-sync/validate-yaml', payload, config)
}

/**
 * 获取自动化 Blueprint 列表。
 * 对应后端 endpoint：GET /ha-sync/blueprints/automation
 * @returns Blueprint 数组
 */
export function fetchAutomationBlueprints(config?: AxiosRequestConfig) {
  return apiGet('/ha-sync/blueprints/automation', config)
}

/**
 * 获取自动化 Blueprint 草稿内容。
 * 对应后端 endpoint：GET /ha-sync/blueprints/automation/draft
 * @param filename Blueprint 文件名
 * @returns 草稿内容
 */
export function fetchAutomationBlueprintDraft(filename: string, config?: AxiosRequestConfig) {
  return apiGet('/ha-sync/blueprints/automation/draft', {
    ...config,
    params: { ...config?.params, filename },
  })
}

/**
 * 创建模板实体。
 * 对应后端 endpoint：POST /template-entity
 * @param payload 模板实体配置
 * @returns 创建结果
 */
export function createTemplateEntity(
  payload: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiPost('/template-entity', payload, config)
}

/**
 * 更新模板实体。
 * 对应后端 endpoint：PUT /template-entity/{id}
 * @param id 模板实体标识
 * @param payload 待更新字段
 * @returns 操作结果
 */
export function updateTemplateEntity(
  id: string,
  payload: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiPut(`/template-entity/${id}`, payload, config)
}

/**
 * 删除模板实体。
 * 对应后端 endpoint：DELETE /template-entity/{id}
 * @param id 模板实体标识
 * @returns 操作结果
 */
export function deleteTemplateEntity(id: string, config?: AxiosRequestConfig) {
  return apiDelete(`/template-entity/${id}`, config)
}

/**
 * 通过 YAML 导入模板实体。
 * 对应后端 endpoint：POST /template-entity/import-yaml
 * @param payload YAML 内容
 * @returns 导入结果
 */
export function importTemplateEntityYaml(
  payload: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiPost('/template-entity/import-yaml', payload, config)
}

/**
 * 通过配置对象导入模板实体。
 * 对应后端 endpoint：POST /template-entity/import-config
 * @param payload 配置对象
 * @returns 导入结果
 */
export function importTemplateEntityConfig(
  payload: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiPost('/template-entity/import-config', payload, config)
}

/**
 * 获取模板实体 HA 配置写入状态（是否已同步到 HA configuration.yaml）。
 * 对应后端 endpoint：GET /template-entity/ha-config/status
 * @returns 同步状态
 */
export function fetchTemplateEntityHaConfigStatus(config?: AxiosRequestConfig) {
  return apiGet('/template-entity/ha-config/status', config)
}

/**
 * 将模板实体写入 HA configuration（持久化）。
 * 对应后端 endpoint：POST /template-entity/{id}/write-ha-config
 * @param id 模板实体标识
 * @returns 操作结果
 */
export function writeTemplateEntityHaConfig(id: string, config?: AxiosRequestConfig) {
  return apiPost(`/template-entity/${id}/write-ha-config`, undefined, config)
}

/**
 * 从 HA 拉取模板实体配置覆盖本地。
 * 对应后端 endpoint：POST /template-entity/{id}/pull-ha-config
 * @param id 模板实体标识
 * @returns 操作结果
 */
export function pullTemplateEntityHaConfig(id: string, config?: AxiosRequestConfig) {
  return apiPost(`/template-entity/${id}/pull-ha-config`, undefined, config)
}

/**
 * 获取联动执行历史（自动化/场景/脚本运行记录）。
 * 对应后端 endpoint：GET /system/execution-history
 * @param params 过滤/分页参数
 * @returns 执行历史数组
 */
export function fetchExecutionHistory(
  params?: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiGet('/system/execution-history', {
    ...config,
    params: { ...config?.params, ...params },
  })
}

/**
 * 清空联动执行历史。
 * 对应后端 endpoint：DELETE /system/execution-history
 * @param params 过滤参数
 * @returns 操作结果
 */
export function clearExecutionHistory(
  params?: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiDelete('/system/execution-history', {
    ...config,
    params: { ...config?.params, ...params },
  })
}

/**
 * 测试 HA 连接（用于配置时校验 URL/Token）。
 * 对应后端 endpoint：POST /ha/test-connection
 * @param payload 连接配置
 * @returns 测试结果
 */
export function testHaConnection(payload: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPost('/ha/test-connection', payload, config)
}

/**
 * 获取 HA 同步状态总览（各类型最近一次同步时间/结果）。
 * 对应后端 endpoint：GET /ha-sync/status
 * @returns 同步状态
 */
export function fetchHaSyncStatus(config?: AxiosRequestConfig) {
  return apiGet('/ha-sync/status', config)
}

/**
 * 发送 WebRTC ICE Candidate（HA 摄像头/WebRTC 信令）。
 * 对应后端 endpoint：POST /ha/webrtc/candidate
 * @param payload 信令载荷
 * @returns 操作结果
 */
export function sendWebRtcCandidate(payload: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPost('/ha/webrtc/candidate', payload, config)
}

/**
 * 关闭 HA WebRTC 会话。
 * 对应后端 endpoint：POST /ha/webrtc/close
 * @param payload 会话标识
 * @returns 操作结果
 */
export function closeWebRtcSession(payload: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPost('/ha/webrtc/close', payload, config)
}

/**
 * 获取自动化分析摘要（触发/执行统计）。
 * 对应后端 endpoint：GET /automation/analytics/summary
 * @param params 过滤/时间窗参数
 * @returns 分析摘要
 */
export function fetchAutomationAnalyticsSummary(
  params?: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiGet('/automation/analytics/summary', {
    ...config,
    params: { ...config?.params, ...params },
  })
}

/**
 * 获取自动化变量列表（按 scope/ruleId 过滤）。
 * 对应后端 endpoint：GET /automation/variables
 * @param params.scope 作用域；params.ruleId 关联自动化 ID
 * @returns 变量数组
 */
export function fetchAutomationVariables(
  params?: { scope?: string; ruleId?: string },
  config?: AxiosRequestConfig,
) {
  return apiGet('/automation/variables', { ...config, params: { ...config?.params, ...params } })
}

/**
 * 创建自动化变量。
 * 对应后端 endpoint：POST /automation/variables
 * @param payload 变量定义
 * @returns 创建结果
 */
export function createAutomationVariable(
  payload: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiPost('/automation/variables', payload, config)
}

/**
 * 更新自动化变量。
 * 对应后端 endpoint：PUT /automation/variables/{id}
 * @param id 变量标识
 * @param payload 待更新字段
 * @returns 操作结果
 */
export function updateAutomationVariable(
  id: string,
  payload: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiPut(`/automation/variables/${id}`, payload, config)
}

/**
 * 删除自动化变量。
 * 对应后端 endpoint：DELETE /automation/variables/{id}
 * @param id 变量标识
 * @returns 操作结果
 */
export function deleteAutomationVariable(id: string, config?: AxiosRequestConfig) {
  return apiDelete(`/automation/variables/${id}`, config)
}
