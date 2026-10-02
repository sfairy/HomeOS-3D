/**
 * 页面行为配置来自文档，键是行为名（interaction / autoRotate / …），取值由各行为自己解释，
 * 所以除少数已知键外统一走索引签名。
 */
type PageBehaviorConfig = {
  behaviorScope?: string;
  pageBehaviors?: Record<string, Record<string, any>>;
  camera?: { rotationMode?: string };
  hideIconsWhileRotating?: unknown;
  // 每种行为的取值形状不同，且会被原样展开进结果，因此这里不设约束。
  [behaviorName: string]: any;
};
export function resolvePageBehavior(behavior: PageBehaviorConfig = {}, pageKind = "light") {
  const normalizedPage =
      {
        climate: "environment",
        cover: "environment",
        nas: "devices",
        speaker: "devices",
        television: "devices",
        "vacuum-shortcut": "vacuum",
      }[pageKind] || pageKind,
    scopeBehaviors =
      behavior.behaviorScope === "page" ? behavior.pageBehaviors?.[normalizedPage] : null,
    mergeBehavior = (name, defaults) => {
      const scopedBehavior = scopeBehaviors?.[name];
      return {
        ...defaults,
        ...behavior[name],
        ...(typeof scopedBehavior == "boolean"
          ? {
              enabled: scopedBehavior,
            }
          : scopedBehavior || {}),
      };
    };
  return {
    interaction: mergeBehavior("interaction", {
      rotationMode: behavior.camera?.rotationMode || "free",
      panEnabled: false,
      zoomEnabled: false,
    }),
    autoRotate: mergeBehavior("autoRotate", {
      enabled: false,
      idleSeconds: 30,
      speed: 6,
      direction: "clockwise",
      returnToDefault: false,
    }),
    idleExitFocus: mergeBehavior("idleExitFocus", {
      enabled: false,
      idleSeconds: 30,
    }),
    idleHideIcons: mergeBehavior("idleHideIcons", {
      enabled: false,
      idleSeconds: 30,
    }),
    hideIconsWhileRotating:
      typeof scopeBehaviors?.hideIconsWhileRotating == "boolean"
        ? scopeBehaviors.hideIconsWhileRotating
        : behavior.hideIconsWhileRotating === true,
  };
}
