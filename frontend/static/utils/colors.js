/**
 * 颜色字符串归一：三份契约，名字即契约，各自服务一种用途。
 *   | 函数 | 省略 `#` | 三位缩写 | 返回值 | 失败时 |
 *   | --- | --- | --- | --- | --- |
 *   | `hexColorOrEmpty`       | 认 | 展开 | 小写 `#rrggbb` | `""` |
 *   | `strictHexColorOrEmpty` | 不认 | 拒绝 | 小写 `#rrggbb` | `""` |
 *   | `expandHexColorOrNull`  | 不认 | 展开 | 六位，原样大小写 | `null` |
 *
 * 失败写法有意：空串=「不是一个颜色」；`null`=「放弃计算」；拒绝缩写=「输入还不完整」。
 */

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
 *
 * 用在「判断用户输入到哪一步了」与「比较两个颜色是不是同一个」的地方：三位缩写在这里
 * 也算「不是一个完整的颜色」—— 比较结果要稳定，不可以因为同一颜色的两种写法而忽等忽不等。
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
