/**
 * API 服务统一入口
 *
 * 职责：聚合所有 API 子模块的导出，提供单一导入入口（apiClient、通用请求方法与各业务模块）。
 * 包含：apiClient 实例、通用请求方法（apiGet/apiPost；apiDelete/apiPut 从 ../api-client 直接引入）以及
 *       earthquake、home-modes、notifications、system、config、security、entities、auth、media、agent 等业务模块。
 * 依赖：../api-client 提供的 Axios 实例与请求封装方法。
 */
export { default as apiClient, apiGet, apiPost } from '../api-client'

export type { ApiRequestConfig } from '../api-client'

export * from './earthquake'

export * from './home-modes'

export * from './notifications'

export * from './system'

export * from './config'

export * from './security'

export * from './entities'

export * from './auth'

export * from './media'

export * from './agent'
