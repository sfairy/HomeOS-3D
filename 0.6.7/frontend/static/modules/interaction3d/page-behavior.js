export function resolvePageBehavior(behavior = {}, pageKind = "light") {
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
