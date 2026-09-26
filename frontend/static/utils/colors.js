/**
 * 颜色工具：归一、校验、插值。三份「归一」契约各自服务一种用途，名字即契约：
 *   | 函数 | 省略 `#` | 三位缩写 | 返回值 | 失败时 |
 *   | --- | --- | --- | --- | --- |
 *   | `hexColorOrEmpty`       | 认 | 展开 | 小写 `#rrggbb` | `""` |
 *   | `strictHexColorOrEmpty` | 不认 | 拒绝 | 小写 `#rrggbb` | `""` |
 *   | `expandHexColorOrNull`  | 不认 | 展开 | 六位，原样大小写 | `null` |
 * 失败写法有意：空串=「不是一个颜色」；`null`=「放弃计算」；拒绝缩写=「输入还不完整」。
 * 另有 `resolveColor`（CSS 颜色白名单校验 + 兜底色）、`mixHexColors`（十六进制线性插值）
 * 与 `paletteColor`（从全站调色板令牌里取实际色值），以及 `hexToRgbOrNull`（拆成 0~255 通道，
 * 失败时返回 `null`，由调用方决定兜底色）与 `kelvinToRgbHex`（色温换算成 0xRRGGBB）。
 *
 * 还有两份**故意不在本模块**的颜色工具，别当成漏合并的重复：
 *   - `design/scene/appearance.js`（及其 distribution 副本 frontend/static/auth/scene/ 与
 *     store/static/scene/）里的 `normalizeHex` / `hexToRgb`：那份是构建隔离的独立副本（主应用与商店
 *     各自只 COPY 自己的目录），且失败语义是**抛错** —— 配色派生遇到非法色必须立刻暴露。
 *   - `utils/numbers.js` 里的数值夹取：本模块只做颜色，不重新实现。
 */
import { clampNumber, coercedFiniteNumberOr } from "./numbers.js?v=2609262312";

/**
 * 读取全站调色板（design/scene/page.css）里某个自定义属性的**实际色值**。
 *
 * 需要它的地方分两类，都是 `var()` 写不了的位置：
 *   1. CanvasRenderingContext —— `ctx.strokeStyle = "var(--hos-accent)"` 会被静默丢弃；
 *   2. `mixHexColors()` —— 它按十六进制解析，收到 `var(...)` 会原样返回、插值静默失效。
 * `getComputedStyle` 返回的是 var() 已替换过的值，所以这两类都能拿到真正的 `#rrggbb`。
 *
 * 结果按令牌名缓存：`getComputedStyle` 每次调用都会迫使一次样式解析，而调用点常在
 * 每帧重绘的热路径上。令牌在一次页面生命周期内不变，缓存安全。
 *
 * 缓存键只有令牌名，不含兜底色 —— 同一个令牌在各调用点必须传同一个兜底色，否则先到的那次
 * 会把后来者的兜底色一起定死（令牌值取到就无所谓，取不到才会分叉）。
 *
 * 页面没加载调色板（运行期动态注入的 stage / runtime 页面）时取到空串，
 * 此时返回传入的兜底色 —— 绝不返回空串让调用方拿到一个非法颜色。
 */
const paletteColorCache = new Map();
export function paletteColor(token, fallbackColor) {
  const cached = paletteColorCache.get(token);
  if (cached !== undefined) return cached;
  let resolved = "";
  try {
    resolved = window.getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  } catch {
    /* 无 window / 无 document（极少见的嵌入场景）：走兜底色 */
  }
  const value = resolved || fallbackColor;
  paletteColorCache.set(token, value);
  return value;
}

/**
 * 容错归一：可省略 `#`、认三位缩写，输出小写 `#rrggbb`；无法识别时返回空串。
 *
 * 用在「把用户输入 / 剪贴板里的颜色变成标准写法」的地方 —— 尽量认出来是它的目的。
 */
export function hexColorOrEmpty(colorInput) {
  const trimmedColor = String(colorInput || "").trim();
  const hexColor = trimmedColor.startsWith("#") ? trimmedColor : "#" + trimmedColor;
  if (/^#[\da-f]{6}$/i.test(hexColor)) {
    return hexColor.toLowerCase();
  } else if (/^#[\da-f]{3}$/i.test(hexColor)) {
    // 三位缩写先展开成六位，再统一小写。
    return expandHexColorOrNull(hexColor).toLowerCase();
  } else {
    return "";
  }
}

/**
 * 严格归一：只认完整的 `#rrggbb`（大小写不限），输出小写；其余（含三位缩写）返回空串。
 * 用在「判断用户输入到哪一步」与「比较两个颜色是否同一个」：三位缩写也算不完整，比较结果要稳定，
 * 不可因同一颜色的两种写法而忽等忽不等。
 */
export function strictHexColorOrEmpty(hexColorInput) {
  const normalizedHexValue = String(hexColorInput || "")
    .trim()
    .toLowerCase();
  if (/^#[\da-f]{6}$/.test(normalizedHexValue)) {
    return normalizedHexValue;
  } else {
    return "";
  }
}

/**
 * 解析成六位 `#rrggbb`（三位缩写展开，大小写原样保留）；不是十六进制时返回 `null`。
 * 用于取值场景（拆 RGB 通道做插值）：HA 里用户常手写 `#abc`，不展开会得到错值；
 * 大小写不归一，调用方只要通道值。拿不准明确返回 `null`，算错颜色比不插值更糟。
 */
function expandHexColorOrNull(colorValue) {
  const trimmedColor = String(colorValue || "").trim();
  const expandedColor = /^#[0-9a-f]{3}$/i.test(trimmedColor)
    ? "#" +
      trimmedColor
        .slice(1)
        .split("")
        .map(hexDigit => "" + hexDigit + hexDigit)
        .join("")
    : trimmedColor;
  if (/^#[0-9a-f]{6}$/i.test(expandedColor)) {
    return expandedColor;
  } else {
    return null;
  }
}

/**
 * 解析成 `{ r, g, b }` 三通道（各 0~255）；不是十六进制时返回 `null`。
 *
 * 三位缩写会展开（HA 里用户手写 `#abc` 很常见，不展开会算出错值），可省略 `#`，大小写不敏感 ——
 * 即解析口径与本模块的 `hexColorOrEmpty` 一致，只是失败时不返回空串而是 `null`。
 *
 * 失败返回 `null` 而不是兜底色，是因为兜底策略按用途分岔：编辑器要把颜色画出来，用黑色兜底；
 * 主题派生则应当直接抛错（配置写错要立刻暴露，不该静默变成一片黑）。
 */
export function hexToRgbOrNull(colorInput) {
  const normalizedColor = hexColorOrEmpty(colorInput);
  if (!normalizedColor) {
    return null;
  }
  return {
    r: Number.parseInt(normalizedColor.slice(1, 3), 16),
    g: Number.parseInt(normalizedColor.slice(3, 5), 16),
    b: Number.parseInt(normalizedColor.slice(5, 7), 16)
  };
}

/**
 * 校验 CSS 颜色字符串，非法时用兜底色。
 * 颜色值来自文档数据并会被写进内联样式，白名单只放行十六进制与 rgb / hsl，防注入。
 */
export function resolveColor(colorCandidate, fallbackColor) {
  const trimmedColor = String(colorCandidate || "").trim();
  if (/^(#[\da-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\))$/i.test(trimmedColor)) {
    return trimmedColor;
  } else {
    return fallbackColor;
  }
}

/**
 * 色温（K）换算成 `0xRRGGBB` 整数 —— Tanner Helland 经典近似式，`66` 是 6600K 分段点。
 * 下面的浮点常数就是公式系数，改等于换公式，必须整段替换而非微调某一位。
 *
 * 单通道收尾要先夹到 0~255 再取整：近似式在区间两端会给出负值或 >255 的值，不夹就左移拼位
 * 溢出 / 借位，把另外两个通道也污染掉。
 *
 * 参数:
 *   kelvin: 开尔文；解析不出（含空串、布尔）时用 `options.fallbackKelvin`。
 *   options.minKelvin / options.maxKelvin: 换算前先把色温夹进这个区间。两个调用方的区间**有意不同**
 *     （3D 场景基础光用 2200~6500 —— 灯具实际可用的色温范围；灯光实体效果色用 1000~20000 ——
 *     近似式本身的名义有效范围），因此由调用方显式传入，别在这里取一个「通用」默认值。
 */
export function kelvinToRgbHex(kelvin, options) {
  const { minKelvin, maxKelvin, fallbackKelvin } = options;
  // 公式以「百 K」为单位，因此先除以 100。
  const scaledKelvin = clampNumber(coercedFiniteNumberOr(kelvin, fallbackKelvin), minKelvin, maxKelvin) / 100;
  const redChannel =
    scaledKelvin <= 66 ? 255 : (scaledKelvin - 60) ** -0.1332047592 * 329.698727446;
  const greenChannel =
    scaledKelvin <= 66
      ? Math.log(scaledKelvin) * 99.4708025861 - 161.1195681661
      : (scaledKelvin - 60) ** -0.0755148492 * 288.1221695283;
  const blueChannel =
    scaledKelvin >= 66
      ? 255
      : scaledKelvin <= 19
        ? 0
        : Math.log(scaledKelvin - 10) * 138.5177312231 - 305.0447927307;
  // 三通道各占 8 位拼成一个整数，与 CSS / three.js 的 0xRRGGBB 表示一致。
  const clampChannel = channel => Math.round(clampNumber(channel, 0, 255));
  return (clampChannel(redChannel) << 16) | (clampChannel(greenChannel) << 8) | clampChannel(blueChannel);
}

/**
 * 在两个十六进制颜色之间做线性插值。
 *
 * 用于按亮度百分比混合开关 / 指示灯的底色。
 */
export function mixHexColors(startColor, endColor, blendRatio = 0) {
  // 三位简写先展开成六位（本模块是唯一实现）：HA 里用户手写的颜色常是 #abc，
  // 直接按六位解析会得到错值。
  const normalizedStartColor = expandHexColorOrNull(startColor);
  const normalizedEndColor = expandHexColorOrNull(endColor);
  // 任一端不是 hex（例如 rgb() 写法或主题变量名）就放弃插值，原样返回起点色 ——
  // 返回一个算错的颜色比返回未混合的颜色更糟。
  if (!normalizedStartColor || !normalizedEndColor) {
    return startColor;
  }
  // 夹到 0~1：比例来自亮度百分比之类的计算值，可能因浮点误差略微越界。
  const clampedBlendRatio = Math.max(0, Math.min(1, Number(blendRatio) || 0));
  /**
   * 取出 #RRGGBB 中某个通道的十进制值。
   */
  const parseColorChannel = (hexString, channelOffset) =>
    Number.parseInt(hexString.slice(channelOffset, channelOffset + 2), 16);
  return (
    "#" +
    [1, 3, 5]
      .map(channelIndex =>
        Math.round(
          parseColorChannel(normalizedStartColor, channelIndex) +
            (parseColorChannel(normalizedEndColor, channelIndex) -
              parseColorChannel(normalizedStartColor, channelIndex)) *
              clampedBlendRatio
        )
      )
      .map(channelValue => channelValue.toString(16).padStart(2, "0"))
      .join("")
  );
}
