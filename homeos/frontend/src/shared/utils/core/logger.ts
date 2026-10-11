/**
 * @module core/logger
 * @description 前端统一日志工具。
 *
 * 输出策略：
 *  - dev：全级别输出到 console（error/warn/info/debug）；
 *  - prod：仅 error 输出（便于大屏现场排障，避免生产环境噪声）。
 *
 * 所有日志统一加 [HomeOS:LEVEL] 前缀，便于在浏览器控制台过滤。
 *
 * 依赖：import.meta.env（Vite 环境变量）。
 */
/* eslint-disable no-console -- 本模块为 console 封装层 */

/** 是否为开发环境（生产环境下降级只输出 error） */
const isDev = import.meta.env?.DEV ?? false

/** 日志附加参数类型 */
type LogArgs = unknown[]

/** 控制台日志全角标点 → 半角 */
function toHalfWidthPunct(text: string): string {
  return text
    .replaceAll('…', '...')
    .replaceAll('——', '--')
    .replaceAll('：', ':')
    .replaceAll('，', ',')
    .replaceAll('。', '.')
    .replaceAll('（', '(')
    .replaceAll('）', ')')
    .replaceAll('！', '!')
    .replaceAll('？', '?')
    .replaceAll('；', ';')
    .replaceAll('、', ',')
    .replaceAll('【', '[')
    .replaceAll('】', ']')
    .replaceAll('「', '"')
    .replaceAll('」', '"')
    .replaceAll('『', '"')
    .replaceAll('』', '"')
    .replaceAll('—', '-')
    .replaceAll('～', '~')
    .replaceAll('．', '.')
}

/** 统一拼接 [HomeOS:LEVEL] 前缀,便于控制台检索 */
function prefix(level: string, msg: string): string {
  return `[HomeOS:${level}] ${toHalfWidthPunct(msg)}`
}

/** logger：对象常量，字段 / 方法语义见定义处。 */
export const logger = {
  /** 错误日志：始终输出（dev/prod 均输出），用于需要现场排查的严重问题 */
  error(msg: string, ...args: LogArgs): void {
    console.error(prefix('ERROR', msg), ...args)
  },
  /** 警告日志：仅 dev 输出 */
  warn(msg: string, ...args: LogArgs): void {
    if (isDev) console.warn(prefix('WARN', msg), ...args)
  },
  /** 信息日志：仅 dev 输出 */
  info(msg: string, ...args: LogArgs): void {
    if (isDev) console.log(prefix('INFO', msg), ...args)
  },
  /** 调试日志：仅 dev 输出 */
  debug(msg: string, ...args: LogArgs): void {
    if (isDev) console.debug(prefix('DEBUG', msg), ...args)
  },
}
