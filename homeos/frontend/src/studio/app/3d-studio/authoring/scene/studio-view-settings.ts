/**
 * 场景默认外观（背景 / 地面 / 楼层 / 墙面 / 家具配色与曝光）。
 *
 * 从 `../studio-app.ts` 的巨型闭包中抽出（P4 拆单体）：纯数据，无闭包依赖。
 */
export const defaultViewSettings = {
  background: 1120029,
  ground: 1382690,


  floor: 13091768,
  floorEdge: 16163146,
  grid: 5331300,


  wall: 14605007,

  wallTop: 14933715,


  windowFrame: 11515315,


  wallOpacity: 0.36,
  furniture: 8226713,
  furnitureSoft: 10332346,
  furnitureLight: 12634839,
  furnitureDark: 5397873,
  appliance: 10134967,
  applianceSoft: 11911118,
  applianceDark: 6845576,


  glass: 10604733,
  frame: 12172999,
  doorLeaf: 10988725,
  accent: 16758886,

  /**
   * **语义调色键**（修复材质脱靶的关键）：这些键原先只存在于暖木主题（`WARM_WOOD_STYLE`），
   * 默认主题里缺省 → 经 `PALETTE_KEY_FALLBACK` 全塌成同一个家具蓝灰 `furniture`，
   * 于是「选鲜绿却全是棕」「叶槽拿不到绿色」。这里按**真实材质**补上写实取值：
   * 叶绿 / 陶土 / 深棕土壤 / 原木 / 台面石 / 布艺 / 金属件 …
   */
  leafColor: 0x4f7a3d,
  leafColorLight: 0x6b9450,
  soil: 0x3b3128,
  decorAccent: 0xc0824a,
  wood: 0xa08a6a,
  woodLight: 0xbba88a,
  woodDark: 0x7a6446,
  cabinetWood: 0x93795a,
  cabinetBody: 0x8c7452,
  cabinetDoor: 0xa79072,
  countertop: 0xd3d0c8,
  joineryAccent: 0xb07a52,
  sofaFabric: 0xb5b0a4,
  diningLinen: 0xdad6cc,
  diningSage: 0x9ba694,
  runnerColor: 0x8e9a86,
  showerMetal: 0xbfc6cc,
  floorLampBody: 0x6f747a,
  rollerCurtain: 0xd6d2c9,
  rollerSlat: 0xc2b7a4,
  doorFrame: 0xd8d3ca,
  entryDoorFrame: 0x8a6f52,
  solidDoorFrame: 0xe2ded6,
  metal: 0xb6bbc0,

  accentIntensity: 3.8,
  exposure: 1.05,
}
