/**
 * 令牌映射契约门禁：防止映射表退化。
 *
 * 断言：
 *  A1 别名链必须终止于字面量（指向永不解析的名字即为断链）。
 *  A2 权威层必须定义区域契约声明的令牌。
 *  A3 namingDrift / conflicts / regionViolations / namespaceBleed 相对基线只减不增。
 *
 * 用法：`node ops/ui-audit/check-token-map.mjs`（失败退出码 1）
 * 基线：`ops/contracts/ui-token-map.baseline.json`（收缩后需一并更新）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '../..')
const MAP = path.join(REPO_ROOT, 'ops/contracts/ui-token-map.json')
const BASELINE = path.join(REPO_ROOT, 'ops/contracts/ui-token-map.baseline.json')

const fail = []
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))

if (!fs.existsSync(MAP)) {
  console.error('缺少 ops/contracts/ui-token-map.json，请先运行 node ops/ui-audit/collect-token-map.mjs')
  process.exit(1)
}
const map = read(MAP)
const baseline = fs.existsSync(BASELINE) ? read(BASELINE) : null

// A1 断链别名
const broken = map.aliases.filter((a) => !a.resolved)
if (broken.length) fail.push(`A1 断链别名 ${broken.length} 个：${broken.slice(0, 10).map((a) => `${a.name}→${a.target}`).join('，')}`)

// A2 权威层覆盖区域契约令牌
const canonicalFile = path.join(REPO_ROOT, map.canonicalLayer.file)
if (!fs.existsSync(canonicalFile)) fail.push(`A2 权威层文件不存在：${map.canonicalLayer.file}`)
else {
  const text = fs.readFileSync(canonicalFile, 'utf8')
  for (const region of [map.regionContract.cool]) {
    if (!text.includes(`${region.token}:`)) fail.push(`A2 权威层未定义区域令牌 ${region.token}`)
  }
}

// A3 棘轮：只减不增
const names = (arr) => new Set(arr.map((x) => x.name))
function ratchet(label, current, base) {
  if (!base) return
  const baseSet = new Set(base)
  const added = [...current].filter((n) => !baseSet.has(n))
  if (added.length) fail.push(`A3 ${label} 新增 ${added.length} 个：${added.slice(0, 10).join('，')}`)
}
if (baseline) {
  ratchet('namingDrift', names(map.namingDrift), baseline.namingDrift)
  ratchet('conflicts', names(map.conflicts), baseline.conflicts)
  ratchet(
    'regionViolations',
    new Set(map.regionViolations.map((v) => `${v.name}@${v.file}`)),
    baseline.regionViolations,
  )
  ratchet(
    'namespaceBleed',
    new Set(map.namespaceBleed.map((v) => `${v.name}@${v.file}`)),
    baseline.namespaceBleed,
  )
}

// 概览
console.log('令牌映射契约：')
console.log(`  别名 ${map.aliases.length}（断链 ${broken.length}）`)
console.log(`  同名分歧 ${map.conflicts.length}，值同构镜像 ${map.valueIdenticalMirrors.length}`)
console.log(`  命名空间遮蔽 ${map.namespaceBleed.length}，区域身份色越界 ${map.regionViolations.length}`)
console.log(`  命名漂移 ${map.namingDrift.length}：${map.namingDrift.map((d) => d.name).join(' ')}`)

if (fail.length) {
  console.error('\n✗ 令牌映射契约未通过：')
  for (const f of fail) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('\n✓ 令牌映射契约通过。')
