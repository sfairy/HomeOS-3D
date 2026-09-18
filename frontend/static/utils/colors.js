/**
 * 颜色字符串归一：三份契约，各自服务一种用途。
 *
 * 位置：`utils/` 下的纯工具，被编辑器（`home.js` / `editor-utils.js`）与运行时渲染器
 *   （`renderer/renderer.js`）引用。
 *
 * 为什么要有这个文件：这三处原先各有自己的「归一十六进制颜色」——
 *   `editor-utils.normalizedHexColor`、`home.js` 里的 `normalizeHexColor`、
 *   `renderer.js` 里 `mixHexColors` 内部的 `normalizeHexColor`。前两个名字只差一个字母
 *   （`normalized` / `normalize`）却是两种契约：能不能省略 `#`、认不认三位缩写、
 *   失败时给空串还是 `null`，全都不同。照名字互相搬用不会报错，只会静默换一套判定 ——
 *   典型后果是「用户才输到 `#ab`」被误判成有效色，或同一个颜色的两种写法比较起来不相等。
 *   现在三份实现都在这里，名字即契约。
 *
 * 契约对照：
 *
 *   | 函数 | 省略 `#` | 三位缩写 | 返回值 | 失败时 |
 *   | --- | --- | --- | --- | --- |
 *   | `hexColorOrEmpty`       | 认 | 展开 | 小写 `#rrggbb` | `""` |
 *   | `strictHexColorOrEmpty` | 不认 | **拒绝** | 小写 `#rrggbb` | `""` |
 *   | `expandHexColorOrNull`  | 不认 | 展开 | 六位，**大小写原样** | `null` |
 *
 * 三种「失败」写法都是有意的：空串给的是「不是一个颜色，跳过它」，`null` 给的是
 * 「读不出通道值，放弃计算」，而拒绝三位缩写给的是「这还不算一个完整的输入」。
 */

/**
 * 容错归一：可省略 `#`、认三位缩写，输出小写 `#rrggbb`；无法识别时返回空串。
 *
 * 用在「把用户输入 / 剪贴板里的颜色变成标准写法」的地方 —— 尽量认出来是它的目的。
 *
 * @param {string} colorInput 颜色输入，可带或不带 `#`，支持三位缩写。
 * @returns {string} `#rrggbb`；无法识别时为空串。
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
 *
 * 用在「判断用户输入到哪一步了」与「比较两个颜色是不是同一个」的地方：三位缩写在这里
 * 也算「不是一个完整的颜色」—— 比较结果要稳定，不可以因为同一颜色的两种写法而忽等忽不等。
 *
 * @param {string} hexColorInput 原始色值。
 * @returns {string} `#rrggbb`；不合法时为空串。
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
 *
 * 用在「取值」的地方（展开成六位后拆出 RGB 通道做插值）：三位缩写要先展开，
 * 因为 HA 里用户手写的颜色常是 `#abc`，直接按六位解析会得到错值；大小写不在这里统一，
 * 调用方只要通道值，归一反而多一次改写。拿不准的输入明确返回 `null`，让调用方放弃计算
 * —— 算出一个错的颜色比不插值更糟。
 *
 * @param {string} colorValue 原始色值。
 * @returns {string|null} 六位色值；非法时为 `null`。
 */
export function expandHexColorOrNull(colorValue) {
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
