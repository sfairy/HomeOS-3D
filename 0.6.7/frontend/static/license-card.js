const s = {
  base: "主授权",
  module: "功能增量包",
  bundle: "全授权",
  package: "自定义套餐",
};
function y(e) {
  if (!e) return "以商城授权记录为准";
  if (e.expiresAt === null) return "永久";
  if (!e.expiresAt) return "以商城授权记录为准";
  const t = new Date(e.expiresAt);
  return Number.isFinite(t.getTime())
    ? `${t.toLocaleString("zh-CN", {
        hour12: false,
      })} \u5230\u671F`
    : "以商城授权记录为准";
}
export function licenseCardData(e = {}) {
  const t = !!e.activationCodeId,
    i = Array.isArray(e.products)
      ? e.products.filter((n) => n && typeof n.name == "string" && n.type !== "template")
      : [],
    a = new Set(Array.isArray(e.features) ? e.features : []),
    r =
      t &&
      e.allowed !== false &&
      ["ACTIVE", "CONNECTION_WARNING", "STARTUP_VALIDATION_REQUIRED"].includes(e.status),
    d = e.featureAccess || {
      editor: r && (a.has("editor") || a.has("all")),
      interaction3d: r && a.has("module.3d_interaction"),
      uiPack:
        r && [...a].some((n) => typeof n == "string" && n.startsWith("ui.") && n !== "ui.base"),
    },
    o = [
      {
        name: "HA Bridge 编辑器",
        enabled: t && !!d.editor,
      },
      {
        name: "3D 交互功能增量包",
        enabled: t && !!d.interaction3d,
      },
    ],
    l = i.find((n) => ["base", "bundle", "package"].includes(n.type)),
    c = [...new Set(i.map((n) => s[n.type]).filter(Boolean))];
  return {
    licensed: t,
    type:
      l?.type === "package"
        ? c.join(" + ")
        : o.every((n) => n.enabled) && d.uiPack
          ? "全授权"
          : c.join(" + ") || "主授权",
    name:
      i
        .map((n) => n.name.trim())
        .filter(Boolean)
        .join(" · ") || "HA Bridge 编辑器",
    validity: y(l || i[0]),
    validityNote: i.length > 1 ? "有效期为主授权期限，附加包以各自授权期限为准。" : "",
    rights: o,
  };
}
export function createLicenseCard({ dialog: e }) {
  const t = (i) => e.querySelector(`#license-${i}`);
  return {
    render(i) {
      const a = licenseCardData(i);
      ((t("card-details").hidden = !a.licensed),
        (t("card-type").textContent = a.type),
        (t("card-name").textContent = a.name),
        (t("card-validity").textContent = a.validity),
        (t("validity-note").textContent = a.validityNote),
        (t("validity-note").hidden = !a.validityNote),
        a.rights.forEach((r, d) => {
          const o = t(`right-${d}`);
          (o.classList.toggle("enabled", r.enabled),
            (o.querySelector("[data-right-icon]").textContent = r.enabled ? "✓" : "—"),
            (o.querySelector("[data-right-state]").textContent = r.enabled ? "已开通" : "未开通"));
        }));
    },
  };
}
