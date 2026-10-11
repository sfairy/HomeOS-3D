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
  accentIntensity: 3.8,
  exposure: 1.05,
}
