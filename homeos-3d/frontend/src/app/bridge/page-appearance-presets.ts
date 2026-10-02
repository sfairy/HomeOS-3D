const baseAppearancePreset = {
  pageDimStrength: {
    overview: 0,
    light: 0,
    environment: 30,
    devices: 30,
    vacuum: 30,
    security: 30,
  },
  pageSaturation: {
    overview: 100,
    light: 100,
    environment: 100,
    devices: 100,
    vacuum: 100,
    security: 100,
  },
  focusDimStrength: 0,
  focusVignetteStrength: 0,
};
for (const presetValue of Object.values(baseAppearancePreset))
  presetValue && typeof presetValue == "object" && Object.freeze(presetValue);
Object.freeze(baseAppearancePreset);
const PAGE_APPEARANCE_PRESETS = Object.freeze({
  default: baseAppearancePreset,
  "warm-wood": baseAppearancePreset,
});
export function withPageAppearancePreset(sceneConfig) {
  const appearancePreset =
    PAGE_APPEARANCE_PRESETS[sceneConfig.sceneStyle === "warm-wood" ? "warm-wood" : "default"];
  return {
    ...sceneConfig,
    ...structuredClone(appearancePreset),
  };
}
