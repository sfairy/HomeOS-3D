import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..')
const CHECKER = path.join(REPO_ROOT, 'ops', 'checks', 'check_perf_budget.mjs')

/** 每个用例一份独立采样目录，互不干扰。 */
const roots = []
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

function makeResultsDir(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'homeos-perf-budget-'))
  roots.push(root)
  for (const [relative, payload] of Object.entries(files)) {
    const file = path.join(root, relative)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, typeof payload === 'string' ? payload : JSON.stringify(payload))
  }
  return root
}

function run(resultsDir) {
  const result = spawnSync(process.execPath, [CHECKER, '--results-dir', resultsDir], {
    encoding: 'utf8',
  })
  return { code: result.status, out: `${result.stdout}${result.stderr}` }
}

describe('check_perf_budget：缺数据不能算 PASS', () => {
  it('预算声明了 3D 相位但采样全是 null 时判 FAIL', () => {
    const dir = makeResultsDir({
      'bench_3d.json': {
        summary: { iframeReadyMs: null, stageMountedMs: null, averageFps: 60 },
      },
    })
    const { code, out } = run(dir)
    assert.equal(code, 1, out)
    assert.match(out, /FAIL\s+3d\.iframeReady\s+未采到/)
    assert.match(out, /FAIL\s+3d\.stageMounted\s+未采到/)
    // fps 有数据，照常判定
    assert.match(out, /PASS\s+3d\.averageFps/)
  })

  it('采集器声明 skip_reason 时记 SKIP 而不是 FAIL', () => {
    const dir = makeResultsDir({
      'bench_3d.json': {
        summary: { iframeReadyMs: null, stageMountedMs: null, averageFps: 60 },
        skip_reason: '登录墙：展示页重定向到 /login，未采到 [display-load]',
      },
      // 首页采样正常，门禁整体可判定；只有 3D 那几行是环境跳过
      'bench_frontend.json': { summary: { lcp: 500, cls: 0, encodedBodyTotal: 1_100_000 } },
    })
    const { code, out } = run(dir)
    assert.match(out, /SKIP\s+3d：登录墙/)
    assert.doesNotMatch(out, /^FAIL\s/m)
    assert.equal(code, 0, out)
  })

  it('只有跳过项、没有任何可判定指标时返回 3（整次采样等于没跑）', () => {
    const dir = makeResultsDir({
      'bench_3d.json': { summary: { iframeReadyMs: null }, skip_reason: '登录墙' },
    })
    const { code, out } = run(dir)
    assert.equal(code, 3, out)
  })

  it('商店采样缺失时输出 SKIP（storeHome 预算不再是一段没人读的配置）', () => {
    const dir = makeResultsDir({
      'bench_3d.json': { summary: { iframeReadyMs: 100, stageMountedMs: 100, averageFps: 60 } },
    })
    const { out } = run(dir)
    assert.match(out, /SKIP\s+storeHome：没有/)
  })

  it('商店采样存在且超预算时判 FAIL', () => {
    const dir = makeResultsDir({
      'bench_3d.json': { summary: { iframeReadyMs: 100, stageMountedMs: 100, averageFps: 60 } },
    })
    // run_baseline 把商店采样写在并列目录 <label>-store
    const storeSibling = `${dir}-store`
    roots.push(storeSibling)
    mkdirSync(storeSibling, { recursive: true })
    writeFileSync(path.join(storeSibling, 'bench_frontend.json'), JSON.stringify({ summary: { lcp: 9000, cls: 0.4 } }))
    const { code, out } = run(dir)
    assert.equal(code, 1, out)
    assert.match(out, /FAIL\s+storeHome\.LCP/)
    assert.match(out, /FAIL\s+storeHome\.CLS/)
  })

  it('端点多数返回 401 时记 SKIP，不把鉴权路径当成业务性能', () => {
    const dir = makeResultsDir({
      'bench_3d.json': { summary: { iframeReadyMs: 100, stageMountedMs: 100, averageFps: 60 } },
      'bench_backend.json': {
        config: { concurrency_total: 200, concurrency: 32 },
        endpoints: [
          {
            name: 'projects',
            path: '/api/v1/projects',
            sequential: { count: 100, p95_ms: 1.0 },
            concurrent: { count: 192, p95_ms: 30 },
            non_2xx: { 401: 292 },
          },
        ],
      },
    })
    const { out } = run(dir)
    assert.match(out, /SKIP\s+backend \/api\/v1\/projects：采样多数返回 401\/403/)
    assert.doesNotMatch(out, /backend projects seq p95/)
  })

  it('预算里有、采样里没有的端点也要说出来', () => {
    const dir = makeResultsDir({
      'bench_3d.json': { summary: { iframeReadyMs: 100, stageMountedMs: 100, averageFps: 60 } },
      'bench_backend.json': {
        config: { concurrency_total: 200, concurrency: 32 },
        endpoints: [
          {
            name: 'health',
            path: '/health/ready',
            sequential: { count: 100, p95_ms: 1.0 },
            concurrent: { count: 192, p95_ms: 10 },
            non_2xx: {},
          },
        ],
      },
    })
    const { out } = run(dir)
    assert.match(out, /SKIP\s+backend \/api\/v1\/projects\/\{projectId\}\/draft：本次采样没有这个端点/)
  })

  it('LCP=0 不算成绩：没有 LCP 候选时判 FAIL 而不是 0ms PASS', () => {
    const dir = makeResultsDir({
      'bench_frontend.json': { summary: { lcp: 0, fcp: 0, cls: 0, encodedBodyTotal: 400_000 } },
      'bench_3d.json': { summary: { iframeReadyMs: 100, stageMountedMs: 100, averageFps: 60 } },
    })
    const { code, out } = run(dir)
    assert.equal(code, 1, out)
    assert.match(out, /FAIL\s+frontend\.LCP\s+未采到：LCP=0/)
  })

  it('整个目录都没有采样时仍返回 3（门禁按 SKIP 处理）', () => {
    const dir = makeResultsDir({})
    const { code } = run(dir)
    assert.equal(code, 3)
  })
})
