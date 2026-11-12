/**
 * 「唯一权威实现」契约：相对时间 / 亮度百分比 / 音量百分比 / 通知单一数据源。
 *
 * 背景（审计 2026-10-31 HS-FE-15/16/19）：同一业务口径散落在多个文件里，各自悄悄
 * 长歪 —— 相对时间有 4 份实现（其中一份畸形时间戳会输出「NaN 天前」），brightness
 * 有 3 份（取整/夹取各不相同，乐观写入 37% 回读变 38%），通知同时存在 store 与
 * composable 两份列表（点 × 关不掉、按引用修改永不生效）。
 *
 * 收敛之后，这些口径只允许存在于各自的权威文件里；本测试同时校验行为与"没有第二份"。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const FRONTEND_SRC = new URL('../../../../homeos/frontend/src/', import.meta.url)
const root = resolve(import.meta.dirname, '../../../..')

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      return { url: new URL(specifier.slice(2), FRONTEND_SRC).href, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})

/** 动态 import 一个 src 下的 .ts 模块（Node 直接做类型剥离）。 */
async function importSrc(relativePath) {
  const url = new URL(relativePath, FRONTEND_SRC)
  return import(url.href)
}

const { formatRelativeFromNow, formatRelativeSecondsFromNow } = await importSrc(
  'shared/utils/format/locale-format.util.ts',
)
const { brightnessToPercent, lightBrightnessFromPct } = await importSrc(
  'shared/entity/utils/control/light-control-core.ts',
)
const { volumeLevelToPercent, volumeLevelFromPercent } = await importSrc(
  'shared/entity/utils/control/media-player-control-core.ts',
)

/** 距现在 ``elapsedMs`` 毫秒的 ISO 时间戳。 */
const ago = (elapsedMs) => new Date(Date.now() - elapsedMs).toISOString()

/**
 * 去掉注释后再做形态匹配：这些检查防的是「代码里又长出一份实现」，
 * 而收敛说明的注释里必然会引用被删掉的旧写法（``* 2.55``、``{...notification}``）。
 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** 递归收集某个相对目录下的源码文件（排除测试产物目录）。 */
function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      sourceFiles(rel, out)
    } else if (/\.(ts|vue|js)$/.test(entry.name)) out.push(rel)
  }
  return out
}

// ---------------------------------------------------------------- 相对时间

test('相对时间：60 秒内是「刚刚」，之后按分钟/小时/天分级', () => {
  assert.equal(formatRelativeFromNow(ago(5_000)), '刚刚')
  assert.equal(formatRelativeFromNow(ago(5 * 60_000 + 1_000)), '5 分钟前')
  assert.equal(formatRelativeFromNow(ago(3 * 3_600_000 + 1_000)), '3 小时前')
  assert.equal(formatRelativeFromNow(ago(5 * 86_400_000 + 1_000)), '5 天前')
})

test('相对时间：超过 30 天退回本地短日期，而不是无限「N 天前」', () => {
  const text = formatRelativeFromNow(ago(40 * 86_400_000))
  assert.ok(!text.includes('天前'), `40 天前应退回短日期，实际：${text}`)
  assert.match(text, /^\d{4}\/\d{1,2}\/\d{1,2}$/)
})

test('相对时间：空值与畸形时间戳落占位文案，绝不输出「NaN 天前」', () => {
  assert.equal(formatRelativeFromNow(null), '—')
  assert.equal(formatRelativeFromNow(undefined), '—')
  assert.equal(formatRelativeFromNow(''), '—')
  // 真实故障：早先的一份副本没有 Number.isNaN 校验，畸形 last_changed 会渲染成「NaN 天前」
  const malformed = formatRelativeFromNow('not-a-date')
  assert.equal(malformed, '—')
  assert.ok(!malformed.includes('NaN'))
  assert.equal(formatRelativeFromNow('not-a-date', ''), '')
})

test('秒级相对时间：首档细到秒，跨天交回绝对时刻', () => {
  assert.equal(formatRelativeSecondsFromNow(ago(5_000)), '刚刚')
  assert.equal(formatRelativeSecondsFromNow(ago(30_000)), '30 秒前')
  assert.equal(formatRelativeSecondsFromNow(ago(5 * 60_000 + 1_000)), '5 分钟前')
  assert.equal(formatRelativeSecondsFromNow(ago(3 * 3_600_000 + 1_000)), '3 小时前')

  const absolute = (ts) => `ABS:${new Date(ts).toISOString().slice(0, 10)}`
  const twoDaysAgo = ago(2 * 86_400_000)
  assert.equal(
    formatRelativeSecondsFromNow(twoDaysAgo, { absolute }),
    `ABS:${new Date(twoDaysAgo).toISOString().slice(0, 10)}`,
  )
  // 未来时间（时钟漂移）不算「刚刚」，同样交回绝对时刻
  assert.match(formatRelativeSecondsFromNow(Date.now() + 60_000, { absolute }), /^ABS:/)
})

// ---------------------------------------------------------------- 亮度 / 音量

test('brightness：0–255 与百分比互逆（0 与 255 仍落在有效区间）', () => {
  for (let pct = 0; pct <= 100; pct += 1) {
    assert.equal(brightnessToPercent(lightBrightnessFromPct(pct)), pct)
  }
  assert.equal(brightnessToPercent(255), 100)
  assert.equal(brightnessToPercent(-20), 0)
  assert.equal(brightnessToPercent(4096), 100)
  assert.equal(brightnessToPercent('nope'), null)
  // 关灯态没有 brightness 时滑块不能归零（否则下一次点亮会先闪到最暗）
  assert.equal(lightBrightnessFromPct(0), 1)
})

test('volume_level：0–1 与百分比互逆，且夹取到 0–100', () => {
  assert.equal(volumeLevelToPercent(0.37), 37)
  assert.equal(volumeLevelToPercent(1), 100)
  assert.equal(volumeLevelToPercent(-0.5), 0)
  assert.equal(volumeLevelToPercent(3), 100)
  assert.equal(volumeLevelToPercent(undefined), null)
  assert.equal(volumeLevelFromPercent(37), 0.37)
  assert.equal(volumeLevelFromPercent(120), 1)
  assert.equal(volumeLevelFromPercent(-1), 0)
  for (let pct = 0; pct <= 100; pct += 1) {
    assert.equal(volumeLevelToPercent(volumeLevelFromPercent(pct)), pct)
  }
})

// ---------------------------------------------------------------- 没有第二份

test('相对时间分级只允许存在于 locale-format.util', () => {
  const ladder = /`\$\{Math\.floor\([^`]*\)\} ?(?:秒|分钟|小时|天)前`/
  const offenders = sourceFiles('homeos/frontend/src').filter((file) =>
    ladder.test(stripComments(readFileSync(join(root, file), 'utf8'))),
  )
  assert.deepEqual(offenders, ['homeos/frontend/src/shared/utils/format/locale-format.util.ts'])
})

/**
 * studio imperative runtime 里允许直接做 brightness / volume 比例换算的文件。
 *
 * 这些位置算出来的是**滑块位置 / 3D 灯光强度**（0–100 小数百分比，不取整），不是
 * 「给用户看的百分之几」：取整会让滑块出现台阶、让灯光调光在低亮度段跳变。而且
 * 每一处消费方都会自己夹到 ≥1（`lighting.ts` 的 `Math.max(1, …)`、`syncLightSlider`
 * 的 `Math.max(sliderMinimum, …)`），所以「亮着的灯显示成 0%」不会发生。
 *
 * 用显式清单而不是整目录跳过：studio 目录本身也会长出**新的**重复实现（`light-state`
 * 的 `Math.max(1, round(…))` 就已经是第三套夹取口径），整目录 skip 等于把这块彻底放行。
 */
const STUDIO_FLOAT_PERCENT_ALLOWED = new Set([
  // 亮度滑块位置（小数百分比，滑块自己夹到 min=1 并取整显示）
  'homeos/frontend/src/studio/app/renderer/panel-seams/controls/light-controls.ts',
  // 灯光光晕强度 / 亮度读数
  'homeos/frontend/src/studio/app/renderer/panel-seams/details/entity-details.ts',
  'homeos/frontend/src/studio/app/renderer/panel-seams/popups/custom-popup.ts',
  'homeos/frontend/src/studio/app/renderer/registry/cover-climate-state.ts',
  // runtime 灯光状态（消费方 lighting.ts 自己夹到 1–100）
  'homeos/frontend/src/studio/runtime/light/light-state.ts',
  // 音量滑块与回读（同一个 input 的 value 与本地下发值互相比对）
  'homeos/frontend/src/studio/runtime/speaker/speaker-panel.ts',
])

test('亮度与音量换算只允许走各自的 control-core', () => {
  const offenders = sourceFiles('homeos/frontend/src').filter((file) => {
    if (file.includes('/shared/entity/utils/control/')) return false
    if (STUDIO_FLOAT_PERCENT_ALLOWED.has(file)) return false
    const text = stripComments(readFileSync(join(root, file), 'utf8'))
    // 直接对 brightness / volume_level 做比例换算，而不是调用 control-core
    return (
      /\/\s*255\s*\)\s*\*\s*100/.test(text) ||
      /\*\s*2\.55\b/.test(text) ||
      /Number\([^)]*volume_level[^)]*\)\s*\)?\s*\*\s*100/.test(text)
    )
  })
  assert.deepEqual(offenders, [])
})

test('studio 换算白名单只列真实存在的文件（防止清单腐烂成整目录放行）', () => {
  for (const file of STUDIO_FLOAT_PERCENT_ALLOWED) {
    assert.ok(existsSync(join(root, file)), `白名单里的文件已不存在：${file}`)
  }
})

test('通知中心只有一个数据源：没有本地副本、不克隆条目、写入走 store', () => {
  const composable = readFileSync(join(root, 'homeos/frontend/src/composables/widget/useNotificationCenter.ts'), 'utf8')
  // 只认「声明本地副本列表」这种形态：文档注释里提到被删掉的旧实现不算违规
  assert.ok(!/(const|let|var)\s+localNotifications\b/.test(composable), '通知中心不应再有本地副本列表')
  assert.ok(!composable.includes('.splice('), '通知列表的增删应走 store action，而不是直接改数组')

  const internals = stripComments(
    readFileSync(join(root, 'homeos/frontend/src/composables/widget/notification-center.filters.internals.ts'), 'utf8'),
  )
  assert.ok(
    !/\.\.\.\s*notification\b/.test(internals),
    '合并列表不得克隆条目：克隆会让「按引用修改已读状态」永远落不到数据源',
  )

  const store = readFileSync(join(root, 'homeos/frontend/src/stores/entities.store.ts'), 'utf8')
  for (const action of ['addRemoteNotification', 'removeRemoteNotification', 'restoreRemoteNotification']) {
    assert.ok(store.includes(action), `实体 store 应暴露 ${action}`)
  }
})
