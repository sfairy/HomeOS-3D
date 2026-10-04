/**
 * Axios 类型扩展：为 InternalAxiosRequestConfig 增加重试计数字段。
 *
 * 本文件是模块声明扩展（declaration merging），通过 declare module 'axios'
 * 向 axios 的 InternalAxiosRequestConfig 接口注入 _retryCount 字段，
 * 供请求拦截器在重试时记录已重试次数，避免无限重试。
 */
import 'axios'

declare module 'axios' {
  /** InternalAxiosRequestConfig：符号语义见下方声明。 */
  export interface InternalAxiosRequestConfig {
    /** 请求已重试次数（拦截器内部维护，超出上限后不再重试） */
    _retryCount?: number
  }
}