export function haNumber(rawValue) {
  if (typeof rawValue == "string") {
    if (
      ((rawValue = rawValue.trim()),
      !/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(rawValue))
    )
      return null;
    rawValue = Number(rawValue);
  }
  return typeof rawValue == "number" && Number.isFinite(rawValue) ? rawValue : null;
}
export function attributesOf(entityState) {
  const attributes = entityState?.attributes;
  return attributes && typeof attributes == "object" && !Array.isArray(attributes) ? attributes : {};
}
export function featureFlags(attributes) {
  const parsedFeatures = haNumber(attributes.supported_features);
  return Number.isInteger(parsedFeatures) && parsedFeatures >= 0 && parsedFeatures <= 2147483647
    ? parsedFeatures
    : 0;
}
export const stringOptions = (values) =>
    Array.isArray(values)
      ? [...new Set(values.filter((value) => typeof value == "string" && value.trim()))]
      : [],
  brightnessModes = new Set([
    "brightness",
    "color_temp",
    "hs",
    "xy",
    "rgb",
    "rgbw",
    "rgbww",
    "white",
  ]);
export function fanCapabilities(attributes) {
  const flags = featureFlags(attributes),
    unversioned = !Object.hasOwn(attributes, "supported_features");
  return {
    canTurnOn: unversioned || !!(flags & 32),
    canTurnOff: unversioned || !!(flags & 16),
    percentageSupported: unversioned ? haNumber(attributes.percentage) !== null : !!(flags & 1),
    oscillatingSupported: !!(flags & 2),
    directionSupported: !!(flags & 4),
    presetModes: unversioned || flags & 8 ? stringOptions(attributes.preset_modes) : [],
  };
}
