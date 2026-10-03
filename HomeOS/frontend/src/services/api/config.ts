/**
 * 项目配置与布局 REST API 封装
 *
 * 所属模块：前端服务层（services/api/）
 * 职责：封装项目档案、终端绑定、配置导入导出、资产文件管理等接口。
 * 依赖：../api-client 提供的 apiGet / apiPost / apiPut / apiDelete。
 * 端点范围：/config/profiles、/config/project/*、/config/terminal/*、/config/all/*、/config/{base}（资产）。
 */
import type { AxiosRequestConfig } from 'axios'
import { apiDelete, apiGet, apiPost, apiPut } from '../api-client'

/**
 * 获取全部配置档案列表。
 * 对应后端 endpoint：GET /config/profiles
 * @returns 档案列表
 */
export function fetchConfigProfiles(config?: AxiosRequestConfig) {
  return apiGet('/config/profiles', config)
}

/**
 * 获取当前激活的项目。
 * 对应后端 endpoint：GET /config/project/active
 * @returns 当前项目信息
 */
export function fetchActiveProject(config?: AxiosRequestConfig) {
  return apiGet('/config/project/active', config)
}

/**
 * 设置激活的项目。
 * 对应后端 endpoint：PUT /config/project/active
 * @param projectId 项目标识
 * @returns 操作结果
 */
export function setActiveProject(projectId: string, config?: AxiosRequestConfig) {
  return apiPut('/config/project/active', { projectId }, config)
}

/**
 * 获取指定项目详情。
 * 对应后端 endpoint：GET /config/project/{id}
 * @param id 项目标识
 * @returns 项目详情
 */
export function fetchProject(id: string, config?: AxiosRequestConfig) {
  return apiGet(`/config/project/${encodeURIComponent(id)}`, config)
}

/**
 * 保存项目配置。
 * 对应后端 endpoint：POST /config/project/{id}
 * @param id 项目标识
 * @param payload 项目配置
 * @returns 保存结果
 */
export function saveProject(id: string, payload: unknown, config?: AxiosRequestConfig) {
  return apiPost(`/config/project/${encodeURIComponent(id)}`, payload, config)
}

/**
 * 删除指定项目。
 * 对应后端 endpoint：DELETE /config/project/{id}
 * @param id 项目标识
 * @returns 操作结果
 */
export function deleteProject(id: string, config?: AxiosRequestConfig) {
  return apiDelete(`/config/project/${encodeURIComponent(id)}`, config)
}

/**
 * 更新项目默认配置。
 * 对应后端 endpoint：PUT /config/project/defaults
 * @param payload 默认配置载荷
 * @returns 操作结果
 */
export function updateProjectDefaults(
  payload: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiPut('/config/project/defaults', payload, config)
}

/**
 * 获取终端绑定列表。
 * 对应后端 endpoint：GET /config/terminal/bindings
 * @returns 终端绑定列表
 */
export function fetchTerminalBindings(config?: AxiosRequestConfig) {
  return apiGet('/config/terminal/bindings', config)
}

/**
 * 根据客户端 ID 解析终端档案。
 * 对应后端 endpoint：GET /config/terminal/resolve
 * @param clientId 客户端标识
 * @returns 终端档案信息
 */
export function resolveTerminalProfile(clientId: string, config?: AxiosRequestConfig) {
  return apiGet('/config/terminal/resolve', { ...config, params: { ...config?.params, clientId } })
}

/**
 * 更新当前终端的自绑定配置。
 * 对应后端 endpoint：PUT /config/terminal/binding/self
 * @param payload 绑定配置
 * @returns 操作结果
 */
export function updateSelfTerminalBinding(
  payload: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiPut('/config/terminal/binding/self', payload, config)
}

/**
 * 管理员更新任意终端绑定。
 * 对应后端 endpoint：PUT /config/terminal/binding
 */
export function upsertTerminalBinding(
  payload: { clientId: string; profileId: string; label?: string },
  config?: AxiosRequestConfig,
) {
  return apiPut('/config/terminal/binding', payload, config)
}

/**
 * 删除指定终端绑定。
 * 对应后端 endpoint：DELETE /config/terminal/binding/{clientId}
 * @param clientId 客户端标识
 * @returns 操作结果
 */
export function deleteTerminalBinding(clientId: string, config?: AxiosRequestConfig) {
  return apiDelete(`/config/terminal/binding/${encodeURIComponent(clientId)}`, config)
}

/**
 * 导出全部配置。
 * 对应后端 endpoint：GET /config/all/export
 * @returns 导出的配置数据
 */
export function exportAllConfig(config?: AxiosRequestConfig) {
  return apiGet('/config/all/export', config)
}

/**
 * 导入全部配置。
 * 对应后端 endpoint：POST /config/all/import
 * @param payload 配置数据
 * @returns 导入结果
 */
export function importAllConfig(payload: unknown, config?: AxiosRequestConfig) {
  return apiPost('/config/all/import', payload, config)
}

/**
 * 列出配置资产文件。
 * 对应后端 endpoint：GET /config/{base}?path={path}
 * @param base 资产基目录
 * @param path 子路径
 * @returns 文件列表
 */
export function listConfigAssets(base: string, path: string, config?: AxiosRequestConfig) {
  return apiGet(`/config/${base}?path=${encodeURIComponent(path)}`, config)
}

/**
 * 在配置资产目录中创建文件夹。
 * 对应后端 endpoint：POST /config/{base}/mkdir
 * @param base 资产基目录
 * @param path 文件夹路径
 * @returns 操作结果
 */
export function mkdirConfigAsset(base: string, path: string, config?: AxiosRequestConfig) {
  return apiPost(`/config/${base}/mkdir`, { path }, config)
}

/**
 * 上传配置资产文件。
 * 对应后端 endpoint：POST {url}
 * @param base 资产基目录
 * @param url 上传地址
 * @param formData 表单数据
 * @returns 上传结果
 */
export function uploadConfigAsset(
  base: string,
  url: string,
  formData: FormData,
  config?: AxiosRequestConfig,
) {
  return apiPost(url, formData, config)
}

/**
 * 删除配置资产文件。
 * 对应后端 endpoint：DELETE /config/{base}?path={path}
 * @param base 资产基目录
 * @param path 文件路径
 * @returns 操作结果
 */
export function deleteConfigAsset(base: string, path: string, config?: AxiosRequestConfig) {
  return apiDelete(`/config/${base}?path=${encodeURIComponent(path)}`, config)
}
