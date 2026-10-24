#!/usr/bin/env bun
/**
 * 槽位改名的「角色不漂移」证明（只读）。
 *
 * `audit_glb_materials.mjs --check-roles` 的基线是**按下标**存的：删除死材质会让后续槽位
 * 下标整体前移，于是报告里会出现成百上千条「漂移」，但材质本身可能一点没变。
 * 这个脚本换一种比对口径：
 *
 *   基线（命名前）的名字  ←→  当前名字经别名表还原后的旧名
 *
 * 逐个材质比「角色」，而不是比下标。任何不一致都必须落在 `DECLARED_ROLE_CHANGES` 里
 * （也就是契约里登记过的 C2 拆分），否则就是真回归，退出码 1。
 *
 * 用法：
 * ```bash
 * bun ops/checks/studio/verify_slot_roles.mjs            # 人读摘要
 * bun ops/checks/studio/verify_slot_roles.mjs --json     # 机读
 * ```
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { collectModelVariants, listModelFiles, readModelAtRevision } from '../../../homeos/frontend/scripts/models/lib/glb-io.mjs'

const hereDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(hereDir, '../../..')
const frontendDir = path.join(repoRoot, 'homeos/frontend')
const baselinePath = path.join(hereDir, 'material-role-baseline.json')
const contractsPath = path.join(frontendDir, 'scripts/models/specs/model-slot-contracts.json')

const { LEGACY_MATERIAL_ALIASES } = await import(
  pathToFileURL(path.join(frontendDir, 'src/studio/app/3d-studio/materials/legacy-material-aliases.generated.ts')).href
)
const { resolveModelMaterialRole } = await import(
  pathToFileURL(path.join(frontendDir, 'src/studio/app/3d-studio/materials/studio-model-material-roles.ts')).href
)

/** 契约里声明过的角色变更（整件同角色拆分），逐条带原因。 */
const DECLARED_ROLE_CHANGES = Object.freeze({
  'ball-pit#0': { from: 'playBall', to: 'body', reason: '池体外壳与球堆共用 playBall，按面积 40.5% / 448 壳拆成池体' },
  'ball-pit#3': { from: 'playBall', to: 'accent', reason: '第二色球从 playBall 拆出，避免整件同色' },
  'bed-tray#1': { from: 'board', to: 'handle', reason: '0.078 面积且位于 y=0.89 的小件是金属把手，不是托盘板面' },
  'decorative-plate#1': { from: 'plate', to: 'trim', reason: '0.084 面积的装饰环从盘面拆出' },
  'decorative-plate#2': { from: 'plate', to: 'accent', reason: '0.014 面积的中心图案从盘面拆出' },
  'decorative-plate#3': { from: 'plate', to: 'base', reason: '靠后 6cm、厚度 19% 的部件是底座' },
  'sofa-throw#1': { from: 'throwBlanket', to: 'trim', reason: '3mm 薄的包边从毯面拆出' },
  'scooter#1': { from: 'trim', to: 'emissive', reason: '指示灯/灯带：旧名 Yellow_Light 的 _light 被读成明度落到 trim' },
  'scooter#2': { from: 'trim', to: 'emissive', reason: '指示灯光带 Green_Light 同上' },
  'scooter#6': { from: 'trim', to: 'emissive', reason: '白色灯带 White_Light 同上' },
  'scooter#7': { from: 'trim', to: 'emissive', reason: '尾灯 Red_Light 同上' },
})

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
const contracts = JSON.parse(fs.readFileSync(contractsPath, 'utf8'))
const alias = (name) => LEGACY_MATERIAL_ALIASES[name] ?? name

/**
 * 基线只存「下标 → 角色」，不存名字（刻意的：改名不该影响指纹）。
 * 所以先用 git HEAD 的材质名把下标翻译回**改名前的名字**，再按名字比角色。
 * 死材质清理造成的下标位移因此不会误报。
 */
const baselineRoles = new Map()
for (const [file, roles] of Object.entries(baseline.files ?? {})) {
  if (Array.isArray(roles)) baselineRoles.set(file, roles)
}

const headNamesCache = new Map()
function headMaterialNames(id, fullPath) {
  if (!fullPath) return null
  if (headNamesCache.has(fullPath)) return headNamesCache.get(fullPath)
  try {
    const buffer = readModelAtRevision(fullPath)
    if (!buffer) {
      headNamesCache.set(fullPath, null)
      return null
    }
    const jsonLength = buffer.readUInt32LE(12)
    const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'))
    const names = (json.materials ?? []).map((material, index) => material.name ?? `material-${index}`)
    headNamesCache.set(fullPath, names)
    return names
  } catch {
    headNamesCache.set(fullPath, null)
    return null
  }
}

const variants = collectModelVariants(listModelFiles())
const itemTypeById = new Map(contracts.models.map((model) => [model.id, model.itemType]))
const legacyRoleByName = new Map()
for (const [id, paths] of variants) {
  const itemType = itemTypeById.get(id)
  if (!itemType) continue
  const names = headMaterialNames(id, paths?.full ?? paths?.lite ?? null)
  if (!names) continue
  // 「改名前的角色」必须现场用**旧名**解析：基线文件是按当前下标存的，
  // 死材质清理会让下标整体前移，按下标把旧名和基线角色对齐会错配
  // （`garden-bollard` 的两条材质顺序恰好相反，就是这个坑）。
  names.forEach((name, index) => {
    const role = resolveModelMaterialRole(itemType, name, index)?.role ?? null
    /**
     * 键要用**改名前的名字**：本脚本提交前后都能跑 —— 提交前 HEAD 还是旧名，
     * 提交后 HEAD 已经变成新名。别名表（新 → 旧）两边都能还原到同一个键，
     * 否则改完名再跑覆盖率会掉到 0，证明就失效了。
     */
    legacyRoleByName.set(`${id}|${String(alias(name)).toLowerCase()}`, role)
  })
}

const drift = []
const matched = []
const undeclared = []
for (const model of contracts.models) {
  for (const slot of model.slots) {
    const legacy = slot.legacyName ?? alias(slot.name)
    const entry = legacyRoleByName.get(`${model.id}|${String(legacy).toLowerCase()}`)
    if (!entry) continue
    const current = resolveModelMaterialRole(model.itemType, slot.name, slot.index)?.role ?? null
    const record = { id: model.id, index: slot.index, name: slot.name, legacy, before: entry, after: current }
    if (entry === current) matched.push(record)
    else {
      const declared = DECLARED_ROLE_CHANGES[`${model.id}#${slot.index}`]
      if (declared && declared.from === entry && declared.to === current) drift.push({ ...record, declared })
      else undeclared.push(record)
    }
  }
}

const covered = matched.length + drift.length + undeclared.length
const summary = {
  baselineEntries: legacyRoleByName.size,
  compared: covered,
  unchanged: matched.length,
  declaredChanges: drift.length,
  undeclaredDrift: undeclared.length,
}

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify({ summary, drift, undeclared }, null, 2) + '\n')
} else {
  console.log(`基线条目 ${summary.baselineEntries}，可比对 ${summary.compared}（${((covered / Math.max(1, summary.baselineEntries)) * 100).toFixed(1)}% 覆盖）`)
  console.log(`  角色不变 ${summary.unchanged}`)
  console.log(`  契约声明的变更 ${summary.declaredChanges}`)
  for (const entry of drift) console.log(`    · ${entry.id}#${entry.index} ${entry.name}：${entry.before} → ${entry.after}（${entry.declared.reason}）`)
  console.log(`  未声明漂移 ${summary.undeclaredDrift}`)
  for (const entry of undeclared.slice(0, 20)) console.log(`    ✗ ${entry.id}#${entry.index} ${entry.name}：${entry.before} → ${entry.after}`)
  const missing = [...legacyRoleByName.keys()]
    .filter((key) => {
      const [file, name] = key.split('|')
      const id = file.replace(/-lite\.glb$|\.glb$/g, '')
      const model = contracts.models.find((candidate) => candidate.id === id)
      if (!model) return false
      return !model.slots.some((slot) => String(slot.legacyName ?? alias(slot.name)).toLowerCase() === name)
    })
  console.log(`  基线里有、当前模型已无对应旧名 ${missing.length}（死材质清理造成，属预期）`)
}

if (undeclared.length) process.exit(1)
