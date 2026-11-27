/**
 * 渲染路径上的 URL 开关读取：同一个 `location.search` 只解析一次。
 *
 * 诊断/回退开关（`?effect-cache=baseline`、`?interaction-batches=baseline` …）以前在每帧的
 * 判定函数里各自 `new URLSearchParams(location.search)`；舞台 iframe 的查询串整页不变，
 * 每帧重解析纯属分配。这里按查询串原文比较缓存，查询串变化（history 改写）时自动重解析。
 */

let cachedSearch: string | null = null
let cachedParams: URLSearchParams = new URLSearchParams()

function currentParams(): URLSearchParams {
  let search = ''
  try {
    search = globalThis.location?.search || ''
  } catch {
    /* 非浏览器环境按无查询串处理 */
  }
  if (search !== cachedSearch) {
    cachedSearch = search
    cachedParams = new URLSearchParams(search)
  }
  return cachedParams
}

/** 读取单个开关原值；不存在时为 null。 */
export function urlFlag(name: string): string | null {
  return currentParams().get(name)
}

/** `?performance-diagnostics=1`。 */
export function isPerformanceDiagnostics(): boolean {
  return urlFlag('performance-diagnostics') === '1'
}
