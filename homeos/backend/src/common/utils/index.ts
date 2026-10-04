/**
 * common/utils 桶文件：统一对外导出业务异常、错误消息与日期工具。
 *
 * 职责：作为 common/utils 模块的对外入口，汇总以下子模块的公共 API：
 *   - business-exception：BusinessException / ErrorCode / notFound / badRequest /
 *     rethrowIfHttpException；
 *   - error-message.util：formatBootstrapFailure / getErrorMessage；
 *   - local-date.util：localDateKey；
 *   - push-time.util：withPushTimestamp。
 * 关键依赖：仅本目录子模块，无外部包依赖。
 */
export {
  BusinessException,
  ErrorCode,
  badRequest,
  notFound,
  rethrowIfHttpException,
} from './business-exception';
export {
  formatBootstrapFailure,
  getErrorMessage,
} from './error-message.util';
export { localDateKey } from './local-date.util';
export { withPushTimestamp } from './push-time.util';
