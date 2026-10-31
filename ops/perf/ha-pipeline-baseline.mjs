/**
 * HA 实时链路基线采样：把 `/metrics` 里的五段延迟与丢弃/重连计数拉成一张表，
 * 并支持与上一次采样做回归对比。
 *
 * 用法：
 *   bun ops/perf/ha-pipeline-baseline.mjs                       # 打印当前基线
 *   bun ops/perf/ha-pipeline-baseline.mjs --save baseline.json  # 存一份基线
 *   bun ops/perf/ha-pipeline-baseline.mjs --diff baseline.json  # 和基线对比（p99 恶化 >25% 报警）
 *
 * 依赖：仅 Node 内置（fetch），需要后端在跑；`/metrics` 生产环境需 `METRICS_TOKEN`，
 * 用 `--token=xxx` 或 `HOMEOS_METRICS_TOKEN` 传入。
 *
 * 指标口径（backend/src/platform/core/observability.py）：
 *   homeos_ha_sync_latency_ms{stage,quantile}  五段管线延迟 p50/p99/max
 *   homeos_ha_events_total{event}              recv / reconnect / fast_reconnect /
 *                                              queue_dropped / resync / reconcile /
 *                                              full_sync / decode_resync /
 *                                              shadow_compare / shadow_mismatch
 */
const DEFAULT_URL = 'http://127.0.0.1:8000/metrics'

/** 计划验收线（p99，毫秒）：只对这几段硬性要求，其余仅记录。 */
const ACCEPTANCE = {
  'fe_e2e_apply': 250,
  // 关键控制域在合并队列里只该停一个帧级窗口；50ms 那档说明短窗口没生效。
  'ha_deferred_dwell_critical': 10,
  ws_emit: 60,
}

const args = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  if (!hit) return fallback
  const index = hit.indexOf('=')
  return index === -1 ? true : hit.slice(index + 1)
}

const url = flag('url', process.env.HOMEOS_METRICS_URL || DEFAULT_URL)
const token = flag('token', process.env.HOMEOS_METRICS_TOKEN || '')

async function fetchMetrics() {
  const target = new URL(url)
  if (token) target.searchParams.set('token', token)
  const response = await fetch(target)
  if (!response.ok) {
    throw new Error(`拉取 ${target.pathname} 失败：HTTP ${response.status}`)
  }
  return response.text()
}

/** 解析 Prometheus 文本里只关心的两类指标。 */
export function parseMetrics(text) {
  const latency = {}
  const counters = {}
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const match = /^([a-zA-Z_:][\w:]*)\{([^}]*)\}\s+(\S+)$/.exec(line)
    if (!match) continue
    const [, name, rawLabels, rawValue] = match
    const value = Number(rawValue)
    if (!Number.isFinite(value)) continue
    const labels = {}
    for (const part of rawLabels.split(',')) {
      const eq = part.indexOf('=')
      if (eq === -1) continue
      labels[part.slice(0, eq).trim()] = part.slice(eq + 1).trim().replace(/^"|"$/g, '')
    }
    if (name === 'homeos_ha_sync_latency_ms' && labels.stage && labels.quantile) {
      latency[labels.stage] ||= {}
      latency[labels.stage][labels.quantile] = value
    } else if (name === 'homeos_ha_sync_latency_samples' && labels.stage) {
      latency[labels.stage] ||= {}
      latency[labels.stage].count = value
    } else if (name === 'homeos_ha_events_total' && labels.event) {
      counters[labels.event] = value
    }
  }
  return { latency, counters }
}

function fmt(value) {
  if (value === undefined || value === null || Number.isNaN(value)) return '—'
  return Number(value).toFixed(value >= 100 ? 0 : 1)
}

function printTable({ latency, counters }) {
  const stages = Object.keys(latency).sort()
  const rows = stages.map((stage) => {
    const s = latency[stage]
    return [
      stage,
      fmt(s.p50),
      fmt(s.p99),
      fmt(s.max),
      String(s.count ?? 0),
    ]
  })
  const header = ['stage', 'p50', 'p99', 'max', 'n']
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)))
  const format = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ')
  console.log(format(header))
  console.log(widths.map((w) => '-'.repeat(w)).join('  '))
  for (const row of rows) console.log(format(row))

  const events = Object.keys(counters).sort()
  if (events.length) {
    console.log('\ncounters:')
    for (const event of events) console.log(`  ${event.padEnd(18)} ${counters[event]}`)
  }
}

function checkAcceptance({ latency }) {
  const failures = []
  for (const [stage, limit] of Object.entries(ACCEPTANCE)) {
    const p99 = latency[stage]?.p99
    if (p99 === undefined) continue
    if (p99 > limit) failures.push(`${stage} p99=${fmt(p99)}ms > ${limit}ms`)
  }
  return failures
}

function diffAgainst(baseline, current) {
  const regressions = []
  for (const stage of Object.keys(current.latency)) {
    const before = baseline.latency?.[stage]?.p99
    const after = current.latency[stage]?.p99
    if (!before || after === undefined) continue
    const delta = ((after - before) / before) * 100
    if (delta > 25) regressions.push(`${stage} p99 ${fmt(before)}ms → ${fmt(after)}ms (+${delta.toFixed(0)}%)`)
  }
  return regressions
}

async function main() {
  const snapshot = parseMetrics(await fetchMetrics())
  printTable(snapshot)

  const failures = checkAcceptance(snapshot)
  for (const failure of failures) console.error(`\n超出验收线：${failure}`)

  const savePath = flag('save')
  if (savePath) {
    const fs = await import('node:fs')
    fs.writeFileSync(String(savePath), `${JSON.stringify(snapshot, null, 2)}\n`)
    console.log(`\n基线已写入 ${savePath}`)
  }

  const diffPath = flag('diff')
  if (diffPath) {
    const fs = await import('node:fs')
    const baseline = JSON.parse(fs.readFileSync(String(diffPath), 'utf8'))
    const regressions = diffAgainst(baseline, snapshot)
    if (regressions.length) {
      console.error('\n相对基线出现回归：')
      for (const line of regressions) console.error(`  ${line}`)
    } else {
      console.log('\n相对基线无显著回归（p99 阈值 +25%）')
    }
    if (regressions.length) process.exitCode = 1
  }

  if (failures.length) process.exitCode = 1
}

if (import.meta.main ?? process.argv[1]?.endsWith('ha-pipeline-baseline.mjs')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
