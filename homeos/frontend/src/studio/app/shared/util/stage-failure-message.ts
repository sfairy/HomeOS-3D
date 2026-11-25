/**
 * 3D 舞台启动失败的**用户可读**文案映射。
 *
 * ## 为什么需要它
 *
 * 舞台由两个进程内组件串起来：宿主（`runtime.ts`，父窗口）与舞台外壳（`studio-boot.ts`，
 * iframe 内）。模块 import 失败时浏览器抛的是这类原始英文：
 *
 *     Failed to fetch dynamically imported module: /api/v1/modules/interaction3d/core/stage.js?v=…
 *
 * 这两处都把 `error.message` 原样写进了用户可见的元素（父窗口的 `.i3d-loading`、遮罩的
 * `detailElement`），于是墙屏上出现一整行英文 URL —— 既不可读，也完全没告诉用户该做什么。
 *
 * ## 两类失败必须分开说
 *
 * - **模块加载失败**：网络中断 / 部署换了 chunk / Safari 的 preload 失败污染后续 import /
 *   会话过期导致 401。重试或重新登录有用，所以文案要给这两种动作。
 * - **WebGL 不可用**：设备或浏览器设置问题，重试无用，要指向「开启图形加速 / 改用 2D」。
 *
 * 其余错误（后端返回的中文领域错误、几何校验失败等）已经是给人看的，原样保留。
 */

/** 浏览器/引擎在「模块脚本没拿到」时用的措辞（Chrome / Safari / Firefox 各不相同）。 */
const MODULE_LOAD_FAILURE =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload|Loading chunk|Loading CSS chunk/i

/** 设备侧没有可用 3D 能力（WebGL/WebGPU 建不起来或上下文丢失）。 */
const GRAPHICS_UNAVAILABLE =
  /webgl|webgpu|context lost|contextlost|disabled|renderer|three\.|reading 'render'|cannot read propert/i

/** 模块加载失败时给用户的动作建议（重试 / 重新登录都在这句话里）。 */
export const MODULE_LOAD_FAILURE_MESSAGE =
  '3D 户型资源未能载入。请检查网络后点「重新加载」；若一直如此，请重新登录后再试。'

/** WebGL 不可用时给用户的动作建议。 */
export const GRAPHICS_UNAVAILABLE_MESSAGE =
  '当前设备无法创建 3D 画面（WebGL 不可用）。请开启浏览器「使用图形加速」并重启浏览器，或改用 2D 控件。'

/**
 * 把一条原始错误文案收敛成用户能读懂、且带动作建议的中文。
 *
 * @param failure 原始 message 或 Error；空值返回空串（调用方各自决定兜底文案）
 */
export function describeStageFailure(failure: unknown): string {
  const raw = typeof failure === 'string' ? failure.trim() : failure instanceof Error ? failure.message.trim() : ''
  if (!raw) return ''
  // 顺序不能反：模块加载失败的原文里可能带 ``render``（如 stage-renderer-chunk），
  // 先判图形能力会把「网络失败」误报成「WebGL 不可用」，指向一个没用的修复动作。
  if (MODULE_LOAD_FAILURE.test(raw)) return MODULE_LOAD_FAILURE_MESSAGE
  if (GRAPHICS_UNAVAILABLE.test(raw)) return GRAPHICS_UNAVAILABLE_MESSAGE
  return raw
}
