/**
 * 页面行为解析：把「组件级配置 + 页面级覆盖」合成某类设备页面最终生效的行为参数。
 *
 * 舞台页在渲染每类设备面板（灯光 / 环境 / 设备 / 清扫 / 安防）前调用一次，结果决定旋转、
 * 自动旋转、空闲退出聚焦、空闲隐藏图标等开关。deviceKind 到页面名的映射就是设置面板里的
 * 分组名，新增分组必须同步改这里。纯函数，无副作用。
 */

/**
 * 解析指定设备种类的最终页面行为。
 * 合并优先级自低到高为：本函数内置默认值 → 组件级 config → 页面级覆盖。
 */
export function resolvePageBehavior(config = {}, deviceKind = "light") {
  // 清扫、电视、NAS、窗帘、空调在设置面板里各自归入固定的页面分组，
  // 未列出的种类（如 light）页面名与种类同名，因此直接把 deviceKind 当作页面名兜底。
  const targetPage =
    {
      climate: "environment",
      cover: "environment",
      nas: "devices",
      television: "devices",
      "vacuum-shortcut": "vacuum"
    }[deviceKind] || deviceKind;
  // scope 非 page 时覆盖整体失效；这里显式取 null 而不只是忽略，
  // 保证后面合并逻辑只有「有覆盖 / 无覆盖」两种状态。
  const pageOverrides = config.behaviorScope === "page" ? config.pageBehaviors?.[targetPage] : null;
  // 三个 spread 的书写顺序即优先级（后者覆盖前者），不能调换。
  // 页面级覆盖允许布尔简写：设置面板的一键开关只写一个布尔值，此时按 { enabled: 值 } 解释。
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
  // 兼容历史文档——早期把相机设置存在 camera 下，故回落 config.camera.rotationMode 而非写死 "free"。
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
