export {
  isCourtyardDrawing,
  normalizeCourtyardDrawing,
} from "./courtyard-drawing.js?v=20260927-drawing-v5";
function i(arg1, arg2, arg3) {
  return Math.min(arg3, Math.max(arg2, arg1));
}
export function finite(arg4, arg5 = 0) {
  const value1 = Number(arg4);
  return Number.isFinite(value1) ? value1 : arg5;
}
export function normalizeFullRotation(arg6, arg7 = 0) {
  const value2 = finite(arg6, arg7);
  return value2 >= 0 && value2 <= 360 ? value2 : ((value2 % 360) + 360) % 360;
}
export function itemMinimumFootprint(arg8) {
  return ["presence", "smart-socket-86"].includes(arg8) ? 0.01 : 0.1;
}
export function itemMinimumHeight(arg9) {
  return arg9?.startsWith("courtyard-")
    ? 0.01
    : arg9 === "planlabel"
      ? 0.001
      : arg9 === "rug"
        ? 0.004
        : 0.05;
}
export function normalizePoint(arg10) {
  return {
    x: finite(arg10?.x),
    y: finite(arg10?.y),
  };
}
export function normalizeLabelText(arg11, arg12, arg13) {
  return (
    String(arg11 ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, arg13) || arg12
  );
}
export function kelvinToRgbHex(arg14) {
  const value3 = i(finite(arg14, 3000), 2200, 6500) / 100,
    value4 = value3 <= 66 ? 255 : 329.698727446 * (value3 - 60) ** -0.1332047592,
    value5 =
      value3 <= 66
        ? 99.4708025861 * Math.log(value3) - 161.1195681661
        : 288.1221695283 * (value3 - 60) ** -0.0755148492,
    value6 =
      value3 >= 66
        ? 255
        : value3 <= 19
          ? 0
          : 138.5177312231 * Math.log(value3 - 10) - 305.0447927307,
    fn1 = (arg15) => Math.round(i(arg15, 0, 255));
  return (fn1(value4) << 16) | (fn1(value5) << 8) | fn1(value6);
}
export function normalizeFixedCameraView(arg16) {
  if (!arg16 || typeof arg16 != "object") return null;
  const object1 = {
      x: i(finite(arg16.position?.x), -500, 500),
      y: i(finite(arg16.position?.y), -500, 500),
      z: i(finite(arg16.position?.z), -500, 500),
    },
    object2 = {
      x: i(finite(arg16.target?.x), -500, 500),
      y: i(finite(arg16.target?.y), -500, 500),
      z: i(finite(arg16.target?.z), -500, 500),
    };
  if (Math.hypot(object1.x - object2.x, object1.y - object2.y, object1.z - object2.z) < 0.1)
    return null;
  const object3 = {
    mode: arg16.mode === "perspective" ? "perspective" : "orthographic",
    view: arg16.view === "top" ? "top" : "free",
    topRotation: (((Math.round(finite(arg16.topRotation, 0) / 90) * 90) % 360) + 360) % 360,
    position: object1,
    target: object2,
    visibleHeight: i(finite(arg16.visibleHeight, 10), 1, 100),
    fov: i(finite(arg16.fov, 36), 20, 80),
    focalLength:
      arg16.focalLength !== null &&
      arg16.focalLength !== undefined &&
      Number.isFinite(Number(arg16.focalLength))
        ? i(finite(arg16.focalLength, 50), 18, 120)
        : null,
  };
  return (
    Number.isFinite(Number(arg16.frameSize)) &&
      Number(arg16.frameSize) > 0 &&
      (object3.frameSize = i(finite(arg16.frameSize, 10), 1, 100)),
    object3
  );
}
export function normalizeCameraSettings(arg17) {
  return {
    cameraView: arg17?.cameraView === "top" ? "top" : "free",
    cameraTopRotation:
      (((Math.round(finite(arg17?.cameraTopRotation, 0) / 90) * 90) % 360) + 360) % 360,
    cameraMode: arg17?.cameraMode === "orthographic" ? "orthographic" : "perspective",
    cameraFocalLength: i(finite(arg17?.cameraFocalLength, 50), 18, 120),
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
export function normalizeBaseLighting(arg18) {
  const value7 = arg18 && typeof arg18 == "object" ? arg18 : {};
  return {
    exposure: i(finite(value7.exposure, DEFAULT_BASE_LIGHTING.exposure), 0.5, 2),
    ...(value7.floorBrightness !== undefined
      ? {
          floorBrightness: i(finite(value7.floorBrightness, 100), 50, 150),
        }
      : {}),
    hemisphereIntensity: i(
      finite(value7.hemisphereIntensity, DEFAULT_BASE_LIGHTING.hemisphereIntensity),
      0,
      3,
    ),
    ambientIntensity: i(
      finite(value7.ambientIntensity, DEFAULT_BASE_LIGHTING.ambientIntensity),
      0,
      2,
    ),
    mainIntensity: i(finite(value7.mainIntensity, DEFAULT_BASE_LIGHTING.mainIntensity), 0, 5),
    mainAzimuth: i(finite(value7.mainAzimuth, DEFAULT_BASE_LIGHTING.mainAzimuth), -180, 180),
    mainElevation: i(finite(value7.mainElevation, DEFAULT_BASE_LIGHTING.mainElevation), 5, 89),
    mainShadowIntensity: i(
      finite(value7.mainShadowIntensity, DEFAULT_BASE_LIGHTING.mainShadowIntensity),
      0,
      1,
    ),
    fillIntensity: i(finite(value7.fillIntensity, DEFAULT_BASE_LIGHTING.fillIntensity), 0, 3),
    fillAzimuth: i(finite(value7.fillAzimuth, DEFAULT_BASE_LIGHTING.fillAzimuth), -180, 180),
    fillElevation: i(finite(value7.fillElevation, DEFAULT_BASE_LIGHTING.fillElevation), 0, 89),
    topIntensity: i(finite(value7.topIntensity, DEFAULT_BASE_LIGHTING.topIntensity), 0, 3),
    topAzimuth: i(finite(value7.topAzimuth, DEFAULT_BASE_LIGHTING.topAzimuth), -180, 180),
    topElevation: i(finite(value7.topElevation, DEFAULT_BASE_LIGHTING.topElevation), 0, 89),
  };
}
