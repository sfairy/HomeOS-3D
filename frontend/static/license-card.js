const PRODUCT_TYPE_LABELS = {
  base: "\u4E3B\u6388\u6743",
  module: "\u529F\u80FD\u589E\u91CF\u5305",
  bundle: "\u5168\u6388\u6743",
  package: "\u81EA\u5B9A\u4E49\u5957\u9910"
};
function formatValidity(license) {
  if (!license) return "\u4EE5\u5546\u57CE\u6388\u6743\u8BB0\u5F55\u4E3A\u51C6";
  if (license.expiresAt === null) return "\u6C38\u4E45";
  if (!license.expiresAt) return "\u4EE5\u5546\u57CE\u6388\u6743\u8BB0\u5F55\u4E3A\u51C6";
  const expiresAt = new Date(license.expiresAt);
  return Number.isFinite(expiresAt.getTime())
    ? `${expiresAt.toLocaleString("zh-CN", { hour12: !1 })} \u5230\u671F`
    : "\u4EE5\u5546\u57CE\u6388\u6743\u8BB0\u5F55\u4E3A\u51C6";
}
export function licenseCardData(licenseData = {}) {
  const isLicensed = !!licenseData.activationCodeId,
    products = Array.isArray(licenseData.products)
      ? licenseData.products.filter(
          product => product && typeof product.name == "string" && product.type !== "template"
        )
      : [],
    featureSet = new Set(Array.isArray(licenseData.features) ? licenseData.features : []),
    isActive =
      isLicensed &&
      licenseData.allowed !== !1 &&
      ["ACTIVE", "CONNECTION_WARNING"].includes(licenseData.status),
    featureAccess = licenseData.featureAccess || {
      editor: isActive && (featureSet.has("editor") || featureSet.has("all")),
      interaction3d: isActive && featureSet.has("module.3d_interaction"),
      uiPack:
        isActive &&
        [...featureSet].some(
          featureName =>
            typeof featureName == "string" &&
            featureName.startsWith("ui.") &&
            featureName !== "ui.base"
        )
    },
    rights = [
      { name: "HomeOS \u7F16\u8F91\u5668", enabled: isLicensed && !!featureAccess.editor },
      {
        name: "3D \u4EA4\u4E92\u529F\u80FD\u589E\u91CF\u5305",
        enabled: isLicensed && !!featureAccess.interaction3d
      }
    ],
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
    type:
      primaryProduct?.type === "package"
        ? typeLabels.join(" + ")
        : rights.every(rightItem => rightItem.enabled) && featureAccess.uiPack
          ? "\u5168\u6388\u6743"
          : typeLabels.join(" + ") || "\u4E3B\u6388\u6743",
    name:
      products
        .map(namedProduct => namedProduct.name.trim())
        .filter(Boolean)
        .join(" \xB7 ") || "HomeOS \u7F16\u8F91\u5668",
    validity: formatValidity(primaryProduct || products[0]),
    validityNote:
      products.length > 1
        ? "\u6709\u6548\u671F\u4E3A\u4E3B\u6388\u6743\u671F\u9650\uFF0C\u9644\u52A0\u5305\u4EE5\u5404\u81EA\u6388\u6743\u671F\u9650\u4E3A\u51C6\u3002"
        : "",
    rights: rights
  };
}
export function createLicenseCard({ dialog: dialogElement }) {
  const querySection = sectionKey => dialogElement.querySelector(`#license-${sectionKey}`);
  return {
    render(data) {
      const card = licenseCardData(data);
      ((querySection("card-details").hidden = !card.licensed),
        (querySection("card-type").textContent = card.type),
        (querySection("card-name").textContent = card.name),
        (querySection("card-validity").textContent = card.validity),
        (querySection("validity-note").textContent = card.validityNote),
        (querySection("validity-note").hidden = !card.validityNote),
        card.rights.forEach((right, rightIndex) => {
          const rightElement = querySection(`right-${rightIndex}`);
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
