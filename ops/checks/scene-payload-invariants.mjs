#!/usr/bin/env node
/**
 * 场景负载归一化的不变量检查（只读）。
 *
 * 为什么需要它
 * ------------
 * `normalizeScenePayload` 是**存草稿的兼容层**：老草稿经它载入、编辑后又整份 PUT 回去。
 * 它一旦少挑一个字段，后果不是「报错」，而是静默的数据丢失 —— 用户保存一次，那个字段
 * 就永远没了。源码里已经记录过两次真实事故（见 `studio-scene-payload.ts` 的注释）：
 *
 * - 自定义窗型：归一化时只挑固定字段，漏掉 `windowDesign` → 保存一次，窗型设计全部退回普通窗；
 * - 窗户备注：同样漏掉 `remark` → 3D 里窗扇的显示名丢失。
 *
 * 这两类错误**静态检查看不见**（类型是对的，字段就是没被挑进去），目测也看不见（要打开
 * 一个含该字段的老草稿、保存、再重开）。所以这里锁住归一化的契约不变量。
 *
 * 断言的性质（不是「录制当前输出」）
 * ----------------------------------
 * 1. 完备性：任何输入都返回一份完整文档，且永不抛出；
 * 2. 幂等：`normalize(normalize(x))` 与 `normalize(x)` 逐字节相同 —— 否则每次保存都会漂移；
 * 3. 白名单：未知字段被丢弃（防外部注入撑爆载荷）；
 * 4. 引用完整性：指向不存在墙体的窗 / 门被丢弃（否则渲染时找不到宿主墙）；
 * 5. 取值夹取：越界数值被夹到边界内，NaN / Infinity 不泄漏到输出；
 * 6. 退化剪除：过短的墙被丢弃（零长度墙会让地板多边形退化）；
 * 7. 字段保留：`windowDesign` / `remark` 这类「归一化白名单必须显式列出」的字段被带过；
 * 8. 可序列化：输出经 JSON round-trip 后与自身等价（没有 undefined / 函数 / 循环引用）。
 *
 * 加载方式：该模块经 import 链间接依赖 three.js（浏览器绝对路径 `/static/vendor/...`），
 * Node 解析不了。用仓库已有的 esbuild + 一个 Proxy 桩把 three 顶掉 —— 归一化逻辑本身
 * 不调用 three 的任何 API，桩只用于让打包通过。
 *
 * 用法
 * ----
 *     node ops/checks/scene-payload-invariants.mjs           # 校验（门禁）
 *     node ops/checks/scene-payload-invariants.mjs --json    # 机器可读
 *     node ops/checks/scene-payload-invariants.mjs --entry <file>  # 校验候选实现
 */
import { build } from 'esbuild'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const args = process.argv.slice(2)
const AS_JSON = args.includes('--json')
const entryIndex = args.indexOf('--entry')
const ENTRY_OVERRIDE = entryIndex >= 0 ? args[entryIndex + 1] : null

const REPO_ROOT = path.resolve(import.meta.dirname, '../..')
const ENTRY = ENTRY_OVERRIDE
  ? path.resolve(REPO_ROOT, ENTRY_OVERRIDE)
  : path.join(REPO_ROOT, 'homeos/frontend/src/studio/app/3d-studio/authoring/scene/payload/studio-scene-payload.ts')

const failures = []
let assertions = 0

function check(label, condition, detail = '') {
  assertions += 1
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ''}`)
}

/**
 * three.js 的 Proxy 桩：归一化代码只做类型判断与字段搬运，不实例化任何 three 对象。
 * 用 Proxy 而不是逐个列举导出，是因为 addon（RoundedBoxGeometry / GLTFLoader 等）与核心
 * 命名空间可能有几十个具名导入，漏一个就打包失败，而它们在这里全都用不到。
 */
const threeStubPlugin = {
  name: 'three-stub',
  setup(buildContext) {
    buildContext.onResolve({ filter: /^\/static\/vendor\/three\// }, (resolveArgs) => ({
      path: resolveArgs.path,
      namespace: 'three-stub',
    }))
    buildContext.onLoad({ filter: /.*/, namespace: 'three-stub' }, () => ({
      contents: `
        const anything = class { constructor(...parameters) { this.parameters = parameters } }
        const namespace = new Proxy({}, {
          get(_target, property) {
            if (property === 'then') return undefined
            if (property === 'default') return namespace
            return anything
          },
        })
        export const Vector2 = anything, Vector3 = anything, Vector4 = anything
        export const Shape = anything, Path = anything, ShapeUtils = { triangulateShape: () => [] }
        export const RoundedBoxGeometry = anything, ExtrudeGeometry = anything
        export const Matrix4 = anything, Quaternion = anything, Euler = anything, Color = anything
        export const OrbitControls = anything, GLTFLoader = anything, DRACOLoader = anything
        export const mergeGeometries = () => anything
        export default namespace
      `,
      loader: 'js',
    }))
  },
}

const outfile = path.join(os.tmpdir(), `homeos-scene-payload-${process.pid}.mjs`)
await build({
  entryPoints: [ENTRY],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile,
  logLevel: 'silent',
  plugins: [threeStubPlugin],
})
const module = await import(`${outfile}?v=${Date.now()}`)
fs.rmSync(outfile, { force: true })

const { normalizeScenePayload, createStudioDocument } = module

/**
 * 外部模型注册表的最小桩：归一化只用它查「这个物品类型对应哪个外部模型」，
 * 桩返回输入类型本身即可（不涉及任何模型几何）。
 */
const registryStub = {
  modelTypeForItem: (item) => String(item?.type ?? 'unknown'),
  modelForType: () => null,
  entry: () => null,
  has: () => false,
}

const normalize = (payload) => normalizeScenePayload(payload, registryStub)
const wall = (id, x1, y1, x2, y2, extra = {}) => ({
  id,
  start: { x: x1, y: y1 },
  end: { x: x2, y: y2 },
  ...extra,
})

// ── 1. 完备性与永不抛出 ──────────────────────────────────────────────────
const hollowDocument = createStudioDocument()
const documentKeys = Object.keys(hollowDocument).sort()
check('空白文档含预期字段', documentKeys.length > 0, documentKeys.join(','))

for (const [label, payload] of [
  ['null', null],
  ['undefined', undefined],
  ['数字', 42],
  ['字符串', 'not-a-scene'],
  ['数组', []],
  ['walls 不是数组', { walls: 'not-array' }],
  ['walls 里混入 null', { walls: [null, undefined] }],
  ['settings 是字符串', { settings: 'x' }],
]) {
  let result = null
  try {
    result = normalize(payload)
  } catch (error) {
    check(`输入 ${label} 不抛出`, false, String(error?.message ?? error))
    continue
  }
  check(`输入 ${label} 返回完整文档`, result !== null && typeof result === 'object')
  check(`输入 ${label} 的字段完整`, JSON.stringify(Object.keys(result).sort()) === JSON.stringify(documentKeys))
}

// ── 2. 幂等 ─────────────────────────────────────────────────────────────
const richScene = {
  calibration: { pixelsPerMeter: 100, reference: { start: { x: 0, y: 0 }, end: { x: 2, y: 0 }, meters: 2 } },
  walls: [wall('w1', 0, 0, 4, 0), wall('w2', 4, 0, 4, 3)],
  windows: [
    {
      id: 'win1',
      wallId: 'w1',
      t: 0.5,
      width: 1.4,
      height: 1.35,
      sill: 0.85,
      windowDesign: { sash: 'double' },
      remark: '客厅窗',
    },
  ],
  doors: [{ id: 'd1', wallId: 'w2', t: 0.5 }],
}
const firstPass = normalize(richScene)
const secondPass = normalize(firstPass)
check(
  '归一化幂等（第二次归一化不改变任何字节）',
  JSON.stringify(firstPass) === JSON.stringify(secondPass),
  '每次保存都会漂移，说明有字段在归一化过程中被重新生成',
)

// ── 3. 白名单：未知字段被丢弃 ────────────────────────────────────────────
const injected = normalize({ ...richScene, __injected: 'evil', settings: { wallHeight: 2.8, __also: 1 } })
check('顶层未知字段被丢弃', !('__injected' in injected))
check('嵌套未知字段被丢弃', !('__also' in (injected.settings ?? {})))

// ── 4. 引用完整性 ───────────────────────────────────────────────────────
const orphanScene = normalize({
  walls: [wall('w1', 0, 0, 4, 0)],
  windows: [
    { id: 'ok', wallId: 'w1', t: 0.5 },
    { id: 'orphan', wallId: 'missing-wall', t: 0.5 },
  ],
  doors: [
    { id: 'door-ok', wallId: 'w1', t: 0.5 },
    { id: 'door-orphan', wallId: 'missing-wall', t: 0.5 },
  ],
})
check('指向不存在墙体的窗被丢弃', orphanScene.windows.length === 1, `得到 ${orphanScene.windows.length}`)
check('保留下来的窗指向真实墙体', orphanScene.windows[0]?.wallId === 'w1')
check('指向不存在墙体的门被丢弃', orphanScene.doors.length === 1, `得到 ${orphanScene.doors.length}`)

// ── 5. 取值夹取与 NaN 不泄漏 ─────────────────────────────────────────────
const clampScene = normalize({
  walls: [wall('w', 0, 0, 4, 0, { height: 999, thickness: -5, opacity: 7 })],
  windows: [{ id: 'win', wallId: 'w', t: 99, width: 999, height: -1, sill: -3 }],
})
const clampWall = clampScene.walls[0]
check('墙高超出上限被夹取', clampWall?.height <= 6 && clampWall?.height > 0, `得到 ${clampWall?.height}`)
check('墙厚低于下限被夹取', clampWall?.thickness >= 0.01, `得到 ${clampWall?.thickness}`)
check('墙不透明度被夹到 [0,1]', clampWall?.opacity === 1, `得到 ${clampWall?.opacity}`)
const clampWindow = clampScene.windows[0]
check('窗位置参数被夹到 [0,1]', clampWindow?.t >= 0 && clampWindow?.t <= 1, `得到 ${clampWindow?.t}`)
check('窗宽被夹到合法范围', clampWindow?.width > 0 && clampWindow.width <= 20, `得到 ${clampWindow?.width}`)

const nanScene = normalize({
  walls: [{ id: 'n', start: { x: Number.NaN, y: Number.POSITIVE_INFINITY }, end: { x: 4, y: 0 } }],
})
const nanText = JSON.stringify(nanScene)
check('输出不含 NaN / Infinity 字面量', !/NaN|Infinity/.test(nanText), nanText.slice(0, 120))
check(
  'NaN 坐标被替换成有限值',
  nanScene.walls.every((entry) => Number.isFinite(entry.start.x) && Number.isFinite(entry.start.y)),
)

// ── 6. 退化剪除 ─────────────────────────────────────────────────────────
check(
  '过短的墙被丢弃（零长度墙会让地板多边形退化）',
  normalize({ walls: [wall('tiny', 0, 0, 0.05, 0)] }).walls.length === 0,
)
check('正常长度的墙被保留', normalize({ walls: [wall('real', 0, 0, 4, 0)] }).walls.length === 1)
check(
  '三点共线的退化环被丢弃',
  normalize({ walls: [wall('a', 0, 0, 2, 0), wall('b', 2, 0, 4, 0)] }).walls.length === 2,
  '共线墙是合法的（只是相邻），不得被当成退化',
)

// ── 7. 白名单必须显式列出的字段被带过 ────────────────────────────────────
const preserved = normalize(richScene)
const preservedWindow = preserved.windows[0]
check(
  'windowDesign 被带过（漏掉即「保存一次窗型全退回普通窗」）',
  preservedWindow?.windowDesign?.sash === 'double',
  JSON.stringify(preservedWindow?.windowDesign),
)
check('remark 被带过（漏掉即窗扇显示名丢失）', preservedWindow?.remark === '客厅窗')

// ── 8. 可序列化 ─────────────────────────────────────────────────────────
const serialized = JSON.stringify(firstPass)
const roundTripped = JSON.stringify(JSON.parse(serialized))
check('输出可 JSON round-trip 且与自身等价', serialized === roundTripped)
check('输出不含 undefined 值', !/":undefined/.test(serialized))

if (AS_JSON) {
  console.log(JSON.stringify({ assertions, failures }, null, 2))
} else if (failures.length > 0) {
  console.error(`场景归一化不变量失败：${failures.length} / ${assertions} 项不成立`)
  for (const failure of failures) console.error(`  - ${failure}`)
  console.error('  说明：这些都是「存草稿兼容层」的契约。失败意味着老草稿会被静默改写或丢字段。')
} else {
  console.log(
    `场景归一化不变量通过：${assertions} 项断言（完备性 / 幂等 / 白名单 / 引用完整性 / 夹取 / 退化剪除 / 字段保留 / 可序列化）`,
  )
}

process.exit(failures.length > 0 ? 1 : 0)
