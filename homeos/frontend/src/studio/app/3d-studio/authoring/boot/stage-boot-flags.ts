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
