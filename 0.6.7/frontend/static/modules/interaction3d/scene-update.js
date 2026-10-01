const m = [
    "planViewRotation",
    "cameraView",
    "cameraTopRotation",
    "cameraMode",
    "cameraFocalLength",
    "fixedCameraView",
    "livePreviewEnabled",
    "backgroundVisible",
    "snapEnabled",
    "snapEndpoints",
    "snapIntersections",
    "snapSegments",
    "snapOrthogonal",
    "snapAngles",
    "snapGrid",
    "snapTolerance",
    "previewPanelRatio",
    "detailsPanelWidthRatio",
  ],
  f = [
    "activeFloorId",
    "previewFloorMode",
    "combinedCameraSettings",
    "combinedFixedCameraView",
    "exportFloorGap",
    "exportPresets",
    "activeExportPresetSlot",
  ];
function s(arg1, arg2) {
  const object1 = {
    ...arg1,
  };
  for (const value1 of arg2) delete object1[value1];
  return object1;
}
function r(arg3) {
  return Array.isArray(arg3)
    ? arg3.map(r)
    : arg3 && typeof arg3 == "object"
      ? Object.fromEntries(
          Object.keys(arg3)
            .sort()
            .map((arg4) => [arg4, r(arg3[arg4])]),
        )
      : arg3;
}
const o = (arg5) => JSON.stringify(r(arg5)),
  g = (arg6) => ({
    ...arg6.scene,
    settings: s(arg6.scene?.settings, m),
  }),
  p = (arg7) => s(arg7, ["scene", "name", "aligned", "alignmentPending"]);
export function sceneUpdatePlan(arg8, arg9) {
  const map1 = new Map(arg8.floors.map((arg10) => [arg10.id, arg10])),
    fn1 = (arg11) => s(arg11, [...f, "floors", "baseLighting"]),
    value2 = o(fn1(arg8)) !== o(fn1(arg9)) || o(arg8.floors.map(p)) !== o(arg9.floors.map(p)),
    value3 = arg9.floors
      .filter((arg12) => !map1.has(arg12.id) || o(g(map1.get(arg12.id))) !== o(g(arg12)))
      .map((arg13) => arg13.id),
    value4 = o(arg8.baseLighting) !== o(arg9.baseLighting);
  return {
    full: value2,
    floors: value3,
    lighting: value4,
    visual: value2 || value3.length > 0 || value4,
  };
}
