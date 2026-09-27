/**
 * 图标名 → 本地 vendor SVG 地址的唯一实现。名称白名单是同一条安全约束（防任意字符串拼进 URL），
 */

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
 */
export function meteoconUrl(iconName) {
  const normalizedIconName = String(iconName || "").trim();
  if (/^[a-z0-9-]+$/.test(normalizedIconName)) {
    return "/static/vendor/meteocons/fill/" + normalizedIconName + ".svg";
  } else {
    return "/static/vendor/meteocons/fill/code-red.svg";
  }
}
