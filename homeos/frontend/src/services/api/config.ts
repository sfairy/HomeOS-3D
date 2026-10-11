/** 项目配置与布局 REST API 封装 */
import type { AxiosRequestConfig } from 'axios'
import { apiDelete, apiGet, apiPost, apiPut } from './client'

/** 获取全部配置档案列表。 */
export function fetchConfigProfiles(config?: AxiosRequestConfig) {
  return apiGet('/config/profiles', config)
}

/** 获取当前激活的项目。 */
export function fetchActiveProject(config?: AxiosRequestConfig) {
  return apiGet('/config/project/active', config)
}

/** 设置激活的项目。 */
export function setActiveProject(projectId: string, config?: AxiosRequestConfig) {
  return apiPut('/config/project/active', { projectId }, config)
}

/** 获取指定项目详情。 */
export function fetchProject(id: string, config?: AxiosRequestConfig) {
  return apiGet(`/config/project/${encodeURIComponent(id)}`, config)
}

/** 保存项目配置。 */
export function saveProject(id: string, payload: unknown, config?: AxiosRequestConfig) {
  return apiPost(`/config/project/${encodeURIComponent(id)}`, payload, config)
}

/** 删除指定项目。 */
export function deleteProject(id: string, config?: AxiosRequestConfig) {
  return apiDelete(`/config/project/${encodeURIComponent(id)}`, config)
}

/** 更新项目默认配置。 */
export function updateProjectDefaults(
  payload: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiPut('/config/project/defaults', payload, config)
}

/** 获取终端绑定列表。 */
export function fetchTerminalBindings(config?: AxiosRequestConfig) {
  return apiGet('/config/terminal/bindings', config)
}

/** 根据客户端 ID 解析终端档案。 */
export function resolveTerminalProfile(clientId: string, config?: AxiosRequestConfig) {
  return apiGet('/config/terminal/resolve', { ...config, params: { ...config?.params, clientId } })
}

/** 更新当前终端的自绑定配置。 */
export function updateSelfTerminalBinding(
  payload: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiPut('/config/terminal/binding/self', payload, config)
}

/** 管理员更新任意终端绑定。 */
export function upsertTerminalBinding(
  payload: { clientId: string; profileId: string; label?: string },
  config?: AxiosRequestConfig,
) {
  return apiPut('/config/terminal/binding', payload, config)
}

/** 删除指定终端绑定。 */
export function deleteTerminalBinding(clientId: string, config?: AxiosRequestConfig) {
  return apiDelete(`/config/terminal/binding/${encodeURIComponent(clientId)}`, config)
}

/** 列出配置资产文件。 */
export function listConfigAssets(base: string, path: string, config?: AxiosRequestConfig) {
  return apiGet(`/config/${base}?path=${encodeURIComponent(path)}`, config)
}

/** 在配置资产目录中创建文件夹。 */
export function mkdirConfigAsset(base: string, path: string, config?: AxiosRequestConfig) {
  return apiPost(`/config/${base}/mkdir`, { path }, config)
}

/** 上传配置资产文件。 */
export function uploadConfigAsset(
  base: string,
  url: string,
  formData: FormData,
  config?: AxiosRequestConfig,
) {
  return apiPost(url, formData, config)
}

/** 删除配置资产文件。 */
export function deleteConfigAsset(base: string, path: string, config?: AxiosRequestConfig) {
  return apiDelete(`/config/${base}?path=${encodeURIComponent(path)}`, config)
}
