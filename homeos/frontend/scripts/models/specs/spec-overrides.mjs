/**
 * `model-specs.json` 的人工查证件与分类口径。
 *
 * 这一层只放**注册表给不了**的东西：
 * - 注册表没有尺寸的 16 款（楼梯 / 车辆 / 电梯 / 钢琴 / 风口 / 落地灯 …）；
 * - 注册表尺寸与实物不符、需要按厂商规格改写的款（`tv_standard` 缺底座）；
 * - 挂载方式、拓扑类别（`solid` / `open-sheet`）、双面薄片例外的判定口径。
 *
 * 规格优先级：厂商规格页 / 国标 > 仓库注册表 > 品类常识 > 目测。
 * `reference.confidence` 的取值范围与含义见计划 §3：0.85–0.95 厂商/国标，0.7–0.85 注册表，
 * 0.45–0.7 品类常识，0.2–0.45 纯目测。风险标签是闭集，不许自造。
 */

/** 30 款深度精修（Tier A 12 + Tier B 18），与计划 §7 一字不差。 */
export const FLAGSHIP_IDS = Object.freeze([
  // Tier A：整体参数化重建
  'sofa',
  'sofa-single',
  'coffeetable',
  'tvstand',
  'bed',
  'round-double-bed',
  'wardrobe',
  'cabinet',
  'nightstand',
  'table',
  'chair',
  'tv_standard',
  // Tier B：关键部件重建 / 重拓扑 + 比例修正
  'kitchen-island',
  'fridge',
  'washer',
  'dryer',
  'rangehood',
  'microwave',
  'dishwasher',
  'exhaust-fan',
  'basin',
  'toilet',
  'bathtub',
  'floor-lamp',
  'airpurifier',
  'car',
  'stairs',
  'steel-stairs',
  'plant-monstera',
  'plant-palm',
])

/** 壁挂件：原点在背面中心，加载器靠 `elevation` 抬到墙面高度，不强行落地。 */
const WALL_MOUNTED = new Set([
  'wallcabinet',
  'wallac',
  'walllamp',
  'up-down-wall-lamp',
  'wall-art',
  'wall-clock',
  'wall-coat-hooks',
  'smart-display-wall',
  'wall-cat-shelves',
  'heated-towel-rail',
  'toothbrush-holder',
  'hairdryer-holder',
  'full-length-mirror',
  'projection-screen',
  'curtain_left',
  'curtain_right',
  'curtain_split',
  'entryway-niche-cabinet',
  'slim-recessed-cabinet',
  'smart-socket-86',
  'switch-console',
  'air-outlet',
  'rectangular-pipeline-dispenser',
  'pipeline-water-purifier',
  'electric-valve',
  'storagewaterheater',
  'gaswaterheater',
  'exhaust-fan',
  'garden-fence',
  'garden-fence-horizontal',
  'garden-fence-lattice',
  'garden-fence-metal',
  'garden-trellis',
  'garden-lantern',
])

/** 吊顶件：原点在天花板平面中心。 */
const CEILING_MOUNTED = new Set(['ceiling-fan'])

/** 台面件：原点在底面中心（y=0），与落地件同口径，只影响摆放语义。 */
const TABLETOP = new Set([
  'microwave',
  'ricecooker',
  'toaster',
  'electric-kettle',
  'health-kettle',
  'coffee-machine',
  'coffee-grinder',
  'juicer',
  'power-blender',
  'air-fryer',
  'bread-maker',
  'multi-cooker',
  'pressure-cooker',
  'food-steamer',
  'stand-mixer',
  'dish-rack',
  'cutting-board-rack',
  'knife-block',
  'spice-set',
  'cookware-set',
  'mug-tree',
  'fruit-basket',
  'capsule-rack',
  'rice-bin',
  'router',
  'nas',
  'desktop',
  'laptop',
  'printer',
  'scanner',
  'ps5',
  'xbox-series-x',
  'turntable',
  'soundbar',
  'tower-speaker',
  'projector',
  'drawing-tablet',
  'dual-monitors',
  'smart-display',
  '3d-printer',
  'paper-shredder',
  'humidifier',
  'dehumidifier',
  'airpurifier',
  'aroma-diffuser',
  'pet-feeder',
  'pet-fountain',
  'table-lamp',
  'desktop-frame',
  'decor-vase',
  'decor-books',
  'decor-tea-tray',
  'decor-tissue-box',
  'decorative-plate',
  'candlestick',
  'decorative-lantern',
  'figurine-set',
  'trophy',
  'toiletry-set',
  'trash-bin',
  'suitcase',
])

/**
 * 整件就是薄片的模型：叶片 / 布片 / 玻璃 / 地毯 / 挂画。
 *
 * 判据是**实测仍有开口**（边界边或非流形边 > 0），不是「看起来薄」。薄片类的门禁只要求
 * 非流形边为 0，对边界边默认放行；一件水密的模型留在这里，等于给它永久豁免闭合检查，
 * 所以重建后闭合了就该挪去 `solid` —— 那边的门禁更严，正好挡住下一次重导出漏面。
 *
 * 2026-10-28 清理：菜谱重建的庭院植物用 `box()` / 球体叶簇，几何本来就是闭合体，
 * 32 款已在两个变体上都无开口，已从本表与 `FOLIAGE_IDS` 移出（自动降为 `solid`）。
 */
const OPEN_SHEET = new Set([
  'rug',
  'round-rug',
  'sofa-throw',
  'wall-art',
  'garden-pond',
  'garden-pool',
  'plant',
  'plant-monstera',
  'plant-palm',
  'plant-pothos',
  'plant-rubber',
  'decor-small-plant',
  'flower-anthurium',
  'flower-orchid',
])

/**
 * 叶片族里**仍然开口**的那几款：整件按「盆 / 干 / 叶簇」建模，叶片是双面开口薄片。
 *
 * 只是 `OPEN_SHEET` 的子集，用来给 `shading` 标 `double-sided`；重建后闭合的庭院植物
 * 不再列在这里——闭合体单面渲染就够，没有理由继续双面付片元开销。
 */
export const FOLIAGE_IDS = Object.freeze([
  'plant',
  'plant-monstera',
  'plant-palm',
  'plant-pothos',
  'plant-rubber',
  'decor-small-plant',
  'flower-anthurium',
  'flower-orchid',
])

/** 注册表与目录都没收录名字的 23 款（补齐后才能生成可读报告）。 */
const MODEL_NAMES = Object.freeze({
  'air-outlet': '中央空调风口',
  'pipeline-water-purifier': '前置净水器',
  'rectangular-pipeline-dispenser': '矩形管线饮水机',
  'tea-bar-machine': '茶吧机',
  'floor-lamp': '落地灯（SimLab 原模型）',
  tv_mobile: '移动电视',
  tv_standard: '标准电视',
  tv_tabletop: '台式电视',
  car: '轿车',
  'floating-stairs': '悬空楼梯',
  'glass-stairs': '玻璃楼梯',
  'pillar-quarter': '四分之一圆柱',
  'pillar-quarterinner': '内四分之一圆柱',
  'pillar-round': '圆柱',
  'pillar-semicircle': '半圆柱',
  'steel-stairs': '钢结构楼梯',
  rounddiningtable_turntable: '圆餐桌（带转盘）',
  curtain_left: '左窗帘',
  curtain_right: '右窗帘',
  curtain_split: '对开窗帘',
  'sofa-l-left': 'L 型沙发（左贵妇）',
  'cabinet-two-section': '两节储物柜',
  'wardrobe-two-section': '两节衣柜',
})

/** 动画 / 可动部件：不烘焙世界变换、不跨节点焊接，只修静态外壳。 */
const ANIMATED = new Set(['ceiling-fan', 'exhaust-fan', 'turntable', 'garden-swing', 'garden-hammock'])

export function nameOf(id, primaryType, collectionEntry, catalogEntry) {
  return (
    collectionEntry?.name ??
    catalogEntry?.name ??
    MODEL_NAMES[id] ??
    MODEL_NAMES[primaryType] ??
    id
  )
}

export function mountOf({ id, primaryType, folder, collectionEntry }) {
  if (collectionEntry?.mount) return collectionEntry.mount
  const keys = [id, primaryType].filter(Boolean)
  if (keys.some((key) => CEILING_MOUNTED.has(key))) return 'ceiling'
  if (keys.some((key) => WALL_MOUNTED.has(key))) return 'wall'
  if (keys.some((key) => TABLETOP.has(key))) return 'tabletop'
  if (folder.startsWith('courtyard')) return 'floor'
  return 'floor'
}

/**
 * 异形柱：原点在**圆弧圆心**而不是平面占位中心。
 *
 * 半圆柱的圆心在直径面（墙线）上、四分之一圆柱的圆心在两片平背面相交的转角上，
 * 资产已按这个口径归心（`scripts/models/recenter-pillar-arc.mjs`），运行期
 * `preserveOrigin: true` 直接拿原点当摆放锚点与旋转轴。
 */
const ARC_CENTER_ORIGIN_IDS = new Set(['pillar-semicircle', 'pillar-quarter'])

export function originOf({ id, mount }) {
  if (ARC_CENTER_ORIGIN_IDS.has(id)) return 'floor-arc-center'
  if (mount === 'wall') return 'wall-back-center'
  if (mount === 'ceiling') return 'ceiling-center'
  if (mount === 'tabletop') return 'base-center'
  return 'floor-center'
}

export function topologyClassOf({ id }) {
  if (OPEN_SHEET.has(id)) return 'open-sheet'
  if (FOLIAGE_IDS.includes(id)) return 'open-sheet'
  return 'solid'
}

export function shadingOf({ id, topologyClass }) {
  if (topologyClass === 'open-sheet' && FOLIAGE_IDS.includes(id)) return 'double-sided'
  if (['glasspartition', 'full-length-mirror', 'aquarium', 'single-glass-cabinet', 'glasscabinet'].includes(id))
    return 'glass'
  return 'auto'
}

const TV_REFERENCE = {
  type: 'web',
  title: '三星 AU7700 65 英寸电视规格（含底座 1449.4 × 906.6 × 282.1 mm）',
  url: 'https://www.samsung.com/tw/support/tv-audio-video/65-type-4k-uhd-tv-au7700s-product-specifications/',
  accessedAt: '2026-10-23',
  confidence: 0.9,
}

const WEB_ACCESSED = '2026-10-23'

/**
 * 30 款旗舰的「联网查证 + 面数预算」。
 *
 * - `reference`：查到的实物规格页（URL + 访问日期），置信度按计划 §3 的区间给；
 *   没有厂商页可引的款（楼梯按国标、车辆/绿植按品类）写 `standard` / `category`，
 *   并在 `assumptions` 里写清「与注册表差多少、为什么仍按注册表」。
 * - `triangleBudget`：重建后的实测三角面数，作为回归预算；审计按预算 +10% 卡。
 *   低模不许因为预算宽就涨面数，只在需要时用满。
 */
export const FLAGSHIP_SPECS = Object.freeze({
  sofa: {
    triangleBudget: 180,
    reference: {
      type: 'web',
      title: 'IKEA KIVIK 三座沙发 228 × 95 × 83 cm（座高 45 / 座深 60）',
      url: 'https://www.ikea.com/gb/en/p/kivik-3-seat-sofa-tresund-anthracite-s79482835/',
      accessedAt: WEB_ACCESSED,
      confidence: 0.85,
    },
    assumptions: [
      {
        claim: '本体 2.2m 宽、0.9m 深、0.82m 高按三人沙发比例，含扶手不含靠垫',
        basis: 'KIVIK 三座 228 × 95 × 83 cm；注册表 2.2 × 0.82 × 0.9 与该规格同量级（宽 −3.5%）',
        confidence: 0.85,
        risk: '形态风格差异',
      },
    ],
  },
  'sofa-single': {
    triangleBudget: 144,
    reference: {
      type: 'category',
      title: '单人沙发常见规格：宽 0.9–1.1m、座高 0.42–0.45m、总高 0.8–0.9m',
      confidence: 0.65,
    },
    assumptions: [
      {
        claim: '宽 1.05m 视为「加宽单人位 / 双人小沙发」口径，与三人款同深同高',
        basis: '同系列三人款 2.28m ÷ 3 ≈ 0.76m/位，1.05m 更接近 1.5 位；注册表按同族比例给值',
        confidence: 0.6,
        risk: '形态风格差异',
      },
    ],
  },
  coffeetable: {
    triangleBudget: 120,
    reference: {
      type: 'web',
      title: 'GAZZDA Kulin 茶几 180 × 100 cm（同系列高 35 / 40 / 45 cm）',
      url: 'https://www.architonic.com/en/p/gazzda-kulin-coffee-table-180x100-20329479/',
      accessedAt: WEB_ACCESSED,
      confidence: 0.75,
    },
    assumptions: [
      {
        claim: '1.9 × 1.05m 大茶几、高 0.5m，属「大户型客厅几」而非边几',
        basis: 'Kulin 180 × 100 面宽与注册表 1.9 × 1.05 同量级；0.5m 高于常见 0.35–0.45，按带下层的厚台面处理',
        confidence: 0.7,
        risk: '形态风格差异',
      },
    ],
  },
  tvstand: {
    triangleBudget: 132,
    reference: {
      type: 'web',
      title: 'IKEA BESTÅ 电视柜 180 × 42 × 39 cm',
      url: 'https://www.ikea.com/gb/en/p/besta-tv-bench-black-brown-lappviken-walnut-effect-s79612139/',
      accessedAt: WEB_ACCESSED,
      confidence: 0.8,
    },
    assumptions: [
      {
        claim: '1.8m 宽、0.42m 深与 BESTÅ 一致；高度取 0.48m（含 9cm 支脚），高于 BESTÅ 的 39cm 落地柜',
        basis: '注册表 1.8 × 0.48 × 0.42；BESTÅ 同宽同深但为落地款，故按带脚款记录差量',
        confidence: 0.75,
        risk: '形态风格差异',
      },
    ],
  },
  bed: {
    triangleBudget: 264,
    reference: {
      type: 'web',
      title: 'IKEA MALM 高床架 160 × 200 cm：209 长 × 176 宽 × 100 高（床头板 100）',
      url: 'https://www.ikea.com/gb/en/p/malm-bed-frame-high-white-s09929373/',
      accessedAt: WEB_ACCESSED,
      confidence: 0.85,
    },
    assumptions: [
      {
        claim: '按 180 × 200 床垫的床架定标：床尾 1.92m 宽、含床头板总高 1.02m、总长 2.18m',
        basis: 'MALM 160 宽款为 176 × 209 × 100cm；注册表 1.92 × 1.02 × 2.18 对应 180 宽款（宽 +9%、长 +4%）',
        confidence: 0.8,
        risk: '尺寸不确定',
      },
    ],
  },
  'round-double-bed': {
    triangleBudget: 972,
    reference: {
      type: 'category',
      title: '圆床常见直径 2.0–2.2m（含床头围边），床面高 0.45–0.55m',
      confidence: 0.55,
    },
    assumptions: [
      {
        claim: '直径 2.07m 的圆床，含圆弧床头围边后总深 2.16m、总高 0.87m',
        basis: '注册表 2.07 × 0.871 × 2.161；圆床 2.0m 直径可睡 2 人，围边抬高的 0.87m 属常见造型',
        confidence: 0.55,
        risk: '形态风格差异',
      },
    ],
  },
  wardrobe: {
    triangleBudget: 236,
    reference: {
      type: 'web',
      title: 'IKEA PAX 双门衣柜 100 × 60 × 201.2 cm（236cm 高为同系另一档）',
      url: 'https://www.ikea.com/gb/en/p/pax-forsand-wardrobe-white-white-s79503017/',
      accessedAt: WEB_ACCESSED,
      confidence: 0.85,
    },
    assumptions: [
      {
        claim: '1.8m 宽为两扇 90cm 门；2.2m 高介于 PAX 的 201 / 236 两档之间；深 0.637m 含门板与把手',
        basis: 'PAX 深 60cm + 门板厚约 2cm + 把手；注册表 1.8 × 2.2 × 0.637 与「双门高柜」一致',
        confidence: 0.85,
        risk: '形态风格差异',
      },
    ],
  },
  cabinet: {
    triangleBudget: 132,
    reference: {
      type: 'category',
      title: '边柜/储物柜常见规格：宽 1.4–1.8m、深 0.4–0.45m、高 0.8–1.9m',
      confidence: 0.6,
    },
    assumptions: [
      {
        claim: '1.6 × 1.9 × 0.45m 按「高身餐边柜」定标，非矮边柜',
        basis: '注册表 1.6 × 1.9 × 0.45；深 0.45m 排除衣柜，高度排除矮柜',
        confidence: 0.6,
        risk: '形态风格差异',
      },
    ],
  },
  nightstand: {
    triangleBudget: 312,
    reference: {
      type: 'category',
      title: '床头柜常见规格：宽 0.45–0.55m、深 0.4–0.45m、高 0.5–0.6m',
      confidence: 0.65,
    },
    assumptions: [
      {
        claim: '0.5 × 0.55 × 0.42m 为标准两抽床头柜，台面高略低于床垫面',
        basis: '注册表 0.5 × 0.55 × 0.42；与床高 0.55–0.6m 的常见搭配一致',
        confidence: 0.65,
        risk: '形态风格差异',
      },
    ],
  },
  table: {
    triangleBudget: 444,
    reference: {
      type: 'web',
      title: 'Punt STOCKHOLM 餐桌 240 × 100 × 75 cm（8–10 人）',
      url: 'https://interiu.com/en/products/Rectangular%20Wooden%20Dining%20Table%20STOCKHOLM-164258',
      accessedAt: WEB_ACCESSED,
      confidence: 0.8,
    },
    assumptions: [
      {
        claim: '2.4m 长、0.82m 高与 8–10 人餐桌一致；1.8m 深按「围坐式大长桌 / 会议桌」口径',
        basis: 'Punt 240 × 100 × 75cm；注册表深度 1.8m 明显大于常规 1.0m，保留注册表以免压扁桌面造型',
        confidence: 0.6,
        risk: '尺寸不确定',
      },
    ],
  },
  chair: {
    triangleBudget: 156,
    reference: {
      type: 'web',
      title: '餐椅/扶手椅规格参考：座高 42–45cm、总高 78–90cm、面宽 0.45–0.5m',
      url: 'https://swyfthome.com/products/model-01-armchair',
      accessedAt: WEB_ACCESSED,
      confidence: 0.65,
    },
    assumptions: [
      {
        claim: '0.5 × 0.86 × 0.5m 为无扶手餐椅：座高 0.45m、靠背顶 0.86m',
        basis: 'Model 01 座高 43cm / 总高 82cm；注册表宽深各 0.5m，符合单椅占地',
        confidence: 0.7,
        risk: '形态风格差异',
      },
    ],
  },
  'kitchen-island': {
    triangleBudget: 684,
    reference: {
      type: 'web',
      title: '厨房岛台标准规格 2400 × 900 × 900 mm（台面高 900）',
      url: 'https://renomart.au/kitchen-island-sizes/',
      accessedAt: WEB_ACCESSED,
      confidence: 0.8,
    },
    assumptions: [
      {
        claim: '2.14m 长、0.78m 深与标准岛台同量级；总高 1.195m 含后挡高柜/吧台段',
        basis: '标准岛台 900mm 台面高；注册表 1.195m 高于台面，按含背柜的组合岛台处理',
        confidence: 0.6,
        risk: '形态风格差异',
      },
    ],
  },
  fridge: {
    triangleBudget: 188,
    reference: {
      type: 'web',
      title: '三星 RF50K5920 法式多门冰箱 795 × 745 × 1920 mm（宽 × 深 × 高）',
      url: 'https://www.samsung.com/si/refrigerators/french-door/486l-elegant-inox-rf50k5920s8-eo/',
      accessedAt: WEB_ACCESSED,
      confidence: 0.85,
    },
    assumptions: [
      {
        claim: '0.75 × 1.85 × 0.72m 为 400–500L 多门冰箱，深度按不含把手计',
        basis: '三星 795 × 745 × 1920mm；注册表 750 × 1850 × 720 各轴 −2%~−6%',
        confidence: 0.85,
        risk: '尺寸不确定',
      },
    ],
  },
  washer: {
    triangleBudget: 656,
    reference: {
      type: 'web',
      title: 'Bosch Series 6 滚筒洗衣机 845 × 598 × 590 mm（高 × 宽 × 深）',
      url: 'https://media3.bosch-home.com/Documents/specsheet/en-GB/WGG244ZCGB.pdf',
      accessedAt: WEB_ACCESSED,
      confidence: 0.9,
    },
    assumptions: [
      {
        claim: '宽 0.6 / 高 0.85m 为欧标 9kg 滚筒；深 0.65m 取含门圈凸出的整机深度',
        basis: 'Bosch 598 × 845 × 590mm（含门 636mm）；注册表深度 650mm 落在含门区间',
        confidence: 0.9,
        risk: '尺寸不确定',
      },
    ],
  },
  dryer: {
    triangleBudget: 656,
    reference: {
      type: 'web',
      title: 'Bosch Series 6 热泵干衣机 842 × 598 × 613 mm（高 × 宽 × 深）',
      url: 'https://media3.bosch-home.com/Documents/specsheet/en-GB/WQG24509GB.pdf',
      accessedAt: WEB_ACCESSED,
      confidence: 0.9,
    },
    assumptions: [
      {
        claim: '与洗衣机同宽同高；深 0.65m 取含门 0.648m 的整机深度',
        basis: 'Bosch 598 × 842 × 613mm（含门 648mm）；注册表 0.6 × 0.85 × 0.65',
        confidence: 0.9,
        risk: '尺寸不确定',
      },
    ],
  },
  rangehood: {
    triangleBudget: 120,
    reference: {
      type: 'web',
      title: 'Fisher & Paykel 90cm 壁挂烟机 898 × 500 × 635–1035 mm',
      url: 'https://www.fisherpaykel.com/au/ventilation/all-ventilation/90cm-series-7-box-chimney-wall-rangehood-hc90dcbb4-50195.html',
      accessedAt: WEB_ACCESSED,
      confidence: 0.8,
    },
    assumptions: [
      {
        claim: '0.9m 宽、0.45m 深为 90cm 烟机罩体；高 0.55m 只算罩体 + 短烟管，不含通顶烟道',
        basis: 'F&P 898 × 500mm 罩体，整机高 635–1035mm 取决于烟管；注册表 0.55m 按罩体高度记录',
        confidence: 0.7,
        risk: '尺寸不确定',
      },
    ],
  },
  microwave: {
    triangleBudget: 108,
    reference: {
      type: 'web',
      title: '三星 23L 微波炉 489 × 275 × 374 mm（宽 × 高 × 深）',
      url: 'https://www.samsung.com/uk/microwave-ovens/solo/microwave-solo-ms23k3513ak/',
      accessedAt: WEB_ACCESSED,
      confidence: 0.9,
    },
    assumptions: [
      {
        claim: '0.52 × 0.32 × 0.42m 为 23–25L 台面微波炉（含把手与脚垫）',
        basis: '三星 489 × 275 × 374mm；注册表各轴 +2%~+16%，深度 0.42 含尾部散热间隙',
        confidence: 0.85,
        risk: '尺寸不确定',
      },
    ],
  },
  dishwasher: {
    triangleBudget: 200,
    reference: {
      type: 'web',
      title: 'Bosch 60cm 独立式洗碗机 845 × 600 × 600 mm（高 × 宽 × 深）',
      url: 'https://media3.bosch-home.com/Documents/specsheet/en-GB/SMS58M18GB.pdf',
      accessedAt: WEB_ACCESSED,
      confidence: 0.9,
    },
    assumptions: [
      {
        claim: '0.6 × 0.82 × 0.6m 为 60cm 独立式洗碗机，高度取不含可拆台面的 820mm',
        basis: 'Bosch 845mm（拆台面 815mm）；注册表 0.82m 落在拆台面档',
        confidence: 0.85,
        risk: '尺寸不确定',
      },
    ],
  },
  'exhaust-fan': {
    triangleBudget: 536,
    reference: {
      type: 'category',
      title: '墙式排气扇常见规格：面板 0.34 × 0.34m，含风筒深 0.20–0.25m',
      confidence: 0.6,
    },
    assumptions: [
      {
        claim: '0.34 × 0.34m 面板、0.21m 深（含穿墙风筒），不是吸顶式',
        basis: '实测世界包围盒深 0.212m；注册表原值 0.16m 只算面板厚度，按实测修正',
        confidence: 0.75,
        risk: '不同安装方式（直接吸墙 / 接管）型深不同',
      },
    ],
  },
  basin: {
    /**
     * `basin` 已恢复**原厂件**（不再重建）：原厂本身就是椭圆盆 + 挂墙柜 + 镜面，
     * 厂商导出的柜体比例、门缝与盆胆过渡都不是参数化能复刻的。此前「平板水槽」的判断
     * 是对拍失误——原件盆胆实测 544 × 315、深 116mm，是一件正常的椭圆台下盆。
     */
    triangleBudget: 2764,
    reference: {
      type: 'web',
      title: 'LAUFEN PRO A 台下盆 600 × 480 × 115 mm（盆胆内腔 430 × 290 × 155）',
      url: 'https://www.laufen.com/products/washbasin-H818952...1561',
      accessedAt: WEB_ACCESSED,
      confidence: 0.8,
    },
    assumptions: [
      {
        claim: '0.9 × 0.5m 是「浴室柜 + 台面」整件，原厂台面标高 0.60m（台面板 0.507–0.607m）',
        basis: '实测世界包围盒：`light`（台面/挡水）0.507–0.607m、`body`（柜体）0.03–0.50m、总高 1.14m 到镜框顶',
        confidence: 0.9,
        risk: '比常见 0.85m 台面矮 25cm，属厂商原件的造型取向，不改网格去凑标准',
      },
      {
        claim: '1.14m 总高 = 镜框顶面；镜面 0.661–1.129m',
        basis: '实测 `glass` 分件包围盒；整件包络由注册表尺寸锁定',
        confidence: 0.85,
        risk: '真实浴室柜含镜应到 1.8m 以上，本件按包络压缩镜面高度',
      },
      {
        claim: '盆胆为椭圆盆：外接 544 × 315mm、内腔深 116mm',
        basis: '实测 `soft` 分件包围盒 0.544 × 0.315 × 0.116m；与 LAUFEN 600 台下盆同量级',
        confidence: 0.9,
        risk: '不同品牌盆胆深度差异',
      },
    ],
  },
  toilet: {
    triangleBudget: 200,
    reference: {
      type: 'web',
      title: 'TOTO CW660NJ 连体坐便器 424 × 690 × 765 mm（宽 × 深 × 高）',
      url: 'https://asia.toto.com/products/detail/spec-gen/generator.php?sysModelNo=cw660nj_sw660j',
      accessedAt: WEB_ACCESSED,
      confidence: 0.85,
    },
    assumptions: [
      {
        claim: '0.42 × 0.7m 占地与连体坐便器一致；0.52m 高为坐圈面高度，模型不含水箱',
        basis: 'TOTO 424 × 690 × 765mm（含水箱）；模型实测 0.52m，缺水箱故按「无水箱坐便器」记录',
        confidence: 0.7,
        risk: '形态风格差异',
      },
    ],
  },
  bathtub: {
    triangleBudget: 208,
    reference: {
      type: 'web',
      title: 'Villeroy & Boch Antao 独立浴缸 1700 × 750 × 500 mm（内深 480）',
      url: 'https://pro.villeroy-boch.com/en/gb/bw/p/Antao-Free-standing-bath-UBQ170TAO7TV01',
      accessedAt: WEB_ACCESSED,
      confidence: 0.9,
    },
    assumptions: [
      {
        claim: '1.7 × 0.78m 为 170 × 75cm 独立浴缸；0.58m 高含裙边与调平脚',
        basis: 'V&B 1700 × 750 × 500mm、Tavistock 同规格高 580mm；注册表 0.58m 取带脚档',
        confidence: 0.85,
        risk: '尺寸不确定',
      },
    ],
  },
  'floor-lamp': {
    triangleBudget: 992,
    // reference / assumptions 见下方 specOverrides（弧形落地灯按品类定标）
  },
  airpurifier: {
    triangleBudget: 308,
    reference: {
      type: 'web',
      title: 'Camfil City M 空气净化器 340 × 720 × 345 mm（宽 × 高 × 深）',
      url: 'https://www.e-nit.lt/images/Userfiles/CAMFIL_/Product-data-sheet-City-M.pdf',
      accessedAt: WEB_ACCESSED,
      confidence: 0.85,
    },
    assumptions: [
      {
        claim: '0.34 × 0.34m 方柱机身、0.7m 高，适用于 40–75㎡ 房间',
        basis: 'Camfil City M 340 × 720 × 345mm；注册表 340 × 700 × 340',
        confidence: 0.85,
        risk: '尺寸不确定',
      },
    ],
  },
  car: {
    triangleBudget: 604,
    reference: {
      type: 'category',
      title: '紧凑型 SUV 常见外廓：宽 1.8–1.9m、高 1.6–1.7m、长 4.5–4.7m',
      confidence: 0.55,
    },
    assumptions: [
      {
        claim: '2.19 × 1.43 × 5.01m 按「中大型 SUV」定标（宽含后视镜、高按车顶）',
        basis: '注册表 2.19 × 1.43 × 5.01 来自 itemTypeCatalog；宽 2.19m 明显含后视镜，长 5.01m 属中大型',
        confidence: 0.55,
        risk: '尺寸不确定',
      },
    ],
  },
  stairs: {
    triangleBudget: 360,
    reference: {
      type: 'standard',
      title: 'GB 50096-2011 6.3.2：踏步宽 ≥260mm、踏步高 ≤175mm、扶手高 ≥900mm',
      url: 'https://gf.cabr-fire.com/m/article-7240.htm',
      accessedAt: WEB_ACCESSED,
      confidence: 0.9,
    },
    assumptions: [
      {
        claim: '1.0m 梯段净宽、1.65m 高按 10 级 × 165mm 踏步高，2.8m 进深按 260mm 踏面 + 平台',
        basis: 'GB 50096-2011 踏步 260/175mm；注册表 1.0 × 1.65 × 2.8 满足净宽与坡度',
        confidence: 0.85,
        risk: '尺寸不确定',
      },
    ],
  },
  'steel-stairs': {
    triangleBudget: 456,
    reference: {
      type: 'standard',
      title: 'GB 50096-2011 6.3.2 踏步宽 ≥260mm、高 ≤175mm；钢结构按同口径校核',
      url: 'https://gf.cabr-fire.com/m/article-7240.htm',
      accessedAt: WEB_ACCESSED,
      confidence: 0.8,
    },
    assumptions: [
      {
        claim: '1.86 × 2.93m 占地、3.45m 高按双跑钢梯（约 20 级 × 172mm）',
        basis: 'GB 50096-2011 踏步高上限 175mm；注册表尺寸与双跑楼梯间一致',
        confidence: 0.7,
        risk: '尺寸不确定',
      },
    ],
  },
  'plant-monstera': {
    triangleBudget: 700,
    reference: {
      type: 'web',
      title: 'RHS 龟背竹（Monstera deliciosa）24cm 盆、株高 1.2m',
      url: 'https://www.rhsplants.co.uk/plants/_/monstera-deliciosa/classid.2000050453/',
      accessedAt: WEB_ACCESSED,
      confidence: 0.8,
    },
    assumptions: [
      {
        claim: '株高 1.12m、冠幅 0.56 × 0.71m，按 25cm 盆的中型龟背竹',
        basis: 'RHS 24cm 盆株高 1.2m；注册表 0.5625 × 1.12 × 0.7112 略小于商品苗，符合室内盆栽',
        confidence: 0.8,
        risk: '形态风格差异',
      },
    ],
  },
  'plant-palm': {
    triangleBudget: 2304,
    reference: {
      type: 'web',
      title: 'Decofora 散尾葵 25/19 盆、株高 150–160cm',
      url: 'https://www.decofora.com/en/areca-2519-h150',
      accessedAt: WEB_ACCESSED,
      confidence: 0.8,
    },
    assumptions: [
      {
        claim: '株高 1.55m、冠幅 1.08 × 1.11m，按 25cm 盆的散尾葵',
        basis: 'Decofora 盆径 25cm、株高 155cm；注册表 1.0834 × 1.55 × 1.1074 与该商品苗一致',
        confidence: 0.8,
        risk: '形态风格差异',
      },
    ],
  },
  tv_standard: {
    triangleBudget: 48,
    // reference / assumptions 见下方 specOverrides（三星 65 英寸含底座）
  },
})

export const specOverrides = {
  'floor-lamp': {
    // 唯一一款**没有被注册表引用**的孤儿模型（SimLab 原始名：`frosted-white`、`[color_008]1`）。
    // 实测世界包围盒 1.64 × 2.04 × 0.44 m —— 这是「弧形落地灯（钓鱼灯）」的比例：
    // 底座 0.30m、弧形碳素杆伸出约 1.3m、灯罩悬在离地 2.0m，不是直立式落地灯。
    size: [1.6, 2.0, 0.45],
    mount: 'floor',
    reference: {
      type: 'category',
      title: '弧形落地灯（钓鱼灯）常见规格：高 1.9–2.1m，伸展 1.4–1.7m',
      confidence: 0.5,
    },
    assumptions: [
      {
        claim: '按弧形落地灯定标：总高 2.0m、水平伸展 1.6m、底座直径 0.30m',
        basis: '实测包围盒比例（1.64 × 2.04 × 0.44）+ 品类常识；注册表未引用该模型，无 scaleBasis 可校',
        confidence: 0.5,
        risk: '形态风格差异',
      },
      {
        claim: '该模型目前是孤儿资源，槽位名全部是 SimLab 原始名',
        basis: 'ALL_ITEM_MODELS 里没有指向 floor-lamp.glb 的条目',
        confidence: 0.95,
        risk: '材质运行时覆盖',
      },
    ],
    notes: 'Tier B：保留弧形比例，重做底座/杆/灯罩的槽位契约；决定是否登记进注册表。',
  },
  tv_standard: {
    // 「标准」档是壁挂裸屏：1.500 × 0.844 × 0.050，16:9、底面 y=0。
    // 带底座的是 tv_tabletop（0.874 高），带落地支架的是 tv_mobile（1.55 高）。
    // 2026-10-28：原资产面板只有 0.570 高（2.63:1）且整体浮在原点上方 0.285，已按 16:9 修正。
    size: [1.5, 0.844, 0.0504],
    mount: 'wall',
    origin: 'base-center',
    reference: TV_REFERENCE,
    animated: false,
    assumptions: [
      {
        claim: '面板 1.500 × 0.844 m（16:9），厚 0.0504 m，底面 y=0',
        basis:
          '16:9 换算：1.5 ÷ 16 × 9 = 0.844；三星 AU7700 65" 规格页的整机宽高 1449.4 × 906.6 mm 与本尺寸同档',
        confidence: 0.9,
        risk: '形态风格差异',
      },
      {
        claim: '裸屏形态：不含底座与立柱；台面摆放由 tv_tabletop 承担',
        basis: '运行时按 tvMountStyle 在 tv_standard / tv_tabletop / tv_mobile 三份资产间切换',
        confidence: 0.8,
        risk: '形态风格差异',
      },
    ],
    notes: '2026-10-28 比例修正：16:9 面板 1.500 × 0.844 × 0.050，底面落到 y=0；原资产 2.63:1 且悬空 0.285 m。',
  },
  // ── 庭院植物 15 款（2026-10-24 形态重建）───────────────────────────
  // 参照全部是**品类常识**而不是厂商页：植物的「规格」没有国标可引，能查的是物种的
  // 成株比例区间（净干高占全高比例、冠幅:树高、秆径、叶片长度）。尺寸仍按注册表，
  // 这里登记的是「这个尺寸下哪些比例是真实的」，重建时照它建模，不再靠目测。
  'garden-tree': {
    triangleBudget: 3190,
    reference: {
      type: 'category',
      title: '落叶阔叶庭院树（朴树 / 榉树 / 樱花）成株比例：净干高占全高 40%–47%、冠幅 2–3m、基部直径 0.12–0.20m',
      confidence: 0.6,
    },
    assumptions: [
      {
        claim: '3.4m 高按「已定植 5–8 年的庭院乔木」建模：净干高 1.4m、基部直径 0.18m、冠层厚 1.5m',
        basis: '注册表 2.2 × 3.4 × 2.1 不变；旧件树干直径 0.48m（3.4m 高的树根部 0.48m 是树桩，不是树）',
        confidence: 0.6,
        risk: '形态风格差异',
      },
      {
        claim: '冠层用 14 个大叶簇 + 7 个次级叶簇铺外缘，冠心留空让内膛枝可见',
        basis: '冠幅 2.1m 的阔叶树，单簇叶团 0.3–0.4m，铺满外缘需要 12–18 簇（旧件只有 4 簇）',
        confidence: 0.55,
        risk: '形态风格差异',
      },
    ],
    notes: '槽位：0 base=树干(trunk)、1 light=受光叶、2 dark=分枝(branch)、3 leaf=主叶。',
  },
  'garden-tree-rounded': {
    triangleBudget: 3128,
    reference: {
      type: 'category',
      title: '球形冠景观阔叶树（椴树 / 枫杨 / 球状修剪榆）：冠高:冠宽 ≈ 0.8–0.9、净干高 1.2–1.4m',
      confidence: 0.6,
    },
    assumptions: [
      {
        claim: '3.0m 高、2.1m 冠幅、净干高 1.4m，冠形接近正球（冠高 1.6m : 冠宽 2.0m）',
        basis: '注册表 2.1 × 3.0 × 2.1；旧件树冠是单个 180 面球，没有「干 + 冠」的分层',
        confidence: 0.6,
        risk: '形态风格差异',
      },
      {
        claim: '树干笔直不分叉（冠内只留 3 根短枝），基部直径 0.15m',
        basis: '球形冠多用单干苗定植，主干在冠下通直；0.15m 对应 3m 高的园林苗口径',
        confidence: 0.55,
        risk: '形态风格差异',
      },
    ],
  },
  'garden-tree-columnar': {
    triangleBudget: 2460,
    reference: {
      type: 'category',
      title: '柱形乔木（塔杨 / 意大利柏 / 柱形鹅耳枥）：冠幅:树高 ≈ 1:4–1:5、冠层 8–12 段收尖',
      confidence: 0.6,
    },
    assumptions: [
      {
        claim: '3.2m 高对应 0.72m 冠幅（1:4.4），旧件 1.0m 冠幅是「胖柱子」',
        basis: '意大利柏成株冠幅:树高约 1:5，柱形鹅耳枥约 1:4；注册表已按 0.72m 改写',
        confidence: 0.6,
        risk: '尺寸不确定',
      },
      {
        claim: '冠层从 0.45m 起、纵向 10 段扁椭球 + 每段一枚偏移叶团，顶端收尖到 0.06m',
        basis: '柱形树的辨识点是「竖直连续冠面 + 尖锐顶端」，不是两枚椭球叠加',
        confidence: 0.55,
        risk: '形态风格差异',
      },
    ],
    notes: '尺寸由 1.00 × 3.20 × 1.00 改为 0.72 × 3.20 × 0.72（计划 §1 两处尺寸调整之一）。',
  },
  'garden-tree-multistem': {
    triangleBudget: 2992,
    reference: {
      type: 'category',
      title: '多干小乔木（丛生茶条槭 / 紫薇 / 丛生柿）：3–5 根自基部分叉、冠层拆成多个小冠',
      confidence: 0.55,
    },
    assumptions: [
      {
        claim: '4 根干自基部 0.06–0.10m 处分叉，向外张开到 0.40–0.50m，干径 5–8cm',
        basis: '注册表 2.1 × 2.6 × 1.8；旧件只有 1 个主干壳体，与「多干」的品类特征矛盾',
        confidence: 0.55,
        risk: '形态风格差异',
      },
      {
        claim: '冠层拆成 4 个独立小冠（每干一个）而不是一整球，冠与冠之间留缝',
        basis: '多干型的观赏点就是「几根干各自顶一个冠」；单一球冠会读成普通乔木',
        confidence: 0.55,
        risk: '形态风格差异',
      },
    ],
  },
  'garden-conifer': {
    triangleBudget: 2702,
    reference: {
      type: 'category',
      title: '自然型景观松（黑松 / 油松）：主干微倾、下段裸干、6–9 片水平云片、片间留空',
      confidence: 0.65,
    },
    assumptions: [
      {
        claim: '3.0m 高、1.5m 冠幅、7 片云片（半径 0.58→0.16m，厚 0.10–0.15m），0.9m 以下裸干',
        basis: '黑松成株的枝盘就是逐层外伸、层间透空；旧件用 3 个圆锥（叶部仅 60 面）读成圣诞树',
        confidence: 0.65,
        risk: '形态风格差异',
      },
      {
        claim: '主干 3m 高处偏移 0.10m（约 2°），基部直径 0.19m',
        basis: '自然型松树少见笔直主干；0.19m 对应 3m 高的黑松口径',
        confidence: 0.55,
        risk: '形态风格差异',
      },
    ],
    notes: '旧件「3 个圆锥当松树」是本批里最不像的一款，重建后由云片 + 可见枝识别。',
  },
  'garden-conifer-layered': {
    triangleBudget: 2966,
    reference: {
      type: 'category',
      title: '造型黑松 / 云片式盆景放大：7–8 层左右交错云片、片间高差 0.25–0.35m',
      confidence: 0.6,
    },
    assumptions: [
      {
        claim: '2.9m 高、2.0m 冠幅，8 片云片沿主干左右交错（x 偏移 ±0.5m），不是同心圆',
        basis: '注册表 2.0 × 2.9 × 1.65；云片式造型的「层叠」靠偏心错位，同心层会读成塔',
        confidence: 0.6,
        risk: '形态风格差异',
      },
      {
        claim: '片厚 0.11–0.17m、片间高差 0.22–0.28m，1.2m 以下可见主干',
        basis: '造型松的观感是「薄片 + 空隙」，片太厚或层距太密会糊成一团',
        confidence: 0.55,
        risk: '形态风格差异',
      },
    ],
  },
  'garden-shrub': {
    triangleBudget: 2336,
    reference: {
      type: 'category',
      title: '无主干丛生花灌木（绣线菊 / 棣棠 / 六道木）：高 0.6–0.9m、枝径 1–1.5cm、无粗桩',
      confidence: 0.6,
    },
    assumptions: [
      {
        claim: '0.72m 高、0.95m 宽的半球冠，6 根 1.4cm 细枝自基部放射，枝尖止于冠面下 5–10cm',
        basis: '注册表 0.95 × 0.72 × 0.85；旧件内部「树干」高 0.53m（占整株 74%），花灌木没有这种主干',
        confidence: 0.6,
        risk: '形态风格差异',
      },
      {
        claim: '冠层 14 个大叶簇 + 6 个次级叶簇，中心也有叶（不能从底下看见空腔）',
        basis: '丛生灌木的叶片从基部就开始分叉，冠心是实的；只有乔木才需要冠心留空',
        confidence: 0.55,
        risk: '形态风格差异',
      },
    ],
    notes: '槽位 0（base）刻意留空：花灌木无主干，树干材质不参与。',
  },
  'garden-shrub-low': {
    triangleBudget: 1796,
    reference: {
      type: 'category',
      title: '修剪成球的黄杨 / 小叶女贞（Buxus 球）：高:宽 ≈ 0.65–0.75、顶部有起伏不平顶',
      confidence: 0.65,
    },
    assumptions: [
      {
        claim: '0.65m 高 / 0.95m 宽（高:宽 0.68），旧件 0.48m 高是压扁的饼',
        basis: '黄杨球苗圃规格多为「宽:高 ≈ 1.2–1.4」；注册表已按 0.95 × 0.65 × 0.85 改写',
        confidence: 0.6,
        risk: '尺寸不确定',
      },
      {
        claim: '半球冠（非整球）+ 顶部 3–4cm 起伏，冠底 6cm 内收露出土面',
        basis: '落地修剪球的下缘会收进去，整球会显得悬空；全平顶是「几何体」不是修剪球',
        confidence: 0.55,
        risk: '形态风格差异',
      },
    ],
    notes: '尺寸由 1.10 × 0.48 × 0.90 改为 0.95 × 0.65 × 0.85（计划 §1 两处尺寸调整之一）。',
  },
  'garden-shrub-flowering': {
    triangleBudget: 2176,
    reference: {
      type: 'category',
      title: '开花灌木（绣球 / 月季 / 锦带）：花簇集中在冠面外层、单花簇 5–10cm',
      confidence: 0.6,
    },
    assumptions: [
      {
        claim: '0.80m 高、1.05m 宽，26 个花簇沿冠面分布（每簇 6–9cm），花与叶分两个槽位',
        basis: '注册表 1.05 × 0.80 × 0.90；旧件「花」是顶部一枚共面圆盘，侧视是一条线',
        confidence: 0.55,
        risk: '形态风格差异',
      },
      {
        claim: '花簇只铺外层 15% 深度，内层仍是叶（不出现「整球都是花」）',
        basis: '绣球/月季的花都开在受光的新梢上，冠内是叶与枝',
        confidence: 0.55,
        risk: '形态风格差异',
      },
    ],
  },
  'garden-hedge': {
    triangleBudget: 2432,
    reference: {
      type: 'category',
      title: '黄杨 / 大叶黄杨修剪绿篱：高 0.8–1.2m、厚 0.4–0.6m、顶面与侧面有叶簇起伏',
      confidence: 0.65,
    },
    assumptions: [
      {
        claim: '1.6 × 0.94 × 0.55 主体 + 顶/侧 14 处叶簇起伏（3–5cm）+ 底部 8cm 土带',
        basis: '注册表 1.6 × 1.0 × 0.55；旧件是一个光盒子，没有任何叶片起伏',
        confidence: 0.6,
        risk: '形态风格差异',
      },
      {
        claim: '顶面起伏只在外缘，中心留可站水线的平面',
        basis: '修剪绿篱的顶面是平的，起伏来自未剪净的新梢；中心起拱会读成「圆顶篱」',
        confidence: 0.55,
        risk: '形态风格差异',
      },
    ],
  },
  'garden-hedge-round': {
    triangleBudget: 1692,
    reference: {
      type: 'category',
      title: '圆顶长条绿篱 / 迷迭香矮篱：连续圆顶、端面收圆、无平顶段',
      confidence: 0.6,
    },
    assumptions: [
      {
        claim: '1.8m 长向连续圆顶（长椭球核 1.72:1:0.6）+ 16 个外缘叶簇 + 底部 7cm 土带',
        basis: '注册表 1.8 × 0.85 × 0.65；圆顶篱的端头是圆角，不是圆柱切面',
        confidence: 0.6,
        risk: '形态风格差异',
      },
    ],
  },
  'garden-bamboo': {
    triangleBudget: 3340,
    reference: {
      type: 'category',
      title: '丛生竹（孝顺竹 / 凤尾竹）：秆径 1.5–3cm、高 2–4m、3–5 个可见竹节、上部 2/3 才有叶',
      confidence: 0.65,
    },
    assumptions: [
      {
        claim: '2.7m 高、15 根秆（秆径 0.015–0.03m 渐细、每根 4 节）、高度 0.55–1.0H 错落',
        basis: '注册表 1.05 × 2.7 × 0.85；旧件是 0.96m 直径的等径圆柱阵，没有节也没有梢',
        confidence: 0.6,
        risk: '形态风格差异',
      },
      {
        claim: '叶片集中在秆上部 60–100 簇，下部只露秆',
        basis: '竹类下部老秆落叶，叶集中在冠层；满秆是叶会丢掉「竹」的识别点',
        confidence: 0.6,
        risk: '形态风格差异',
      },
    ],
    notes: '槽位：0 base=竹秆(branch)、1 light=嫩叶、2 dark=老秆/枝(branch)、3 leaf=叶。',
  },
  'garden-bamboo-dense': {
    triangleBudget: 4256,
    reference: {
      type: 'category',
      title: '密植竹丛（凤尾竹 / 箬竹）：秆数 18–25 根、比单丛更矮更密',
      confidence: 0.6,
    },
    assumptions: [
      {
        claim: '2.4m 高、22 根秆、96 个叶簇，密度比竹丛高约 45%',
        basis: '注册表 1.2 × 2.4 × 1.0；密植丛的观感是「秆看不太清、叶连成一片」',
        confidence: 0.6,
        risk: '形态风格差异',
      },
    ],
  },
  'garden-grass-clump': {
    triangleBudget: 1952,
    reference: {
      type: 'category',
      title: '观赏草丛（狼尾草 / 芒草）：叶长 0.6–0.9m、弧形外弯、抽穗高 0.7–0.9m',
      confidence: 0.65,
    },
    assumptions: [
      {
        claim: '0.8m 高、56 片弯曲叶（每片 4 段）+ 8 个穗',
        basis: '注册表 0.75 × 0.8 × 0.65；旧件是单个锥体，没有一片叶',
        confidence: 0.6,
        risk: '形态风格差异',
      },
      {
        claim: '叶片截面用 4 边细棱柱（厚度 6mm）而不是单面四边形',
        basis: '运行时材质是单面（doubleSided=false），单面片从背面看会整片消失',
        confidence: 0.85,
        risk: '材质运行时覆盖',
      },
    ],
  },
  'garden-grass-low': {
    triangleBudget: 1644,
    reference: {
      type: 'category',
      title: '低矮观赏草 / 地被草：高 0.3–0.45m、叶匍匐斜出、无明显穗',
      confidence: 0.65,
    },
    assumptions: [
      {
        claim: '0.42m 高、0.8m 宽，66 片匍匐/斜出叶（外圈更平、内圈更立）',
        basis: '注册表 0.8 × 0.45 × 0.8（按 0.42m 高重建）；旧件是单个扁球',
        confidence: 0.6,
        risk: '形态风格差异',
      },
    ],
  },
}

/**
 * 2026-10-23 尺寸正名（计划 §5「尺寸问题改规格不拉伸」）。
 *
 * 上一轮把「模型实测包围盒 vs 注册表数值」的偏差记成 40 多条 waiver，既没缩放也没改规格，
 * 门禁只能靠例外放行。这里改成：**资产外廓就是规格**——`spec.size` 取原始 GLB 的世界 AABB，
 * 注册表数值继续保留在 `spec.registrySize` 里做对照，运行时摆放/碰撞也按真实外廓走。
 *
 * 为什么不是「按注册表缩放模型」：这些偏差集中在把手、踢脚、台面外沿、靠背、支架横杆等
 * 外凸细节上，按单轴拉伸会把整件压扁（例如 `glasspartition` 深 0.08 m 只是玻璃厚度，
 * `piano` 的 2.0 m 深包含琴凳与掀开的顶盖）。改规格不会让任何 CLB 形变。
 */
const MEASURED_AABB = {
  elliptical: [0.818, 1.637, 1.318],
  floorlamp: [1.278, 1.649, 0.46],
  glasspartition: [1.2, 2.0, 0.094],
  nightstand: [0.52, 0.52, 0.455],
  'round-rug': [1.8, 0.013, 1.8],
  rug: [2.0, 0.013, 1.4],
  'wall-art': [0.64, 0.84, 0.045],
  'coat-rack': [0.453, 1.66, 0.43],
  shoecabinet: [1.809, 2.205, 0.449],
  'dumbbell-rack': [1.05, 0.899, 0.6],
  'mahjong-table': [0.94, 0.815, 0.94],
  'child-highchair': [0.594, 1.007, 0.696],
  kitchenbase: [2.448, 0.85, 0.648],
  kitchencooktop: [1.224, 0.908, 0.648],
  'side-table': [0.45, 0.52, 0.45],
  'guitar-stand': [0.457, 1.134, 0.485],
  'keyboard-stand': [1.03, 0.969, 0.357],
  piano: [1.805, 1.47, 1.996],
  bookcase: [1.2, 1.9, 0.347],
  cabinet: [1.6, 1.9, 0.474],
  glasscabinet: [1.2, 1.9, 0.437],
  sideboard: [1.6, 2.2, 0.474],
  wallcabinet: [1.53, 0.842, 0.377],
  // 第二批：`build-spec-exceptions.mjs` 仍挂着「尺寸例外」的 40 款。逐一按原始资产的
  // 世界 AABB 登记，消掉「规格对不上就拉伸网格」的动机；网格一律保持原样。
  '3d-printer': [0.46, 0.694, 0.461],
  'aroma-diffuser': [0.106, 0.174, 0.106],
  'baby-crib': [0.831, 1.032, 1.434],
  bar: [2.2, 1.049, 0.754],
  'bar-stool': [0.458, 0.97, 0.472],
  'bicycle-rack': [0.638, 1.058, 1.77],
  'cat-tree': [0.73, 1.301, 0.5],
  'ceiling-fan': [1.009, 0.306, 1.149],
  'cello-stand': [0.546, 1.529, 0.554],
  curtain_left: [1.908, 2.334, 0.148],
  curtain_right: [1.908, 2.334, 0.148],
  curtain_split: [1.908, 2.334, 0.148],
  'desktop-frame': [0.224, 0.309, 0.126],
  'disinfection-cabinet': [0.44, 0.41, 0.385],
  'drying-rack': [1.653, 1.037, 0.563],
  'easel-board': [0.749, 1.694, 0.827],
  'electric-valve': [0.22, 0.15, 0.121],
  'home-network-cabinet': [0.55, 0.64, 0.46],
  kitchensink: [1.224, 1.037, 0.648],
  'laundry-basket': [0.344, 0.434, 0.267],
  'pet-bed-bowls': [0.92, 0.156, 0.48],
  'pet-dryer': [0.522, 0.562, 0.495],
  'ping-pong-table': [1.685, 0.921, 2.74],
  'pipeline-water-purifier': [0.26, 0.378, 0.104],
  ps5: [0.178, 0.421, 0.268],
  robotvacuum: [0.414, 0.66, 0.515],
  'rocking-horse': [0.564, 0.868, 1.08],
  shower: [0.459, 1.908, 0.677],
  'single-rail-rack': [1.232, 1.55, 0.596],
  'smart-display': [0.256, 0.222, 0.114],
  'smart-display-wall': [0.257, 0.162, 0.032],
  'storage-box': [0.577, 0.346, 0.383],
  'storage-cart': [0.466, 0.792, 0.326],
  'switch-console': [0.241, 0.128, 0.096],
  'tea-bar-machine': [0.402, 1.162, 0.402],
  tv_mobile: [1.5, 1.55, 0.55],
  tv_tabletop: [1.5, 0.874, 0.16],
  'up-down-wall-lamp': [0.06, 0.3, 0.06],
  'water-purifier': [0.18, 0.415, 0.365],
  'yoga-set': [1.363, 0.65, 1.8],
  tv_standard: [1.5, 0.844, 0.0504],
  wallac: [0.9, 0.28, 0.231],
}

for (const [id, size] of Object.entries(MEASURED_AABB)) {
  const existing = specOverrides[id] ?? {}
  specOverrides[id] = {
    ...existing,
    size,
    reference: {
      type: 'asset',
      title: '原始 GLB 世界包围盒（HEAD 资产，含把手 / 踢脚 / 外沿等外凸细节）',
      confidence: 0.9,
    },
    assumptions: [
      ...(existing.assumptions ?? []),
      {
        claim: `有效外廓 ${size.map((value) => value.toFixed(3)).join(' × ')} m`,
        basis:
          '原始 GLB 的世界 AABB；摆放与碰撞按真实外廓，注册表数值保留在 registrySize 做对照。' +
          '本款偏差来自外凸细节（把手 / 踢脚 / 台面外沿 / 支架横杆 / 波形叶片），不是单位或比例错误',
        confidence: 0.9,
        risk: '尺寸不确定',
      },
    ],
  }
}

export { ANIMATED, MEASURED_AABB, MODEL_NAMES, OPEN_SHEET }
