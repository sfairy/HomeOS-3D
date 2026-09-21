/**
 * 图标名 → 本地 vendor SVG 地址的唯一实现。名称白名单是同一条安全约束（防任意字符串拼进 URL），
 * 收在一处；升级图标集时只改这里的版本号。
 *   | 函数 | vendor | 校验不过 |
 *   | --- | --- | --- |
 *   | `mdiIconUrl`  | mdi 7.4.47     | 返回空串（调用方据此不渲染） |
 *   | `meteoconUrl` | meteocons fill | 回落 `code-red.svg`（天气图标不能空） |
 *
 * 两种「校验不过」都刻意：前者返回空串让调用方不渲染；后者回落 code-red.svg，因天气图标位留空会塌陷。
 *
 * `applyMdiMask` 是给「把图标当遮罩上色」的那批调用点用的（编辑器图标选择按钮、舞台标记、
 * 安防图标）：三处原先各自拼 `url('/static/vendor/mdi/7.4.47/svg/' + name.slice(4) + '.svg')`，
 * 于是版本号在运行时树里散了三份，而 `slice(4)` 在没带 `mdi:` 前缀的名字上会切错字符。
 */

//: mdi 版本目录名。与 `static/vendor/mdi/<version>`、`api/icons.py` 的解析结果、
//: `3d-studio/studio/studio.css` 里那三条写死的遮罩地址必须是同一个版本，
//: `tools/check_invariants.mjs` 会核对全站只出现一个值。
export const MDI_VERSION = "7.4.47";

/**
 * mdi 图标名 → 本地 SVG 地址。名字不合白名单时返回空串。
 */
export function mdiIconUrl(iconName) {
  const normalizedIconName = String(iconName || "")
    .trim()
    .replace(/^mdi:/, "");
  if (/^[a-z0-9-]+$/.test(normalizedIconName)) {
    return "/static/vendor/mdi/" + MDI_VERSION + "/svg/" + normalizedIconName + ".svg";
  } else {
    return "";
  }
}

/**
 * 给元素套上 mdi 图标的遮罩（颜色随 currentColor 走）。
 *
 * 名字不合法时**不动元素**：`mask-image: url("")` 会被解析成当前文档地址，白多一次请求，
 * 所以这里宁可留着空白。返回是否设置成功。
 */
export function applyMdiMask(element, iconName) {
  const iconUrl = mdiIconUrl(iconName);
  if (!iconUrl) {
    return false;
  }
  const maskValue = 'url("' + iconUrl + '")';
  element.style.maskImage = maskValue;
  element.style.webkitMaskImage = maskValue;
  return true;
}

/**
 * meteocons 图标名 → 本地 SVG 地址。
 * 名称来自后端，但仍做白名单校验（只允许小写字母、数字与连字符）避免拼出跨目录路径；
 * 不合法时统一回落到 code-red。
 */
export function meteoconUrl(iconName) {
  const normalizedIconName = String(iconName || "").trim();
  if (/^[a-z0-9-]+$/.test(normalizedIconName)) {
    return "/static/vendor/meteocons/fill/" + normalizedIconName + ".svg";
  } else {
    return "/static/vendor/meteocons/fill/code-red.svg";
  }
}
