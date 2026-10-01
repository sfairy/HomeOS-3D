export function normalizeGroundReflection(settings = {}) {
  return (
    (settings = settings && typeof settings == "object" ? settings : {}),
    {
      mode: ["off", "inside", "outside", "all"].includes(settings.mode) ? settings.mode : "off",
      resolution: [256, 512, 768].includes(settings.resolution) ? settings.resolution : 512,
      strength: Number.isFinite(settings.strength)
        ? Math.max(0, Math.min(0.45, settings.strength))
        : 0.18,
    }
  );
}
