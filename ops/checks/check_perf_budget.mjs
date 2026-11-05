#!/usr/bin/env node
/**
 * 运行期性能预算校验：读 `ops/perf/results/<label>/` 的采样，对照 `ops/perf/perf-budget.json`。
 *
 * 设计取舍
 * --------
 * - **没有采样就 SKIP（退出码 3）**，不是静默 PASS。性能预算需要真实跑一次 harness，
 *   CI 的每次构建都跑既慢又噪声大；跑到哪一步就验到哪一步，缺数据必须显式说出来。
 * - 只拦**大幅回退**。本机 LCP 自身漂移 11.7%~19.8%（docs/perf §1.3），把阈值卡在实测值
 *   上会天天红，最后所有人都学会忽略这条门禁 —— 那等于没有门禁。
 * - 字节类指标（encodedBodySize）是确定性的，按实测值卡；毫秒类按上限卡。
 *
 * 用法
 * ----
 * ```bash
 * node ops/checks/check_perf_budget.mjs                       # 读 results/latest
 * node ops/checks/check_perf_budget.mjs --label before-1101
 * node ops/checks/check_perf_budget.mjs --results-dir /tmp/x
 * ```
 * 退出码：0 通过，1 超预算，3 无数据（门禁里按 SKIP 处理）。
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..')
const BUDGET_PATH = path.join(REPO_ROOT, 'ops', 'perf', 'perf-budget.json')

function parseArgs(argv) {
  const options = { label: 'latest', resultsDir: '' }
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--label') options.label = argv[++index]
    else if (arg.startsWith('--label=')) options.label = arg.slice('--label='.length)
    else if (arg === '--results-dir') options.resultsDir = argv[++index]
    else if (arg.startsWith('--results-dir=')) options.resultsDir = arg.slice('--results-dir='.length)
    else {
      console.error(`未知参数：${arg}`)
      process.exit(2)
    }
  }
  return options
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/**
 * 预算声明了、但采样里没有这个数字时的行。
 *
 * 这是本门禁最容易骗过自己的一种情形：`typeof summary.x !== 'number'` 让 `rows` 少一行，
 * 汇总里就只显示 "4 PASS / 0 FAIL"，看起来全绿，实际上有预算项从未参与判定
 * （`3d.iframeReady` 就长期如此——采样里全是 `null`）。缺数据必须变成一条 FAIL 行。
 */
function missingRow(name, limit, unit, reason) {
  return { name, actual: Number.NaN, limit, unit, note: reason }
}

/**
 * LCP 是否是「真采到」。
 *
 * `lcp: 0` 不是「闪电般快」，而是「一条 LCP 候选都没有」——页面没挂载 / 只画了纯色底 /
 * 观测器被导航冲掉，都会得到 0。把 0 当成绩计入，就会得到「0ms / 上限 2600ms PASS」
 * 这种最危险的结论：看起来最好，其实什么都没测。
 */
function lcpMissed(summary) {
  return typeof summary.lcp !== 'number' || summary.lcp <= 0
}

/** 采样目录缺失/整块跳过时的说明（打印出来，别让它变成"没这回事"）。 */
const skipped = []

/** @returns {{name: string, actual: number, limit: number, unit: string}[]} */
function checkFrontend(frontendDir, budget) {
  const rows = []
  const files = existsSync(frontendDir) ? ['bench_frontend.json'] : []
  for (const name of files) {
    const payload = readJson(path.join(frontendDir, name))
    if (!payload?.summary) continue
    const summary = payload.summary
    if (payload.skip_reason) {
      skipped.push(`frontend：${payload.skip_reason}`)
      continue
    }
    if (budget.lcpMs) {
      rows.push(
        lcpMissed(summary)
          ? missingRow('frontend.LCP', budget.lcpMs, 'ms', '未采到：LCP=0 表示页面没有产生 LCP 候选')
          : { name: 'frontend.LCP', actual: summary.lcp, limit: budget.lcpMs, unit: 'ms' },
      )
    }
    if (budget.cls) {
      if (typeof summary.cls === 'number') {
        rows.push({ name: 'frontend.CLS', actual: summary.cls, limit: budget.cls, unit: '' })
      } else {
        rows.push(missingRow('frontend.CLS', budget.cls, '', '未采到：采样里没有 CLS 数值'))
      }
    }
    if (budget.encodedBodyBytes) {
      if (typeof summary.encodedBodyTotal === 'number') {
        rows.push({
          name: 'frontend.encodedBody',
          actual: summary.encodedBodyTotal,
          limit: budget.encodedBodyBytes,
          unit: 'B',
        })
      } else {
        rows.push(
          missingRow('frontend.encodedBody', budget.encodedBodyBytes, 'B', '未采到：采样里没有 encodedBodyTotal'),
        )
      }
    }
  }
  return rows
}

/**
 * 商店首页（homeos-store）。
 *
 * 采样目录是 `<homeos 结果目录>-store`：`run_baseline.sh` 用 `--label <label>-store`
 * 跑第二份采样，因此两者永远并列。这份预算以前只写在 JSON 里、没有任何代码读它——
 * 属于"看起来有门禁，其实没跑"。
 */
function checkStoreHome(homeosDir, budget) {
  const storeDir = `${homeosDir}-store`
  if (!existsSync(path.join(storeDir, 'bench_frontend.json'))) {
    skipped.push(`storeHome：没有 ${path.basename(storeDir)}/bench_frontend.json（跑 harness 时给 STORE_URL）`)
    return []
  }
  const payload = readJson(path.join(storeDir, 'bench_frontend.json'))
  if (!payload?.summary) return []
  if (payload.skip_reason) {
    skipped.push(`storeHome：${payload.skip_reason}`)
    return []
  }
  const summary = payload.summary
  const rows = []
  if (budget.lcpMs) {
    rows.push(
      lcpMissed(summary)
        ? missingRow(
            'storeHome.LCP',
            budget.lcpMs,
            'ms',
            '未采到：LCP=0 表示商店首页没有产生 LCP 候选（应用未挂载 / 只画了底色）',
          )
        : { name: 'storeHome.LCP', actual: summary.lcp, limit: budget.lcpMs, unit: 'ms' },
    )
  }
  if (budget.cls) {
    rows.push(
      typeof summary.cls === 'number'
        ? { name: 'storeHome.CLS', actual: summary.cls, limit: budget.cls, unit: '' }
        : missingRow('storeHome.CLS', budget.cls, '', '未采到：商店首页采样里没有 CLS 数值'),
    )
  }
  return rows
}

function checkStage(stageDir, budget) {
  const payload = readJson(path.join(stageDir, 'bench_3d.json'))
  if (!payload?.summary) return []
  // 采集器自己说明「这次没采到相位」（例如展示页被登录墙挡住）时按跳过处理：
  // 这时数字不存在是环境问题，判 FAIL 只会训练大家忽略门禁。
  if (payload.skip_reason) {
    skipped.push(`3d：${payload.skip_reason}`)
    return []
  }
  const summary = payload.summary
  const rows = []
  if (budget.iframeReadyMs) {
    rows.push(
      typeof summary.iframeReadyMs === 'number'
        ? { name: '3d.iframeReady', actual: summary.iframeReadyMs, limit: budget.iframeReadyMs, unit: 'ms' }
        : missingRow(
            '3d.iframeReady',
            budget.iframeReadyMs,
            'ms',
            '未采到：bench_3d 没拿到 first-screen-ready（预算此前从未真正生效）',
          ),
    )
  }
  if (budget.stageMountedMs) {
    rows.push(
      typeof summary.stageMountedMs === 'number'
        ? { name: '3d.stageMounted', actual: summary.stageMountedMs, limit: budget.stageMountedMs, unit: 'ms' }
        : missingRow('3d.stageMounted', budget.stageMountedMs, 'ms', '未采到：bench_3d 没拿到 stage-mounted'),
    )
  }
  if (budget.averageFps) {
    // FPS 是"越大越好"，用负数把方向折成统一的上限语义
    rows.push(
      typeof summary.averageFps === 'number'
        ? { name: '3d.averageFps', actual: -summary.averageFps, limit: -budget.averageFps, unit: '' }
        : missingRow('3d.averageFps', -budget.averageFps, '', '未采到：bench_3d 没拿到帧率样本'),
    )
  }
  return rows
}

function checkBackend(backendDir, budget) {
  const payload = readJson(path.join(backendDir, 'bench_backend.json'))
  if (!payload?.endpoints) return []
  const rows = []

  /**
   * 并发口径校验：`concurrent p95` **完全由并发度决定**，不是端点固有属性。
   *
   * 同一台机器、同一个 `/health/ready`，实测（2026-11-05）：
   *   30 总请求 / 10 线程 → 5.9ms；200 总请求 / 32 线程 → 19.3ms。
   * 预算里写 15ms 而采样跑的是 200/32 时，这条门禁永远红 —— 而且红得「有道理」：
   * 它拦的不是回退，是**口径漂移**。历史上 smoke 采样用的是轻口径（30/10），
   * 于是 3.17ms 的读数被误当成了「默认口径下的基线」。
   *
   * 所以预算必须同时声明口径，采样口径不符时按失败处理并说清差在哪 ——
   * 否则调低/调高阈值都只是把噪声搬个地方。
   */
  const caliber = budget.caliber
  const sampled = payload.config
  if (caliber && sampled) {
    const pairs = [
      ['concurrencyTotal', sampled.concurrency_total],
      ['concurrency', sampled.concurrency],
    ]
    const drift = pairs.filter(([key, actual]) => Number(caliber[key]) !== Number(actual))
    if (drift.length) {
      const detail = drift.map(([key, actual]) => `${key}=${actual}（预算 ${caliber[key]}）`).join(' / ')
      rows.push({
        name: 'backend 并发口径',
        actual: Number.NaN,
        limit: Number.NaN,
        unit: '',
        note: `采样口径与预算不一致：${detail}。并发 p95 随并发度线性变化，口径不同则数字不可比。`,
      })
    }
  }

  for (const endpoint of payload.endpoints) {
    const limit = budget.endpoints?.[endpoint.path] ?? budget.endpoints?.[endpoint.name]
    if (!limit) continue
    // 鉴权被挡时测到的是「验证守卫」而不是「业务处理器」，把它算成 PASS/FAIL 都是误导。
    // 这类端点必须带 COOKIE 才有意义，缺了就说清楚（否则 projects/draft 的预算形同虚设）。
    const statuses = endpoint.non_2xx ?? {}
    const denied = Number(statuses['401'] ?? 0) + Number(statuses['403'] ?? 0)
    const total = Number(endpoint.sequential?.count ?? 0) + Number(endpoint.concurrent?.count ?? 0)
    if (denied > 0 && total > 0 && denied >= total / 2) {
      skipped.push(`backend ${endpoint.path}：采样多数返回 401/403，未测到业务路径（需要 COOKIE）`)
      continue
    }
    if (typeof endpoint.sequential?.p95_ms === 'number' && limit.sequentialP95Ms) {
      rows.push({
        name: `backend ${endpoint.name} seq p95`,
        actual: endpoint.sequential.p95_ms,
        limit: limit.sequentialP95Ms,
        unit: 'ms',
        note: `n=${endpoint.sequential.count}`,
      })
    }
    if (typeof endpoint.concurrent?.p95_ms === 'number' && limit.concurrentP95Ms) {
      rows.push({
        name: `backend ${endpoint.name} conc p95`,
        actual: endpoint.concurrent.p95_ms,
        limit: limit.concurrentP95Ms,
        unit: 'ms',
        note: `n=${endpoint.concurrent.count} @${sampled?.concurrency ?? '?'} 线程`,
      })
    }
  }
  // 预算里声明了、采样里却没有的端点：同样不能静默放过。
  // （默认 ENDPOINTS 曾经只有 /health/ready，另外三条预算就此从未参与判定。）
  const sampledPaths = new Set(payload.endpoints.map((endpoint) => endpoint.path))
  const sampledNames = new Set(payload.endpoints.map((endpoint) => endpoint.name))
  for (const [key, limit] of Object.entries(budget.endpoints ?? {})) {
    if (sampledPaths.has(key) || sampledNames.has(key)) continue
    const needsAuth = Boolean(limit.sequentialP95Ms || limit.concurrentP95Ms)
    skipped.push(
      `backend ${key}：本次采样没有这个端点，预算未判定${needsAuth ? '（含登录需求的端点请显式加 ENDPOINTS + COOKIE）' : ''}`,
    )
  }
  return rows
}

function main() {
  const options = parseArgs(process.argv)
  const budget = readJson(BUDGET_PATH)
  if (!budget) {
    console.error(`预算文件不可读：${BUDGET_PATH}`)
    return 2
  }
  const resultsDir = options.resultsDir
    ? path.resolve(options.resultsDir)
    : path.join(REPO_ROOT, 'ops', 'perf', 'results', options.label)

  const rows = [
    ...checkFrontend(resultsDir, budget.frontend ?? {}),
    ...checkStoreHome(resultsDir, budget.storeHome ?? {}),
    ...checkStage(resultsDir, budget.stage3d ?? {}),
    ...checkBackend(resultsDir, budget.backend ?? {}),
  ]

  for (const note of skipped) console.log(`SKIP  ${note}`)

  if (!rows.length) {
    console.log(`没有可校验的采样：${path.relative(REPO_ROOT, resultsDir)}`)
    console.log('先跑 `bun run perf:baseline -- <label>`（或 node ops/perf/harness/run_baseline.sh <label>）。')
    return 3
  }

  let failed = 0
  for (const row of rows) {
    const unit = row.unit ? ` ${row.unit}` : ''
    if (row.note && Number.isNaN(row.actual)) {
      failed += 1
      console.log(`FAIL  ${row.name.padEnd(28)} ${row.note}`)
      continue
    }
    const actual = row.name === '3d.averageFps' ? -row.actual : row.actual
    const limit = row.name === '3d.averageFps' ? -row.limit : row.limit
    const over = row.name === '3d.averageFps' ? actual < limit : actual > limit
    const suffix = row.note ? `  (${row.note})` : ''
    console.log(
      `${over ? 'FAIL' : 'PASS'}  ${row.name.padEnd(28)} ${String(actual).padStart(9)}${unit}  / 上限 ${limit}${unit}${suffix}`,
    )
    if (over) failed += 1
  }
  console.log(`--- 性能预算：${rows.length - failed} PASS / ${failed} FAIL（${resultsDir}）`)
  return failed ? 1 : 0
}

process.exit(main())
