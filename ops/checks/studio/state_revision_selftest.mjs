/**
 * 状态发布游标 + 生命周期计数清洗自检（纯函数，不依赖 DOM）。
 *
 * 为什么需要它：`createStateRevision` 修的是一个**画面不更新却没有任何报错**的 bug ——
 * 舞台的 `onPatch` 原地写入状态表（引用不变），早期用 `currentStates === lastPublishedStates`
 * 短路，等价于「永远没变化」，单实体的 `state_changed` 全部被吞掉（空调关机切制热必须刷新
 * 页面才看得见）。这种回归既不会让类型检查失败，也不会让构建失败，只能靠断言钉住。
 *
 * `sanitizeCounts` 同理：白名单 / 夹取一旦退化，上报里会混进 NaN 与负数，「慢帧」判定开始
 * 假阳性，同样静默。
 *
 * 用法：bun ops/checks/state_revision_selftest.mjs
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const CORE = 'homeos/frontend/src/studio/runtime/core'
const { createStateRevision } = await import(pathToFileURL(resolve(ROOT, CORE, 'state-revision.ts')).href)
const { sanitizeCounts, NUMERIC_COUNT_FIELDS } = await import(
  pathToFileURL(resolve(ROOT, CORE, 'lifecycle-counts.ts')).href
)

const CHECKS = []
function check(name, condition, detail = '') {
  if (!condition) throw new Error(`${name} 失败${detail ? `：${detail}` : ''}`)
  CHECKS.push(name)
}

// ── createStateRevision ──
{
  const revision = createStateRevision()
  check('初始状态必须视为未发布', revision.changed() === true)

  revision.markPublished()
  check('发布后不再有变化', revision.changed() === false)

  revision.bump()
  check('原地写入后必须感知到变化', revision.changed() === true)

  revision.markPublished()
  revision.bump()
  revision.bump()
  check('多次 bump 只需再发一次', revision.changed() === true)
  revision.markPublished()
  check('发布后变化归零', revision.changed() === false)

  revision.invalidate()
  check('invalidate 后必定重发', revision.changed() === true)

  // 两个实例互不影响（每个 3D 舞台各持一份）。
  const first = createStateRevision()
  const second = createStateRevision()
  first.bump()
  first.markPublished()
  check('实例之间不共享游标', first.changed() === false && second.changed() === true)
}

// ── sanitizeCounts ──
{
  const sanitized = sanitizeCounts({
    frameLoads: 12,
    durationMs: -5,
    width: Number.NaN,
    height: Number.POSITIVE_INFINITY,
    dpr: 2.5,
    pending: '7',
    replacementPending: true,
    persisted: 'yes',
    unknownField: 42,
  })
  check('正数原样保留', sanitized.frameLoads === 12)
  check('负数夹到 0', sanitized.durationMs === 0)
  check('NaN 丢弃', !('width' in sanitized))
  check('Infinity 丢弃', !('height' in sanitized))
  check('小数原样保留', sanitized.dpr === 2.5)
  check('字符串数字丢弃', !('pending' in sanitized))
  check('布尔字段保留', sanitized.replacementPending === true)
  check('非布尔字符串丢弃', !('persisted' in sanitized))
  check('白名单外字段丢弃', !('unknownField' in sanitized))

  check('超大值夹到上界', sanitizeCounts({ frameLoads: 1e15 }).frameLoads === 1_000_000_000)
  check('空入参返回空对象', Object.keys(sanitizeCounts()).length === 0)
  check('null 入参不抛错', Object.keys(sanitizeCounts(null)).length === 0)

  // 白名单本身：漏登记会让真实指标被静默丢弃。
  check('白名单含帧率关键指标', NUMERIC_COUNT_FIELDS.includes('frameLoads') && NUMERIC_COUNT_FIELDS.includes('dpr'))
  check('白名单不含布尔字段', !NUMERIC_COUNT_FIELDS.includes('persisted'))

  // 返回值必须是新对象（调用方会直接塞进上报体，不能被入参引用影响）。
  const source = { frameLoads: 3 }
  const copied = sanitizeCounts(source)
  copied.frameLoads = 9
  check('返回新对象而非入参', source.frameLoads === 3)
}

console.log(`状态发布游标自检通过：${CHECKS.length} 项`)
