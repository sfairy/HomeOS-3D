/**
 * 「自然木语」主题调色板。
 *
 * 与 `WARM_WOOD_STYLE` 的关系：两者共享**暖色分支**的判定（`isWarmSceneStyle`），但取值
 * 不同 —— 暖阳原木偏「浅 oak + 奶油白」，自然木语偏「胡桃木 + 亚麻 + 苔绿」，并按 0.8.7
 * 的新材质体系补齐了原先只有暖木才有的**语义调色键**（叶绿 / 陶土 / 台面石 / 布艺 / 金属件）。
 *
 * 为什么不复制 0.8.7 的 jpg 贴图：木纹 / 皮革改由 `natural-wood-materials.ts` 用 shader
 * 程序化生成（同色系、可无级缩放），代价是与上游的纹理细节存在可见差异 —— 这一点已写进
 * 移植报告的「明确偏离」。
 */

/** 自然木语主色（十六进制），键与 `WARM_WOOD_STYLE` / `defaultViewSettings` 对齐。 */
export const NATURAL_WOOD_STYLE = Object.freeze({
  warmWood: true,
  naturalWood: true,
  // 平面标注：比暖木更深一档的褐，浅底上仍可读。
  planLabelText: 'rgb(96, 82, 66)',
  planLabelLine: 'rgba(96, 82, 66, 0.70)',

  // 门窗框：胡桃木 + 一处深色入户门。
  windowFrame: 0xa89070,
  doorFrame: 0xb39a78,
  entryDoorFrame: 0x5d4a38,
  solidDoorFrame: 0xd9cdb8,
  rollerCurtain: 0xd6cbb6,
  rollerSlat: 0xc0ae92,

  // 五金 / 卫浴
  floorLampBody: 0x6b6157,
  showerMetal: 0x9aa0a4,

  // 布艺：亚麻灰绿与浅麻。
  sofaFabric: 0xd8cfbd,
  diningLinen: 0xcfc6b2,
  diningSage: 0x8f9a7c,

  // 木作：胡桃主色 + 浅胡桃 + 深胡桃。
  wood: 0x8a6a48,
  woodLight: 0xa98a66,
  woodDark: 0x5f452c,
  cabinetWood: 0x7d5f40,
  cabinetBody: 0x745737,
  cabinetDoor: 0x94744f,
  countertop: 0xd8d2c6,
  joineryAccent: 0x9c7550,

  // 装饰 / 植物：苔绿为主，避免「自然木语」被棕化。
  decorAccent: 0xb07a4e,
  leafColor: 0x55703c,
  leafColorLight: 0x76904f,
  soil: 0x3a2f24,

  // 地面 / 背景：暖砂底，网格更淡。
  background: 0xe9e2d4,
  ground: 0xefe8da,
  floor: 0xd7b98c,
  floorEdge: 0xf0e4cc,
  grid: 0xcbbda4,
  wall: 0xf5efe2,
  wallTop: 0xfffaf0,

  // 家具 / 电器
  furniture: 0x9a7a56,
  furnitureSoft: 0xb9a184,
  furnitureLight: 0xdfd3bd,
  furnitureDark: 0x5a4632,
  appliance: 0xd9d6cf,
  applianceSoft: 0xeeeae2,
  applianceDark: 0x4a4740,

  // 玻璃 / 边框 / 门扇
  glass: 0xa8b2a4,
  frame: 0x8d7a5f,
  doorLeaf: 0xd9cdb8,
  metal: 0xb0b4b6,
  runnerColor: 0x9aa189,
  accent: 0xd8a35c,

  /** 曝光比暖木略低：自然木语的墙自发光更高，再亮会糊成一片。 */
  exposure: 1.0,
  accentIntensity: 3.4,
} as const)

/** 主题背景的默认叶影版本（改它即让背景缓存失效）。 */
export const NATURAL_WOOD_BACKDROP_REVISION = 'natural-leaf-responsive-v6'
