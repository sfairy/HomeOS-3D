/** 物品类型目录：类型 → 名称/字形/尺寸/离地/颜色的装配点，以及各类型集合。 */
import { COLLECTION_ITEM_CATALOG, COLLECTION_ITEM_CATALOG_APPLIANCE_TYPES } from './collection-item-catalog'
import { decorLightCatalog } from './catalog/decor-light'
import { furnitureCatalog } from './catalog/furniture'
import { gardenCatalog } from './catalog/garden'
import { kitchenBathCatalog } from './catalog/kitchen-bath'

/**
 * 全量物品目录。
 *
 * 数据本身按族拆在 `./catalog/*`（纯字面量，无逻辑）：单个 2100 行的数据文件在评审里
 * 无法定位，也无法按族 diff。
 *
 * 两点必须保持：
 * 1. `...COLLECTION_ITEM_CATALOG` 仍在**最后** —— 它可能覆盖同名的显式键（拆分前就是
 *    这个位置）；
 * 2. 拆分前后 `Object.keys()` 的内容逐键相同（338 项），只是**顺序按族重排**。
 *    键顺序不可观测：仅有的两处 `Object.entries(itemTypeCatalog)` 都只用来建
 *    `类型 → 名称` 的映射表（`placed-items-wiring` / `overlap-and-preview-wiring`），
 *    其余消费方全是按键取值。
 */
export const itemTypeCatalog = {
  ...furnitureCatalog,
  ...kitchenBathCatalog,
  ...decorLightCatalog,
  ...gardenCatalog,
  ...COLLECTION_ITEM_CATALOG,
}

export const itemTypeCatalogParts = {
  furniture: furnitureCatalog,
  kitchenBath: kitchenBathCatalog,
  decorLight: decorLightCatalog,
  garden: gardenCatalog,
}

/** 类型集合 / 常量（与 `itemTypeCatalog` 同源；拆分前它们是同一条 const 声明的多个 declarator）。 */
export const squareEdgeItemTypeSet = new Set([
  'mural',
  'featurewall',
  'rectangular-pipeline-dispenser',
  'loft-bed-circle',
  'entryway-niche-cabinet',
  'arched-glass-console',
  'double-open-wardrobe',
  'drawer-chest',
  'smart-socket-86',
  'wardrobe',
  'pool-table',
  'router',
  'dehumidifier',
  'heater',
  'bunk-bed',
  'nightstand',
  'bar',
  'aquarium',
  'sideboard',
  'shoecabinet',
  'stairs',
  'steelstairs',
  'glassstairs',
  'floatingstairs',
  'smallcar',
  'suv',
  'scooter',
  'cabinet',
  'glasscabinet',
  'bookcase',
  'shelf',
  'pillar',
  'wallcabinet',
  'kitchenbase',
  'kitchensink',
  'kitchencooktop',
  'kitchenisland',
  'kitchen-island',
  'vanity',
  'basin',
  'bathtub',
  'tvstand',
  'squarecoffeetable',
  'glasspartition',
  'washer',
  'airoutlet',
  'dryer',
  'dishwasher',
  'freezer',
  'steamoven',
  'microwave',
  'rangehood',
  'nas',
  'printer',
  'pipelinewaterpurifier',
  'tea_bar_machine',
])

export const applianceItemTypeSet = new Set([
  'smart-socket-86',
  'router',
  'humidifier',
  'dehumidifier',
  'heater',
  'fridge',
  'freezer',
  'storagewaterheater',
  'gaswaterheater',
  'pipelinewaterpurifier',
  'tea_bar_machine',
  'washer',
  'airoutlet',
  'dryer',
  'dishwasher',
  'steamoven',
  'microwave',
  'ricecooker',
  'rangehood',
  'wallac',
  'floorac',
  'robotvacuum',
  'nas',
  'printer',
  'camera',
  'presence',
  'airpurifier',
  'airer',
  'fan',
  'ceiling-fan',
  'exhaust-fan',
  'table-lamp',
  'up-down-wall-lamp',
  'aroma-diffuser',
  'pet-dryer',
  'electric-valve',
  'treadmill',
  'elliptical',
  'disinfection-cabinet',
  'water-purifier',
  'speaker',
  'tv',
  'desktop',
  'laptop',
  'home-network-cabinet',
  'smart-display',
  'smart-display-wall',
  'ps5',
  'xbox-series-x',
  'switch-console',
  'arcade-machine',
  '3d-printer',
  'floorlamp',
  'walllamp',
  ...COLLECTION_ITEM_CATALOG_APPLIANCE_TYPES,
])

export const lampItemTypeSet = new Set(['downlight', 'ceilinglight', 'striplight'])

export const stairItemTypeSet = new Set(['stairs', 'steelstairs', 'glassstairs', 'floatingstairs'])

export const openStairTypeSet = new Set(['steelstairs', 'glassstairs', 'floatingstairs'])

export const roundTableTypeSet = new Set(['rounddiningtable', 'rounddiningtableturntable'])

export const tvMountStyleSet = new Set(['standard', 'tabletop', 'mobile'])

export const sofaMinDimensions = Object.freeze({
  depth: 0.55,
  height: 1.55,
})

export const nextBatchItemTypeSet = new Set([
  'rectangular-pipeline-dispenser',
  'loft-bed-circle',
  'entryway-niche-cabinet',
  'arched-glass-console',
  'double-open-wardrobe',
  'drawer-chest',
  'smart-socket-86',
  'router',
  'humidifier',
  'wardrobe',
  'office-chair',
  'dehumidifier',
  'heater',
  'bunk-bed',
  'pool-table',
  'tea-table-set',
  'coffeetable',
  'squarecoffeetable',
  'tvstand',
  'plant',
  'bed',
  'nightstand',
  'curtain',
  'vanity',
  'desk',
  'bookcase',
  'piano',
  'table',
  'rounddiningtable',
  'rounddiningtableturntable',
  'bar',
  'sideboard',
  'shoecabinet',
  'chair',
  'cabinet',
  'glasscabinet',
  'shelf',
  'wallcabinet',
  'kitchenbase',
  'kitchensink',
  'kitchencooktop',
  'kitchenisland',
  'fridge',
  'freezer',
  'washer',
  'dryer',
  'dishwasher',
  'steamoven',
  'microwave',
  'ricecooker',
  'rangehood',
  'wallac',
  'floorac',
  'nas',
  'printer',
  'airpurifier',
  'tv',
  'desktop',
  'laptop',
  'toilet',
  'squattoilet',
  'urinal',
  'bathtub',
  'shower',
  'basin',
])
