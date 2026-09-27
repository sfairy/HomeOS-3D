/**
 * 授权卡片的数据整形与渲染。
 */

// 商品类型的中文名；"template" 类型只用于模板，不展示给用户。
const PRODUCT_TYPE_LABELS = {
  base: "主授权",
  module: "功能增量包",
  bundle: "全授权",
  package: "自定义套餐"
};

/**
 * 把授权记录格式化成有效期文案。
 */
function formatValidity(license) {
  if (!license) return "以商城授权记录为准";
  if (license.expiresAt === null) return "永久";
  // 字段缺失（undefined）与 null 语义不同：前者未知，后者是永久。
  if (!license.expiresAt) return "以商城授权记录为准";
  const expiresAt = new Date(license.expiresAt);
  return Number.isFinite(expiresAt.getTime())
    ? `${expiresAt.toLocaleString("zh-CN", { hour12: !1 })} 到期`
    : "以商城授权记录为准";
}

/**
 * 把授权状态数据整理成卡片渲染所需的结构。
 */
function licenseCardData(licenseData = {}) {
  const isLicensed = !!licenseData.activationCodeId,
    // template 类商品是内部模板，不作为用户可见授权；名称非字符串的脏数据也过滤掉。
    products = Array.isArray(licenseData.products)
      ? licenseData.products.filter(
          product => product && typeof product.name == "string" && product.type !== "template"
        )
      : [],
    // 已激活、未被禁用且状态属于「可用」三档才算真正生效：
    isActive =
      isLicensed &&
      licenseData.allowed !== !1 &&
      ["ACTIVE", "CONNECTION_WARNING", "STARTUP_VALIDATION_REQUIRED"].includes(licenseData.status),
    featureAccess =
      licenseData.featureAccess && typeof licenseData.featureAccess == "object"
        ? licenseData.featureAccess
        : {},
    rights = [
      { name: "HomeOS 编辑器", enabled: isLicensed && !!featureAccess.editor },
      {
        name: "3D 交互功能增量包",
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
    licensed: isLicensed,
    showDetails: isActive,
    type:
      primaryProduct?.type === "package"
        ? typeLabels.join(" + ")
        : rights.every(rightItem => rightItem.enabled)
          ? "全授权"
          : typeLabels.join(" + ") || "主授权",
    name:
      products
        .map(namedProduct => namedProduct.name.trim())
        .filter(Boolean)
        .join(" \xB7 ") || "HomeOS 编辑器",
    validity: formatValidity(primaryProduct || products[0]),
    // 多商品时才提示「以主授权期限为准」，单商品无需这句话。
    validityNote:
      products.length > 1
        ? "有效期为主授权期限，附加包以各自授权期限为准。"
        : "",
    rights: rights
  };
}

/**
 * 创建授权卡片渲染器。
 */
export function createLicenseCard({ dialog: dialogElement }) {
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
              ? "✓"
              : "—"),
            (rightElement.querySelector("[data-right-state]").textContent = right.enabled
              ? "已开通"
              : "未开通"));
        }));
    }
  };
}
