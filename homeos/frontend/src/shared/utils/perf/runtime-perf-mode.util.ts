/**
 * 运行时性能档位（自动降档）
 * ---------------------------------------------------------------
 * 设备能力 / 帧率回落 / 实体规模带来的降档属于**当前终端的运行时状态**，
 * 不能写进 `layoutConfig.performanceMode`：
 *  - 布局配置是多终端共享的，写进去会把平板/低端机的档位同步给所有设备；
 *  - 深 watch 会把它标成「未保存的更改」，用户在设置页什么都没改也会被
 *    离开确认拦住（「全局布局有 1 项未保存的更改」），点保存还会真的落库。
 *
 * 因此自动降档单独放在这里，只影响渲染（壳层 class / 毛玻璃 / 时钟 / 图表动画），
 * 用户手动选择的档位仍然只在设置页保存时写入布局。
 */
import { ref } from 'vue'

export type PerfMode = 'high' | 'medium' | 'low'

const RANK: Record<PerfMode, number> = { low: 1, medium: 2, high: 3 }

/** 归一化性能档位：未知值按 high（默认档）处理 */
export function normalizePerfMode(value: unknown): PerfMode {
  return value === 'low' || value === 'medium' ? value : 'high'
}

/** 自动降档结果；null 表示没有自动降档，按用户保存的档位运行 */
const autoPerformanceMode = ref<PerfMode | null>(null)

/** 供模板 / watch 订阅自动档位（只读语义，写入请走 set/clear） */
export const autoPerformanceModeRef = autoPerformanceMode

/** 当前自动降档档位（null = 未降档） */
export function getAutoPerformanceMode(): PerfMode | null {
  return autoPerformanceMode.value
}

/**
 * 设置自动降档，只降不升：多个来源（设备能力 / FPS / 实体规模）同时报告时取最低档。
 * 传 `high` 或空值等价于清除自动降档。
 */
export function setAutoPerformanceMode(mode: unknown): void {
  const next = normalizePerfMode(mode)
  if (next === 'high') {
    clearAutoPerformanceMode()
    return
  }
  const current = autoPerformanceMode.value
  if (current && RANK[current] <= RANK[next]) return
  autoPerformanceMode.value = next
}

/** 清除自动降档（用户手动选档 / 帧率恢复后调用） */
export function clearAutoPerformanceMode(): void {
  if (autoPerformanceMode.value === null) return
  autoPerformanceMode.value = null
}

/**
 * 当前终端实际生效的档位 = 用户保存档位与自动降档里更低的那个。
 * 自动降档永远不高于用户选择，避免「自动」把用户显式选的低档抬高。
 */
export function resolveEffectivePerformanceMode(saved?: string | null): PerfMode {
  const base = normalizePerfMode(saved)
  const auto = autoPerformanceMode.value
  if (!auto) return base
  return RANK[auto] < RANK[base] ? auto : base
}
