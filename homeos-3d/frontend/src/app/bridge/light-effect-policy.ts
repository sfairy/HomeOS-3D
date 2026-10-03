const LIGHT_EFFECT_RANGE = Object.freeze({
    brightnessMin: 50,
    brightnessMax: 150,
    temperatureMin: 2700,
    temperatureMax: 6500,
  }),
  LIGHT_EFFECT_DEFAULTS = Object.freeze({
    brightness: 150,
    kelvin: 3500,
  });
export function withFixedLightEffects(settings) {
  return {
    ...settings,
    effectRange: {
      ...LIGHT_EFFECT_RANGE,
    },
    effectDefaults: {
      ...LIGHT_EFFECT_DEFAULTS,
    },
  };
}
