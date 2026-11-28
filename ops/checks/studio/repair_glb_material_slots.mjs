#!/usr/bin/env bun
/**
 * GLB 材质槽位修复：改名 / 死材质清理 / 内嵌 PBR 回填（默认 dry-run）。
 *
 * 真值只有一份：`homeos/frontend/scripts/models/specs/model-slot-contracts.json`。
 * 本脚本不自己判断角色，只执行契约里的 `action` / `targetName` / `target`。
 *
 * 三条安全线：
 * 1. **改名必须先迁移遗留分支**。`studio-external-models.ts` 里有 30 处按
 *    `material-<n>` / 原始名取色的分支；本脚本会先写 `legacy-material-aliases.generated.ts`
 *    （新名 → 旧名），加载器在取色前统一过一遍别名表，改名不会让分支静默失效。
 *    没有别名文件时拒绝改名，除非显式 `--force-rename`。
 * 2. **只改 JSON chunk**，BIN 逐字节保留（`patchGlbJson`），几何与 accessor 一定不动。
 * 3. **删材质按「从后往前」重排 primitive 下标**，并断言：删除后每条 primitive 的
 *    material 下标都指向原来那个材质（用删除前抓到的名字比对）。
 *
 * 用法：
 * ```bash
 * bun ops/checks/studio/repair_glb_material_slots.mjs                     # dry-run，打印计划
 * bun ops/checks/studio/repair_glb_material_slots.mjs --emit-generated    # 只写两个 generated TS
 * bun ops/checks/studio/repair_glb_material_slots.mjs --write             # 落盘 GLB + 生成文件
 * bun ops/checks/studio/repair_glb_material_slots.mjs --model sofa --json # 单模型机读
 * bun ops/checks/studio/repair_glb_material_slots.mjs --write --prune-dead # 额外删死材质（会重排下标）
 * bun ops/checks/studio/repair_glb_material_slots.mjs --write --backfill-pbr --backfill-surface
 *   # 按契约回填 roughness / metalness，并把 alphaMode / opacity / doubleSided 对齐目标
 * ```
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  collectModelVariants,
  listModelFiles,
  modelsDir,
  patchGlbJson,
  repoRoot,
  specsDir,
} from '../../../homeos/frontend/scripts/models/lib/glb-io.mjs'
import { formatGenerated } from '../../lib/biome-format.mjs'
import { OPEN_SHELL_ITEM_TYPES } from '../../../homeos/frontend/scripts/models/lib/open-shell-models.mjs'

const hereDir = path.dirname(fileURLToPath(import.meta.url))
void hereDir
const contractsPath = path.join(specsDir, 'model-slot-contracts.json')
const materialsDir = path.join(repoRoot, 'homeos/frontend/src/studio/authoring/materials')
const aliasFile = path.join(materialsDir, 'legacy-material-aliases.generated.ts')
const roleFile = path.join(materialsDir, 'model-slot-roles.generated.ts')

const args = process.argv.slice(2)
const hasFlag = (flag) => args.includes(`--${flag}`)
const valueOf = (flag) => {
  const index = args.indexOf(`--${flag}`)
  return index >= 0 ? args[index + 1] : null
}
const write = hasFlag('write')
const pruneDead = hasFlag('prune-dead')
const emitOnly = hasFlag('emit-generated')
const forceRename = hasFlag('force-rename')
const backfillSurface = hasFlag('backfill-surface')
/** A6：删掉 `KHR_materials_pbrSpecularGlossiness` 残留（three 0.187 已不支持，pbrMR 才是真值）。 */
const stripSpecularGlossiness = hasFlag('strip-specular-glossiness')
const only = valueOf('model')
const asJson = hasFlag('json')

const ROUGHNESS_TOLERANCE = 0.05
const METALNESS_TOLERANCE = 0.05

const hexToFactor = (hex, opacity = 1) => {
  if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return null
  const value = Number.parseInt(hex.slice(1), 16)
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255, opacity].map((channel) =>
    Number(channel.toFixed(4)),
  )
}

/**
 * 语义 token：去掉家族中缀后取尾段。
 * 尾段是纯序号（`bookcase-accent-2` 的 `2`）时继续往前取——序号不是语义，
 * 重复槽位在解析器里本来就靠「去掉序号再解析一次」兜底，登记成 token 只会制造冲突。
 */
const roleToken = (name) => {
  const afterInfix = String(name || '')
    .toLowerCase()
    .split(/-(?:garden|candidate|furniture|detail|foliage|decor|aquatic|sanitary|tea)-/)
    .pop()
  const segments = String(afterInfix || '')
    .split(/[-_]/)
    .filter(Boolean)
  while (segments.length > 1 && /^\d+$/.test(segments[segments.length - 1])) segments.pop()
  const token = segments[segments.length - 1] ?? ''
  return /^[a-z][a-z0-9]*$/.test(token) ? token : ''
}

/**
 * 完整名覆盖的键必须小写：`resolveSemanticSlotRole` 先 `toLowerCase()` 再查表。
 * 少数槽位沿用 SimLab 原始名（`[Color_002]`、`M03_Pewter_Shine`），原样落键会永远查不到。
 */
const overrideName = (name) => String(name || '').toLowerCase()

/** 改名计划 → token 角色表（同一 token 在同一模型里必须只有一个角色）。 */
function buildGeneratedTables(contracts) {
  const aliases = {}
  const slotRoles = {}
  const nameOverrides = {}
  const conflicts = []
  const conflictedTokens = []
  for (const model of contracts.models) {
    const roleByToken = new Map()
    /**
     * 该模型是否有槽位改过名（`legacyName` 是持久记录，改完名重建契约后依然在）。
     * 有改名就必须给**每个**槽位写完整名覆盖：改名后解析器走语义路径
     * （`hasSemanticSlotRoles` 因生成表变真），没写覆盖的槽位会落到家族 token，
     * 角色可能和改名前的下标表不一致 —— 那正是「改名后错色」的来源。
     */
    const renamedModel = model.slots.some((slot) => slot.legacyName && slot.legacyName !== slot.name)
    for (const slot of model.slots) {
      const canonicalName = slot.action === 'rename' && slot.targetName ? slot.targetName : slot.name
      if (renamedModel && slot.required && slot.role) {
        nameOverrides[model.itemType] = nameOverrides[model.itemType] ?? {}
        nameOverrides[model.itemType][overrideName(canonicalName)] = slot.role
        // 旧名也要锁同一个角色。生成表一旦存在，`hasSemanticSlotRoles` 就变真，
        // 解析器改走语义路径：没有完整名覆盖的旧名会落到家族 token，角色可能和
        // 改名前的下标表不一致（`rug` 的 `ha-rug-soft` 被判成 `rugPile`）。
        // 运行期加载器还会把材质名归一成旧名，所以旧名必须同样在表里。
        const legacyName = slot.legacyName ?? (slot.name !== canonicalName ? slot.name : null)
        if (legacyName && legacyName !== canonicalName) {
          nameOverrides[model.itemType][overrideName(legacyName)] = slot.role
        }
      }
      // 人工裁定的角色必须进运行期完整名覆盖：契约与运行时同源，否则配色按运行期走。
      // （典型：`ball-pit` 池体与球堆同名同族，只有完整名能区分。）
      if (slot.roleExplicit && slot.role) {
        nameOverrides[model.itemType] = nameOverrides[model.itemType] ?? {}
        nameOverrides[model.itemType][overrideName(slot.name)] = slot.role
      }
      // 改名过的槽位（含历史改名）都要进表：`legacyName` 是持久记录，
      // 只按「本次待改名」生成，会让上一批改名从别名表里消失，历史取色分支随即失效。
      if (!slot.required) continue
      const legacyName = slot.legacyName ?? slot.name
      if (canonicalName === legacyName) continue
      const token = roleToken(canonicalName)
      if (!token) continue
      const existing = roleByToken.get(token)
      if (existing && existing !== slot.role) {
        // 同一 token 在不同槽位上含义不同（`bookcase-accent-2` 其实是书、`curtain-metal-2`
        // 是布帘而不是金属）：token 表只能表达「一词一义」，冲突的 token 直接放弃，
        // 由完整名覆盖（`GENERATED_MATERIAL_ROLE_OVERRIDES`）逐槽位锁定，解析依然精确。
        conflicts.push({ id: model.id, token, roles: [existing, slot.role], slots: [legacyName, canonicalName] })
        conflictedTokens.push(`${model.itemType}:${token}`)
        roleByToken.delete(token)
        continue
      }
      roleByToken.set(token, slot.role)
      aliases[canonicalName] = legacyName
      // 完整名覆盖优先于 token 推断：`shower-body` 的 token `body` 在 ceramic 家族里
      // 会被解释成「陶瓷本体」，而契约要求它保持 `body`（金属淋浴房本体）。
      nameOverrides[model.itemType] = nameOverrides[model.itemType] ?? {}
      nameOverrides[model.itemType][overrideName(canonicalName)] = slot.role
    }
    if (roleByToken.size) slotRoles[model.itemType] = Object.fromEntries([...roleByToken.entries()].sort())
  }
  for (const entry of conflictedTokens) {
    const [itemType, token] = entry.split(':')
    if (slotRoles[itemType]) delete slotRoles[itemType][token]
  }
  return { aliases, slotRoles, nameOverrides, conflicts, conflictedTokens }
}

function renderAliasFile(tables) {
  const sortKeys = (object) => Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)))
  const lines = []
  lines.push('/**')
  lines.push(' * 自动生成，勿手改。生成命令：')
  lines.push(' *   bun ops/checks/studio/repair_glb_material_slots.mjs --emit-generated')
  lines.push(' *')
  lines.push(' * 作用：GLB 槽位改名后，`studio-external-models.ts` 里按 `material-<n>` / 原始名取色的')
  lines.push(' * 分支仍然要看到**旧名**。加载器在拿 `materialName` 的第一时间过一遍这张表，')
  lines.push(' * 旧分支逻辑与视觉结果都不变；表为空时函数退化为小写归一，行为完全等价。')
  lines.push(' *')
  lines.push(' * 只落全局表：按 itemType 的切片在 `legacy-material-aliases.ts` 里按 `new 名` 前缀')
  lines.push(' * 派生（两者是同一份改名的两个视图，重复落一份只会漂移）。')
  lines.push(' */')
  lines.push('')
  lines.push(
    'export const LEGACY_MATERIAL_ALIASES: Readonly<Record<string, string>> = Object.freeze(' +
      JSON.stringify(sortKeys(tables.aliases), null, 2) +
      ');',
  )
  lines.push('')
  return lines.join('\n')
}

function renderRoleFile(tables) {
  return [
    '/**',
    ' * 自动生成，勿手改。生成命令：',
    ' *   bun ops/checks/studio/repair_glb_material_slots.mjs --emit-generated',
    ' *',
    ' * 槽位改名后，原本靠 `MODEL_SLOT_ROLES[itemType][slotIndex]` 顺序表解析角色的模型，',
    ' * 名字里已经没有 `material-<n>`；这里把「新 token → 角色」登记进语义表，',
    ' * 让解析从「按顺序猜」变成「按名字定」，重出模型时顺序变化也不会错色。',
    ' */',
    'export const GENERATED_MODEL_SLOT_ROLES: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze(',
    JSON.stringify(tables.slotRoles, null, 2),
    ');',
    '',
    '/**',
    ' * 完整材质名 → 角色（改名后的新名）。优先级高于 token 推断：',
    ' * `shower-body` 的 token `body` 在 ceramic 家族里会被读成「陶瓷本体」，',
    ' * 而该槽位的契约角色是金属淋浴房本体，只能按完整名锁定。',
    ' */',
    'export const GENERATED_MATERIAL_ROLE_OVERRIDES: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze(',
    JSON.stringify(tables.nameOverrides, null, 2),
    ');',
    '',
  ].join('\n')
}

/**
 * 透明度 / 双面按契约回填（`--backfill-surface`）。
 *
 * 只做四件有明确契约证据的事：
 * 1. `alphaMode` 与契约目标不同 → 写成目标值（A4/A7 的根因：镜面 / 水面被导成 OPAQUE，
 *    或车身材质被导成 MASK 却带着 `< 1` 的 alpha）；
 * 2. 由不透明转成 `BLEND` 且原本 alpha 满值 → 补 `baseColorFactor[3] = opacity`，
 *    否则 BLEND 依然不透明；**已经是 BLEND 的一律不动 alpha** —— 那是作者按部件
 *    调过的值（`suv.glb` 的前风挡 0.16、尾灯罩 0.42 是两回事，套用配方会统一成 0.42）；
 * 3. 目标 `MASK` 却没写 `alphaCutoff` → 补规范默认 0.5（A2）；
 * 4. 最终是 `OPAQUE` 却标了双面 → 关掉（A4）。**透明件不在此列**：玻璃 / 水 / 镜面
 *    单面化会让背面直接消失，远比起伏的面片更难看。
 *
 * 两条跳过：
 * - 带 `baseColorTexture` 的 `MASK` 材质（`car_tms` 这类 UV 图集）保持原状：
 *   图集的 alpha 通道就是裁切信息，改成 OPAQUE 会把整块贴图铺满；
 * - 已经是 BLEND 的材质不改 opacity（见上）。
 *
 * 每次都写日志，调用方据此判断 this file 是否需要落盘。
 */
function applySurfaceBackfill(material, pbr, slot, log, { openShell = false } = {}) {
  const target = slot.target
  if (!target) return
  const wantAlphaMode = target.alphaMode
  if (!wantAlphaMode) return
  const currentAlphaMode = material.alphaMode ?? 'OPAQUE'
  const hasBaseColorTexture = Boolean(pbr.baseColorTexture)
  // 开放壳（门板 / 内饰片是单面壳）必须双面：单面化会从背面直接看穿。
  // 契约对这类模型已经把 `target.doubleSided` 固定成 true，这里再兜一次 ——
  // 免得有人先跑修复、后重建契约时把它们改回单面。
  if (openShell && material.doubleSided !== true) {
    material.doubleSided = true
    log.push('doubleSided 恢复（开放壳必须双面）')
  }
  if (wantAlphaMode === 'OPAQUE' && currentAlphaMode === 'MASK' && hasBaseColorTexture) return
  if (wantAlphaMode !== currentAlphaMode) {
    material.alphaMode = wantAlphaMode
    log.push(`alphaMode ${currentAlphaMode} → ${wantAlphaMode}`)
  }
  if (wantAlphaMode === 'MASK' && (material.alphaCutoff === undefined || material.alphaCutoff === null)) {
    material.alphaCutoff = 0.5
    log.push('alphaCutoff 补 0.5（MASK 缺省值）')
  }
  if (wantAlphaMode !== 'MASK') delete material.alphaCutoff
  if (wantAlphaMode === 'BLEND' && currentAlphaMode !== 'BLEND' && typeof target.opacity === 'number') {
    const factor = Array.isArray(pbr.baseColorFactor)
      ? [...pbr.baseColorFactor]
      : target.baseColorHex
        ? hexToFactor(target.baseColorHex, target.opacity)
        : null
    // 原材质在 OPAQUE 下写过的 `< 1` alpha 视为作者意图，只补满值 / 缺失的情况。
    if (factor && !(factor[3] !== undefined && factor[3] < 1)) {
      const before = factor[3]
      factor[3] = Number(target.opacity.toFixed(4))
      pbr.baseColorFactor = factor
      log.push(`alpha ${before ?? '缺省'} → ${factor[3]}（BLEND）`)
    }
  }
  if (wantAlphaMode === 'OPAQUE') {
    if (Array.isArray(pbr.baseColorFactor) && pbr.baseColorFactor[3] !== undefined && pbr.baseColorFactor[3] < 1) {
      pbr.baseColorFactor = [...pbr.baseColorFactor.slice(0, 3), 1]
      log.push('alpha 归 1（OPAQUE 下不生效）')
    }
    if (material.doubleSided === true && target.doubleSided === false) {
      material.doubleSided = false
      log.push('doubleSided 关（OPAQUE 无裁剪意义）')
    }
  }
}

/**
 * 单个 GLB 的改写：清死材质 → 改名 → 自发光归零。
 *
 * 两条刻意的边界：
 * 1. **按名字对齐，不按下标**：lite 与完整件的 materials 数组本来就不一致（8 款漂移），
 *    按下标删会把不同变体的不同材质删掉。
 * 2. **只处理「改名 / 清死材质 / 清误用自发光」**：roughness / metallic / alphaMode /
 *    doubleSided 这类 PBR 规则曾由 `repair_glb_materials.mjs` 拥有（该脚本已随手动 3D
 *    工具链清理移除），这里再写一遍会变成两套互相打架的真值；需要时用
 *    `--backfill-pbr` 强制按契约回填 roughness / metalness。
 * 3. **透明度 / 双面只在显式 `--backfill-surface` 时动**（`applySurfaceBackfill`）：
 *    `alphaMode` 写错会让镜面 / 水面渲染成实心板，`doubleSided` 写错只是多一倍背面
 *    绘制，两者都不该在没有契约证据时由脚本自行猜测。
 */
function planFilePatch(
  json,
  model,
  { backfillPbr = false, backfillSurface = false, stripSpecularGlossiness = false, pruneDead = false } = {},
) {
  const log = []
  const openShell = Boolean(OPEN_SHELL_ITEM_TYPES[model.itemType])
  const materials = json.materials ?? []
  const referenced = new Set()
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      if (typeof primitive.material === 'number') referenced.add(primitive.material)
    }
  }

  // 0) A6：清掉 specular-glossiness 残留。`pbrMetallicRoughness` 已是完整真值
  //    （baseColorTexture + roughness/metallic），旧扩展只是导出器残留；
  //    three 0.187 起完全不解析它，留着只会让审计与「真值到底在哪」长期对不上。
  if (stripSpecularGlossiness) {
    for (const material of materials) {
      if (material.extensions?.KHR_materials_pbrSpecularGlossiness) {
        delete material.extensions.KHR_materials_pbrSpecularGlossiness
        if (!Object.keys(material.extensions).length) delete material.extensions
        log.push(`移除 KHR_materials_pbrSpecularGlossiness（${material.name ?? '?'}）`)
      }
    }
    if (Array.isArray(json.extensionsUsed)) {
      const used = json.extensionsUsed.filter((name) => name !== 'KHR_materials_pbrSpecularGlossiness')
      if (used.length !== json.extensionsUsed.length) json.extensionsUsed = used
    }
    if (Array.isArray(json.extensionsRequired)) {
      const required = json.extensionsRequired.filter((name) => name !== 'KHR_materials_pbrSpecularGlossiness')
      if (required.length !== json.extensionsRequired.length) json.extensionsRequired = required
      if (!json.extensionsRequired.length) delete json.extensionsRequired
    }
  }

  // 1) 死材质清理（`--prune-dead`，默认关闭）：从后往前删，同步重排 primitive 下标。
  //
  // 默认关闭是刻意的：GLB 的 `material` 是数组下标，删掉任意一条都会让后面所有材质的
  // 下标前移，而运行期还有按下标取色的历史分支（`MODEL_SLOT_ROLES[itemType][index]`、
  // 角色基线也按文件 + 下标存）。死材质只是没有被 primitive 引用，占几百字节，
  // 留着比承担「下标错位」的风险划算 —— 审计里按 notice 记录（S4）。
  const pruneIndices = pruneDead
    ? materials
        .map((_, index) => index)
        .filter((index) => !referenced.has(index))
        .sort((a, b) => b - a)
    : []
  if (pruneIndices.length) {
    const nameBefore = new Map(materials.map((material, index) => [index, material.name ?? `material-${index}`]))
    const remap = new Map()
    let cursor = 0
    for (let index = 0; index < materials.length; index += 1) {
      if (pruneIndices.includes(index)) continue
      remap.set(index, cursor)
      cursor += 1
    }
    json.materials = materials.filter((_, index) => !pruneIndices.includes(index))
    for (const mesh of json.meshes ?? []) {
      for (const primitive of mesh.primitives ?? []) {
        if (typeof primitive.material !== 'number') continue
        const next = remap.get(primitive.material)
        if (next === undefined) throw new Error(`死材质清理后 primitive 指向了被删材质 ${primitive.material}`)
        primitive.material = next
      }
    }
    for (const [before, after] of remap) {
      if (nameBefore.get(before) !== (json.materials[after]?.name ?? ''))
        throw new Error('死材质清理后材质指向发生错位')
    }
    log.push(`prune ${pruneIndices.length}`)
  }

  // 2) 改名：契约里 action=rename 的旧名 → 新名
  const renameByName = new Map()
  const slotByName = new Map()
  for (const slot of model.slots) {
    slotByName.set(slot.name, slot)
    slotByName.set(slot.targetName, slot)
    if (slot.action === 'rename' && slot.targetName && slot.targetName !== slot.name)
      renameByName.set(slot.name, slot.targetName)
  }
  for (const material of json.materials ?? []) {
    const target = renameByName.get(material.name)
    if (target) {
      log.push(`rename ${material.name} → ${target}`)
      material.name = target
    }
  }

  // 3) 自发光：非发光角色残留的 emissiveFactor 归零（A3）。
  for (const material of json.materials ?? []) {
    const slot = slotByName.get(material.name)
    if (!slot) continue
    const EMISSIVE_ROLES = new Set(['glow', 'lit', 'emissive', 'indicator', 'display', 'led', 'screen', 'taillight'])
    const roleIsEmissive = EMISSIVE_ROLES.has(String(slot.role || ''))
    const targetEmissive = slot.target?.emissiveHex && slot.target.emissiveHex !== '—'
    const current = Array.isArray(material.emissiveFactor) ? material.emissiveFactor : null
    // 只有「角色本身不发光」才清；配方没给发光值不等于该角色不发光（`lit`/`glow` 的
    // 发光强度是运行时按档位给的，清掉会让灯具、指示灯彻底不亮）。
    if (!roleIsEmissive && !targetEmissive && current && current.some((value) => value > 0)) {
      material.emissiveFactor = [0, 0, 0]
      if (material.emissiveTexture) delete material.emissiveTexture
      log.push(`emissive 归零（角色 ${slot.role ?? 'unknown'} 非发光）`)
    }
    const pbr = (material.pbrMetallicRoughness = material.pbrMetallicRoughness ?? {})
    // baseColor 缺失（M1）：只补「没有 baseColorFactor 且没有 baseColorTexture」的槽位，
    // 已经有贴图的绝不覆盖。颜色取角色配方的默认主题色，运行时仍会被 itemPalette 覆盖。
    if (!Array.isArray(pbr.baseColorFactor) && !pbr.baseColorTexture && slot.target?.baseColorHex) {
      const factor = hexToFactor(slot.target.baseColorHex, slot.target.opacity ?? 1)
      if (factor) {
        pbr.baseColorFactor = factor
        log.push(`baseColorFactor 回填 ${slot.target.baseColorHex}`)
      }
    }
    if (!backfillPbr) {
      backfillSurface && applySurfaceBackfill(material, pbr, slot, log, { openShell })
      continue
    }
    const target = slot.target
    if (!target) continue
    if (typeof target.roughness === 'number') {
      const value = typeof pbr.roughnessFactor === 'number' ? pbr.roughnessFactor : null
      if (value === null || Math.abs(value - target.roughness) > ROUGHNESS_TOLERANCE) {
        pbr.roughnessFactor = target.roughness
        log.push(`roughness ${value} → ${target.roughness}`)
      }
    }
    if (typeof target.metalness === 'number') {
      const value = typeof pbr.metallicFactor === 'number' ? pbr.metallicFactor : null
      if (value === null || Math.abs(value - target.metalness) > METALNESS_TOLERANCE) {
        pbr.metallicFactor = target.metalness
        log.push(`metalness ${value} → ${target.metalness}`)
      }
    }
    backfillSurface && applySurfaceBackfill(material, pbr, slot, log, { openShell })
  }

  return { changed: log.length > 0, log }
}

function main() {
  if (!fs.existsSync(contractsPath)) {
    console.error(`缺少槽位契约：${contractsPath}\n先跑 bun homeos/frontend/scripts/models/build-slot-contracts.mjs`)
    process.exit(1)
  }
  const contracts = JSON.parse(fs.readFileSync(contractsPath, 'utf8'))
  const variants = collectModelVariants(listModelFiles())
  const tables = buildGeneratedTables(contracts)
  const models = only ? contracts.models.filter((model) => model.id === only) : contracts.models

  const renameCount = models.reduce(
    (sum, model) =>
      sum +
      model.slots.filter((slot) => slot.action === 'rename' && slot.required && slot.targetName !== slot.name).length,
    0,
  )
  const pruneCount = pruneDead
    ? models.reduce((sum, model) => sum + model.slots.filter((slot) => !slot.required).length, 0)
    : 0

  if (!emitOnly && renameCount > 0 && !fs.existsSync(aliasFile) && !forceRename) {
    console.error(
      [
        `✗ 改名被拒绝：还没有 ${path.relative(repoRoot, aliasFile)}`,
        '  遗留分支（30 处按 material-<n> / 原始名取色）会静默失效。先执行：',
        '    bun ops/checks/studio/repair_glb_material_slots.mjs --emit-generated',
        '  再把 legacy-material-aliases.ts 接进 studio-external-models.ts，再跑本脚本。',
        '  确实要先改名可加 --force-rename（不推荐）。',
      ].join('\n'),
    )
    process.exit(1)
  }

  const results = []
  for (const model of models) {
    const paths = variants.get(model.id)
    if (!paths) {
      results.push({ id: model.id, status: 'skipped', reason: '找不到 GLB' })
      continue
    }
    const files = []
    for (const [kind, relative] of Object.entries(paths)) {
      const filePath = path.join(modelsDir, relative)
      let log = []
      try {
        const outcome = patchGlbJson(
          filePath,
          (json) => {
            const plan = planFilePatch(json, model, {
              backfillPbr: hasFlag('backfill-pbr'),
              backfillSurface,
              stripSpecularGlossiness,
              pruneDead: hasFlag('prune-dead'),
            })
            log = plan.log
            return plan.changed
          },
          { dryRun: !write || emitOnly },
        )
        files.push({
          kind,
          file: relative,
          changed: outcome.changed,
          bytesBefore: outcome.bytesBefore,
          bytesAfter: outcome.bytesAfter,
          actions: log,
        })
      } catch (error) {
        files.push({ kind, file: relative, error: error.message })
      }
    }
    results.push({
      id: model.id,
      renames: model.slots.filter((slot) => slot.action === 'rename' && slot.required && slot.targetName !== slot.name)
        .length,
      prunes: pruneDead ? model.slots.filter((slot) => !slot.required).length : 0,
      files,
    })
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    mode: write ? 'write' : 'dry-run',
    contracts: {
      models: contracts.totals?.models ?? contracts.models.length,
      renamePending: renameCount,
      deadMaterials: pruneCount,
      tokenConflicts: tables.conflicts.length,
    },
    models: results.length,
    changedFiles: results.flatMap((entry) => entry.files ?? []).filter((file) => file.changed).length,
    errors: results.flatMap((entry) => entry.files ?? []).filter((file) => file.error).length,
  }

  if (tables.conflicts.length) {
    console.error(`✗ token 冲突 ${tables.conflicts.length} 处（同一 token 指向不同角色），必须先人工消歧：`)
    for (const conflict of tables.conflicts.slice(0, 10)) console.error('  -', JSON.stringify(conflict))
    if (write) process.exit(1)
  }

  if (!only) {
    fs.mkdirSync(materialsDir, { recursive: true })
    // 生成器口味（JSON.stringify 的双引号 + 分号）与全仓格式化结果不同，落盘前统一过一遍
    // Biome，保证「重新生成」对已格式化文件是逐字节幂等的。见 ops/lib/biome-format.mjs。
    fs.writeFileSync(aliasFile, formatGenerated(renderAliasFile(tables), aliasFile))
    fs.writeFileSync(roleFile, formatGenerated(renderRoleFile(tables), roleFile))
    console.log(`写入 ${path.relative(repoRoot, aliasFile)}（${Object.keys(tables.aliases).length} 条别名）`)
    console.log(
      `写入 ${path.relative(repoRoot, roleFile)}（${Object.keys(tables.slotRoles).length} 个模型的 token 表）`,
    )
  }

  if (asJson) {
    process.stdout.write(JSON.stringify({ summary, results }, null, 2) + '\n')
  } else {
    console.log(
      `\n${write ? '已落盘' : 'dry-run'}：${summary.models} 款 / 改名 ${renameCount} / 清死材质 ${pruneCount}`,
    )
    console.log(`变更文件 ${summary.changedFiles}，错误 ${summary.errors}`)
    const sample = results.filter((entry) => entry.files?.some((file) => file.changed)).slice(0, 8)
    for (const entry of sample) {
      console.log(`\n${entry.id}`)
      for (const file of entry.files) {
        if (!file.changed && !file.error) continue
        console.log(`  ${file.kind} ${file.file}${file.error ? ` ✗ ${file.error}` : ''}`)
        for (const action of file.actions.slice(0, 8)) console.log(`    - ${action}`)
      }
    }
    if (!write) console.log('\n（dry-run：加 --write 才落盘）')
  }

  if (!write && !emitOnly)
    fs.writeFileSync(
      path.join(repoRoot, 'ops/checks/studio/material-slot-repair-plan.json'),
      JSON.stringify({ summary, results }, null, 2) + '\n',
    )
}

main()
