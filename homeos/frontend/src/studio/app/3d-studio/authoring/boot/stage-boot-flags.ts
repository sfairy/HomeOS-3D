/**
 * 舞台启动的 A/B 开关。
 *
 * 为什么是 URL 参数而不是配置项：这些开关只用于「同一份产物上量两条路径」，
 * 走服务端配置就得为一次 A/B 发两次镜像；而本仓库既有的舞台开关
 * （`wall-trial` / `furniture-runtime` / `reflection-detail` / `effect-cache`）
 * 都是 URL 参数，沿用同一套约定，排查时只要换一个链接。
 *
 * 默认值的原则：**默认为基线（关闭）**。开启侧必须能在不重新构建的前提下退回基线，
 * 否则一旦某台低端设备上出现可见回退（例如灯光烘焙贴图晚到导致的明暗跳变），
 * 就只能再发一版。
 *
 * 已登记开关：
 * - `?light-cache=defer`：首帧不再等待灯光烘焙贴图就绪（`waitForStageReady` 里
 *   最长 1800ms 的自旋），先出画面、贴图就绪后再由后台帧补上。
 */

/** 灯光烘焙贴图延迟就绪开关的查询参数名与开启值。 */
export const LIGHT_CACHE_PARAM = 'light-cache'
export const LIGHT_CACHE_DEFER_VALUE = 'defer'

/** 读取开关所需的最小环境：只依赖 `location.search`，单测可传普通对象。 */
export interface StageBootEnv {
  location?: { search?: string }
}

export interface StageBootFlags {
  /** 首帧是否不等灯光烘焙贴图（`?light-cache=defer`）。 */
  deferLightCache: boolean
}

/** 从 `location.search` 读取舞台启动开关；缺失或非法值一律取基线。 */
export function readStageBootFlags(env: StageBootEnv = globalThis as StageBootEnv): StageBootFlags {
  let lightCacheMode = ''
  try {
    lightCacheMode = new URLSearchParams(env.location?.search || '').get(LIGHT_CACHE_PARAM) || ''
  } catch {
    /* 无 window 的环境（单测 / worker）：按基线处理 */
    lightCacheMode = ''
  }
  return {
    deferLightCache: lightCacheMode === LIGHT_CACHE_DEFER_VALUE,
  }
}

/**
 * 首帧是否跳过灯光烘焙贴图的等待。
 *
 * 单独导出而不是让调用方读 `readStageBootFlags().deferLightCache`：启动路径上只有
 * 这一处关心它，多一层解构没有收益；而单测可以直接对着这个函数断言开关语义。
 */
export function deferLightCacheEnabled(env: StageBootEnv = globalThis as StageBootEnv): boolean {
  return readStageBootFlags(env).deferLightCache
}

/**
 * 灯光烘焙贴图那一步的分阶段标签（给 `stageLoadTiming` / `performance.mark` 用）。
 *
 * 内嵌模式根本不加载烘焙贴图，所以它不是一个「等没等到」的问题，单独一个标签才不会
 * 与延迟路径混在一起计数。A/B 两组的梯子要靠这个标签区分，取错就等于两组数据无法比较。
 */
export function lightCachePhase(isEmbedStageMode: boolean, lightCacheReady: boolean): string {
  if (isEmbedStageMode) return 'light-cache-not-required'
  return lightCacheReady ? 'light-cache-ready' : 'light-cache-deferred'
}

/**
 * 等待烘焙贴图就绪并上报分阶段标签。
 *
 * 「先等、再按结果打标签」这两步必须贴在一起：拆成两行会让调用方各自持有 `ready`
 * 局部变量，任何一次重构都可能把打标签挪到等待之前（标签就永远报 ready）。
 * 等待本身仍由调用方传入，本模块不依赖舞台运行时。
 */
export async function awaitLightCachePhase(
  isEmbedStageMode: boolean,
  waitForStageReady: () => Promise<boolean>,
  onPhase: (phase: string) => void,
): Promise<void> {
  const ready = await waitForStageReady()
  onPhase(lightCachePhase(isEmbedStageMode, ready))
}
