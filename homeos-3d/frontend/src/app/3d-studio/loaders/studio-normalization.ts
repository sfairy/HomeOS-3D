export {
  isCourtyardDrawing,
  normalizeCourtyardDrawing,
} from "../plan/courtyard-drawing";
function clamp(rawValue, minValue, maxValue) {
  return Math.min(maxValue, Math.max(minValue, rawValue));
}
export function finite(candidateValue, fallbackValue = 0) {
  const numericValue = Number(candidateValue);
  return Number.isFinite(numericValue) ? numericValue : fallbackValue;
}
export function normalizeFullRotation(angleDeg, fallbackAngleDeg = 0) {
  const normalizedAngleDeg = finite(angleDeg, fallbackAngleDeg);
  return normalizedAngleDeg >= 0 && normalizedAngleDeg <= 360
    ? normalizedAngleDeg
    : ((normalizedAngleDeg % 360) + 360) % 360;
}
export function itemMinimumFootprint(footprintItemType) {
  return ["presence", "smart-socket-86"].includes(footprintItemType) ? 0.01 : 0.1;
}
export function itemMinimumHeight(heightItemType) {
  return heightItemType?.startsWith("courtyard-")
    ? 0.01
    : heightItemType === "planlabel"
      ? 0.001
      : heightItemType === "rug"
        ? 0.004
        : 0.05;
}
export function normalizePoint(rawPoint) {
  return {
    x: finite(rawPoint?.x),
    y: finite(rawPoint?.y),
  };
}
export function normalizeLabelText(rawLabelText, fallbackLabelText, maxLabelLength) {
  return (
    String(rawLabelText ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLabelLength) || fallbackLabelText
  );
}
export function kelvinToRgbHex(kelvinValue) {
  const normalizedKelvin = clamp(finite(kelvinValue, 3000), 2200, 6500) / 100,
    redChannel =
      normalizedKelvin <= 66 ? 255 : 329.698727446 * (normalizedKelvin - 60) ** -0.1332047592,
    greenChannel =
      normalizedKelvin <= 66
        ? 99.4708025861 * Math.log(normalizedKelvin) - 161.1195681661
        : 288.1221695283 * (normalizedKelvin - 60) ** -0.0755148492,
    blueChannel =
      normalizedKelvin >= 66
        ? 255
        : normalizedKelvin <= 19
          ? 0
          : 138.5177312231 * Math.log(normalizedKelvin - 10) - 305.0447927307,
    clampChannel = (channelValue) => Math.round(clamp(channelValue, 0, 255));
  return (
    (clampChannel(redChannel) << 16) | (clampChannel(greenChannel) << 8) | clampChannel(blueChannel)
  );
}
export function normalizeFixedCameraView(rawCameraView) {
  if (!rawCameraView || typeof rawCameraView != "object") return null;
  const positionVector = {
      x: clamp(finite(rawCameraView.position?.x), -500, 500),
      y: clamp(finite(rawCameraView.position?.y), -500, 500),
      z: clamp(finite(rawCameraView.position?.z), -500, 500),
    },
    targetVector = {
      x: clamp(finite(rawCameraView.target?.x), -500, 500),
      y: clamp(finite(rawCameraView.target?.y), -500, 500),
      z: clamp(finite(rawCameraView.target?.z), -500, 500),
    };
  if (
    Math.hypot(
      positionVector.x - targetVector.x,
      positionVector.y - targetVector.y,
      positionVector.z - targetVector.z,
    ) < 0.1
  )
    return null;
  const fixedCameraView: {
    mode: string;
    view: string;
    topRotation: number;
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
    visibleHeight: number;
    fov: number;
    focalLength: number | null;
    frameSize?: number;
  } = {
    mode: rawCameraView.mode === "perspective" ? "perspective" : "orthographic",
    view: rawCameraView.view === "top" ? "top" : "free",
    topRotation: (((Math.round(finite(rawCameraView.topRotation, 0) / 90) * 90) % 360) + 360) % 360,
    position: positionVector,
    target: targetVector,
    visibleHeight: clamp(finite(rawCameraView.visibleHeight, 10), 1, 100),
    fov: clamp(finite(rawCameraView.fov, 36), 20, 80),
    focalLength:
      rawCameraView.focalLength !== null &&
      rawCameraView.focalLength !== undefined &&
      Number.isFinite(Number(rawCameraView.focalLength))
        ? clamp(finite(rawCameraView.focalLength, 50), 18, 120)
        : null,
  };
  return (
    Number.isFinite(Number(rawCameraView.frameSize)) &&
      Number(rawCameraView.frameSize) > 0 &&
      (fixedCameraView.frameSize = clamp(finite(rawCameraView.frameSize, 10), 1, 100)),
    fixedCameraView
  );
}
export function normalizeCameraSettings(cameraSettings) {
  return {
    cameraView: cameraSettings?.cameraView === "top" ? "top" : "free",
    cameraTopRotation:
      (((Math.round(finite(cameraSettings?.cameraTopRotation, 0) / 90) * 90) % 360) + 360) % 360,
    cameraMode: cameraSettings?.cameraMode === "orthographic" ? "orthographic" : "perspective",
    cameraFocalLength: clamp(finite(cameraSettings?.cameraFocalLength, 50), 18, 120),
  };
}
export const DEFAULT_BASE_LIGHTING = Object.freeze({
  exposure: 1.05,
  hemisphereIntensity: 0.58,
  ambientIntensity: 0.16,
  mainIntensity: 2.05,
  mainAzimuth: 139,
  mainElevation: 55,
  mainShadowIntensity: 0.18,
  fillIntensity: 0.16,
  fillAzimuth: -48,
  fillElevation: 28,
  topIntensity: 0.12,
  topAzimuth: 90,
  topElevation: 86,
});
export function normalizeBaseLighting(baseLighting) {
  const lightingConfig = baseLighting && typeof baseLighting == "object" ? baseLighting : {};
  return {
    exposure: clamp(finite(lightingConfig.exposure, DEFAULT_BASE_LIGHTING.exposure), 0.5, 2),
    ...(lightingConfig.floorBrightness !== undefined
      ? {
          floorBrightness: clamp(finite(lightingConfig.floorBrightness, 100), 50, 150),
        }
      : {}),
    hemisphereIntensity: clamp(
      finite(lightingConfig.hemisphereIntensity, DEFAULT_BASE_LIGHTING.hemisphereIntensity),
      0,
      3,
    ),
    ambientIntensity: clamp(
      finite(lightingConfig.ambientIntensity, DEFAULT_BASE_LIGHTING.ambientIntensity),
      0,
      2,
    ),
    mainIntensity: clamp(
      finite(lightingConfig.mainIntensity, DEFAULT_BASE_LIGHTING.mainIntensity),
      0,
      5,
    ),
    mainAzimuth: clamp(
      finite(lightingConfig.mainAzimuth, DEFAULT_BASE_LIGHTING.mainAzimuth),
      -180,
      180,
    ),
    mainElevation: clamp(
      finite(lightingConfig.mainElevation, DEFAULT_BASE_LIGHTING.mainElevation),
      5,
      89,
    ),
    mainShadowIntensity: clamp(
      finite(lightingConfig.mainShadowIntensity, DEFAULT_BASE_LIGHTING.mainShadowIntensity),
      0,
      1,
    ),
    fillIntensity: clamp(
      finite(lightingConfig.fillIntensity, DEFAULT_BASE_LIGHTING.fillIntensity),
      0,
      3,
    ),
    fillAzimuth: clamp(
      finite(lightingConfig.fillAzimuth, DEFAULT_BASE_LIGHTING.fillAzimuth),
      -180,
      180,
    ),
    fillElevation: clamp(
      finite(lightingConfig.fillElevation, DEFAULT_BASE_LIGHTING.fillElevation),
      0,
      89,
    ),
    topIntensity: clamp(
      finite(lightingConfig.topIntensity, DEFAULT_BASE_LIGHTING.topIntensity),
      0,
      3,
    ),
    topAzimuth: clamp(
      finite(lightingConfig.topAzimuth, DEFAULT_BASE_LIGHTING.topAzimuth),
      -180,
      180,
    ),
    topElevation: clamp(
      finite(lightingConfig.topElevation, DEFAULT_BASE_LIGHTING.topElevation),
      0,
      89,
    ),
  };
}
