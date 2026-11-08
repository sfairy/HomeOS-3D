/**
 * 整页等比缩放的画布数学。
 *
 * 抽成纯函数的原因：这套公式同时被主壳（`useScaling`）、锁屏（`computeScreensaverLayout`）
 * 与设置页预览消费，此前三处各自内联一份，改一处就会漂移；而且它是「换分辨率后布局是否
 * 变形」的唯一判据，必须能被单测直接断言（见 ops/checks/frontend/tests/scaling-canvas-layout.test.mjs）。
 *
 * 契约（两个轴都必须成立）：
 *   1. `canvasW × scale == 视口宽`、`canvasH × scale == 视口高` —— 不出现黑边、不裁切；
 *   2. 两个方向共用同一个 `scale` —— 几何不变形；
 *   3. `canvasW ≥ 设计宽`、`canvasH ≥ 设计高` —— 只扩展画布，不压缩设计稿；
 *   4. `scale = min(视口宽/设计宽, 视口高/设计高)`，只封顶不抬底。
 *
 * 不再有「留边」与「触底滚动」两种历史分支：画布按比例扩展，多出来的空间交给
 * flex 布局列（右栏 / 页脚 / 3D 画布）自然吃掉。
 */

/** 可读性警戒线。**不是缩放下限**，只用于设置页提示字号偏小，不参与缩放计算。 */
export const MIN_SCALE = 0.72

/** 整页等比缩放的放大上限：超过它改用更宽的布局列，而不是继续放大字号。 */
export const MAX_UPSCALE = 1.5

/** 设计稿基准宽度缺省值（后端 ui.scaleBaseWidth 缺省同值）。 */
export const DEFAULT_DESIGN_WIDTH = 1366

/** 设计稿基准高度缺省值（后端 ui.scaleBaseHeight 缺省同值）。 */
export const DEFAULT_DESIGN_HEIGHT = 1024

/** 手机视口判定的短边阈值：低于它不再整页缩放（正文会被压到不可读）。 */
const PHONE_SHORT_SIDE_MAX = 600

/** 手机视口判定的宽度阈值：竖屏手机宽度必然低于它。 */
const PHONE_WIDTH_MAX = 640

/** `computeViewportLayout` 的结果：画布尺寸、缩放系数与可读性标记。 */
export interface CanvasLayout {
  /** 实际使用的缩放系数（contain 比与 MAX_UPSCALE 取小） */
  scale: number
  /** 完整显示设计稿所需的原始比例（未封顶），供设置页展示换算过程 */
  requiredScale: number
  /** 缩放比是否低于可读性警戒线（仅提示，不影响布局） */
  belowReadable: boolean
  /** 画布宽度（CSS px，未乘缩放比） */
  canvasW: number
  /** 画布高度（CSS px，未乘缩放比） */
  canvasH: number
  /** 设计稿基准宽度 */
  designW: number
  /** 设计稿基准高度 */
  designH: number
  /**
   * 兼容字段：缩放壳（`.app-shell`）的布局尺寸。
   *
   * 画布铺满后壳与内容区同尺寸 —— 旧实现里壳比内容宽（`vw / scale`），多出来的部分靠
   * 居中把内容挤在中间，等价于留边。现在两者恒等，保留字段名只是为了不打断既有调用方。
   */
  shellW: number
  /** 兼容字段，见 `shellW` */
  shellH: number
  /** 兼容字段：内容区宽度，与 `canvasW` 恒等 */
  contentW: number
  /** 兼容字段：内容区高度，与 `canvasH` 恒等 */
  contentH: number
}

/**
 * 把任意数值收敛成有限正数，读不出时回退缺省值。
 *
 * Why：`vw/vh` 来自 `clientWidth / clientHeight`，在隐藏标签页、折叠侧栏或首帧测量时
 * 会是 0 甚至 NaN，直接参与除法会得到 `Infinity`，再写进 `transform: scale()` 就是整页空白。
 *
 * @param value 原始数值
 * @param fallback 回退值
 * @returns 有限正数
 */
function positive(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

/**
 * 计算当前视口下的画布布局。
 *
 * @param vw 视口宽度（安全区内的可用内容盒宽度）
 * @param vh 视口高度（安全区内的可用内容盒高度）
 * @param designW 设计稿基准宽度
 * @param designH 设计稿基准高度
 * @returns 画布尺寸、缩放系数与可读性标记
 */
export function computeViewportLayout(vw: number, vh: number, designW: number, designH: number): CanvasLayout {
  const dw = positive(designW, DEFAULT_DESIGN_WIDTH)
  const dh = positive(designH, DEFAULT_DESIGN_HEIGHT)
  const width = positive(vw, dw)
  const height = positive(vh, dh)

  // contain：整体等比，两个方向都不溢出视口
  const requiredScale = Math.min(width / dw, height / dh)
  // 只封顶不抬底：contain 已保证不溢出，封顶是为了防止大屏把字号放到脱离设计基准。
  // 封顶后 `width / scale > dw` 必然成立（封顶的前提就是两个方向的比值都超过上限），
  // 所以下面两个 max() 只是数值兜底，不会真的把画布压回设计尺寸。
  const scale = Math.min(requiredScale, MAX_UPSCALE)
  const canvasW = Math.max(dw, width / scale)
  const canvasH = Math.max(dh, height / scale)

  return {
    scale,
    requiredScale,
    belowReadable: scale < MIN_SCALE,
    canvasW,
    canvasH,
    designW: dw,
    designH: dh,
    shellW: canvasW,
    shellH: canvasH,
    contentW: canvasW,
    contentH: canvasH,
  }
}

/**
 * 画布单位 CSS 变量。
 *
 * `--hos-vw/vh` 是画布逻辑尺寸，`--hos-screen-w/h` 是「一屏可见区域」换算到画布单位后的值。
 * 画布铺满视口后两者相等，但保留两组名字：弹窗/侧栏的 `max-height` 一直读
 * `--hos-screen-h`，语义上它才是「一屏」，`--hos-vh` 是「画布总高」，将来若引入可滚动
 * 画布就会分叉。
 *
 * @param layout 当前画布布局
 * @returns 注入到 `.app-shell` 的内联 CSS 变量
 */
export function buildCanvasVars(layout: CanvasLayout) {
  return {
    '--hos-vw': `${layout.canvasW}px`,
    '--hos-vh': `${layout.canvasH}px`,
    '--hos-screen-w': `${layout.canvasW}px`,
    '--hos-screen-h': `${layout.canvasH}px`,
  }
}

/**
 * 是否属于手机视口（此时整页等比缩放会把正文压到不可读）。
 *
 * 判据取「短边 < 600 或宽 < 640」：竖屏手机（390×844）、横屏手机（844×390）都命中，
 * 而平板（768×1024 短边 768、1024×768 短边 768）不受影响。
 *
 * @param vw 视口宽度
 * @param vh 视口高度
 * @returns 是手机视口返回 true
 */
export function isPhoneViewport(vw: number, vh: number) {
  const width = positive(vw, DEFAULT_DESIGN_WIDTH)
  const height = positive(vh, DEFAULT_DESIGN_HEIGHT)
  return width < PHONE_WIDTH_MAX || Math.min(width, height) < PHONE_SHORT_SIDE_MAX
}

/** 设计宽高的来源：布局配置的页面最大宽度 + 系统配置的缩放基准。 */
export interface DesignMetricsSource {
  /** `layoutConfig.pageMaxWidth`；缺省 / 非法时回退到 `ui.scaleBaseWidth` */
  pageMaxWidth?: number | null
  /** `ui` 配置段（`scaleBaseWidth` / `scaleBaseHeight`） */
  ui?: { scaleBaseWidth?: number | null; scaleBaseHeight?: number | null } | null
}

/**
 * 解析生效的设计稿基准宽高。
 *
 * 此前 `ScaledViewport` / `useScaling` / `SettingsGeneralPanel` / `RightSidebar` / 屏保
 * 五处各写一份 fallback 链，顺序略有差异（有的把 `pageMaxWidth` 排在配置前，有的相反），
 * 导致设置页预览与真实壳层可能算出不同的设计基准。统一到这里。
 *
 * @param source 布局配置与 ui 配置
 * @returns 设计稿基准宽高（均为有限正数）
 */
export function resolveDesignMetrics(source: DesignMetricsSource) {
  const ui = source.ui ?? {}
  const pageMax = Number(source.pageMaxWidth)
  const width =
    Number.isFinite(pageMax) && pageMax > 0 ? pageMax : positive(Number(ui.scaleBaseWidth), DEFAULT_DESIGN_WIDTH)
  const height = positive(Number(ui.scaleBaseHeight), DEFAULT_DESIGN_HEIGHT)
  return { width, height }
}
