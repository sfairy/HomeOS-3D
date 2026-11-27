/**
 * @file api-error-codes.ts
 * @module @/shared/constants/api-error-codes
 * @description 后端稳定 `apiErrorCode` 的前端常量表（studio3d / interaction3d / 显示图片 / HA）。
 *
 * 为什么要有这张表：后端把「中文文案」本地化后，`apiErrorCode` 是唯一稳定的判定依据
 * （见 `backend/src/platform/core/http/errors.py` 的 `API_ERROR` 码表）。前端若用
 * `message.includes('…')` 判定，改一句文案就换一次接口语义。这里集中列出本仓库会消费的码，
 * 供 `switch` / 映射使用。
 *
 * 收录范围：只收「前端需要按码分支」的码。仅用于展示的文案仍走后端 `message`。
 */

/** studio3d 装饰模型库 / 柔光范围 / 绑定冲突。 */
export const STUDIO3D_ERROR_CODES = {
  /** 模型本身不合法（结构、网格、内嵌贴图、尺寸等）；具体原因在 `message` 里。 */
  modelInvalid: 'STUDIO3D_MODEL_INVALID',
  /** 模型超过体积上限。 */
  modelTooLarge: 'STUDIO3D_MODEL_TOO_LARGE',
  /** 引用的模型不存在（可能已删除）。 */
  modelNotFound: 'STUDIO3D_MODEL_NOT_FOUND',
  /** 当前户型没有任何可用的静态装饰。 */
  sceneModelMissing: 'STUDIO3D_SCENE_MODEL_MISSING',
  /** 保存时发现场景引用的装饰已被删除。 */
  bindingConflict: 'STUDIO3D_BINDING_CONFLICT',
  /** 保存的户型来源无法读取。 */
  sceneUnavailable: 'STUDIO3D_SCENE_UNAVAILABLE',
  /** 柔光范围校验失败。 */
  lightRangeInvalid: 'STUDIO3D_LIGHT_RANGE_INVALID',
} as const

/** interaction3d 配置诊断。 */
export const INTERACTION3D_ERROR_CODES = {
  /** 配置存在无法保存的设置；用诊断接口取 `findings` 定位。 */
  configInvalid: 'INTERACTION3D_CONFIG_INVALID',
  /** 配置包含当前版本无法识别的字段（版本过高或字段已废弃）。 */
  configUnsupported: 'INTERACTION3D_CONFIG_UNSUPPORTED',
  /** 未保存户型前就编辑柔光范围。 */
  sceneRequired: 'INTERACTION3D_SCENE_REQUIRED',
} as const

/** 显示图片按需缩放。 */
export const DISPLAY_IMAGE_ERROR_CODES = {
  /** 不支持的图片格式（svg 直通，不走缩放）。 */
  unsupported: 'DISPLAY_IMAGE_UNSUPPORTED',
  /** 源图超过像素/边长上限。 */
  tooLarge: 'DISPLAY_IMAGE_TOO_LARGE',
} as const

/** HA 连接身份切换（0.8.9：换 HA 后旧画面/旧操作必须失效）。 */
export const HA_ERROR_CODES = {
  /** 请求携带的 `expectedHaSource` 与当前连接不一致。 */
  sourceChanged: 'HA_SOURCE_CHANGED',
} as const

/** 全部错误码的联合类型（便于穷举式映射）。 */
export type KnownApiErrorCode =
  | (typeof STUDIO3D_ERROR_CODES)[keyof typeof STUDIO3D_ERROR_CODES]
  | (typeof INTERACTION3D_ERROR_CODES)[keyof typeof INTERACTION3D_ERROR_CODES]
  | (typeof DISPLAY_IMAGE_ERROR_CODES)[keyof typeof DISPLAY_IMAGE_ERROR_CODES]
  | (typeof HA_ERROR_CODES)[keyof typeof HA_ERROR_CODES]

/** 从任意错误对象里安全读取 `apiErrorCode`（Axios / fetch 两种形状都覆盖）。 */
export function readApiErrorCode(error: unknown): string | null {
  const code = (error as { response?: { data?: { apiErrorCode?: unknown } } })?.response?.data?.apiErrorCode
  return typeof code === 'string' && code ? code : null
}
