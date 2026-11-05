/**
 * 舞台启动开关 + 分阶段计时的契约测试（路线图 `stage-fast-boot`）。
 *
 * 守三件事：
 * 1. `?light-cache=defer` 是**显式开启**：缺省、拼错、写 `baseline` 都必须回到「等烘焙贴图」
 *    的老路径。这是 A/B 的前提 —— 开关一旦默认打开，低端设备上的明暗跳变就没有回退手段。
 * 2. 首帧等待真的接到了这个开关上（`waitForStageReady` 读它、渲染循环按结果打不同标签）。
 *    这类接线最容易在「顺手重构」时被删掉，而删掉后**没有任何报错**：只是又慢回去了。
 * 3. 计时器同时产出 `performance.mark`（无条件）与 `[3D-load]` 控制台日志（仅诊断参数）。
 *    前者给 DevTools / CDP 用，后者是 `ops/perf/harness/bench_3d.mjs` 的既有采集口径，
 *    两者都不能在重构里丢掉其中一个。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const FLAGS = fileURLToPath(
  new URL('../../../../homeos/frontend/src/studio/app/3d-studio/authoring/boot/stage-boot-flags.ts', import.meta.url),
)
const LOAD_TIMING = fileURLToPath(
  new URL('../../../../homeos/frontend/src/studio/app/bridge/scene/load-timing.ts', import.meta.url),
)
const POINTER_TOOLS = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/studio/app/3d-studio/authoring/studio-app/functions/groups/pointer-input-and-tools.ts',
    import.meta.url,
  ),
)
const RENDER_LOOP = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/studio/app/3d-studio/authoring/studio-app/render/studio-render-loop.ts',
    import.meta.url,
  ),
)

const { readStageBootFlags, deferLightCacheEnabled } = await import(FLAGS)
const { createLoadTiming } = await import(LOAD_TIMING)

const source = (file) => readFileSync(file, 'utf8')

test('stage-boot-flags：默认等烘焙贴图，只有显式 defer 才跳过', () => {
  assert.equal(deferLightCacheEnabled({ location: { search: '' } }), false)
  assert.equal(deferLightCacheEnabled({ location: { search: '?foo=1' } }), false)
  assert.equal(deferLightCacheEnabled({ location: { search: '?light-cache=baseline' } }), false)
  assert.equal(deferLightCacheEnabled({ location: { search: '?light-cache=DEFER' } }), false)
  assert.equal(deferLightCacheEnabled({ location: { search: '?light-cache=defer' } }), true)
  // 与其它参数共存时仍要命中
  assert.equal(deferLightCacheEnabled({ location: { search: '?embed=1&light-cache=defer&x=2' } }), true)
})

test('stage-boot-flags：没有 location 也不抛（单测 / worker 环境）', () => {
  assert.deepEqual(readStageBootFlags({}), { deferLightCache: false })
  assert.doesNotThrow(() => readStageBootFlags(undefined))
})

test('waitForStageReady 接线到开关，且保留 1800ms 兜底', () => {
  const text = source(POINTER_TOOLS)
  assert.match(text, /import \{ deferLightCacheEnabled \} from '\.\.\/\.\.\/\.\.\/boot\/stage-boot-flags'/)
  assert.match(text, /const STAGE_READY_TIMEOUT_MS = 1800/)
  const body = text.slice(text.indexOf('export async function waitForStageReady'))
  assert.match(body.slice(0, body.indexOf('export function jumpWorkflowStep')), /deferLightCacheEnabled\(\)/)
})

test('渲染循环按实际结果打标签，A/B 两组的梯子可比较', () => {
  const text = source(RENDER_LOOP)
  assert.match(text, /isLightCacheReady = await waitForStageReady\(\)/)
  assert.match(text, /'light-cache-deferred'/)
  // 旧的秒等写法不能再出现（它会把延迟模式的等待又加回来）
  assert.equal(/await waitForStageReady\(\),\n\s*isCurrentAppInstance/.test(text), false)
})

test('计时器：无条件打 mark，控制台仅诊断参数下打印', () => {
  const marks = []
  const logged = []
  const baseHost = {
    location: { search: '' },
    console: { info: (...args) => logged.push(args) },
    performance: { now: () => 42, mark: (name) => marks.push(name) },
  }

  const timing = createLoadTiming('stage', baseHost)
  timing('stage-mounted')
  assert.deepEqual(marks, ['homeos:3d:stage:stage-mounted'])
  assert.equal(logged.length, 0)

  const diagnosticTiming = createLoadTiming('stage', {
    ...baseHost,
    location: { search: '?performance-diagnostics=1' },
  })
  diagnosticTiming('first-screen-ready')
  assert.deepEqual(marks, ['homeos:3d:stage:stage-mounted', 'homeos:3d:stage:first-screen-ready'])
  assert.equal(logged.length, 1)
  assert.equal(logged[0][0], '[3D-load]')
  assert.equal(JSON.parse(logged[0][1]).phase, 'first-screen-ready')
})

test('计时器：mark 不可用时吞掉异常，不影响启动', () => {
  const host = {
    location: { search: '' },
    console: { info() {} },
    performance: {
      now: () => 0,
      mark: () => {
        throw new Error('not supported')
      },
    },
  }
  assert.doesNotThrow(() => createLoadTiming('stage', host)('stage-mounted'))
})
