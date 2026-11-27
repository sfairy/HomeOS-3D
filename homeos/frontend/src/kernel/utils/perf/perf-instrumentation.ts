/**
 * B22 + RUM 的懒加载启动器。
 *
 * main.ts 只保留一个动态 import（首屏入口 chunk 不为采集/守卫付字节）；真正需要同步导入的
 * 依赖都收在这里。启动失败一律静默：采集与守卫都不是应用启动的必要条件。
 */
import { startClientMetrics } from './client-metrics.util'
import { installGlobalWebglContextLossGuard } from './webgl-context-loss-guard.util'

export function startPerfInstrumentation(): void {
  try {
    installGlobalWebglContextLossGuard()
    startClientMetrics()
  } catch {
    /* 采集/守卫初始化失败不应影响应用启动 */
  }
}
