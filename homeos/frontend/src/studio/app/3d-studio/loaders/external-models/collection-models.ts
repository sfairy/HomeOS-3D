/**
 * 家用收藏模型注册表：98 款新增 + 重绘替换 12 款，共 110 条，另外收录从其中一款
 * **派生**出来的单件模型（`台面`，取 `basin` 的台面构件）。
 *
 * 每款给出摆放尺寸、挂载方式、细分类目与角色配色。`replaces` 为 `true` 的 12 款是
 * 重绘后顶替既有同名模型的（微波炉 / 洗衣机 / 烘干机 / 台盆 / 绿植 …），它们的
 * `-lite` 与完整 GLB 均已覆盖。
 *
 * 角色配色是 `[冷色, 暖木色]` 二元组：取值为名字时由调用方传入的调色板解析，
 * 为数字时直接当色值用（见 `collectionRoleColorSpec`）。
 */
import type { LibraryGroupId } from '../../authoring/items/studio-model-library'

type CollectionModelMount = 'floor' | 'tabletop' | 'wall'
type CollectionModelCategory = 'home' | 'appliance'
type CollectionModelRolePair = readonly [string | number, string | number]

type CollectionModelDefinition = {
  name: string
  /** `[宽, 高, 深]` 米。 */
  size: readonly [number, number, number]
  mount: CollectionModelMount
  category: CollectionModelCategory
  group: LibraryGroupId
  /** 资源缓存键后缀。 */
  assetVersion: string
  /** `true` 表示重绘并替换了既有同名模型。 */
  replaces: boolean
  /** 角色 → `[冷色, 暖木色]`。 */
  roles: Readonly<Record<string, CollectionModelRolePair>>
}

/**
 * 室内绿植 / 花艺的**语义角色**配色基线（`[冷色, 暖木色]`）：
 * 盆 = 陶土、托盘 = 浅瓷、枝干 = 深木、叶 = 叶绿 / 浅叶绿。
 * 冷色档以前给的是 `furniture`（蓝灰家具色），「选鲜绿却全是棕」的根因之一；现在两套主题都取植物色。
 */
const PLANT_CONTAINER_ROLES: Readonly<Record<string, CollectionModelRolePair>> = Object.freeze({
  pot: ['decorAccent', 'decorAccent'],
  saucer: ['countertop', 'countertop'],
  stem: ['woodDark', 'woodDark'],
  foliage: ['leafColor', 'leafColor'],
  foliageSoft: ['leafColorLight', 'leafColorLight'],
  foliageLight: ['leafColorLight', 'leafColorLight'],
})

const COLLECTION_MODEL_ASSET_VERSION = '20261013-household-v2'

/** 重绘后顶替既有同名模型的 12 款（`replaces: true`）。 */
const REPLACED_MODEL_IDS = new Set([
  'urinal',
  'bathtub',
  'basin',
  'ricecooker',
  'washer',
  'dryer',
  'microwave',
  'steamoven',
  'rangehood',
  'dishwasher',
  'plant',
  'walllamp',
])

/** 角色配色简写：单个值表示冷暖同色（`'x'` ≡ `['x', 'x']`）。 */
type CollectionModelRoleSpec = string | number | CollectionModelRolePair

/** 一条注册表定义：尺寸 `[宽, 高, 深]` 米，挂载方式、细分类目与角色配色依次给出。 */
function model(
  name: string,
  size: readonly [number, number, number],
  mount: CollectionModelMount,
  category: CollectionModelCategory,
  group: LibraryGroupId,
  roles: Readonly<Record<string, CollectionModelRoleSpec>>,
): CollectionModelDefinition {
  const expandedRoles: Record<string, CollectionModelRolePair> = {}
  for (const [role, spec] of Object.entries(roles)) expandedRoles[role] = typeof spec === 'object' ? spec : [spec, spec]
  return {
    name,
    size,
    mount,
    category,
    group,
    assetVersion: COLLECTION_MODEL_ASSET_VERSION,
    replaces: false,
    roles: expandedRoles,
  }
}

const COLLECTION_MODEL_TABLE: Readonly<Record<string, CollectionModelDefinition>> = {
  'floor-washer': model('洗地机', [0.29, 1.209281, 0.327822], 'floor', 'appliance', 'cleaning', {
    dark: 'applianceDark',
    body: 'appliance',
    soft: 'applianceSoft',
    accent: ['furnitureDark', 'furniture'],
    light: 'furnitureLight',
  }),
  soundbar: model('长条音响', [0.98, 0.08, 0.1247], 'tabletop', 'appliance', 'media', {
    body: 'appliance',
    dark: 'applianceDark',
    accent: ['furnitureDark', 'furniture'],
    light: 'furnitureLight',
  }),
  'tower-speaker': model('立式音响', [0.33, 0.97, 0.346696], 'floor', 'appliance', 'media', {
    body: 'furniture',
    dark: 'applianceDark',
    accent: 'furnitureDark',
    soft: ['appliance', 'woodLight'],
    light: 'furnitureLight',
  }),
  'coffee-machine': model('咖啡机', [0.313957, 0.418, 0.38459], 'tabletop', 'appliance', 'kitchen-devices', {
    dark: 'applianceDark',
    body: 'appliance',
    soft: 'applianceSoft',
    light: 'furnitureLight',
    accent: ['furnitureDark', 'furniture'],
  }),
  'round-double-bed': model('圆形双人床', [2.07, 0.871, 2.161003], 'floor', 'home', 'bedroom', {
    body: 'furniture',
    dark: ['furnitureDark', 'woodDark'],
    light: 'furnitureLight',
    soft: ['furnitureSoft', 'diningLinen'],
    accent: ['appliance', 'woodLight'],
  }),
  'pressure-cooker': model('电压力锅', [0.38, 0.3555, 0.311], 'tabletop', 'appliance', 'kitchen-devices', {
    body: 'appliance',
    dark: 'applianceDark',
    soft: 'applianceSoft',
    accent: ['furnitureDark', 'furniture'],
    light: 'furnitureLight',
  }),
  'single-glass-cabinet': model('单列玻璃展示柜', [0.48, 1.7, 0.427], 'floor', 'home', 'storage', {
    body: 'furniture',
    soft: ['applianceSoft', 'woodLight'],
    dark: ['furnitureDark', 'woodDark'],
    glass: 'glass',
  }),
  projector: model('投影仪', [0.333, 0.129, 0.259598], 'tabletop', 'appliance', 'media', {
    body: 'appliance',
    dark: 'applianceDark',
    glass: 'glass',
    light: 'furnitureLight',
  }),
  'projection-screen': model('投影幕布', [2.08, 1.265, 0.118], 'wall', 'appliance', 'media', {
    body: 'appliance',
    dark: 'applianceDark',
    light: 'furnitureLight',
  }),
  turntable: model('唱片机', [0.43, 0.139562, 0.348], 'tabletop', 'appliance', 'media', {
    body: 'appliance',
    dark: 'applianceDark',
    accent: ['furniture', 'woodLight'],
    light: 'furnitureLight',
  }),
  'electric-fireplace': model('电壁炉', [1.09, 0.9405, 0.402], 'floor', 'appliance', 'media', {
    body: 'appliance',
    dark: 'applianceDark',
    soft: 'applianceSoft',
    light: 'furnitureLight',
    accent: ['furniture', 'woodLight'],
  }),
  'magazine-rack': model('杂志架', [0.402825, 0.379095, 0.324], 'floor', 'appliance', 'media', {
    body: 'furniture',
    soft: ['furnitureSoft', 'diningLinen'],
    accent: ['furniture', 'woodLight'],
    dark: ['furnitureDark', 'woodDark'],
    light: 'furnitureLight',
  }),
  'shoe-bench': model('换鞋凳', [0.85, 0.4925, 0.34], 'floor', 'home', 'entry', {
    soft: ['furnitureSoft', 'diningLinen'],
    body: 'furniture',
    dark: ['furnitureDark', 'woodDark'],
    light: 'furnitureLight',
  }),
  'umbrella-stand': model('雨伞架', [0.268, 0.783222, 0.268], 'floor', 'home', 'entry', {
    dark: ['furnitureDark', 'woodDark'],
    body: 'furniture',
    accent: ['furniture', 'woodLight'],
    soft: ['furnitureSoft', 'diningLinen'],
  }),
  'wall-coat-hooks': model('壁挂衣钩', [0.6, 0.084, 0.099888], 'wall', 'home', 'entry', {
    body: 'furniture',
    dark: ['furnitureDark', 'woodDark'],
  }),
  'folding-screen': model('屏风', [1.514317, 1.7, 0.148576], 'floor', 'home', 'entry', {
    body: 'furniture',
    soft: ['furnitureSoft', 'diningLinen'],
    accent: ['furniture', 'woodLight'],
  }),
  suitcase: model('行李箱', [0.424, 0.9915, 0.2405], 'floor', 'home', 'entry', {
    body: 'appliance',
    dark: 'applianceDark',
    soft: 'applianceSoft',
    light: 'furnitureLight',
  }),
  'air-fryer': model('空气炸锅', [0.28, 0.34, 0.369], 'tabletop', 'appliance', 'kitchen-devices', {
    body: 'appliance',
    dark: 'applianceDark',
    soft: 'applianceSoft',
    light: 'furnitureLight',
  }),
  'power-blender': model('破壁机', [0.235386, 0.495, 0.1965], 'tabletop', 'appliance', 'kitchen-devices', {
    body: 'appliance',
    dark: 'applianceDark',
    light: 'furnitureLight',
    glass: 'glass',
    soft: 'applianceSoft',
  }),
  juicer: model('榨汁机', [0.2685, 0.529, 0.249], 'tabletop', 'appliance', 'kitchen-devices', {
    body: 'appliance',
    dark: 'applianceDark',
    light: 'furnitureLight',
    soft: 'applianceSoft',
    glass: 'glass',
    accent: ['furniture', 'woodLight'],
  }),
  'bread-maker': model('面包机', [0.294, 0.346872, 0.337], 'tabletop', 'appliance', 'kitchen-devices', {
    body: 'appliance',
    soft: 'applianceSoft',
    glass: 'glass',
    dark: 'applianceDark',
    light: 'furnitureLight',
  }),
  'stand-mixer': model('厨师机', [0.24, 0.4025, 0.34], 'tabletop', 'appliance', 'kitchen-devices', {
    body: 'appliance',
    dark: 'applianceDark',
    light: 'furnitureLight',
  }),
  toaster: model('吐司机', [0.278314, 0.204883, 0.16], 'tabletop', 'appliance', 'kitchen-devices', {
    body: 'appliance',
    soft: 'applianceSoft',
    dark: 'applianceDark',
    accent: ['furniture', 'woodLight'],
  }),
  'electric-kettle': model('电热水壶', [0.312681, 0.264, 0.206], 'tabletop', 'appliance', 'kitchen-devices', {
    dark: 'applianceDark',
    body: 'appliance',
    soft: 'applianceSoft',
  }),
  'health-kettle': model('养生壶', [0.312681, 0.264, 0.206], 'tabletop', 'appliance', 'kitchen-devices', {
    dark: 'applianceDark',
    glass: 'glass',
    soft: 'applianceSoft',
    body: 'appliance',
    light: 'furnitureLight',
  }),
  'induction-hob': model('电磁炉', [0.29, 0.0375, 0.36], 'tabletop', 'appliance', 'kitchen-devices', {
    body: 'appliance',
    dark: 'applianceDark',
    light: 'furnitureLight',
  }),
  'ceramic-hob': model('电陶炉', [0.29, 0.0375, 0.36], 'tabletop', 'appliance', 'kitchen-devices', {
    body: 'appliance',
    dark: 'applianceDark',
    accent: ['furniture', 'woodLight'],
    light: 'furnitureLight',
  }),
  'food-steamer': model('电蒸锅', [0.3, 0.3165, 0.227], 'tabletop', 'appliance', 'kitchen-devices', {
    body: 'appliance',
    dark: 'applianceDark',
    glass: 'glass',
    light: 'furnitureLight',
    soft: 'applianceSoft',
  }),
  'multi-cooker': model('多功能料理锅', [0.408, 0.2175, 0.2365], 'tabletop', 'appliance', 'kitchen-devices', {
    body: 'appliance',
    soft: 'applianceSoft',
    dark: 'applianceDark',
    light: 'furnitureLight',
  }),
  'coffee-grinder': model('咖啡磨豆机', [0.186, 0.4395, 0.241], 'tabletop', 'appliance', 'kitchen-devices', {
    body: 'appliance',
    glass: 'glass',
    dark: 'applianceDark',
    soft: 'applianceSoft',
    accent: ['furniture', 'woodLight'],
  }),
  'dish-rack': model('碗碟沥水架', [0.44, 0.195808, 0.28], 'tabletop', 'home', 'kitchen-tools', {
    body: 'appliance',
    dark: 'applianceDark',
    light: 'furnitureLight',
    soft: 'applianceSoft',
  }),
  'knife-block': model('刀具架', [0.13, 0.285, 0.13], 'tabletop', 'home', 'kitchen-tools', {
    body: 'furniture',
    light: 'furnitureLight',
    dark: ['furnitureDark', 'woodDark'],
  }),
  'cutting-board-rack': model('砧板架', [0.25, 0.320001, 0.156366], 'tabletop', 'home', 'kitchen-tools', {
    dark: ['furnitureDark', 'woodDark'],
    body: 'furniture',
  }),
  'spice-set': model('调味瓶组合', [0.3, 0.1355, 0.19], 'tabletop', 'home', 'kitchen-tools', {
    body: 'appliance',
    soft: 'applianceSoft',
    dark: 'applianceDark',
    light: 'furnitureLight',
  }),
  'cookware-set': model('锅具组合', [0.501, 0.138, 0.396], 'tabletop', 'home', 'kitchen-tools', {
    body: 'appliance',
    light: 'furnitureLight',
    dark: 'applianceDark',
    soft: 'applianceSoft',
  }),
  'mug-tree': model('杯架', [0.226198, 0.34, 0.214], 'tabletop', 'home', 'kitchen-tools', {
    body: 'furniture',
    light: 'furnitureLight',
  }),
  'capsule-rack': model('咖啡胶囊架', [0.202, 0.3, 0.1], 'tabletop', 'home', 'kitchen-tools', {
    body: 'appliance',
    dark: 'applianceDark',
    soft: 'applianceSoft',
    light: 'furnitureLight',
    accent: ['furniture', 'woodLight'],
  }),
  'rice-bin': model('米桶', [0.285, 0.4235, 0.29], 'floor', 'home', 'kitchen-tools', {
    body: 'appliance',
    soft: 'applianceSoft',
    dark: 'applianceDark',
    glass: 'glass',
  }),
  'fruit-basket': model('水果篮', [0.31, 0.123446, 0.31], 'tabletop', 'home', 'kitchen-tools', {
    body: 'appliance',
    accent: ['furniture', 'woodLight'],
    dark: 'applianceDark',
    soft: 'applianceSoft',
  }),
  'bed-end-bench': model('床尾凳', [1.3, 0.494, 0.43], 'floor', 'home', 'bedroom', {
    soft: ['furnitureSoft', 'diningLinen'],
    body: 'furniture',
  }),
  'bed-storage-chest': model('床尾储物箱', [1.12, 0.492, 0.465], 'floor', 'home', 'bedroom', {
    body: 'furniture',
    soft: ['furnitureSoft', 'diningLinen'],
    dark: ['furnitureDark', 'woodDark'],
    accent: ['furniture', 'woodLight'],
  }),
  'bed-tray': model('床上托盘', [0.58, 0.314, 0.36], 'tabletop', 'home', 'bedroom', {
    body: 'furniture',
    light: 'furnitureLight',
  }),
  'jewelry-box': model('首饰收纳盒', [0.257, 0.1105, 0.1945], 'tabletop', 'home', 'bedroom', {
    body: 'furniture',
    accent: ['furniture', 'woodLight'],
    soft: ['furnitureSoft', 'diningLinen'],
    light: 'furnitureLight',
    dark: ['furnitureDark', 'woodDark'],
  }),
  'heated-towel-rail': model('电热毛巾架', [0.496913, 0.7925, 0.078], 'wall', 'home', 'bathroom', {
    body: 'appliance',
    dark: 'applianceDark',
    soft: 'applianceSoft',
    light: 'furnitureLight',
  }),
  'shower-stool': model('淋浴凳', [0.37, 0.451, 0.29], 'floor', 'home', 'bathroom', {
    body: 'furniture',
    light: 'furnitureLight',
    dark: ['furnitureDark', 'woodDark'],
  }),
  'toiletry-set': model('洗漱用品组合', [0.3, 0.228804, 0.19], 'tabletop', 'home', 'bathroom', {
    body: 'appliance',
    soft: 'applianceSoft',
    dark: 'applianceDark',
    light: 'furnitureLight',
  }),
  'hairdryer-holder': model('吹风机支架', [0.14, 0.253502, 0.159], 'wall', 'home', 'bathroom', {
    body: 'appliance',
    dark: 'applianceDark',
    soft: 'applianceSoft',
  }),
  'toothbrush-holder': model('壁挂牙刷架', [0.27, 0.2345, 0.108], 'wall', 'home', 'bathroom', {
    body: 'appliance',
    soft: 'applianceSoft',
    dark: 'applianceDark',
    light: 'furnitureLight',
  }),
  'mop-sink': model('拖把池', [0.48, 0.477256, 0.4305], 'floor', 'home', 'bathroom', {
    light: 'furnitureLight',
    dark: 'applianceDark',
    body: 'appliance',
  }),
  'foot-spa': model('足浴盆', [0.36, 0.186, 0.36], 'floor', 'home', 'bathroom', {
    body: 'appliance',
    dark: 'applianceDark',
    soft: 'applianceSoft',
    light: 'furnitureLight',
  }),
  'dual-monitors': model('双屏显示器', [1.13, 0.496, 0.385], 'tabletop', 'appliance', 'office-devices', {
    dark: 'applianceDark',
    glass: 'glass',
    body: 'appliance',
  }),
  'paper-shredder': model('碎纸机', [0.315, 0.4985, 0.2305], 'floor', 'appliance', 'office-devices', {
    body: 'appliance',
    dark: 'applianceDark',
    light: 'furnitureLight',
    accent: ['furniture', 'woodLight'],
  }),
  scanner: model('扫描仪', [0.3, 0.074, 0.42], 'tabletop', 'appliance', 'office-devices', {
    body: 'appliance',
    soft: 'applianceSoft',
    glass: 'glass',
    dark: 'applianceDark',
    light: 'furnitureLight',
  }),
  'drawing-tablet': model('绘图板', [0.344755, 0.023, 0.22], 'tabletop', 'appliance', 'office-devices', {
    body: 'appliance',
    dark: 'applianceDark',
    light: 'furnitureLight',
  }),
  'building-block-table': model('积木桌', [0.7, 0.5695, 0.52], 'floor', 'home', 'kids', {
    body: 'furniture',
    soft: ['furnitureSoft', 'diningLinen'],
    light: 'furnitureLight',
    accent: ['furniture', 'woodLight'],
  }),
  'kids-tent': model('儿童帐篷', [1.063793, 1.434945, 1.064544], 'floor', 'home', 'kids', {
    body: 'appliance',
    soft: 'applianceSoft',
    light: 'furnitureLight',
    accent: ['furniture', 'woodLight'],
    dark: 'applianceDark',
  }),
  'kids-slide': model('滑梯', [0.487553, 1.119941, 1.852039], 'floor', 'home', 'kids', {
    body: 'furniture',
    accent: ['furniture', 'woodLight'],
    soft: ['furnitureSoft', 'diningLinen'],
  }),
  'kids-swing': model('秋千', [1.48, 1.657263, 0.968099], 'floor', 'home', 'kids', {
    body: 'appliance',
    dark: 'applianceDark',
    soft: 'applianceSoft',
  }),
  'ball-pit': model('小型球池', [1.5, 0.28, 1.5], 'floor', 'home', 'kids', {
    soft: 'applianceSoft',
    light: 'furnitureLight',
    body: 'appliance',
    accent: ['furniture', 'woodLight'],
  }),
  'play-kitchen': model('玩具厨房', [0.89, 0.9, 0.366], 'floor', 'home', 'kids', {
    body: 'furniture',
    accent: ['furniture', 'woodLight'],
    dark: ['furnitureDark', 'woodDark'],
    glass: 'glass',
    soft: ['furnitureSoft', 'diningLinen'],
    light: 'furnitureLight',
  }),
  'doll-shelf': model('玩偶收纳架', [0.665, 1.05, 0.2505], 'floor', 'home', 'kids', {
    body: 'furniture',
    soft: ['furnitureSoft', 'diningLinen'],
    accent: ['furniture', 'woodLight'],
    light: 'furnitureLight',
    dark: ['furnitureDark', 'woodDark'],
  }),
  'pet-fountain': model('宠物饮水机', [0.224, 0.200819, 0.226], 'floor', 'home', 'pets', {
    body: 'appliance',
    light: 'furnitureLight',
    glass: 'glass',
    soft: 'applianceSoft',
    dark: 'applianceDark',
  }),
  'pet-feeder': model('自动喂食器', [0.22, 0.33, 0.3415], 'floor', 'home', 'pets', {
    body: 'appliance',
    dark: 'applianceDark',
    soft: 'applianceSoft',
    light: 'furnitureLight',
  }),
  'litter-tray': model('普通猫砂盆', [0.5, 0.130191, 0.38], 'floor', 'home', 'pets', {
    body: 'appliance',
    soft: 'applianceSoft',
    accent: ['furniture', 'woodLight'],
  }),
  'smart-litter-box': model('智能猫砂盆', [0.48, 0.55, 0.52], 'floor', 'home', 'pets', {
    dark: 'applianceDark',
    body: 'appliance',
    soft: 'applianceSoft',
    light: 'furnitureLight',
  }),
  'pet-pen': model('宠物围栏', [1.27, 0.658, 1.22], 'floor', 'home', 'pets', {
    body: 'appliance',
    dark: 'applianceDark',
  }),
  'dog-crate': model('狗笼', [0.865217, 0.678, 0.639], 'floor', 'home', 'pets', {
    body: 'appliance',
    dark: 'applianceDark',
    soft: 'applianceSoft',
  }),
  'cat-scratcher': model('猫抓板', [0.68, 0.195, 0.253], 'floor', 'home', 'pets', {
    body: 'furniture',
    dark: ['furnitureDark', 'woodDark'],
  }),
  'wall-cat-shelves': model('壁挂猫跳台', [1.12, 0.778758, 0.265], 'wall', 'home', 'pets', {
    body: 'furniture',
    soft: ['furnitureSoft', 'diningLinen'],
    dark: ['furnitureDark', 'woodDark'],
  }),
  'pet-steps': model('宠物台阶', [0.4, 0.372, 0.64], 'floor', 'home', 'pets', {
    body: 'furniture',
    soft: ['furnitureSoft', 'diningLinen'],
  }),
  'pet-stroller': model('宠物推车', [0.48, 1.095217, 0.691], 'floor', 'home', 'pets', {
    dark: 'applianceDark',
    body: 'appliance',
    soft: 'applianceSoft',
    light: 'furnitureLight',
  }),
  'pillow-set': model('独立抱枕组合', [0.850636, 0.25, 0.520636], 'tabletop', 'home', 'decor', {
    light: 'furnitureLight',
    soft: 'applianceSoft',
    accent: ['furniture', 'woodLight'],
  }),
  'sofa-throw': model('沙发毯', [1.12, 0.054362, 0.98], 'tabletop', 'home', 'decor', {
    soft: 'applianceSoft',
    light: 'furnitureLight',
  }),
  'floor-sculpture': model('落地雕塑', [0.330546, 1.01, 0.27], 'floor', 'home', 'decor', {
    dark: ['furnitureDark', 'woodDark'],
    body: 'furniture',
    accent: ['furniture', 'woodLight'],
  }),
  'decorative-plate': model('装饰盘', [0.32, 0.045907, 0.32], 'tabletop', 'home', 'decor', {
    light: 'furnitureLight',
    accent: ['furniture', 'woodLight'],
    body: 'furniture',
    dark: ['furnitureDark', 'woodDark'],
  }),
  'dried-flowers': model('干花花束', [0.268846, 0.5732, 0.1386], 'tabletop', 'home', 'decor', {
    body: 'furniture',
    dark: ['furnitureDark', 'woodDark'],
    accent: ['furniture', 'woodLight'],
  }),
  candlestick: model('烛台', [0.15, 0.409, 0.15], 'tabletop', 'home', 'decor', {
    body: 'appliance',
    accent: ['furniture', 'woodLight'],
    light: 'furnitureLight',
    dark: 'applianceDark',
  }),
  'decorative-lantern': model('装饰灯笼', [0.186676, 0.389, 0.186676], 'tabletop', 'home', 'decor', {
    dark: 'applianceDark',
    body: 'appliance',
    glass: 'glass',
    light: 'furnitureLight',
  }),
  trophy: model('奖杯', [0.236, 0.27, 0.152], 'tabletop', 'home', 'decor', {
    dark: 'applianceDark',
    accent: ['furniture', 'woodLight'],
    light: 'furnitureLight',
  }),
  'figurine-set': model('手办组合', [0.418, 0.193259, 0.118], 'tabletop', 'home', 'decor', {
    dark: 'applianceDark',
    body: 'appliance',
    light: 'furnitureLight',
    accent: ['furniture', 'woodLight'],
    soft: 'applianceSoft',
  }),
  'spin-bike': model('动感单车', [0.55478, 1.133692, 0.859652], 'floor', 'home', 'fitness', {
    dark: 'applianceDark',
    body: 'appliance',
    light: 'furnitureLight',
  }),
  'rowing-machine': model('划船机', [0.48, 0.713776, 1.83], 'floor', 'home', 'fitness', {
    body: 'appliance',
    dark: 'applianceDark',
    light: 'furnitureLight',
  }),
  'weight-bench': model('健身长凳', [0.52, 0.421727, 1.1], 'floor', 'home', 'fitness', {
    dark: 'applianceDark',
    body: 'appliance',
  }),
  'barbell-rack': model('杠铃架', [1.45, 1.62, 0.64], 'floor', 'home', 'fitness', {
    body: 'appliance',
    dark: 'applianceDark',
    light: 'furnitureLight',
  }),
  'punching-bag': model('拳击沙袋', [0.7, 1.54, 0.7], 'floor', 'home', 'fitness', {
    dark: 'applianceDark',
    body: 'appliance',
    accent: ['furniture', 'woodLight'],
    light: 'furnitureLight',
  }),
  'pilates-reformer': model('普拉提床', [0.66, 0.779393, 2], 'floor', 'home', 'fitness', {
    body: 'appliance',
    dark: 'applianceDark',
    soft: 'applianceSoft',
    light: 'furnitureLight',
    accent: ['furniture', 'woodLight'],
  }),
  'foosball-table': model('桌上足球', [1.2, 0.99, 1.25], 'floor', 'home', 'fitness', {
    body: 'furniture',
    soft: ['furnitureSoft', 'diningLinen'],
    accent: ['furniture', 'woodLight'],
    dark: ['furnitureDark', 'woodDark'],
    light: 'furnitureLight',
  }),
  'air-hockey-table': model('桌上冰球', [1, 0.93, 1.75], 'floor', 'home', 'fitness', {
    body: 'appliance',
    light: 'furnitureLight',
    accent: ['furniture', 'woodLight'],
    dark: 'applianceDark',
  }),
  'racing-cockpit': model('赛车模拟座舱', [0.595, 0.962271, 1.5], 'floor', 'home', 'fitness', {
    body: 'appliance',
    soft: 'applianceSoft',
    dark: 'applianceDark',
    light: 'furnitureLight',
  }),
  urinal: model('小便斗', [0.38, 0.72, 0.34], 'wall', 'home', 'bathroom', {
    soft: 'applianceSoft',
    dark: 'applianceDark',
    light: 'furnitureLight',
    body: 'appliance',
  }),
  bathtub: model('浴缸', [1.7, 0.58, 0.78], 'floor', 'home', 'bathroom', {
    soft: 'applianceSoft',
    dark: 'applianceDark',
    light: 'furnitureLight',
  }),
  basin: model('台盆', [0.9, 1.14, 0.5], 'floor', 'home', 'bathroom', {
    body: 'appliance',
    accent: ['furnitureSoft', 'cabinetWood'],
    dark: 'applianceDark',
    light: 'furnitureLight',
    soft: 'applianceSoft',
    glass: 'glass',
  }),
  /**
   * 台面：一块**实心**台面板（几何按程序生成后入库，不是从台盆抽的）。
   *
   * 台盆那张台面是块 4cm 的**环板**（中间按盆口挖空、板面在 y = 0.81–0.85m，孔 0.436 × 0.296m）
   * ——抽出来单摆就是「中间空一圈」的台面沿，补面也只是把它封成一张不像样品的薄片。台面这件素材因此
   * 直接建几何：外轮廓 0.90 × 0.50m（与台盆台面同尺寸，能和台盆柜对齐）、板厚 0.05m
   * （一块板就是 5cm 厚；属性面板「高（m）」的下限同样钉在 0.05 —— 见
   * `studio-normalization.ts` 的 `itemMinimumHeight`，再薄就不像台面板了），
   * **底面落在 y = 0**（与其它落地件同一套坐标约定），离地高度交给目录
   * （`collection-item-catalog.ts` 的 `elevation = 0.80m` → 台面高 0.85m，与厨房台面族
   * `kitchenbase` / `kitchensink` / `kitchencooktop` 的 0.85m 对齐）。
   *
   * 材质**与台盆那张台面同一套**：槽位 token 取 `light`（= 台盆台面构件的槽位名），
   * 角色落 `rim`（见 `MODEL_SLOT_ROLES_SEMANTIC.countertop`），家族按台盆给 `ceramic`，
   * 档位组**直接挂台盆那一组**（`studio-material-presets.ts` 的 `PRESET_GROUP_BY_MODEL_TYPE.countertop
   * = "basin"`，不再另做一份复制的 `COUNTERTOP_STYLES`）——于是「盆沿什么颜色，台面就什么颜色」，
   * **同一个档位 id**（`basin-marble-white`…）在两件素材上都合法、都出同一个色。
   */
  countertop: model('台面', [0.9, 0.05, 0.5], 'floor', 'home', 'bathroom', { light: 'furnitureLight' }),
  ricecooker: model('电饭煲', [0.28, 0.25, 0.32], 'tabletop', 'appliance', 'kitchen-devices', {
    body: 'appliance',
    dark: 'applianceDark',
    soft: 'applianceSoft',
    light: 'furnitureLight',
  }),
  washer: model('洗衣机', [0.6, 0.85, 0.65], 'floor', 'appliance', 'laundry', {
    dark: 'applianceDark',
    body: 'appliance',
    soft: 'applianceSoft',
    light: 'furnitureLight',
    glass: 'glass',
  }),
  dryer: model('烘干机', [0.6, 0.85, 0.65], 'floor', 'appliance', 'laundry', {
    dark: 'applianceDark',
    body: 'appliance',
    soft: 'applianceSoft',
    light: 'furnitureLight',
    glass: 'glass',
  }),
  microwave: model('微波炉', [0.52, 0.32, 0.42], 'tabletop', 'appliance', 'kitchen-devices', {
    body: 'appliance',
    dark: 'applianceDark',
    soft: 'applianceSoft',
    light: 'furnitureLight',
  }),
  steamoven: model('蒸烤箱', [0.6, 0.6, 0.55], 'floor', 'appliance', 'kitchen-devices', {
    body: 'appliance',
    dark: 'applianceDark',
    light: 'furnitureLight',
    glass: 'glass',
  }),
  rangehood: model('油烟机', [0.9, 0.55, 0.45], 'wall', 'appliance', 'kitchen-devices', {
    body: 'appliance',
    soft: 'applianceSoft',
    dark: 'applianceDark',
    light: 'furnitureLight',
  }),
  dishwasher: model('洗碗机', [0.6, 0.82, 0.6], 'floor', 'appliance', 'kitchen-devices', {
    dark: 'applianceDark',
    body: 'appliance',
    soft: 'applianceSoft',
    light: 'furnitureLight',
  }),
  /**
   * 语义角色配色（`model-slot-roles.ts` 把 `-candidate-*` 还原成真实构件）：
   * 盆 = 陶土、托盘 = 浅瓷、叶 = 叶绿 / 浅叶绿。冷暖两套都给植物色，不再出现「选鲜绿全是棕」。
   */
  plant: model('室内绿植', [0.75, 1.6, 0.75], 'floor', 'home', 'plants', {
    pot: 'decorAccent',
    saucer: 'countertop',
    foliage: 'leafColor',
    foliageSoft: 'leafColorLight',
    foliageLight: 'leafColorLight',
  }),
  walllamp: model('壁灯', [0.3, 0.34, 0.22], 'wall', 'appliance', 'lighting-decor', {
    dark: 'applianceDark',
    accent: ['furniture', 'woodLight'],
    soft: 'applianceSoft',
    light: 'furnitureLight',
  }),
  'plant-monstera': model('龟背竹', [0.56251, 1.12, 0.711153], 'floor', 'home', 'plants', PLANT_CONTAINER_ROLES),
  'plant-snake': model('虎皮兰', [0.276664, 0.82, 0.276664], 'floor', 'home', 'plants', PLANT_CONTAINER_ROLES),
  'plant-palm': model('散尾葵', [1.083448, 1.55, 1.107444], 'floor', 'home', 'plants', PLANT_CONTAINER_ROLES),
  'plant-rubber': model('橡皮树', [0.342087, 1.45, 0.417069], 'floor', 'home', 'plants', PLANT_CONTAINER_ROLES),
  'plant-pothos': model('绿萝', [0.65306, 0.55, 0.695154], 'tabletop', 'home', 'plants', PLANT_CONTAINER_ROLES),
  'flower-orchid': model('蝴蝶兰', [0.679072, 0.76, 0.415792], 'tabletop', 'home', 'plants', {
    ...PLANT_CONTAINER_ROLES,
    flower: 0xd8a4c0,
    flowerCenter: 0xe0c060,
  }),
  'flower-peace-lily': model('白掌', [0.349737, 0.79, 0.541618], 'tabletop', 'home', 'plants', {
    ...PLANT_CONTAINER_ROLES,
    flower: 0xf0ece2,
    flowerCenter: 0xe0c060,
  }),
  'flower-anthurium': model('红掌', [0.292185, 0.66, 0.452491], 'tabletop', 'home', 'plants', {
    ...PLANT_CONTAINER_ROLES,
    flower: 0xc0392f,
    flowerCenter: 0xe0c060,
  }),
  'flower-hydrangea': model('绣球花', [0.389913, 0.64, 0.53079], 'tabletop', 'home', 'plants', {
    ...PLANT_CONTAINER_ROLES,
    flower: 0x9fbfd8,
    flowerCenter: 0xe0c060,
  }),
}

export const COLLECTION_MODELS: Readonly<Record<string, CollectionModelDefinition>> = Object.freeze(
  Object.fromEntries(
    Object.entries(COLLECTION_MODEL_TABLE).map(([id, definition]) => [
      id,
      REPLACED_MODEL_IDS.has(id) ? { ...definition, replaces: true } : definition,
    ]),
  ),
)

/**
 * 取某款模型某个角色的**色号**（调色板键或固定色值）；暖木色取每对里的第二个。
 * 模型不在注册表、或该角色没登记配色时返回 `null` —— 调用方（`studio-model-material-roles.ts`
 * 的角色配方）会退回通用家族配方。
 */
export function collectionRoleColorSpec(modelId: string, role: string, warm: boolean): string | number | null {
  const rolePair = COLLECTION_MODELS[modelId]?.roles?.[role]
  if (!rolePair) return null
  return rolePair[warm ? 1 : 0] ?? null
}
