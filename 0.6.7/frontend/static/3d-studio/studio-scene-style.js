export const WARM_WOOD_STYLE = Object.freeze({
  warmWood: true,
  windowFrame: 10726055,
  doorFrame: 10725279,
  entryDoorFrame: 6843753,
  solidDoorFrame: 15327699,
  rollerCurtain: 15327699,
  rollerSlat: 13748409,
  floorLampBody: 7830133,
  showerMetal: 4146760,
  sofaFabric: 16776434,
  cabinetWood: 12884602,
  countertop: 16117989,
  diningLinen: 10926731,
  diningSage: 10926731,
  wood: 12158296,
  woodLight: 14069375,
  woodDark: 9462335,
  joineryAccent: 14278595,
  decorAccent: 13142117,
  leafColor: 6131544,
  background: 15329247,
  ground: 15658212,
  floor: 15919321,
  floorEdge: 16314851,
  grid: 14012611,
  wall: 16776436,
  wallTop: 16777215,
  furniture: 12158296,
  furnitureSoft: 11914636,
  furnitureLight: 16776434,
  furnitureDark: 6640449,
  appliance: 16052453,
  applianceSoft: 16776693,
  applianceDark: 4936789,
  glass: 9226677,
  frame: 10257502,
  doorLeaf: 15327699,
});
export function decorateWarmFloor(material, style) {
  if (!style.warmWood) return;
  ((material.roughness = 0.92), (material.emissiveIntensity = 0.075), (material.roughness = 0.84));
  const originalBeforeCompile = material.onBeforeCompile,
    originalProgramKey = material.customProgramCacheKey.bind(material)();
  ((material.onBeforeCompile = function (shader, renderer) {
    (originalBeforeCompile.call(this, shader, renderer),
      (shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec2 hbOakPosition;\nvarying float hbOakTop;",
        )
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nhbOakPosition = (modelMatrix * vec4(transformed, 1.0)).xz;\nhbOakTop = abs((mat3(modelMatrix) * normal).y);",
        )),
      (shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec2 hbOakPosition;\nvarying float hbOakTop;",
        )
        .replace(
          "#include <color_fragment>",
          "#include <color_fragment>\n        vec2 oakP = hbOakPosition;\n        float oakRow = floor(oakP.y / 0.28);\n        float oakV = fract(oakP.y / 0.28);\n        float oakU = fract(oakP.x / 2.4 + mod(oakRow, 3.0) / 3.0);\n        float oakAcross = min(oakV, 1.0 - oakV) * 0.28;\n        float oakEnd = min(oakU, 1.0 - oakU) * 2.4;\n        vec2 oakAA = max(fwidth(oakP), vec2(0.0001));\n        float oakSeam = (1.0 - smoothstep(0.001, 0.001 + oakAA.y, oakAcross)) * min(1.0, 0.003 / oakAA.y);\n        float oakJoint = (1.0 - smoothstep(0.001, 0.001 + oakAA.x, oakEnd)) * min(1.0, 0.003 / oakAA.x);\n        float oakGrain = sin(oakP.y * 94.0 + sin(oakP.x * 1.15 + oakRow) * 1.5);\n        float oakDetail = 1.0 - smoothstep(0.012, 0.05, oakAA.y);\n        float oakTone = 1.0 + sin(oakRow * 2.31) * 0.006 + oakGrain * oakDetail * 0.008\n          - max(oakSeam, oakJoint) * 0.1;\n        diffuseColor.rgb *= mix(1.0, oakTone, step(0.8, hbOakTop));\n      ",
        )));
  }),
    (material.customProgramCacheKey = () => originalProgramKey + ":warm-pale-oak-v1"));
}
