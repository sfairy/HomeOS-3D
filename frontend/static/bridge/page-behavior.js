/**
 * 页面行为解析：把「组件级配置 + 页面级覆盖」合成某类设备页面最终生效的行为参数。
 */

/**
 * 解析指定设备种类的最终页面行为。
 */
export function resolvePageBehavior(config = {}, deviceKind = "light") {
  // 清扫、电视、NAS、窗帘、空调在设置面板里各自归入固定的页面分组，
  const targetPage =
    {
      climate: "environment",
      cover: "environment",
      nas: "devices",
      television: "devices",
      "vacuum-shortcut": "vacuum"
    }[deviceKind] || deviceKind;
  // scope 非 page 时覆盖整体失效；这里显式取 null 而不只是忽略，
  const pageOverrides = config.behaviorScope === "page" ? config.pageBehaviors?.[targetPage] : null;
  // 三个 spread 的书写顺序即优先级（后者覆盖前者），不能调换。
  const mergeSection = (sectionKey, defaults) => {
    const pageOverride = pageOverrides?.[sectionKey];
    return {
      ...defaults,
      ...config[sectionKey],
      ...(typeof pageOverride == "boolean"
        ? {
            enabled: pageOverride
          }
        : pageOverride || {})
    };
  };
  // 各分节默认 false / 关闭：页面行为是增强项，缺省不改变既有手感。interaction 的默认旋转模式
  return {
    interaction: mergeSection("interaction", {
      rotationMode: config.camera?.rotationMode || "free",
      panEnabled: false,
      zoomEnabled: false
    }),
    autoRotate: mergeSection("autoRotate", {
      enabled: false,
      idleSeconds: 30,
      speed: 6,
      direction: "clockwise",
      returnToDefault: false
    }),
    idleExitFocus: mergeSection("idleExitFocus", {
      enabled: false,
      idleSeconds: 30
    }),
    idleHideIcons: mergeSection("idleHideIcons", {
      enabled: false,
      idleSeconds: 30
    }),
    hideIconsWhileRotating:
      typeof pageOverrides?.hideIconsWhileRotating == "boolean"
        ? pageOverrides.hideIconsWhileRotating
        : config.hideIconsWhileRotating === true
  };
}
