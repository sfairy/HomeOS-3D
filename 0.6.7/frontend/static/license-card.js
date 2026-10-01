const LICENSE_TYPE_LABELS = {
  base: "主授权",
  module: "功能增量包",
  bundle: "全授权",
  package: "自定义套餐",
};
function formatValidity(record) {
  if (!record) return "以商城授权记录为准";
  if (record.expiresAt === null) return "永久";
  if (!record.expiresAt) return "以商城授权记录为准";
  const expiresDate = new Date(record.expiresAt);
  return Number.isFinite(expiresDate.getTime())
    ? `${expiresDate.toLocaleString("zh-CN", {
        hour12: false,
      })} \u5230\u671F`
    : "以商城授权记录为准";
}
export function licenseCardData(license = {}) {
  const isActivated = !!license.activationCodeId,
    products = Array.isArray(license.products)
      ? license.products.filter(
          (product) => product && typeof product.name == "string" && product.type !== "template",
        )
      : [],
    featureSet = new Set(Array.isArray(license.features) ? license.features : []),
    isActive =
      isActivated &&
      license.allowed !== false &&
      ["ACTIVE", "CONNECTION_WARNING", "STARTUP_VALIDATION_REQUIRED"].includes(license.status),
    featureAccess = license.featureAccess || {
      editor: isActive && (featureSet.has("editor") || featureSet.has("all")),
      interaction3d: isActive && featureSet.has("module.3d_interaction"),
      uiPack:
        isActive &&
        [...featureSet].some(
          (featureName) =>
            typeof featureName == "string" &&
            featureName.startsWith("ui.") &&
            featureName !== "ui.base",
        ),
    },
    rights = [
      {
        name: "HA Bridge 编辑器",
        enabled: isActivated && !!featureAccess.editor,
      },
      {
        name: "3D 交互功能增量包",
        enabled: isActivated && !!featureAccess.interaction3d,
      },
    ],
    primaryProduct = products.find((candidateProduct) =>
      ["base", "bundle", "package"].includes(candidateProduct.type),
    ),
    typeLabels = [
      ...new Set(
        products.map((mappedProduct) => LICENSE_TYPE_LABELS[mappedProduct.type]).filter(Boolean),
      ),
    ];
  return {
    licensed: isActivated,
    type:
      primaryProduct?.type === "package"
        ? typeLabels.join(" + ")
        : rights.every((rightEntry) => rightEntry.enabled) && featureAccess.uiPack
          ? "全授权"
          : typeLabels.join(" + ") || "主授权",
    name:
      products
        .map((productEntry) => productEntry.name.trim())
        .filter(Boolean)
        .join(" · ") || "HA Bridge 编辑器",
    validity: formatValidity(primaryProduct || products[0]),
    validityNote: products.length > 1 ? "有效期为主授权期限，附加包以各自授权期限为准。" : "",
    rights: rights,
  };
}
export function createLicenseCard({ dialog: dialogElement }) {
  const findNode = (selectorId) => dialogElement.querySelector(`#license-${selectorId}`);
  return {
    render(licenseInput) {
      const card = licenseCardData(licenseInput);
      ((findNode("card-details").hidden = !card.licensed),
        (findNode("card-type").textContent = card.type),
        (findNode("card-name").textContent = card.name),
        (findNode("card-validity").textContent = card.validity),
        (findNode("validity-note").textContent = card.validityNote),
        (findNode("validity-note").hidden = !card.validityNote),
        card.rights.forEach((rightRow, rightIndex) => {
          const rightNode = findNode(`right-${rightIndex}`);
          (rightNode.classList.toggle("enabled", rightRow.enabled),
            (rightNode.querySelector("[data-right-icon]").textContent = rightRow.enabled
              ? "✓"
              : "—"),
            (rightNode.querySelector("[data-right-state]").textContent = rightRow.enabled
              ? "已开通"
              : "未开通"));
        }));
    },
  };
}
