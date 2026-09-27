/**
 * 自 studio-app.ts 外提的独立单元（Phase A：安全外提）。
 * 对本模块之外的 studio-app.ts 内部零依赖：只引用 import 与自身成员，故不存在循环引用。
 */
/** 平面符号的进深下限：壁挂电视真身只有 60mm，1:100 画出来 6px，符号和缩放手柄都抓不住。 */
export const TELEVISION_PLAN_MIN_DEPTH = 0.12;

/**
 * 电视离地高度同样由挂装方式决定：壁挂要挂到「看着舒服」的高度（面板下沿 0.70m，0.92m 的面板
 */
export const TELEVISION_MOUNT_ELEVATIONS = Object.freeze({
  standard: 0.7,
  tabletop: 0,
  mobile: 0
});

/**
 * 电视进深由挂装方式决定，不是用户拉出来的：壁挂只有机身 60mm、座装含底板 180mm、移动支架含脚架
 */
export const TELEVISION_MOUNT_DEPTHS = Object.freeze({
  standard: 0.06,
  tabletop: 0.18,
  mobile: 0.55
});

export const MOBILE_TV_MOUNT_DIMENSIONS = Object.freeze({
  height: 1.55
});

export const TV_MOUNT_STYLES = new Set(["standard", "tabletop", "mobile"]);

/**
 * 圆形占地物件在平面图上那一两个**同心圈**的半径比（圈半径 / 占地半径）。
 */
export const ROUND_PLAN_RING_RATIOS_BY_TYPE = Object.freeze({
  fan: [0.144 / 0.2],
  floorac: [0.19 / 0.21],
  humidifier: [0.045 / 0.15],
  airpurifier: [0.12 / 0.17],
  trashbin: [0.135 / 0.14],
  kettle: [0.07 / 0.095],
  stool: [0.133 / 0.18],
  barstool: [0.148 / 0.21], // 环状踏脚 r 0.148 / 座面 r 0.21
  // 两层：台面收边 r 0.432 / 台面 r 0.45；中心柱底座 r 0.22 / 台面 r 0.45
  roundcoffeetable: [0.432 / 0.45, 0.22 / 0.45],
  coatrail: [0.075 / 0.225]
});

export const STUDIO_PALETTE = {
  background: 1120029,
  ground: 7239559,
  floor: 12568532,
  floorEdge: 16163146,
  grid: 10002864,
  // 墙体：墙身提到近白的浅灰，墙顶更白一档，让「墙比地板亮」的层次保持住。
  wall: 14475754,
  wallTop: 16119803,
  wallOpacity: 0.25,
  furniture: 8226713,
  furnitureSoft: 10332346,
  furnitureLight: 12634839,
  furnitureDark: 5397873,
  appliance: 10134967,
  applianceSoft: 11911118,
  applianceDark: 6845576,
  glass: 11126227,
  frame: 12172999,
  // 门扇棕黑：默认风格下门窗框仍取 frame，只有门扇换成棕黑（与柜体同色）。
  doorLeaf: 4007960,
  accent: 16758886,
  accentIntensity: 3.8,
  exposure: 1.05
};

export const TOOL_HELP_TEXT = {
  flooropening: [
    "楼板洞口",
    "拖出矩形洞口；仅切除当前层楼板，楼梯通往上层时请在上层开洞。Esc 取消"
  ],
  select: [
    "选择工具",
    "移动时 Shift 锁轴；缩放时 Shift 等比例；Option/Alt 拖动复制；⌘/Ctrl+C、V 复制粘贴"
  ],
  pan: ["平移画布", "按住左键拖动即可平移画布；滚轮缩放；中键或按住空格拖动同样可平移"],
  scale: ["参考线工具", "依次单击两个端点；按住 Shift 强制锁定水平或垂直轴线"],
  wall: ["连续画墙", "逐点绘制并回到起点闭合空间；未闭合不会生成地面，按住 Shift 锁轴，Esc 结束"],
  window: ["窗户工具", "靠近墙体单击，窗户会自动吸附并生成真实窗洞"],
  door: ["门工具", "靠近墙体单击，门会自动吸附并生成门洞；选中后可翻转开启方向"],
  railing: ["玻璃栏杆", "靠近墙体单击，栏杆会吸附到墙段并替换对应的实体墙"],
  label: ["户型铭牌", "单击画布放置；选中后可修改文字、拖动、缩放和旋转"]
};

export const LIGHT_TYPE_MAX_ANGLE_DEG = {
  downlight: 120,
  ceilinglight: 150,
  striplight: 120
};

export const LIGHT_TYPE_BRIGHTNESS_SCALE = Object.freeze({
  downlight: 1.1,
  ceilinglight: 0.792,
  striplight: 1.3
});

export const DEFAULT_LIGHT_SETTINGS = {
  downlight: {
    temperature: 3000,
    brightness: 48,
    range: 3.2,
    angle: 48
  },
  ceilinglight: {
    temperature: 3500,
    brightness: 62,
    range: 5,
    angle: 110
  },
  striplight: {
    temperature: 3000,
    brightness: 42,
    range: 3.5,
    angle: 100
  }
};

export const LIGHT_FIELD_CONFIG = {
  lightTemperature: {
    label: "色温",
    input: "#light-temperature",
    unit: "K"
  },
  lightBrightness: {
    label: "亮度",
    input: "#light-brightness",
    unit: "%"
  },
  lightRange: {
    label: "照射范围",
    input: "#light-range",
    unit: "m"
  },
  lightAngle: {
    label: "光束角",
    input: "#light-angle",
    unit: "°"
  },
  elevation: {
    label: "离地高度",
    input: "#item-elevation",
    unit: "m"
  }
};

export const DOOR_TYPE_DIMENSIONS = {
  solid: {
    width: 0.9,
    height: 2.1
  },
  double: {
    width: 1.8,
    height: 2.2
  },
  entry: {
    width: 1.05,
    height: 2.2
  },
  glass: {
    width: 0.9,
    height: 2.1
  },
  "sliding-glass": {
    width: 1.8,
    height: 2.1
  },
  "roller-shutter": {
    width: 3,
    height: 2.8
  },
  "frame-only": {
    width: 0.9,
    height: 2.1
  }
};

export const SELF_LIT_ITEM_TYPES = new Set([
  "tv",
  "smallcar",
  "planlabel",
  "downlight",
  "ceilinglight",
  "striplight"
]);

export const ITEM_TYPE_DEFINITIONS = {
  flooropening: {
    name: "楼板洞口",
    glyph: "▧",
    width: 2,
    depth: 3,
    height: 0.16,
    color: "#db9e54"
  },
  planlabel: {
    name: "户型铭牌",
    glyph: "T",
    width: 4.5,
    depth: 1.35,
    height: 0.01,
    color: "#cbd4e2"
  },
  sofa: {
    name: "沙发",
    glyph: "▰",
    width: 2.2,
    depth: 0.9,
    height: 0.82,
    color: "#c98a58"
  },
  smallcar: {
    name: "小汽车",
    glyph: "◆",
    width: 2.19,
    depth: 5.01,
    height: 1.43,
    color: "#8f969d"
  },
  bed: {
    name: "双人床",
    glyph: "▤",
    width: 1.8,
    depth: 2,
    // 整件高度 = 床头板顶面（软包床头实物就在 1.0~1.1m）。占位几何、规格表与 scaleBasis
    height: 1.05,
    color: "#d8d4c9"
  },
  curtain: {
    name: "窗帘",
    glyph: "▥",
    width: 1.8,
    depth: 0.18,
    height: 2.4,
    color: "#7d8799"
  },
  nightstand: {
    name: "床头柜",
    glyph: "▣",
    width: 0.5,
    depth: 0.42,
    height: 0.55,
    color: "#8d6d57"
  },
  table: {
    name: "餐桌组合",
    glyph: "▦",
    width: 2.4,
    depth: 1.8,
    height: 0.82,
    color: "#9b6945"
  },
  rounddiningtable: {
    name: "圆形餐桌",
    glyph: "◉",
    width: 2.2,
    depth: 2.2,
    height: 0.78,
    color: "#6f5544"
  },
  rounddiningtableturntable: {
    name: "圆形餐桌（带转盘）",
    glyph: "◎",
    width: 2.2,
    depth: 2.2,
    height: 0.78,
    color: "#6f5544"
  },
  squarecoffeetable: {
    name: "方茶几",
    glyph: "▦",
    width: 1.4,
    depth: 0.7,
    height: 0.46,
    color: "#8d96aa"
  },
  bar: {
    name: "吧台",
    glyph: "▰",
    width: 2.2,
    depth: 0.65,
    height: 1.05,
    color: "#8b674d"
  },
  aquarium: {
    name: "鱼缸",
    glyph: "▣",
    width: 1.5,
    depth: 0.55,
    height: 1.4,
    color: "#7896a4"
  },
  coffeetable: {
    name: "组合茶几",
    // 平面符号已改成两块叠合的石板（见 drawPlanItem），字形也跟着从圆点换成条状。
    glyph: "▭",
    width: 1.9,
    depth: 1.05,
    height: 0.5,
    color: "#8d96aa"
  },
  sideboard: {
    name: "餐边柜",
    glyph: "▤",
    width: 1.6,
    depth: 0.45,
    height: 2.2,
    color: "#94745d"
  },
  shoecabinet: {
    name: "鞋柜",
    glyph: "▥",
    width: 1.8,
    depth: 0.42,
    height: 2.25,
    color: "#8e7764"
  },
  stairs: {
    name: "楼梯",
    glyph: "⇧",
    width: 1,
    depth: 2.8,
    height: 1.65,
    color: "#8b95a6"
  },
  steelstairs: {
    name: "钢楼梯",
    glyph: "⇧",
    width: 1.86,
    depth: 2.93,
    height: 3.45,
    color: "#7d8799"
  },
  glassstairs: {
    name: "玻璃楼梯",
    glyph: "⇧",
    width: 2.51,
    depth: 2.84,
    height: 3.41,
    color: "#a9c5d3"
  },
  // 悬空楼梯（1 字型直跑）：占地 0.97 × 2.25、层高 2.59，逐值等于流水线规格 size 与
  floatingstairs: {
    name: "悬空楼梯",
    glyph: "⇧",
    width: 0.97254264,
    depth: 2.2483418,
    height: 2.59010673,
    color: "#b08a5e"
  },
  chair: {
    name: "椅子",
    glyph: "◇",
    width: 0.5,
    depth: 0.5,
    height: 0.86,
    color: "#b47b51"
  },
  cabinet: {
    name: "储物柜",
    glyph: "▥",
    width: 1.6,
    depth: 0.45,
    height: 1.9,
    color: "#9a7658"
  },
  glasscabinet: {
    name: "玻璃柜",
    glyph: "▧",
    width: 1.2,
    depth: 0.4,
    height: 1.9,
    color: "#90755f"
  },
  bookcase: {
    name: "书架",
    glyph: "▥",
    width: 1.2,
    depth: 0.32,
    height: 1.9,
    color: "#8f7058"
  },
  shelf: {
    name: "货架",
    glyph: "▤",
    width: 1.2,
    depth: 0.45,
    height: 1.8,
    color: "#778391"
  },
  mural: {
    name: "壁画",
    glyph: "❐",
    width: 1.2,
    depth: 0.1,
    height: 0.8,
    elevation: 0.9,
    color: "#8d7b62",
    muralStyle: "bauhaus"
  },
  featurewall: {
    name: "背景墙",
    glyph: "❏",
    width: 3,
    depth: 0.1,
    height: 2.4,
    elevation: 0,
    color: "#c4bcae",
    wallStyle: "marble"
  },
  pillar: {
    name: "柱子",
    glyph: "▣",
    width: 0.45,
    depth: 0.45,
    height: 2.8,
    color: "#9099aa",
    pillarShape: "square",
    pillarAxis: "vertical"
  },
  wallcabinet: {
    name: "吊柜",
    glyph: "▧",
    width: 1.5,
    depth: 0.35,
    height: 0.82,
    color: "#9a806c"
  },
  kitchenbase: {
    name: "厨房地柜",
    glyph: "▤",
    width: 2.4,
    depth: 0.6,
    height: 0.85,
    color: "#8f7865"
  },
  kitchensink: {
    name: "地柜带水盆",
    glyph: "▣",
    width: 1.2,
    depth: 0.6,
    height: 0.85,
    color: "#8f7865"
  },
  kitchencooktop: {
    name: "地柜带燃气灶",
    glyph: "▦",
    width: 1.2,
    depth: 0.6,
    height: 0.85,
    color: "#8f7865"
  },
  fridge: {
    name: "冰箱",
    glyph: "▯",
    width: 0.75,
    depth: 0.72,
    height: 1.85,
    color: "#b8c3c8"
  },
  freezer: {
    // 卧式冰柜：占地方向是「宽 × 深」的长边在前，与它顶开盖的造型一致。
    name: "冰柜",
    glyph: "▭",
    width: 1.05,
    depth: 0.6,
    height: 0.85,
    color: "#454c54"
  },
  storagewaterheater: {
    name: "储水式热水器",
    glyph: "◉",
    width: 0.86,
    depth: 0.46,
    height: 0.48,
    elevation: 1.65,
    color: "#e5e9ec"
  },
  gaswaterheater: {
    name: "燃气热水器",
    glyph: "▯",
    width: 0.42,
    depth: 0.22,
    height: 0.72,
    elevation: 1.55,
    color: "#e3e7e9"
  },
  pipelinewaterpurifier: {
    name: "管线机",
    glyph: "▥",
    width: 0.48,
    depth: 0.24,
    height: 0.68,
    elevation: 1.42,
    color: "#e2e6e7"
  },
  tea_bar_machine: {
    name: "茶吧机",
    glyph: "▤",
    width: 0.62,
    depth: 0.48,
    height: 1.32,
    color: "#b8b5ac"
  },
  elevator: {
    name: "电梯",
    glyph: "⇧",
    width: 1.4,
    depth: 1.52,
    height: 2.2,
    color: "#b8c3c8"
  },
  washer: {
    name: "洗衣机",
    glyph: "◉",
    width: 0.6,
    depth: 0.65,
    height: 0.85,
    color: "#b8c3c8"
  },
  airoutlet: {
    name: "出风口",
    glyph: "▥",
    width: 0.188,
    depth: 2,
    height: 0.3,
    elevation: 2,
    color: "#a8adb2"
  },
  dryer: {
    name: "烘干机",
    glyph: "◎",
    width: 0.6,
    depth: 0.65,
    height: 0.85,
    color: "#aeb9c3"
  },
  dishwasher: {
    name: "洗碗机",
    glyph: "▤",
    width: 0.6,
    depth: 0.6,
    height: 0.82,
    color: "#b8c3c8"
  },
  steamoven: {
    name: "蒸烤箱",
    glyph: "▣",
    width: 0.6,
    depth: 0.55,
    height: 0.6,
    elevation: 0.82,
    color: "#aeb9c3"
  },
  microwave: {
    name: "微波炉",
    glyph: "▭",
    width: 0.52,
    depth: 0.42,
    height: 0.32,
    elevation: 0.85,
    color: "#aeb9c3"
  },
  ricecooker: {
    name: "电饭煲",
    glyph: "◉",
    width: 0.28,
    depth: 0.32,
    height: 0.25,
    elevation: 0.85,
    color: "#b8c3c8"
  },
  rangehood: {
    name: "油烟机",
    glyph: "◢",
    width: 0.9,
    depth: 0.45,
    height: 0.55,
    elevation: 1.45,
    color: "#9faab5"
  },
  wallac: {
    name: "挂机空调",
    glyph: "▬",
    width: 0.9,
    depth: 0.22,
    height: 0.28,
    elevation: 2,
    color: "#c4ccd2"
  },
  floorac: {
    name: "柜机空调",
    glyph: "◉",
    width: 0.42,
    depth: 0.42,
    height: 1.75,
    color: "#b8c3c8"
  },
  robotvacuum: {
    name: "扫地机器人",
    glyph: "◎",
    width: 0.55,
    depth: 0.5,
    height: 0.85,
    color: "#b8c3c8"
  },
  nas: {
    name: "NAS",
    glyph: "▦",
    width: 0.28,
    depth: 0.24,
    height: 0.34,
    elevation: 0,
    color: "#626d7b"
  },
  camera: {
    name: "摄像头",
    glyph: "◉",
    width: 0.12,
    depth: 0.12,
    height: 0.16,
    elevation: 1.2,
    color: "#5d6978"
  },
  presence: {
    name: "人体传感器",
    glyph: "◌",
    width: 0.065,
    depth: 0.065,
    height: 0.14,
    elevation: 1.2,
    color: "#6d8994"
  },
  airpurifier: {
    name: "空气净化器",
    glyph: "◌",
    width: 0.34,
    depth: 0.34,
    height: 0.7,
    color: "#b8c3c8"
  },
  tv: {
    name: "电视",
    glyph: "▭",
    width: 1.5,
    depth: 0.18,
    height: 0.92,
    color: "#22282d"
  },
  plant: {
    name: "绿植",
    glyph: "✦",
    width: 0.75,
    depth: 0.75,
    height: 1.6,
    color: "#4e8b63"
  },
  floorlamp: {
    name: "落地灯",
    glyph: "⌁",
    width: 1.35,
    depth: 0.5,
    height: 1.8,
    color: "#4b5361"
  },
  vanity: {
    name: "梳妆台",
    glyph: "◫",
    width: 1.2,
    depth: 0.5,
    height: 1.55,
    color: "#b68c70"
  },
  desk: {
    name: "桌子",
    glyph: "▱",
    width: 1.4,
    depth: 0.65,
    height: 0.76,
    color: "#8e6b50"
  },
  piano: {
    name: "钢琴",
    glyph: "▰",
    // 三角钢琴的实物尺寸（Yamaha GB1 这类小型三角琴 1.46 × 1.48 × 0.99，键盘面高 0.72）：
    width: 1.5,
    depth: 1.5,
    height: 0.99,
    color: "#4b5361"
  },
  desktop: {
    name: "台式电脑",
    glyph: "▣",
    width: 0.72,
    depth: 0.32,
    height: 0.5,
    elevation: 0.76,
    color: "#434b59"
  },
  laptop: {
    name: "笔记本电脑",
    glyph: "⌨",
    width: 0.36,
    depth: 0.28,
    height: 0.22,
    elevation: 0.76,
    color: "#555e6b"
  },
  toilet: {
    name: "马桶",
    glyph: "◒",
    width: 0.42,
    depth: 0.7,
    height: 0.52,
    color: "#e1e5e8"
  },
  squattoilet: {
    name: "蹲便",
    glyph: "▱",
    width: 0.45,
    depth: 0.65,
    height: 0.18,
    color: "#e1e5e8"
  },
  urinal: {
    name: "小便斗",
    glyph: "◖",
    width: 0.38,
    depth: 0.34,
    height: 0.72,
    elevation: 0.38,
    color: "#e1e5e8"
  },
  bathtub: {
    name: "浴缸",
    glyph: "▱",
    width: 1.7,
    depth: 0.78,
    height: 0.58,
    color: "#e1e5e8"
  },
  walllamp: {
    name: "壁灯",
    glyph: "◒",
    width: 0.3,
    depth: 0.22,
    height: 0.34,
    elevation: 1.55,
    color: "#d4dbe2"
  },
  shower: {
    name: "花洒",
    glyph: "♨",
    width: 0.9,
    depth: 0.9,
    height: 2.1,
    color: "#aebac5"
  },
  glasspartition: {
    name: "玻璃隔断",
    glyph: "▥",
    width: 1.2,
    depth: 0.08,
    height: 2,
    color: "#a9c5d3"
  },
  basin: {
    name: "台盆",
    glyph: "◉",
    width: 0.9,
    depth: 0.5,
    height: 0.88,
    color: "#d9dee2"
  },
  rug: {
    name: "地毯",
    glyph: "▨",
    width: 2,
    depth: 1.4,
    height: 0.012,
    color: "#7f7180"
  },
  tvstand: {
    name: "电视柜",
    glyph: "▬",
    width: 1.8,
    depth: 0.42,
    height: 0.48,
    color: "#77675e"
  },
  downlight: {
    name: "筒射灯",
    glyph: "◎",
    width: 0.52,
    depth: 0.52,
    height: 0.08,
    elevation: 2.68,
    color: "#d4dbe2"
  },
  ceilinglight: {
    name: "吸顶灯",
    glyph: "▣",
    width: 0.58,
    depth: 0.58,
    height: 0.1,
    elevation: 2.65,
    color: "#d4dbe2"
  },
  striplight: {
    name: "灯带",
    glyph: "━",
    width: 2,
    depth: 0.28,
    height: 0.05,
    elevation: 2.7,
    color: "#d4dbe2",
    stripAxis: "horizontal"
  },
  armchair: {
    name: "单人沙发椅",
    glyph: "▮",
    width: 0.85,
    depth: 0.8,
    height: 0.75,
    color: "#c9a884"
  },
  loungechair: {
    name: "休闲躺椅",
    glyph: "▬",
    width: 0.7,
    depth: 1.6,
    height: 0.85,
    color: "#b0703c"
  },
  ottoman: {
    name: "脚凳",
    glyph: "◾",
    width: 0.6,
    depth: 0.45,
    height: 0.4,
    color: "#d8c8b4"
  },
  bench: {
    name: "长凳",
    glyph: "▭",
    width: 1.4,
    depth: 0.42,
    height: 0.45,
    color: "#c49a6c"
  },
  barstool: {
    name: "吧凳",
    glyph: "◍",
    width: 0.42,
    depth: 0.42,
    height: 0.95,
    color: "#8d8f92"
  },
  sidetable: {
    name: "边几",
    glyph: "▪",
    width: 0.45,
    depth: 0.45,
    height: 0.55,
    color: "#c49a6c"
  },
  console: {
    name: "玄关台",
    glyph: "▤",
    width: 1.2,
    depth: 0.35,
    height: 0.8,
    color: "#c49a6c"
  },
  chestdrawer: {
    name: "斗柜",
    glyph: "▥",
    width: 1.0,
    depth: 0.45,
    height: 1.1,
    color: "#8a6b4a"
  },
  entrycabinet: {
    name: "玄关柜",
    glyph: "▦",
    width: 1.0,
    depth: 0.38,
    height: 1.1,
    color: "#9a806c"
  },
  displaycabinet: {
    name: "展示柜",
    glyph: "▧",
    width: 0.9,
    depth: 0.4,
    height: 1.8,
    color: "#7d6a52"
  },
  bunkbed: {
    name: "上下床",
    glyph: "▤",
    width: 1.0,
    depth: 1.95,
    height: 1.7,
    color: "#c49a6c"
  },
  kidsbed: {
    name: "儿童床",
    glyph: "▤",
    width: 0.95,
    depth: 1.6,
    height: 0.65,
    color: "#d8b98f"
  },
  soundbar: {
    name: "回音壁",
    glyph: "▬",
    width: 0.95,
    depth: 0.12,
    height: 0.08,
    color: "#3a3d42"
  },
  speaker: {
    name: "落地音箱",
    glyph: "◉",
    width: 0.28,
    depth: 0.28,
    height: 1.05,
    color: "#4a4e54"
  },
  projector: {
    name: "投影仪",
    glyph: "▭",
    width: 0.3,
    depth: 0.24,
    height: 0.1,
    color: "#dcdcd8"
  },
  fan: {
    name: "落地风扇",
    glyph: "✦",
    width: 0.4,
    depth: 0.4,
    height: 1.15,
    color: "#e4e6e8"
  },
  humidifier: {
    name: "加湿器",
    glyph: "◌",
    width: 0.3,
    depth: 0.3,
    height: 0.55,
    color: "#eceff0"
  },
  dehumidifier: {
    name: "除湿机",
    glyph: "▯",
    width: 0.35,
    depth: 0.28,
    height: 0.6,
    color: "#e8ecee"
  },
  freshair: {
    name: "新风机",
    glyph: "▥",
    width: 0.6,
    depth: 0.3,
    height: 0.3,
    elevation: 2.2,
    color: "#dfe4e6"
  },
  thermostat: {
    name: "温控面板",
    glyph: "▫",
    width: 0.1,
    depth: 0.02,
    height: 0.1,
    elevation: 1.4,
    color: "#cfd6da"
  },
  smartpanel: {
    name: "智能面板",
    glyph: "▪",
    width: 0.12,
    depth: 0.02,
    height: 0.12,
    elevation: 1.4,
    color: "#c8cfd4"
  },
  smartlock: {
    name: "智能门锁",
    glyph: "▮",
    width: 0.08,
    depth: 0.05,
    height: 0.28,
    elevation: 1.0,
    color: "#3c4148"
  },
  doorbell: {
    name: "可视门铃",
    glyph: "▫",
    width: 0.06,
    depth: 0.03,
    height: 0.13,
    elevation: 1.35,
    color: "#4a5058"
  },
  gateway: {
    name: "智能网关",
    glyph: "◈",
    width: 0.12,
    depth: 0.12,
    height: 0.05,
    color: "#e8ecee"
  },
  chaise: {
    name: "贵妃榻",
    glyph: "▤",
    width: 0.75,
    depth: 1.65,
    height: 0.72,
    color: "#d8c8b4"
  },
  nestingtable: {
    name: "套几",
    glyph: "▦",
    width: 0.55,
    depth: 0.55,
    height: 0.5,
    color: "#b98c5f"
  },
  roundcoffeetable: {
    name: "圆茶几",
    glyph: "◉",
    width: 0.9,
    depth: 0.9,
    height: 0.42,
    color: "#b0703c"
  },
  screenspan: {
    name: "屏风",
    glyph: "▥",
    width: 1.6,
    depth: 0.35,
    height: 1.75,
    color: "#b08a63"
  },
  coatrail: {
    name: "衣帽架",
    glyph: "✚",
    width: 0.45,
    depth: 0.45,
    height: 1.75,
    color: "#9c6b3f"
  },
  stool: {
    name: "圆凳",
    glyph: "◌",
    width: 0.36,
    depth: 0.36,
    height: 0.45,
    color: "#c49a6c"
  },
  locker: {
    name: "储物柜",
    glyph: "▦",
    width: 0.9,
    depth: 0.4,
    height: 1.8,
    color: "#8a705a"
  },
  laundrycabinet: {
    name: "洗衣柜",
    glyph: "▥",
    width: 0.65,
    depth: 0.6,
    height: 0.85,
    color: "#cfd6da"
  },
  balconycabinet: {
    name: "阳台柜",
    glyph: "▥",
    width: 0.8,
    depth: 0.4,
    height: 1.2,
    color: "#a08a72"
  },
  winecabinet: {
    name: "酒柜",
    glyph: "▧",
    width: 0.6,
    depth: 0.45,
    height: 1.6,
    color: "#7d6a52"
  },
  kitchenisland: {
    name: "岛台",
    glyph: "▭",
    width: 2.4,
    depth: 0.8,
    height: 0.9,
    color: "#cdd2d6"
  },
  pantry: {
    name: "餐边高柜",
    glyph: "▥",
    width: 0.9,
    depth: 0.42,
    height: 1.9,
    color: "#8f7a63"
  },
  daybed: {
    name: "榻榻米床",
    glyph: "▤",
    width: 1.2,
    depth: 2,
    height: 0.55,
    color: "#e6d9c6"
  },
  cot: {
    name: "婴儿床",
    glyph: "▤",
    width: 0.7,
    depth: 1.35,
    height: 0.95,
    color: "#e0c9a6"
  },
  computertable: {
    name: "电脑桌",
    glyph: "▤",
    width: 1.2,
    depth: 0.6,
    height: 0.75,
    color: "#c49a6c"
  },
  officestool: {
    name: "办公椅",
    glyph: "◍",
    width: 0.6,
    depth: 0.6,
    height: 1,
    color: "#4a4e54"
  },
  filecabinet: {
    name: "文件柜",
    glyph: "▥",
    width: 0.8,
    depth: 0.45,
    height: 1.3,
    color: "#c9cdd2"
  },
  booktower: {
    name: "简易书架",
    glyph: "▤",
    width: 0.5,
    depth: 0.3,
    height: 1.6,
    color: "#c49a6c"
  },
  gameconsole: {
    name: "游戏主机",
    glyph: "▬",
    width: 0.3,
    depth: 0.24,
    height: 0.08,
    color: "#f2f4f5"
  },
  avreceiver: {
    name: "功放",
    glyph: "▬",
    width: 0.44,
    depth: 0.35,
    height: 0.16,
    color: "#2b2f34"
  },
  screenpanel: {
    name: "投影幕",
    glyph: "▭",
    width: 2.2,
    depth: 0.08,
    height: 1.25,
    elevation: 1.4,
    color: "#eceff1"
  },
  smartspeaker: {
    name: "智能音箱",
    glyph: "◉",
    width: 0.12,
    depth: 0.12,
    height: 0.18,
    color: "#dfeaec"
  },
  router: {
    name: "路由器",
    glyph: "◈",
    width: 0.22,
    depth: 0.16,
    height: 0.15,
    color: "#2b2f34"
  },
  printer: {
    name: "打印机",
    glyph: "▭",
    width: 0.4,
    depth: 0.35,
    height: 0.3,
    color: "#eef0f1"
  },
  ceilingfan: {
    name: "吊扇",
    glyph: "✦",
    width: 1.1,
    depth: 1.1,
    height: 0.4,
    elevation: 2.25,
    color: "#e8ebed"
  },
  heater: {
    name: "取暖器",
    glyph: "▯",
    width: 0.6,
    depth: 0.25,
    height: 0.55,
    color: "#f2f4f5"
  },
  ceilingac: {
    name: "嵌入式空调",
    glyph: "▣",
    width: 0.9,
    depth: 0.9,
    height: 0.3,
    elevation: 2.35,
    color: "#f2f4f5"
  },
  vacuumcleaner: {
    name: "吸尘器",
    glyph: "▮",
    width: 0.28,
    depth: 0.3,
    height: 1.15,
    color: "#9aa1a8"
  },
  floorwasher: {
    name: "洗地机",
    glyph: "▮",
    width: 0.3,
    depth: 0.3,
    height: 1.1,
    color: "#f2f4f5"
  },
  dryingrack: {
    name: "电动晾衣架",
    glyph: "▬",
    width: 1.8,
    depth: 0.35,
    height: 0.5,
    elevation: 2.15,
    color: "#f2f4f5"
  },
  garmentcare: {
    name: "衣物护理机",
    glyph: "▥",
    width: 0.6,
    depth: 0.6,
    height: 1.85,
    color: "#f2f4f5"
  },
  airer: {
    name: "晾衣杆",
    glyph: "▬",
    width: 1.2,
    depth: 0.3,
    height: 0.3,
    color: "#b4babf"
  },
  integratedstove: {
    name: "集成灶",
    glyph: "▣",
    width: 0.9,
    depth: 0.6,
    height: 1.35,
    color: "#2b2f34"
  },
  sterilizer: {
    name: "消毒柜",
    glyph: "▥",
    width: 0.6,
    depth: 0.5,
    height: 0.65,
    color: "#f2f4f5"
  },
  oven: {
    name: "嵌入式烤箱",
    glyph: "▥",
    width: 0.6,
    depth: 0.55,
    height: 0.6,
    color: "#2b2f34"
  },
  coffeemaker: {
    name: "咖啡机",
    glyph: "▯",
    width: 0.28,
    depth: 0.35,
    height: 0.38,
    color: "#2b2f34"
  },
  kettle: {
    name: "电水壶",
    glyph: "◌",
    width: 0.2,
    depth: 0.2,
    height: 0.26,
    color: "#f2f4f5"
  },
  airfryer: {
    name: "空气炸锅",
    glyph: "◫",
    width: 0.3,
    depth: 0.34,
    height: 0.34,
    color: "#2b2f34"
  },
  blender: {
    name: "破壁机",
    glyph: "◫",
    width: 0.22,
    depth: 0.24,
    height: 0.45,
    color: "#2b2f34"
  },
  waterpurifier: {
    name: "净水器",
    glyph: "▮",
    width: 0.3,
    depth: 0.3,
    height: 1.2,
    color: "#f2f4f5"
  },
  trashbin: {
    name: "智能垃圾桶",
    glyph: "◌",
    width: 0.28,
    depth: 0.28,
    height: 0.45,
    color: "#f2f4f5"
  },
};

/** 导出画布默认尺寸（px）。 */
export const DEFAULT_EXPORT_WIDTH = 1852;
export const DEFAULT_EXPORT_HEIGHT = 1293;
