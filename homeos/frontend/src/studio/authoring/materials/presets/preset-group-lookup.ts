/** 模型 → 档位组的查表（逐模型登记优先，其次按模型族）。 */

import { resolveModelFamily } from '../studio-model-material-roles'

/** 逐模型的档位组：参考实现里按类型单独指定过的那些，这里逐一登记（空串 = 明确不给档位：结构件 / 车辆 / 壁画 / 饰面墙等由专用收尾接管颜色）。 */
const PRESET_GROUP_BY_MODEL_TYPE: Readonly<Record<string, string>> = Object.freeze({
  coffeetable: 'marbleTable',
  squarecoffeetable: 'woodwork',

  kitchenisland: 'kitchen',
  /**
   * 带连字符的岛台（`kitchen-island.glb`，2026 新资产）与老 `kitchenisland` 是**两件不同素材**，
   * 型号字符串也不同：只登记 `kitchenisland` 时它落到 family 兜底 `woodwork`，拿到「原木 / 胡桃 /
   * 白烤漆 / 黑砂金属腿」四档 —— 石台面被冻结在 `countertop` 语义默认色 `#d9d5cd`、绿植槽位无配方，
   * 看起来像「档位对它不生效」。这里显式并到厨房组，五档石台面才跟着走。
   */
  'kitchen-island': 'kitchen',
  kitchenbase: 'kitchen',
  kitchensink: 'kitchen',
  kitchencooktop: 'kitchen',
  glasspartition: 'glass',
  glasscabinet: 'joinery',
  tv: 'screen',
  tv_standard: 'screen',
  tv_tabletop: 'screen',
  tv_mobile: 'screen',
  screenpanel: 'screen',
  ricecooker: 'device',
  airoutlet: 'device',
  tea_bar_machine: 'device',
  pipelinewaterpurifier: 'steelAppliance',
  /** 「矩形双出水」款式与原款同为不锈钢家电，沿用同一预设，不新造材质族。 */
  'rectangular-pipeline-dispenser': 'steelAppliance',
  piano: 'piano',
  aquarium: 'aquarium',

  'pool-table': 'poolTable',
  shower: 'shower',
  'tea-table-set': 'teaTable',

  basin: 'basin',
  /**
   * 台面的档位组：**直接挂台盆那一组**（不是「换 id 复用」）。
   *
   * 台面这件素材的材质就是台盆的那张台面板（`light` 槽位 → 角色 `rim` → `furniture` 色号），
   * 所以它必须和台盆**共用同一份档位注册表**，而不是拿一份复制品：
   *  · 档位 id 同一套 → 台盆上存的 `basin-marble-white` 在台面上**同样合法**
   *    （复制风格 / 应用到同类物件 / 场景存档都不会被 `normalizeMaterialStyle` 悄悄打回 `auto`，
   *    那正是「台面看着和台盆不一样」最容易踩的一步）；
   *  · 份数同一套 → 盆沿与台面在**任何**档位下都是同一个色，没有第二份定义可以走偏；
   *  · 用户给台盆建的个人预设（`custom:*`）也立刻能用在台面上。
   *
   * 代价：台面只有 `rim` 一个槽位，「亮白陶瓷」与「白色大理石台面」这两档的 `furniture`
   * 同为 0xf0f0ec，于是这两档对台面**看起来是同一块板**（= 台盆那张台面在这两档下也确实同色）。
   * 审计会记一条 `style-presets-identical`；这是单槽位素材的必然结果，不是配置漂移。
   *
   * 组内角色补全见 `STYLE_ROLE_RECIPES_BY_GROUP.basin` 的 `rim: RIM_RECIPE`。
   */
  countertop: 'basin',

  door: 'door',

  mural: '',
  featurewall: '',
  stairs: '',
  steelstairs: '',
  glassstairs: '',
  floatingstairs: '',
  smallcar: '',
  car: '',
  suv: '',
  scooter: '',
  elevator: '',
})

/** 家族 → 档位组（逐模型表没登记时的兜底）。 */
const PRESET_GROUP_BY_FAMILY: Readonly<Record<string, string>> = Object.freeze({
  joinery: 'joinery',
  woodwork: 'woodwork',
  upholstery: 'upholstery',
  rug: 'rug',
  ceramic: 'ceramic',
  appliance: 'steelAppliance',
  device: 'device',
  curtain: 'curtain',

  plant: 'decor',
  decor: 'ornament',
  lamp: 'lamp',
  pillar: 'pillar',
  aquatic: 'aquarium',

  pet: 'pet',
  kids: 'kids',
  media: 'media',
  fitness: 'fitness',
  tableware: 'tableware',
  garden: 'garden',
  furniture: 'woodwork',
})

/** 取某模型的档位组名； */
export function presetGroupFor(modelType: string): string | null {
  if (!modelType) return null
  if (modelType in PRESET_GROUP_BY_MODEL_TYPE) {
    const explicitGroup = PRESET_GROUP_BY_MODEL_TYPE[modelType]
    return explicitGroup || null
  }
  return PRESET_GROUP_BY_FAMILY[resolveModelFamily(modelType)] || null
}
