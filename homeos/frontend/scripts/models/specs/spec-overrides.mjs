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

/** 整件就是薄片的模型：叶片 / 布片 / 玻璃 / 地毯 / 挂画。 */
const OPEN_SHEET = new Set([
  'rug',
  'round-rug',
  'sofa-throw',
  'pillow-set',
  'curtain_left',
  'curtain_right',
  'curtain_split',
  'wall-art',
  'projection-screen',
  'folding-screen',
  'garden-pond',
  'garden-pond-round',
  'garden-pool',
  'garden-lawn',
  'garden-paving',
  'garden-stepping',
  'garden-deck',
  'garden-grass-clump',
  'garden-grass-low',
  'plant',
  'plant-monstera',
  'plant-palm',
  'plant-pothos',
  'plant-rubber',
  'plant-snake',
  'decor-small-plant',
  'dried-flowers',
  'flower-anthurium',
  'flower-hydrangea',
  'flower-orchid',
  'flower-peace-lily',
])

/** 叶片族：整件按「盆/干/叶簇」建模，叶片必然是双面开口薄片，登记为合法例外。 */
export const FOLIAGE_IDS = Object.freeze([
  'plant',
  'plant-monstera',
  'plant-palm',
  'plant-pothos',
  'plant-rubber',
  'plant-snake',
  'decor-small-plant',
  'dried-flowers',
  'flower-anthurium',
  'flower-hydrangea',
  'flower-orchid',
  'flower-peace-lily',
  'garden-bamboo',
  'garden-bamboo-dense',
  'garden-conifer',
  'garden-conifer-layered',
  'garden-grass-clump',
  'garden-grass-low',
  'garden-hedge',
  'garden-hedge-round',
  'garden-shrub',
  'garden-shrub-flowering',
  'garden-shrub-low',
  'garden-tree',
  'garden-tree-columnar',
  'garden-tree-multistem',
  'garden-tree-rounded',
  'garden-flowers',
  'garden-flowers-wild',
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

export function originOf({ mount }) {
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
    // 实测 1.5 × 0.57 × 0.05 只有面板，没有底座；注册表 1.5 × 0.92 × 0.18 是「含底座」口径。
    // 按厂商规格改写为 65 英寸整机（含底座），Tier A 重建时补底座与 16:9 面板。
    size: [1.449, 0.907, 0.282],
    mount: 'tabletop',
    reference: TV_REFERENCE,
    animated: false,
    assumptions: [
      {
        claim: '尺寸为 65 英寸整机含底座（宽 1.449 / 高 0.907 / 深 0.282 m）',
        basis: '三星 AU7700 官方规格页；原模型 1.5 × 0.57 × 0.05 只有面板，缺底座',
        confidence: 0.9,
        risk: '形态风格差异',
      },
      {
        claim: '以「台面摆放含底座」为默认形态，壁挂形态由场景 elevation 决定',
        basis: '注册表 scaleBasis 高度 0.92 与含底座规格一致；材质预设注释称其为壁挂电视',
        confidence: 0.75,
        risk: '轴向/单位歧义',
      },
    ],
    notes: 'Tier A 重建：16:9 面板 + 中置底座 + 背板接口区，面数预算 450。',
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
  tv_mobile: [1.5, 0.897, 0.3],
  tv_tabletop: [1.5, 0.874, 0.16],
  'up-down-wall-lamp': [0.06, 0.3, 0.06],
  'water-purifier': [0.18, 0.415, 0.365],
  'yoga-set': [1.363, 0.65, 1.8],
  tv_standard: [1.5, 0.57, 0.05],
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
