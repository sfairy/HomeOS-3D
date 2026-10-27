#!/usr/bin/env bun
/**
 * 材质槽位审计（只读）：逐模型逐槽位比对「契约 ↔ GLB ↔ 运行时解析」。
 *
 * 与 `audit_glb_materials.mjs` 的分工：
 * - 那个脚本看的是**材质属性**（PBR / alpha / 贴图 / 命名体系），回答「值对不对」；
 * - 这个脚本看的是**槽位身份**，回答「这个槽位是不是契约里那一个构件、角色有没有跑掉、
 *   lite 与完整件是不是同一套槽位」。
 *
 * 判定全部来自契约 `specs/model-slot-contracts.json`，脚本不自己猜角色：
 * 1. 覆盖：336 款都有契约，槽位数与两个变体的 materials 长度一致；
 * 2. 解析：每个槽位按当前名解析出的角色 == 契约角色，来源不是家族兜底；
 * 3. 命名：规范字符、不是 `material-<n>` / 序号 / 符号；
 * 4. 引用：没有死材质（契约登记例外的除外）；
 * 5. 同角色：≥2 槽的模型不允许整件同角色；
 * 6. 一致：lite 与完整件的槽位名 / 顺序 / PBR 参数一致；
 * 7. 偏差：roughness / metalness 与配方差 ≤0.05（运行时重建的槽位不参与）；
 * 8. 几何：面积占比相对契约漂移 ≤0.1（证明槽位还绑在同一批构件上）。
 *
 * 用法：
 * ```bash
 * bun ops/checks/studio/audit_glb_material_slots.mjs            # 写报告
 * bun ops/checks/studio/audit_glb_material_slots.mjs --stdout   # 只打摘要
 * bun ops/checks/studio/audit_glb_material_slots.mjs --check    # 门禁，失败退出码 1
 * bun ops/checks/studio/audit_glb_material_slots.mjs --model sofa --json
 * ```
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { collectModelVariants, listModelFiles, modelsDir, repoRoot, specsDir } from '../../../homeos/frontend/scripts/models/lib/glb-io.mjs'
import { enumerateSlots } from '../../../homeos/frontend/scripts/models/lib/material-slots.mjs'
import { modelAuditDir as docsDir } from '../../../homeos/frontend/scripts/models/lib/model-audit-paths.mjs'

const contractsPath = path.join(specsDir, 'model-slot-contracts.json')
const frontendDir = path.join(repoRoot, 'homeos/frontend')

const args = process.argv.slice(2)
const hasFlag = (flag) => args.includes(`--${flag}`)
const valueOf = (flag) => {
  const index = args.indexOf(`--${flag}`)
  return index >= 0 ? args[index + 1] : null
}
const only = valueOf('model')
const asJson = hasFlag('json')
const check = hasFlag('check')
const stdoutOnly = hasFlag('stdout')

const CANONICAL = /^[a-z0-9][a-z0-9_]*(?:[-][a-z0-9][a-z0-9_]*)*$/
const MIN_COVERAGE = 1
const PBR_TOLERANCE = 0.05
const AREA_SHARE_TOLERANCE = 0.1

const { resolveModelMaterialRole, materialRoleRecipeForRole } = await import(
  pathToFileURL(path.join(frontendDir, 'src/studio/app/3d-studio/materials/studio-model-material-roles.ts')).href
)
const { materialPbrIsReplaced } = await import(
  pathToFileURL(path.join(frontendDir, 'src/studio/app/3d-studio/materials/material-pipeline.ts')).href
)

const round = (value, digits = 3) => (typeof value === 'number' ? Number(value.toFixed(digits)) : value)
const hexOf = (factor) =>
  Array.isArray(factor)
    ? '#' + factor.slice(0, 3).map((channel) => Math.round(Math.max(0, Math.min(1, channel)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()
    : null

function auditModel(contract, paths) {
  const findings = []
  const slots = []
  const variants = {}
  for (const kind of ['lite', 'full']) {
    const relative = paths?.[kind]
    if (!relative) continue
    try {
      variants[kind] = enumerateSlots(path.join(modelsDir, relative), {
        fullPath: paths?.full ? path.join(modelsDir, paths.full) : null,
      })
    } catch (error) {
      findings.push({ rule: 'S0', detail: `${kind} 读取失败：${error.message}` })
    }
  }
  const primary = variants.lite ?? variants.full
  if (!primary) return { id: contract.id, status: 'fail', findings: findings.length ? findings : [{ rule: 'S0', detail: '没有可读变体' }], slots }

  // 1) 覆盖
  if (primary.materialCount !== contract.expectedSlotCount) {
    findings.push({
      rule: 'S1',
      detail: `契约槽位 ${contract.expectedSlotCount}，GLB 材质 ${primary.materialCount}`,
    })
  }

  /**
   * 6) lite / 完整件一致。
   *
   * `notice` 而不是 `error`：这两件由同一次导出产出，槽位集合漂移只能靠**重出**解决
   * （代码侧删槽位会打穿按下标取色的历史分支）。审计的 C4 逐条登记这些漂移，门禁这里
   * 只保证「不会再被 Draco 回退掩盖」——2026-10-24 之前 lite 是 Draco 时整份换读完整件，
   * 于是这部分永远报 0 处，审计却报 9 处，两边长期对不上。
   */
  if (variants.lite && variants.full) {
    const liteCount = variants.lite.materialCount
    const fullCount = variants.full.materialCount
    const drift = []
    if (liteCount !== fullCount) drift.push(`lite ${liteCount} 槽 vs 完整件 ${fullCount} 槽`)
    const limit = Math.max(liteCount, fullCount)
    for (let index = 0; index < limit; index += 1) {
      const liteSlot = variants.lite.slots[index]
      const fullSlot = variants.full.slots[index]
      if (!liteSlot || !fullSlot) {
        drift.push(`#${index} 只在一个变体里存在`)
        continue
      }
      const diffs = []
      if (liteSlot.name !== fullSlot.name) diffs.push(`名 ${liteSlot.name} ≠ ${fullSlot.name}`)
      if ((liteSlot.alphaMode ?? 'OPAQUE') !== (fullSlot.alphaMode ?? 'OPAQUE')) diffs.push('alphaMode')
      if (Boolean(liteSlot.doubleSided) !== Boolean(fullSlot.doubleSided)) diffs.push('doubleSided')
      if (Math.abs((liteSlot.roughnessFactor ?? -1) - (fullSlot.roughnessFactor ?? -1)) > PBR_TOLERANCE) diffs.push('roughness')
      if (Math.abs((liteSlot.metallicFactor ?? -1) - (fullSlot.metallicFactor ?? -1)) > PBR_TOLERANCE) diffs.push('metalness')
      if (diffs.length) drift.push(`#${index} ${diffs.join(' / ')}`)
    }
    for (const detail of drift) findings.push({ rule: 'S6', detail, severity: 'notice' })
  }

  // 逐槽位
  const contractByIndex = new Map(contract.slots.map((slot) => [slot.index, slot]))
  const roles = []
  for (const slot of primary.slots) {
    const expected = contractByIndex.get(slot.index)
    const resolution = resolveModelMaterialRole(contract.itemType, slot.name, slot.index)
    const role = resolution?.role ?? null
    roles.push(role)
    const recipe = materialRoleRecipeForRole(contract.itemType, role, null)
    const replaced = materialPbrIsReplaced(contract.itemType, slot.name)
    const row = {
      index: slot.index,
      name: slot.name,
      contractName: expected?.name ?? null,
      targetName: expected?.targetName ?? null,
      role,
      roleSource: resolution?.source ?? null,
      contractRole: expected?.role ?? null,
      surface: recipe?.surface ?? expected?.surface ?? null,
      used: slot.used,
      fingerprint: slot.fingerprint
        ? {
            areaShare: slot.fingerprint.areaShare,
            thinness: slot.fingerprint.thinness,
            yBand: slot.fingerprint.yBand,
            shells: slot.fingerprint.shells,
          }
        : null,
      embedded: {
        baseColor: hexOf(slot.baseColorFactor),
        roughness: round(slot.roughnessFactor),
        metalness: round(slot.metallicFactor),
        alphaMode: slot.alphaMode,
        doubleSided: slot.doubleSided,
      },
      target: expected?.target ?? null,
      pbrReplaced: replaced,
      findings: [],
    }
    /**
     * severity：
     * - `error` 参与门禁（契约结构、角色解析、变体一致性、PBR/几何漂移）；
     * - `notice` 只进报告（命名规范、死材质）——2026-10-23 起契约口径是「只登记、不改名」，
     *   原始名里有 `[Color_008]1`、`*5`、`material-3` 属于导出器现状，不再是待办；
     *   死材质同样刻意保留（删了会重排 material 下标，打穿按下标取色的分支）。
     */
    const add = (rule, detail, severity = 'error') => {
      row.findings.push({ rule, detail, severity })
      findings.push({ rule, detail: `#${slot.index} ${slot.name}：${detail}`, severity })
    }

    // 2) 解析
    if (!expected) add('S1', '契约里没有这个槽位')
    else {
      if (role !== expected.role) add('S2', `角色 ${role}（${resolution?.source}）≠ 契约 ${expected.role}`)
      if (resolution?.source === 'default') add('S2', '角色落到家族兜底')
      if (expected.name !== slot.name && expected.targetName !== slot.name) {
        add('S1', `名字既不是契约原名（${expected.name}）也不是目标名（${expected.targetName}）`)
      }
    }

    // 3) 命名（notice：原始名保留，不再要求规范化）
    if (!CANONICAL.test(slot.name)) add('S3', `槽位名含非规范字符：${slot.name}`, 'notice')
    if (/material-\d+$/.test(slot.name)) add('S3', '槽位名只有材质序号', 'notice')

    // 4) 引用（notice：死材质刻意保留，见上方说明）
    if (!slot.used) add('S4', '死材质（没有任何 primitive 引用）', 'notice')

    // 7) PBR
    if (expected?.target && !replaced) {
      if (typeof expected.target.roughness === 'number' && typeof slot.roughnessFactor === 'number') {
        const delta = Math.abs(slot.roughnessFactor - expected.target.roughness)
        if (delta > PBR_TOLERANCE) add('S7', `roughness 偏差 ${round(delta)} > ${PBR_TOLERANCE}`)
      }
      if (typeof expected.target.metalness === 'number' && typeof slot.metallicFactor === 'number') {
        const delta = Math.abs(slot.metallicFactor - expected.target.metalness)
        if (delta > PBR_TOLERANCE) add('S7', `metalness 偏差 ${round(delta)} > ${PBR_TOLERANCE}`)
      }
    }

    // 8) 几何漂移
    const expectedShare = expected?.geometryEvidence?.areaShare
    if (typeof expectedShare === 'number' && slot.fingerprint && Math.abs(slot.fingerprint.areaShare - expectedShare) > AREA_SHARE_TOLERANCE) {
      add('S8', `面积占比 ${slot.fingerprint.areaShare} vs 契约 ${expectedShare}`)
    }

    slots.push(row)
  }

  // 5) 同角色
  const uniqueRoles = [...new Set(roles.filter(Boolean))]
  if (primary.materialCount > 1 && uniqueRoles.length === 1) {
    findings.push({
      rule: 'S5',
      detail: `${primary.materialCount} 个槽位全部解析成 ${uniqueRoles[0]}`,
      severity: 'notice',
    })
  }

  return {
    id: contract.id,
    itemType: contract.itemType,
    family: contract.family,
    status: findings.some((finding) => finding.severity !== 'notice') ? 'fail' : 'pass',
    coverage: primary.materialCount / Math.max(1, contract.expectedSlotCount),
    slots,
    findings,
  }
}

function main() {
  if (!fs.existsSync(contractsPath)) {
    console.error(`缺少槽位契约：${contractsPath}`)
    process.exit(1)
  }
  const contracts = JSON.parse(fs.readFileSync(contractsPath, 'utf8'))
  const variants = collectModelVariants(listModelFiles())
  const targets = only ? contracts.models.filter((model) => model.id === only) : contracts.models
  const results = targets.map((contract) => auditModel(contract, variants.get(contract.id)))

  const ruleCounts = {}
  for (const model of results) for (const finding of model.findings) ruleCounts[finding.rule] = (ruleCounts[finding.rule] ?? 0) + 1
  const failing = results.filter((model) => model.status === 'fail')
  const summary = {
    generatedAt: new Date().toISOString(),
    models: results.length,
    contracts: contracts.models.length,
    slots: results.reduce((sum, model) => sum + model.slots.length, 0),
    pass: results.length - failing.length,
    fail: failing.length,
    coverage: contracts.totals?.models ? results.length / contracts.models.length : 0,
    minCoverage: MIN_COVERAGE,
    ruleCounts,
    thresholds: { pbrTolerance: PBR_TOLERANCE, areaShareTolerance: AREA_SHARE_TOLERANCE },
  }

  if (asJson) process.stdout.write(JSON.stringify({ summary, models: results }, null, 2) + '\n')

  if (check) {
    if (failing.length) {
      console.error(`✗ 槽位门禁：${failing.length}/${results.length} 款不合格`)
      for (const model of failing.slice(0, 30)) {
        console.error(`  - ${model.id}: ${model.findings.slice(0, 3).map((finding) => `${finding.rule} ${finding.detail}`).join('；')}`)
      }
      process.exit(1)
    }
    console.log(`✓ 槽位门禁通过：${results.length} 款 / ${summary.slots} 槽位`)
    return
  }

  if (stdoutOnly) {
    console.log(JSON.stringify(summary, null, 2))
    for (const model of failing.slice(0, 20)) console.log(`  - ${model.id}: ${model.findings.map((f) => `${f.rule} ${f.detail}`).join('；')}`)
    return
  }

  fs.mkdirSync(docsDir, { recursive: true })
  const jsonPath = path.join(docsDir, 'glb-material-slots.json')
  fs.writeFileSync(jsonPath, JSON.stringify({ summary, models: results }, null, 2) + '\n')

  const lines = []
  lines.push('# GLB 材质槽位审计', '')
  lines.push(`- 生成时间：${summary.generatedAt}`)
  lines.push(`- 规模：${summary.models} 个模型 / ${summary.slots} 个槽位；契约 ${summary.contracts} 条`)
  lines.push(`- 判定：pass ${summary.pass} / fail ${summary.fail}`)
  lines.push(`- 问题分类：${Object.entries(ruleCounts).map(([rule, count]) => `${rule}=${count}`).join('、') || '无'}`)
  lines.push('')
  lines.push('规则：S1 契约覆盖 / S2 角色解析 / S3 命名规范 / S4 死材质 / S5 整件同角色 / S6 lite 一致 / S7 PBR 偏差 / S8 几何漂移')
  lines.push('')
  for (const model of results) {
    if (model.status === 'pass') continue
    lines.push(`## ${model.id}（${model.itemType} / ${model.family}）`, '')
    lines.push('| 槽位 | 名称 | 解析角色（来源） | 契约角色 | 结论 |')
    lines.push('| --- | --- | --- | --- | --- |')
    for (const slot of model.slots) {
      const verdict = slot.findings.length ? slot.findings.map((f) => `${f.rule} ${f.detail}`).join('；') : 'ok'
      lines.push(`| ${slot.index} | ${slot.name} | ${slot.role ?? '—'}（${slot.roleSource ?? '—'}） | ${slot.contractRole ?? '—'} | ${verdict} |`)
    }
    lines.push('')
    for (const finding of model.findings) lines.push(`- ${finding.rule}：${finding.detail}`)
    lines.push('')
  }
  const mdPath = path.join(docsDir, 'glb-material-slots.md')
  fs.writeFileSync(mdPath, lines.join('\n') + '\n')
  console.log(`槽位审计：pass ${summary.pass} / fail ${summary.fail}，${summary.slots} 个槽位`)
  console.log(`  → ${path.relative(repoRoot, mdPath)}`)
  console.log(`  → ${path.relative(repoRoot, jsonPath)}`)
}

main()
