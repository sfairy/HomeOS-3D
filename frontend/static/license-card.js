/**
 * 授权卡片的数据整形与渲染。
 *
 * 位置：/license 授权页（编辑器中「授权信息」卡片）的展示逻辑。
 * 职责：把 /api/v1/license/status 返回的原始数据整理成卡片的类型、名称、
 *   有效期与权益列表，并写入对话框内对应节点。
 * 约定：卡片文案（已开通 / 未开通、永久、到期等）与后端状态码一一对应；
 *   权益开关只读后端返回的 featureAccess。
 */

// 商品类型的中文名；"template" 类型只用于模板，不展示给用户。
const PRODUCT_TYPE_LABELS = {
  base: "\u4E3B\u6388\u6743",
  module: "\u529F\u80FD\u589E\u91CF\u5305",
  bundle: "\u5168\u6388\u6743",
  package: "\u81EA\u5B9A\u4E49\u5957\u9910"
};

/**
 * 把授权记录格式化成有效期文案。
 *
 * @param {object} license 授权商品记录，可为空。
 * @returns {string} 「永久」「xxxx 到期」或「以商城授权记录为准」。
 */
function formatValidity(license) {
  if (!license) return "\u4EE5\u5546\u57CE\u6388\u6743\u8BB0\u5F55\u4E3A\u51C6";
  if (license.expiresAt === null) return "\u6C38\u4E45";
  // 字段缺失（undefined）与 null 语义不同：前者未知，后者是永久。
  if (!license.expiresAt) return "\u4EE5\u5546\u57CE\u6388\u6743\u8BB0\u5F55\u4E3A\u51C6";
  const expiresAt = new Date(license.expiresAt);
  return Number.isFinite(expiresAt.getTime())
    ? `${expiresAt.toLocaleString("zh-CN", { hour12: !1 })} \u5230\u671F`
    : "\u4EE5\u5546\u57CE\u6388\u6743\u8BB0\u5F55\u4E3A\u51C6";
}

/**
 * 把授权状态数据整理成卡片渲染所需的结构。
 *
 * @param {object} [licenseData] /api/v1/license/status 的响应体。
 * @returns {{licensed: boolean, type: string, name: string, validity: string,
 *   validityNote: string, rights: Array<{name: string, enabled: boolean}>}} 卡片数据。
 */
export function licenseCardData(licenseData = {}) {
  const isLicensed = !!licenseData.activationCodeId,
    // template 类商品是内部模板，不作为用户可见授权；名称非字符串的脏数据也过滤掉。
    products = Array.isArray(licenseData.products)
      ? licenseData.products.filter(
          product => product && typeof product.name == "string" && product.type !== "template"
        )
      : [],
    // 只有已激活、未被禁用且状态为 ACTIVE / CONNECTION_WARNING 才算真正生效。
    isActive =
      isLicensed &&
      licenseData.allowed !== !1 &&
      ["ACTIVE", "CONNECTION_WARNING"].includes(licenseData.status),
    featureAccess =
      licenseData.featureAccess && typeof licenseData.featureAccess == "object"
        ? licenseData.featureAccess
        : {},
    rights = [
      { name: "HomeOS \u7F16\u8F91\u5668", enabled: isLicensed && !!featureAccess.editor },
      {
        name: "3D \u4EA4\u4E92\u529F\u80FD\u589E\u91CF\u5305",
        enabled: isLicensed && !!featureAccess.interaction3d
      }
    ],
    // 主商品用于取有效期：优先 base / bundle / package，其次首个商品。
    primaryProduct = products.find(matchedProduct =>
      ["base", "bundle", "package"].includes(matchedProduct.type)
    ),
    typeLabels = [
      ...new Set(
        products.map(productEntry => PRODUCT_TYPE_LABELS[productEntry.type]).filter(Boolean)
      )
    ];
  return {
    /**
     * 是否已落过激活码记录（可能已失效，仅表示曾经绑定过）。
     */
    licensed: isLicensed,
    /**
     * 仅在租约真正可用时展示商品详情，避免 INSTANCE_MISMATCH 等状态仍显示「基础版/永久」。
     */
    showDetails: isActive,
    // 自定义套餐直接展示组合名；否则看权益是否全开，全开显示「全授权」。
    type:
      primaryProduct?.type === "package"
        ? typeLabels.join(" + ")
        : rights.every(rightItem => rightItem.enabled)
          ? "\u5168\u6388\u6743"
          : typeLabels.join(" + ") || "\u4E3B\u6388\u6743",
    name:
      products
        .map(namedProduct => namedProduct.name.trim())
        .filter(Boolean)
        .join(" \xB7 ") || "HomeOS \u7F16\u8F91\u5668",
    validity: formatValidity(primaryProduct || products[0]),
    // 多商品时才提示「以主授权期限为准」，单商品无需这句话。
    validityNote:
      products.length > 1
        ? "\u6709\u6548\u671F\u4E3A\u4E3B\u6388\u6743\u671F\u9650\uFF0C\u9644\u52A0\u5305\u4EE5\u5404\u81EA\u6388\u6743\u671F\u9650\u4E3A\u51C6\u3002"
        : "",
    rights: rights
  };
}

/**
 * 创建授权卡片渲染器。
 *
 * @param {object} handlers 依赖注入。
 * @param {HTMLDialogElement} handlers.dialog 卡片所在的对话框。
 * @returns {{render: function(object): void}} 渲染器。
 */
export function createLicenseCard({ dialog: dialogElement }) {
  // 卡片内所有节点统一以 #license-<key> 命名，避免与页面其它元素冲突。
  const querySection = sectionKey => dialogElement.querySelector(`#license-${sectionKey}`);
  return {
    render(data) {
      const card = licenseCardData(data);
      ((querySection("card-details").hidden = !card.showDetails),
        (querySection("card-type").textContent = card.type),
        (querySection("card-name").textContent = card.name),
        (querySection("card-validity").textContent = card.validity),
        (querySection("validity-note").textContent = card.validityNote),
        (querySection("validity-note").hidden = !card.validityNote),
        card.rights.forEach((right, rightIndex) => {
          const rightElement = querySection(`right-${rightIndex}`);
          // 权益行的样式与图标 / 状态文案都由 enabled 决定，三处必须同步。
          (rightElement.classList.toggle("enabled", right.enabled),
            (rightElement.querySelector("[data-right-icon]").textContent = right.enabled
              ? "\u2713"
              : "\u2014"),
            (rightElement.querySelector("[data-right-state]").textContent = right.enabled
              ? "\u5DF2\u5F00\u901A"
              : "\u672A\u5F00\u901A"));
        }));
    }
  };
}
