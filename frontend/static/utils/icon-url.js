/**
 * 图标名 → 本地 vendor SVG 地址的唯一实现。名称白名单是同一条安全约束（防任意字符串拼进 URL），
 * 收在一处；升级图标集时只改这里的版本号。
 *   | 函数 | vendor | 校验不过 |
 *   | --- | --- | --- |
 *   | `mdiIconUrl`  | mdi 7.4.47     | 返回空串（调用方据此不渲染） |
 *   | `meteoconUrl` | meteocons fill | 回落 `code-red.svg`（天气图标不能空） |
 *
 * 两种「校验不过」都刻意：前者返回空串让调用方不渲染；后者回落 code-red.svg，因天气图标位留空会塌陷。
 */

/**
 * mdi 图标名 → 本地 SVG 地址。
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
 */
export function meteoconUrl(iconName) {
  const normalizedIconName = String(iconName || "").trim();
  if (/^[a-z0-9-]+$/.test(normalizedIconName)) {
    return "/static/vendor/meteocons/fill/" + normalizedIconName + ".svg";
  } else {
    return "/static/vendor/meteocons/fill/code-red.svg";
  }
}
