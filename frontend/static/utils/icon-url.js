/**
 * 图标名 → 本地 vendor SVG 地址的唯一实现。
 *
 * 两个 vendor 各一个函数，知识形状相同（**白名单校验名称 → 拼 vendor 路径 → 兜底**），
 * 差别只在路径前缀与「校验不过怎么办」：
 *
 *   | 函数 | vendor | 名称规范化 | 校验不过 |
 *   | --- | --- | --- | --- |
 *   | `mdiIconUrl`     | mdi 7.4.47        | 去 `mdi:` 前缀 + trim | 返回空串（调用方据此不渲染） |
 *   | `meteoconUrl`    | meteocons fill    | trim                  | 回落 `code-red.svg`（天气图标不能空） |
 *
 * 为什么收在一个模块：这两份原先散在三个文件里（`home.js` 与 `registry.js` 各写一份
 * 逐字相同的 mdi 版本，`weather-chart-runtime.js` 自带 meteocons 版本），而「哪些字符
 * 允许出现在图标名里」是**同一条安全约束** —— 它防的是把任意字符串拼进 URL。分散时
 * 改一处漏一处不会报错，只会留下一个能穿目录的入口。升级图标集时只改这里的版本号。
 *
 * `mdiIconUrl` 校验不过返回空串是刻意的：调用方据此不渲染图标，而不是去请求一个坏地址。
 * `meteoconUrl` 不能这么办 —— 天气图标位是版式的一部分，留空会让整块版式塌陷。
 */

/**
 * mdi 图标名 → 本地 SVG 地址。
 *
 * @param {string} iconName 图标名，可带 `mdi:` 前缀，形如 mdi:lightbulb-outline。
 * @returns {string} SVG 资源路径；名字非法时返回空串。
 */
export function mdiIconUrl(iconName) {
  const normalizedIconName = String(iconName || "")
    .trim()
    .replace(/^mdi:/, "");
  if (/^[a-z0-9-]+$/.test(normalizedIconName)) {
    return "/static/vendor/mdi/7.4.47/svg/" + normalizedIconName + ".svg";
  } else {
    return "";
  }
}

/**
 * meteocons 图标名 → 本地 SVG 地址。
 *
 * 图标名来自后端下发，理论上可信，但仍做一次白名单校验（只允许小写字母、数字与连字符），
 * 避免异常数据拼出跨目录路径；不合法时统一回落到 code-red。
 *
 * @param {string} iconName 图标名。
 * @returns {string} `/static/vendor/meteocons/fill/<name>.svg` 形式的地址。
 */
export function meteoconUrl(iconName) {
  const normalizedIconName = String(iconName || "").trim();
  if (/^[a-z0-9-]+$/.test(normalizedIconName)) {
    return "/static/vendor/meteocons/fill/" + normalizedIconName + ".svg";
  } else {
    return "/static/vendor/meteocons/fill/code-red.svg";
  }
}
