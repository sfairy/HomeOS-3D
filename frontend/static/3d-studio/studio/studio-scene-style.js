/**
 * 「暖阳原木」主题的调色板与地板材质增强。
 *
 * 色卡拆成两张，供两类调用方各取所需：
 *   - WARM_SCENE_STYLE：场景与建筑本体 —— 背景、地面、地板、网格、墙、门窗框与门扇。
 *     只有「暖阳原木」这一档会叠加（studio-app.js 的 studioPalette()），默认风格下不动，
 *     这样墙、地板、灯光、背景、门窗在任何风格里都维持原观感。
 *   - WARM_HOME_STYLE：家居 —— 家具、软装、家电、洁具。默认风格也叠加这一张
 *     （homePalette()），所以默认风格下的家居配色与「暖阳原木」一致。
 * WARM_WOOD_STYLE 是两张合并的结果（外加总开关 warmWood: true），暖阳原木那一档逐值不变。
 *
 * 地板另需 decorateWarmFloor 做橡木拼板接缝与木纹，仅换基色做不出来。
 *
 * 约定：色值用 0xRRGGBB 十进制，与 three 的 Color 直接互通。本表不含 accent / accentIntensity /
 * exposure / wallOpacity —— 这四项仍取 STUDIO_PALETTE 的原值，合并时不要补上，否则会偏离原设计。
 */
export const WARM_HOME_STYLE = Object.freeze({
  // 帘轨、灯体与五金：暖白到浅木色的一族。
  rollerCurtain: 15327699,
  rollerSlat: 13748409,
  floorLampBody: 7830133,
  showerMetal: 4146760,
  // 家具主色：布艺、柜体、台面与餐桌布。
  sofaFabric: 16776434,
  cabinetWood: 12884602,
  countertop: 16117989,
  diningLinen: 10926731,
  diningSage: 10926731,
  // 木色三档：主体、浅色高光面与深色描边。
  wood: 12158296,
  woodLight: 14069375,
  woodDark: 9462335,
  joineryAccent: 14278595,
  decorAccent: 13142117,
  leafColor: 6131544,
  // 家具四档 + 家电三档。
  furniture: 12158296,
  furnitureSoft: 11914636,
  furnitureLight: 16776434,
  furnitureDark: 6640449,
  appliance: 16052453,
  applianceSoft: 16776693,
  applianceDark: 4936789,
  glass: 9226677,
  frame: 10257502
});
export const WARM_SCENE_STYLE = Object.freeze({
  // 门窗框与门扇：暖白到浅木色的一族。
  windowFrame: 10726055,
  doorFrame: 10725279,
  entryDoorFrame: 6843753,
  solidDoorFrame: 15327699,
  doorLeaf: 15327699,
  // 场景底色：背景、地面、地板、地板描边与网格。
  background: 15329247,
  ground: 15658212,
  floor: 15919321,
  floorEdge: 16314851,
  grid: 14012611,
  // 墙体：墙身偏暖白、墙顶几乎纯白，形成柔和的顶光观感。
  wall: 16776436,
  wallTop: 16777215
});
export const WARM_WOOD_STYLE = Object.freeze({
  // 总开关：材质层大量分支都以它为准，取色表本身也带这一位。
  warmWood: true,
  ...WARM_HOME_STYLE,
  ...WARM_SCENE_STYLE
});
/**
 * 给地板材质注入「泛白橡木」的程序化拼板与木纹。
 * 在标准材质插入两段 GLSL：顶点阶段传世界坐标 xz 与法线竖向分量；片元阶段按 0.28m 行距切拼板行、
 * 每行按 2.4m 错缝，画板缝 / 端缝 / 细木纹，线条用 fwidth 抗锯齿。只在暖阳原木下生效。
 */
export function decorateWarmFloor(material, palette) {
  if (!palette.warmWood) {
    return;
  }
  // 0.5.6 里先写 0.92、紧接着又被 0.84 覆盖：按原样保留两次赋值，
  // 以便与上游逐行对齐；实际生效的粗糙度是 0.84（暖阳下地板更亮、反光更收）。
  material.roughness = 0.92;
  material.emissiveIntensity = 0.075;
  material.roughness = 0.84;
  // 与其它材质注入一样：先接上原有的编译钩子与缓存键，
  // 否则会丢掉上层已注入的效果，或让着色器缓存串味。
  const previousOnBeforeCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey.bind(material)();
  material.onBeforeCompile = function (shader, renderer) {
    previousOnBeforeCompile.call(this, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 hbOakPosition;\nvarying float hbOakTop;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nhbOakPosition = (modelMatrix * vec4(transformed, 1.0)).xz;\nhbOakTop = abs((mat3(modelMatrix) * normal).y);"
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 hbOakPosition;\nvarying float hbOakTop;")
      .replace(
        "#include <color_fragment>",
        "#include <color_fragment>\n        vec2 oakP = hbOakPosition;\n        float oakRow = floor(oakP.y / 0.28);\n        float oakV = fract(oakP.y / 0.28);\n        float oakU = fract(oakP.x / 2.4 + mod(oakRow, 3.0) / 3.0);\n        float oakAcross = min(oakV, 1.0 - oakV) * 0.28;\n        float oakEnd = min(oakU, 1.0 - oakU) * 2.4;\n        vec2 oakAA = max(fwidth(oakP), vec2(0.0001));\n        float oakSeam = (1.0 - smoothstep(0.001, 0.001 + oakAA.y, oakAcross)) * min(1.0, 0.003 / oakAA.y);\n        float oakJoint = (1.0 - smoothstep(0.001, 0.001 + oakAA.x, oakEnd)) * min(1.0, 0.003 / oakAA.x);\n        float oakGrain = sin(oakP.y * 94.0 + sin(oakP.x * 1.15 + oakRow) * 1.5);\n        float oakDetail = 1.0 - smoothstep(0.012, 0.05, oakAA.y);\n        float oakTone = 1.0 + sin(oakRow * 2.31) * 0.006 + oakGrain * oakDetail * 0.008\n          - max(oakSeam, oakJoint) * 0.1;\n        diffuseColor.rgb *= mix(1.0, oakTone, step(0.8, hbOakTop));\n      "
      );
  };
  // 注入改变了着色器源码，缓存键必须跟着变；后缀带版本号便于后续再改时失效旧程序。
  material.customProgramCacheKey = () => previousCacheKey + ":warm-pale-oak-v1";
}
