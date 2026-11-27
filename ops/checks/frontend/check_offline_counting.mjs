/**
 * 「离线」计数口径守卫。
 *
 * ## 为什么需要一条静态门禁
 *
 * 「离线 N」在全站有七八处独立实现（首页角标、设备页侧栏、诊断页、安全区卡片、
 * 危险源面板、设备画像、健康趋势图）。它们的自然写法都是
 * `entities.filter((e) => e.state === 'unavailable').length` —— 量纲是**实体**。
 *
 * 一台掉线的多传感器设备会贡献 5~10 条实体（电量、信号、各测量项），于是同一个故障
 * 在不同页面写着 131 / 131 / 131，而用户心里想的是「十几台设备连不上」。
 * 这类差异**不会报错**：数字看起来合理，只是差一个数量级。
 *
 * 2026-11 把这些点统一到 `countOfflineDevices` / `groupOfflineByDevice` 之后，
 * 这条守卫防止再次长出按实体计数的写法。
 *
 * ## 判定
 *
 * 在 `homeos/frontend/src/**` 里匹配「对实体集合做 filter，然后 .length」且谓词里出现
 * 离线状态字面量的表达式。允许的例外（逐条登记，理由必填）：
 * - 明确在算**实体**数的位置（如诊断页的 `unavailableCount`、单实体状态判断）；
 * - 逐行渲染用的布尔判定（不是计数）。
 *
 * 用法：
 *   node ops/checks/frontend/check_offline_counting.mjs            # 校验
 *   node ops/checks/frontend/check_offline_counting.mjs --json
 */
import fs from 'node:fs'
import path from 'node:path'

import { isMain } from '../../lib/cli.mjs'
import { report } from '../../lib/ratchet.mjs'

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..')
const SCOPE = 'homeos/frontend/src'

/**
 * 允许按实体计数的地方（仓库相对路径 → 理由）。
 *
 * 新增条目必须写清「为什么这里要的是实体数而不是设备数」；不写理由的条目不生效，
 * 免得这张表慢慢变成「遇到红灯就加一行」。
 */
const ALLOWED = new Map([
  // 运维诊断的原始指标：回答「有多少条状态流断了」，设备数另有 unavailableDeviceCount
  [
    'homeos/frontend/src/features/device/components/DeviceStatsDashboard.vue',
    '实体级在线/总数，与列表行同量纲；设备数另由 countOfflineDevices 给出',
  ],
  // 设备聚合本身的实现：`offlineStateLabel` 要算「该设备 N 个实体里几个不可用」。
  // 这个 N/M 是**刻意**的实体数 —— 它是「部分失效 3/12」的分子分母，不是离线总数。
  [
    'homeos/frontend/src/domain/entity/device-group.ts',
    '在**单个设备内部**数个数字体（N/M）；离线总数仍由 groupOfflineByDevice 给出',
  ],
])

/**
 * 判定一行是否是「按实体统计离线」。
 *
 * 不用一条大正则：`filter((e) => e.state === 'unavailable')` 里的 `(e) =>` 含右括号，
 * `[^)]*` 会在那里截断，导致漏报（实测漏掉了最典型的写法）。
 * 改成三个必要条件的合取，各自容易核验：
 *
 * 1. 出现 `.filter(` —— 在做集合筛选；
 * 2. 同一行出现**实体状态**的离线字面量（`unavailable` 或 `state === 'offline'`）——
 *    只写 `'offline'` 会误伤 `row.kind === 'offline'`、`r.status === 'offline'` 这类
 *    行级判定（它们筛的是已经聚合好的行，不是实体）；
 * 3. 同一行出现 `.length` —— 筛完在计数（逐行渲染的布尔判定不会带 `.length`）。
 *
 * 误报代价是「需要在该文件登记一行理由」，漏报代价是一个长期虚高的数字。
 */
function isEntityOfflineCountLine(line) {
  if (!line.includes('.filter(')) return false
  if (!line.includes('.length')) return false
  return /unavailable|state\s*===\s*['"]offline['"]/.test(line)
}

/** 逐行渲染用的布尔判定不是计数（它也不带 `.length`，这里留作双保险）。 */
const BOOLEAN_ASSIGN = /(?:const|let|var)\s+\w+\s*=\s*(?:!|\w|\().*(?:unavailable|'offline')/

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      walk(full, out)
      continue
    }
    if (/\.(ts|vue|mts)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full)
  }
  return out
}

/**
 * @returns {{file: string, line: number, snippet: string}[]}
 */
export function findEntityOfflineCounts(root = REPO_ROOT) {
  const hits = []
  for (const file of walk(path.join(root, SCOPE))) {
    const rel = path.relative(root, file).split(path.sep).join('/')
    if (ALLOWED.has(rel)) continue
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      if (!isEntityOfflineCountLine(line)) continue
      // 布尔赋值形态且不带 `.length`：不是计数
      if (BOOLEAN_ASSIGN.test(line) && !line.includes('.length')) continue
      hits.push({ file: rel, line: index + 1, snippet: line.trim().slice(0, 140) })
    }
  }
  return hits
}

/**
 * @returns {{name: string, summary: string, problems: string[], json: object}}
 */
export function audit() {
  const hits = findEntityOfflineCounts()
  return {
    name: '离线计数口径',
    summary: `未发现按实体计数的「离线 N」（${ALLOWED.size} 处已登记例外）`,
    problems: hits.map(
      (hit) =>
        `${hit.file}:${hit.line} 按**实体**统计离线（一台设备多实体时数字虚高）\n` +
        `    ${hit.snippet}\n` +
        '    → 改用 `countOfflineDevices(ids, entities)` / `groupOfflineByDevice(...)`',
    ),
    hints:
      hits.length > 0 ? ['若这一处确实要的是实体数，在 check_offline_counting.mjs 的 ALLOWED 里登记并写明理由。'] : [],
    json: { hits, allowed: [...ALLOWED.keys()] },
  }
}

/** 单跑入口。 */
export function cli(argv = process.argv.slice(2)) {
  return report(audit(), { json: argv.includes('--json') })
}

if (isMain(import.meta.url)) process.exit(cli())
