/**
 * 「暖阳原木」主题的调色板与地板材质增强。
 *
 * 位置：工作室的 `studioPalette()` 在主题为暖阳原木时，把 WARM_WOOD_STYLE 合并到
 *   STUDIO_PALETTE 之上，之后所有取色都走合并结果；地板这一个材质另外需要着色器
 *   增强（见 decorateWarmFloor），因为仅换基色无法做出橡木拼板的接缝与木纹。
 * 对外：WARM_WOOD_STYLE（冻结的色表）、decorateWarmFloor（地板材质注入）。
 * 约定：色值与 STUDIO_PALETTE 一样用 0xRRGGBB 的十进制写法，与 three 的 Color 直接互通。
 * 重要：本表**不含** accent / accentIntensity / exposure / wallOpacity ——
 *   这四项在 0.5.6 里仍取 STUDIO_PALETTE 的原值，合并时不要在这里补上，
 *   否则会让强调色、曝光与墙体透明度偏离原设计。
 */
export const WARM_WOOD_STYLE = Object.freeze({
  // 总开关：材质层大量分支都以它为准，取色表本身也带这一位。
  warmWood: true,
  // 门窗框与帘轨：暖白到浅木色的一族。
  windowFrame: 10726055,
  doorFrame: 10725279,
  entryDoorFrame: 6843753,
  solidDoorFrame: 15327699,
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
  // 场景底色：背景、地面、地板、地板描边与网格。
  background: 15329247,
  ground: 15658212,
  floor: 15919321,
  floorEdge: 16314851,
  grid: 14012611,
  // 墙体：墙身偏暖白、墙顶几乎纯白，形成柔和的顶光观感。
  wall: 16776436,
  wallTop: 16777215,
  // 家具四档 + 家电三档。
  furniture: 12158296,
  furnitureSoft: 11914636,
  furnitureLight: 16776434,
  furnitureDark: 6640449,
  appliance: 16052453,
  applianceSoft: 16776693,
  applianceDark: 4936789,
  glass: 9226677,
  frame: 10257502,
  doorLeaf: 15327699
});
/**
 * 给地板材质注入「泛白橡木」的程序化拼板与木纹。
 *
 * 做法：在标准材质里插入两段 GLSL —— 顶点阶段把世界坐标的 xz 与法线的竖向分量
 * 传给片元；片元阶段按 0.28m 的行距切出拼板行、每行按 2.4m 错缝，再画出
 * 板缝、端缝与细木纹。所有线条都用 fwidth 做抗锯齿，远处不会闪成噪点。
 *
 * 只在暖阳原木下生效：其它主题直接返回，不做任何改动。
 *
 * @param {object} material 地板材质（会被就地改写）。
 * @param {object} palette 调色板；读取 palette.warmWood 作为开关。
 * @returns {void}
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
