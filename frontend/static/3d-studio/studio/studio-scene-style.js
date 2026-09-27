/**
 * 「暖阳原木」主题的调色板与地板材质增强。
 */
import { APPLIANCE_FINISH_BY_ITEM_TYPE } from "./studio-item-types.js?v=2609271508";

export const WARM_HOME_STYLE = Object.freeze({
  // 帘轨、灯体与五金：暖白到浅木色的一族。
  rollerCurtain: 15327699,
  rollerSlat: 13748409,
  floorLampBody: 7830133,
  showerMetal: 4146760,
  // 家具主色：布艺、台面与餐桌布（柜类另见下面那一组）。
  sofaFabric: 16776434,
  countertop: 16117989,
  diningLinen: 10926731,
  diningSage: 10926731,
  // 衣柜 / 柜类：柜体棕黑、柜门白 —— 柜体与门板必须分别取色，
  cabinetWood: 4007960,
  cabinetBody: 4007960,
  cabinetDoor: 16777215,
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
  // 不锈钢家电的取材：冰箱银灰、其余银黑（见下面的 APPLIANCE_FINISH_*）。
  fridgeBody: 13028305,
  fridgeTrim: 8818326,
  steelBlack: 4541524,
  steelBlackBright: 6976381,
  steelBlackDark: 2501424,
  glass: 9226677,
  frame: 10257502
});
export const WARM_SCENE_STYLE = Object.freeze({
  // 门窗框与门扇：暖白到浅木色的一族。
  windowFrame: 10726055,
  doorFrame: 10725279,
  entryDoorFrame: 6843753,
  solidDoorFrame: 15327699,
  // 门扇棕黑：与柜体同一支棕黑，门窗框仍是暖白，门扇因此从框里跳出来。
  doorLeaf: 4007960,
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
 * 不锈钢家电的配色族，每族给「亮 / 中 / 暗」三档。
 */
const APPLIANCE_FINISH_FAMILIES = Object.freeze({
  silver: Object.freeze({ light: 13028305, mid: 13028305, dark: 8818326 }),
  steelBlack: Object.freeze({ light: 4541524, mid: 6976381, dark: 2501424 })
});
/**
 * 给一件物品的调色板套上它的外观，返回新对象；不需要改写的类型原样返回入参（不复制）。
 * @param {object} palette 基础调色板（homePalette() 的结果）。
 * @param {string} itemType 物件类型。
 * @param {ReadonlySet<string>} joineryItemTypes 柜类名单（studio-item-types.js 的 JOINERY_ITEM_TYPES）。
 */
export function applyItemFinish(palette, itemType, joineryItemTypes) {
  const finishName = APPLIANCE_FINISH_BY_ITEM_TYPE[itemType];
  if (finishName) {
    const finish = APPLIANCE_FINISH_FAMILIES[finishName];
    return {
      ...palette,
      appliance: finish.light,
      applianceSoft: finish.mid,
      applianceDark: finish.dark,
      furniture: finish.light,
      furnitureSoft: finish.mid,
      furnitureLight: finish.light,
      furnitureDark: finish.dark
    };
  }
  if (joineryItemTypes?.has(itemType)) {
    // 只收敛家具三档，light 档留给台面 / 拉手这些要提亮的面。
    const cabinetWood = palette.cabinetWood ?? palette.wood;
    return {
      ...palette,
      furniture: cabinetWood,
      furnitureSoft: cabinetWood,
      furnitureDark: cabinetWood
    };
  }
  return palette;
}
/**
 * 给地板材质注入「泛白橡木」的程序化拼板与木纹。
 */
export function decorateWarmFloor(material, palette) {
  if (!palette.warmWood) {
    return;
  }
  // 0.5.6 里先写 0.92、紧接着又被 0.84 覆盖：按原样保留两次赋值，
  material.roughness = 0.92;
  material.emissiveIntensity = 0.075;
  material.roughness = 0.84;
  // 与其它材质注入一样：先接上原有的编译钩子与缓存键，
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
