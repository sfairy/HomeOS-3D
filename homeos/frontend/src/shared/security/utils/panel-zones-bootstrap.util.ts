/**
 * 安防面板区域 bootstrap 去重模块。
 *
 * 职责：
 * - 防止多个 SecurityPanelWidget 实例重复 bootstrap 区域到后端；
 * - 通过模块级 flag + 共享 Promise 保证仅执行一次 bootstrap。
 *
 * 设计说明：多个安防面板小部件可能同时挂载并触发 bootstrap，
 * 此模块确保首个调用执行后续调用复用同一 Promise，成功后标记完成。
 */

/** 防止多个 SecurityPanelWidget 实例重复 bootstrap 区域到后端 */
let bootstrapDone = false
let bootstrapPromise: Promise<boolean> | null = null

/**
 * 保证 bootstrap 仅执行一次。
 *
 * 逻辑：
 * 1. 已完成（bootstrapDone=true）直接返回 true；
 * 2. 进行中（bootstrapPromise 非空）复用同一 Promise；
 * 3. 未开始则执行 run()，成功后标记 bootstrapDone，无论成败最终清空 Promise。
 *
 * @param run 实际执行 bootstrap 的异步函数，返回是否成功
 * @returns 是否成功（已完成或本次执行成功）
 */
export async function bootstrapSecurityPanelZonesOnce(run: () => Promise<boolean>): Promise<boolean> {
  if (bootstrapDone) return true
  if (bootstrapPromise) return bootstrapPromise
  bootstrapPromise = run()
    .then((ok) => {
      if (ok) bootstrapDone = true
      return ok
    })
    .finally(() => {
      bootstrapPromise = null
    })
  return bootstrapPromise
}