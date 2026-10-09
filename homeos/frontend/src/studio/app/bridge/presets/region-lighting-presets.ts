const baseLightingPreset = {
  ambientIntensity: 0.16,
  fillAzimuth: -48,
  fillElevation: 28,
  fillIntensity: 0.16,
  hemisphereIntensity: 0.58,
  mainAzimuth: 139,
  mainElevation: 55,
  mainIntensity: 2.05,
  mainShadowIntensity: 0.18,
  topAzimuth: 90,
  topElevation: 86,
  topIntensity: 0.12,
};
const REGION_LIGHTING_PRESETS = Object.freeze({
  default: Object.freeze({
    ...baseLightingPreset,
    exposure: 0.95,
    floorBrightness: 75,
  }),
  "warm-wood": Object.freeze({
    ...baseLightingPreset,
    exposure: 0.6,
    floorBrightness: 50,
  }),
});
export function withRegionLightingPreset(sceneConfig: any) {
  if (sceneConfig.lightingMode !== "region") return sceneConfig;
  const presetKey = sceneConfig.sceneStyle === "warm-wood" ? "warm-wood" : "default";
  return {
    ...sceneConfig,
    baseLighting: {
      ...REGION_LIGHTING_PRESETS[presetKey],
    },
  };
}
