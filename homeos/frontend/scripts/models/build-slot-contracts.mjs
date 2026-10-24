#!/usr/bin/env bun
/**
 * 生成 `specs/model-slot-contracts.json`：336 个模型的「槽位 → 构件 → 角色 → 外观」契约。
 *
 * 三个输入，缺一不可：
 * 1. `docs/architecture/2026-10-22/glb-material-audit.json`：角色、解析来源、目标配方
 *    （由 `audit_glb_materials.mjs` 用**运行时解析器**算出，这里不重新实现角色判定）；
 * 2. GLB 本体：逐槽位的几何指纹（面积占比 / 薄厚比 / 竖向位置带 / 壳数 / 前偏），
 *    由 `lib/material-slots.mjs` 实测；
 * 3. `specs/model-specs.json`：模型族与拓扑类别，用来解释「为什么这个槽位允许是薄片」。
 *
 * 契约只登记、不改名：GLB 里的材质名保持原样，角色由运行期解析器按名字/几何推断。
 *
 * 用法：
 * ```bash
 * bun homeos/frontend/scripts/models/build-slot-contracts.mjs            # 写契约
 * bun homeos/frontend/scripts/models/build-slot-contracts.mjs --stdout    # 只打统计
 * ```
 */
import fs from 'node:fs'
import path from 'node:path'
import { collectModelVariants, listModelFiles, modelsDir, repoRoot, specsDir } from './lib/glb-io.mjs'
import { enumerateSlots } from './lib/material-slots.mjs'

const auditPath = path.join(repoRoot, 'docs/architecture/2026-10-22/glb-material-audit.json')
const specsPath = path.join(specsDir, 'model-specs.json')
const outputPath = path.join(specsDir, 'model-slot-contracts.json')

const stdoutOnly = process.argv.includes('--stdout')

/** 角色 → 构件中文说明（报告可读性；判断逻辑不依赖它）。 */
const COMPONENT_BY_ROLE = {
  cabinetDoor: '柜门 / 箱体面板',
  carcass: '箱体柜身',
  countertop: '台面',
  plinth: '踢脚 / 底座',
  handle: '把手',
  frame: '框架 / 骨架',
  fabric: '软包织物面',
  cushion: '坐垫 / 靠垫',
  upholstery: '软包主体',
  surface: '台面 / 桌面',
  accent: '饰条 / 点缀件',
  trim: '收边饰条',
  glass: '玻璃 / 透明面',
  mirror: '镜面',
  metal: '金属件',
  leg: '支腿 / 脚垫',
  base: '底座 / 基座',
  body: '主体外壳',
  panel: '面板 / 门板',
  door: '门体',
  drawer: '抽屉面',
  shelf: '层板',
  back: '背板',
  seat: '座面',
  backrest: '靠背',
  armrest: '扶手',
  mattress: '床垫',
  headboard: '床头板',
  bedding: '床品',
  pillow: '枕头',
  throw: '毯面',
  rug: '地毯面',
  curtain: '帘布',
  foliage: '叶片 / 叶簇',
  leaf: '叶片',
  stem: '枝干',
  trunk: '主干',
  pot: '花盆',
  water: '水面',
  soil: '基质 / 土面',
  grille: '格栅 / 风口',
  vent: '出风口',
  display: '屏幕 / 面板显示',
  screen: '屏幕',
  bezel: '屏幕边框',
  lens: '镜头 / 透光罩',
  light: '灯具发光面',
  shade: '灯罩',
  bulb: '灯泡',
  glow: '自发光面',
  shadow: '接触阴影贴片',
  basin: '盆体 / 水槽',
  faucet: '龙头',
  seat_cover: '座圈',
  tank: '水箱',
  bowl: '锅体 / 内胆',
  interior: '内胆 / 内腔',
  drum: '滚筒内腔',
  door_seal: '门封 / 密封圈',
  control: '控制面板',
  knob: '旋钮 / 按键',
  tire: '轮胎',
  wheel: '轮毂 / 车轮',
  window: '车窗玻璃',
  windshield: '前风挡',
  lamp: '车灯',
  paint: '车漆',
  chrome: '镀铬饰件',
  tread: '踏步',
  riser: '踢面 / 立板',
  stringer: '龙骨 / 侧梁',
  railing: '栏杆',
  handrail: '扶手',
  floor: '地面 / 楼板',
  wall: '墙面',
  ceiling: '顶棚',
  floorboard: '地板拼块',
  tile: '瓷砖面',
  stone: '石材面',
  wood: '木饰面',
  lacquer: '烤漆面',
  plastic: '塑料件',
  rubber: '橡胶件',
  ceramic: '陶瓷面',
  porcelain: '瓷面',
  appliance: '家电外壳',
  detail: '细节件',
  guide: '导向件',
  seal: '密封条',
  gasket: '垫圈',
  wire: '线缆',
  pipe: '管件',
  filter: '滤网',
  grate: '篦子',
  hose: '软管',
  nozzle: '喷嘴',
  shelf_pin: '层板托',
  hinge: '铰链',
  rail: '滑轨',
  foot: '底脚',
  wheel_caster: '万向轮',
  canvas: '画布 / 画面',
  artwork: '画面',
  frame_molding: '画框',
  shade_top: '灯罩顶',
  stone_slab: '台面板材',
  backsplash: '挡水 / 背板',
  sink: '水槽',
  cooktop: '灶面',
  hood: '烟机罩体',
  burner: '灶眼',
  toe_kick: '踢脚板',
}

/** 角色 → 表面族兜底（审计报告里已有 surface，这里只在缺失时补）。 */
const SURFACE_BY_ROLE = {
  glass: 'glass',
  mirror: 'glass',
  window: 'glass',
  windshield: 'glass',
  metal: 'metal',
  chrome: 'metal',
  steel: 'metal',
  fabric: 'fabric',
  upholstery: 'fabric',
  cushion: 'fabric',
  curtain: 'fabric',
  throw: 'fabric',
  rug: 'fabric',
  foliage: 'foliage',
  leaf: 'foliage',
  display: 'screen',
  screen: 'screen',
  glow: 'emissive',
  light: 'emissive',
  shadow: 'shadow',
  ceramic: 'ceramic',
  porcelain: 'ceramic',
  wood: 'wood',
  paint: 'lacquer',
  lacquer: 'lacquer',
}

/**
 * 人工定名的遗留槽位（SimLab 导出名：`*5`、`[Color_008]1`、`Material #1`、`om.cn_1336`）。
 *
 * 这些槽位的角色**已经被解析器判对**（`role` 有值、来源是名字或顺序表），只是名字里带
 * 大写 / 方括号 / 星号 / 空格，过不了「规范字符」门禁。改名不会改变角色——解析器靠
 * `GENERATED_MATERIAL_ROLE_OVERRIDES` 按完整名锁回同一角色，别名表保证取色分支不变。
 *
 * 同角色重复的槽位按 `-2`、`-3` 后缀区分（解析器对尾段序号有去重规则）。
 */
/**
 * 整件同角色（C2）的拆分：按几何证据把「一个颜色刷满全件」拆成真实构件。
 *
 * 判定依据（都来自 `geometryEvidence`）：
 * - `ball-pit`：0.405/448 壳是池体外壳，0.405/1850 壳是球堆，两块 1.1×0.14 是另一色球；
 * - `bed-tray`：0.922 是托盘主体，0.078 且 y=0.89 的小件是金属把手；
 * - `decorative-plate`：0.813 盘面、0.084 装饰环、0.014 中心图案、0.089 且靠后 6cm 是底座；
 * - `sofa-throw`：0.971 是毯面，0.029 且厚度 3mm 是包边。
 */
const EXPLICIT_ROLE_OVERRIDES = Object.freeze({
  'ball-pit': { 0: 'body', 1: 'playBall', 2: 'playBall', 3: 'accent' },
  'bed-tray': { 0: 'board', 1: 'handle' },
  'decorative-plate': { 0: 'plate', 1: 'trim', 2: 'accent', 3: 'base' },
  'sofa-throw': { 0: 'throwBlanket', 1: 'trim' },
  // 滑板车的 `Yellow_Light` / `Green_Light` / `White_Light` / `Red_Light` 是指示灯与灯带，
  // 旧名里的 `_light` 被车辆家族读成「明度」才落到 trim；按名字（lamp）与几何（薄壳、贴边）
  // 都应是 emissive，内嵌 PBR 需要自发光。
  scooter: { 1: 'emissive', 2: 'emissive', 6: 'emissive', 7: 'emissive' },
})

/**
 * 显式改名表：**已停用**（2026-10-23 回滚）。
 *
 * 上一轮用它把 249 个文件的材质从 `airpurifier-detail-recess` 这类原名改成
 * `airpurifier-material-2` 这类语义名，结果打穿了运行期 30 处按原名/下标取色的分支，
 * 同时让 `legacy-material-aliases.generated.ts` 变成改名与运行期的耦合点。
 *
 * 现在改成「只登记、不改名」：契约只记录每个槽位的**原名 + 角色 + 几何证据**，
 * 语义由 `resolveModelMaterialRole` 在运行期解析，GLB 字节保持原样。
 */

const round = (value, digits = 3) => (typeof value === 'number' ? Number(value.toFixed(digits)) : value)

/** 几何指纹 → 「构件说明」：把测量值翻译成一句话，供人复核。 */
function describeComponent(role, fingerprint, fallback) {
  const base = COMPONENT_BY_ROLE[role] ?? fallback
  if (!fingerprint) return base
  const notes = []
  const share = fingerprint.areaShare
  if (share >= 0.6) notes.push(`面积占比 ${(share * 100).toFixed(0)}%（主体）`)
  else if (share <= 0.05) notes.push(`面积占比 ${(share * 100).toFixed(1)}%（小件）`)
  if (fingerprint.thinness <= 0.06) notes.push('薄板')
  if (fingerprint.yBand !== null) {
    const band = fingerprint.yBand <= 0.15 ? '贴地' : fingerprint.yBand >= 0.85 ? '顶部' : fingerprint.yBand >= 0.6 ? '上部' : fingerprint.yBand <= 0.4 ? '下部' : '中部'
    notes.push(`${band}(y=${fingerprint.yBand})`)
  }
  if (fingerprint.offset && Math.abs(fingerprint.offset[2]) >= 0.12) {
    notes.push(fingerprint.offset[2] > 0 ? '靠前' : '靠后')
  }
  return notes.length ? `${base}（${notes.join('，')}）` : base
}

/** 置信度：名字能解析 → 高；靠家族表还原 → 中；只有序号 → 低。 */
function confidenceFor(material) {
  const semantics = material.naming?.semantics
  const action = material.naming?.action
  if (semantics === 'semantic') return 0.92
  if (semantics === 'lightness-remapped') return 0.85
  if (action === 'register') return 0.7
  if (action === 'rename') return material.role && material.roleSource !== 'family' ? 0.6 : 0.45
  return 0.5
}

function basisFor(material) {
  const semantics = material.naming?.semantics
  const source = material.roleSource
  const parts = []
  if (semantics === 'semantic') parts.push('槽位名直接解析出角色')
  else if (semantics === 'lightness-remapped') parts.push('明度候选经家族表还原角色')
  else if (semantics === 'indexed') parts.push('槽位名只有材质序号，角色靠几何推断')
  else if (semantics === 'opaque') parts.push('槽位名是符号/缩写，角色靠几何推断')
  else parts.push('槽位词可读但未登记，建议补表')
  if (source) parts.push(`解析来源 ${source}`)
  parts.push('几何指纹（面积占比 / 薄厚比 / 位置带）')
  return parts.join('；')
}

function main() {
  if (!fs.existsSync(auditPath)) {
    console.error(`缺少材质审计快照：${auditPath}\n先跑 bun ops/checks/studio/audit_glb_materials.mjs`)
    process.exit(1)
  }
  const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'))
  const specs = JSON.parse(fs.readFileSync(specsPath, 'utf8'))
  const specById = new Map(specs.models.map((spec) => [spec.id, spec]))
  const variants = collectModelVariants(listModelFiles())

  const contracts = []
  const stats = { models: 0, slots: 0, noGeometry: 0, dead: [], rename: 0, sameRole: [] }

  for (const model of audit.models) {
    const paths = variants.get(model.id)
    const fullPath = paths?.full ? path.join(modelsDir, paths.full) : null
    const litePath = paths?.lite ? path.join(modelsDir, paths.lite) : null
    let enumeration = null
    if (fullPath || litePath) {
      try {
        // 枚举 **lite**（运行时真正加载的件），`fullPath` 只用于借几何指纹：
        // lite 是 Draco，纯 JS 解不出顶点。指纹在 `enumerateSlots` 里按材质名对齐，
        // 不能按完整件的下标取 —— 两件的槽位集合会漂移（`sofa` 的 lite 少一个槽），
        // 按下标会把 A 构件的面积记到 B 构件上，门禁随即报一片假 S8。
        enumeration = enumerateSlots(litePath ?? fullPath, { fullPath })
      } catch {
        enumeration = null
      }
    }
    const spec = specById.get(model.id) ?? {}
    const slots = model.materials.map((material) => {
      // 指纹按**材质名**对齐：lite 与完整件的下标在导出漂移后不可靠（lite 会整段丢槽位）。
      const fingerprint =
        enumeration?.slots.find((slot) => slot.name === material.name)?.fingerprint ?? null
      if (!fingerprint) stats.noGeometry += 1
      const explicitRole = EXPLICIT_ROLE_OVERRIDES[model.id]?.[material.index]
      const role = explicitRole ?? material.role ?? null
      /**
       * 只登记、不改名（2026-10-23 回滚后定稿）。
       *
       * 上一轮这里把材质改成审计建议名（`material-<n>` → `<模型>-<构件>`），落盘后
       * 249 个文件、171 个材质被改名/删除，运行期按旧名硬匹配的 30 处分支静默失效。
       * 现在 GLB 名字一律不动，语义由运行期角色表解决。
       */
      const dead = material.used === false
      if (dead) stats.dead.push({ id: model.id, name: material.name })
      return {
        index: material.index,
        name: material.name,
        // 改名前的名字：仅在真的改过名时才有值（当前口径下恒为 null）。
        legacyName: null,
        component: describeComponent(role, fingerprint, material.surface ?? '未分类构件'),
        role,
        roleSource: material.roleSource ?? null,
        /**
         * 契约里的人工裁定（`EXPLICIT_ROLE_OVERRIDES`）：这类槽位的角色**必须**进运行期
         * 完整名覆盖表，否则「契约说 body、运行时按名字解析成 playBall」，配色按运行期走。
         * 生成器 `repair_glb_material_slots.mjs --emit-generated` 会据此写
         * `GENERATED_MATERIAL_ROLE_OVERRIDES`。
         */
        roleExplicit: Boolean(explicitRole),
        surface: material.surface ?? SURFACE_BY_ROLE[role] ?? null,
        required: !dead,
        alphaMode: material.alphaMode ?? 'OPAQUE',
        emissive: Boolean(material.emissiveFactor && material.emissiveFactor.some((v) => v > 0)),
        doubleSided: material.doubleSided === true,
        target: material.target
          ? {
              baseColorHex: material.target.baseColorHex ?? null,
              roughness: round(material.target.roughnessFactor, 3),
              metalness: round(material.target.metallicFactor, 3),
              alphaMode: material.target.alphaMode ?? 'OPAQUE',
              opacity: round(material.target.opacity, 3),
              emissiveHex: material.target.emissiveHex ?? null,
              doubleSided: material.target.doubleSided === true,
            }
          : null,
        embedded: {
          baseColorFactor: material.baseColorFactor ? material.baseColorFactor.map((v) => round(v, 3)) : null,
          roughness: round(material.roughnessFactor, 3),
          metalness: round(material.metallicFactor, 3),
          alphaMode: material.alphaMode ?? 'OPAQUE',
          alphaCutoff: round(material.alphaCutoff, 3),
          doubleSided: material.doubleSided === true,
          emissiveFactor: material.emissiveFactor ? material.emissiveFactor.map((v) => round(v, 3)) : null,
        },
        geometryEvidence: fingerprint
          ? {
              triangles: fingerprint.triangles,
              areaShare: fingerprint.areaShare,
              thinness: fingerprint.thinness,
              shells: fingerprint.shells,
              yBand: fingerprint.yBand,
              offset: fingerprint.offset,
              size: fingerprint.size,
              inverted: fingerprint.inverted,
            }
          : null,
        confidence: confidenceFor(material),
        basis: basisFor(material),
      }
    })
    const roles = slots.map((slot) => slot.role).filter(Boolean)
    const uniqueRoles = [...new Set(roles)]
    if (uniqueRoles.length === 1 && slots.length > 1) stats.sameRole.push(model.id)
    const topologyClass = spec.topologyClass ?? 'solid'
    contracts.push({
      id: model.id,
      itemType: model.itemType,
      family: model.family,
      topologyClass,
      expectedSlotCount: slots.length,
      slots,
      expectedRoles: uniqueRoles,
      exceptions: [],
      source: {
        audit: 'docs/architecture/2026-10-22/glb-material-audit.json',
        generatedAt: new Date().toISOString(),
        geometry: fullPath ? path.relative(repoRoot, fullPath) : litePath ? path.relative(repoRoot, litePath) : null,
      },
    })
    stats.models += 1
    stats.slots += slots.length
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    unit: 'm',
    note:
      '槽位契约：逐槽位锁定「原名 → 构件 → 角色 → 表面 → 外观目标」。角色来自运行时解析器，' +
      '几何证据来自 GLB 实测；审计脚本只比对契约，不改名、不回写 GLB。',
    totals: {
      models: stats.models,
      slots: stats.slots,
      withoutGeometry: stats.noGeometry,
      renamePending: stats.rename,
      deadMaterials: stats.dead.length,
      sameRoleModels: stats.sameRole.length,
    },
    models: contracts,
  }

  if (stdoutOnly) {
    console.log(JSON.stringify(payload.totals, null, 2))
    console.log('死材质示例：', stats.dead.slice(0, 12))
    console.log('全槽位同角色：', stats.sameRole)
    return
  }
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + '\n')
  console.log(`写入 ${path.relative(repoRoot, outputPath)}：${stats.models} 款 / ${stats.slots} 槽位`)
  console.log(`  待改名 ${stats.rename}、死材质 ${stats.dead.length}、全槽位同角色 ${stats.sameRole.length}、无几何指纹 ${stats.noGeometry}`)
}

main()
