/** 安防面板区域 bootstrap 去重模块。 */

/** 防止多个 SecurityPanelWidget 实例重复 bootstrap 区域到后端 */
//: 持久化标记：浏览器刷新后模块状态会重置，若只靠内存标记，用户在后端
//: 主动删除全部防区（合法操作）后刷新页面就会把旧区域重新推回去。
const STORAGE_KEY = 'homeos.security.panel-zones-bootstrapped'

function readDoneMarker(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeDoneMarker(): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, '1')
  } catch {
    // 隐私模式 / 配额满：退化为仅内存去重
  }
}

let bootstrapDone = readDoneMarker()
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
      if (ok) {
        bootstrapDone = true
        writeDoneMarker()
      }
      return ok
    })
    .finally(() => {
      bootstrapPromise = null
    })
  return bootstrapPromise
}