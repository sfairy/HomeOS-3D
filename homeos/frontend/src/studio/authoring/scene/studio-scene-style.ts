export const WARM_WOOD_STYLE = Object.freeze({
  warmWood: true,
  planLabelText: 'rgb(118, 102, 84)',
  planLabelLine: 'rgba(118, 102, 84, 0.72)',
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
})
export function decorateWarmFloor(material: any, style: any) {
  if (!style.warmWood) return
  // 自然木语用胡桃色 + 更窄的板宽与更密的木纹；暖阳原木保持浅橡木。共用同一段 shader 结构，
  // 只换常量 —— 两套 GLSL 各自演化的话，改一处必然忘另一处。
  const isNatural = style.naturalWood === true,
    plankWidth = isNatural ? '0.19' : '0.28',
    plankLength = isNatural ? '1.80' : '2.40',
    grainFrequency = isNatural ? '128.0' : '94.0',
    grainAmplitude = isNatural ? '0.014' : '0.008',
    seamStrength = isNatural ? '0.14' : '0.10',
    programTag = isNatural ? ':natural-walnut-v1' : ':warm-pale-oak-v1'
  ;(material.roughness = 0.92), (material.emissiveIntensity = isNatural ? 0.06 : 0.075), (material.roughness = 0.84)
  const originalBeforeCompile = material.onBeforeCompile,
    originalProgramKey = material.customProgramCacheKey.bind(material)()
  const woodGrainChunk =
    '#include <color_fragment>\n        vec2 oakP = hbOakPosition;\n' +
    `        float oakRow = floor(oakP.y / ${plankWidth});\n` +
    `        float oakV = fract(oakP.y / ${plankWidth});\n` +
    `        float oakU = fract(oakP.x / ${plankLength} + mod(oakRow, 3.0) / 3.0);\n` +
    `        float oakAcross = min(oakV, 1.0 - oakV) * ${plankWidth};\n` +
    `        float oakEnd = min(oakU, 1.0 - oakU) * ${plankLength};\n` +
    '        vec2 oakAA = max(fwidth(oakP), vec2(0.0001));\n' +
    '        float oakSeam = (1.0 - smoothstep(0.001, 0.001 + oakAA.y, oakAcross)) * min(1.0, 0.003 / oakAA.y);\n' +
    '        float oakJoint = (1.0 - smoothstep(0.001, 0.001 + oakAA.x, oakEnd)) * min(1.0, 0.003 / oakAA.x);\n' +
    `        float oakGrain = sin(oakP.y * ${grainFrequency} + sin(oakP.x * 1.15 + oakRow) * 1.5);\n` +
    '        float oakDetail = 1.0 - smoothstep(0.012, 0.05, oakAA.y);\n' +
    `        float oakTone = 1.0 + sin(oakRow * 2.31) * 0.006 + oakGrain * oakDetail * ${grainAmplitude}\n` +
    `          - max(oakSeam, oakJoint) * ${seamStrength};\n` +
    '        diffuseColor.rgb *= mix(1.0, oakTone, step(0.8, hbOakTop));\n      '
  ;(material.onBeforeCompile = function (shader: any, renderer: any) {
    originalBeforeCompile.call(this, shader, renderer),
      (shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 hbOakPosition;\nvarying float hbOakTop;')
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nhbOakPosition = (modelMatrix * vec4(transformed, 1.0)).xz;\nhbOakTop = abs((mat3(modelMatrix) * normal).y);',
        )),
      (shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 hbOakPosition;\nvarying float hbOakTop;')
        .replace('#include <color_fragment>', woodGrainChunk))
  }),
    (material.customProgramCacheKey = () => originalProgramKey + programTag)
}
