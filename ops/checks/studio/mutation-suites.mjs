#!/usr/bin/env node
/**
 * 突变测试入口（`plan-geometry` / `scene-payload` 两组）。
 *
 * 为什么合并
 * ---------
 * 两组突变测试只有**突变表**不同：运行器（注入突变 → 跑检查器 → 还原）都在
 * `ops/lib/mutation-check.mjs`，CLI 外壳（解析参数、逐个跑、汇总退出码）完全一样。
 * 原先各占一个入口文件，第三个同类检查出现时就会长出第三份外壳，因此收成一个
 * `--suite` 入口。注意与运行器区分：那个是单数 `mutation-check.mjs`。
 *
 * 修正：两个旧入口的检查器路径都少了一层 `studio/`
 * -------------------------------------------------
 * 旧文件写的是 `ops/checks/plan-geometry-invariants.mjs` / `ops/checks/scene-payload-invariants.mjs`，
 * 而真实文件在 `ops/checks/studio/` 下。`execFileSync` 因此每次都因 MODULE_NOT_FOUND 退出 1，
 * 运行器把「检查器根本没启动」当成「突变被抓住了」—— 两组突变全程假绿，等于没有突变测试。
 * 这里统一指向真实路径。
 *
 * 两组突变各覆盖什么
 * ------------------
 * **`plan-geometry`**：证「多边形不变量检查」不是空壳。四个突变各代表一类真实事故：
 * 1. 差集吞掉 `holeLoops` —— 「挖了洞但面积没减」，庭院挖水池位置错；
 * 2. 并集丢弃额外环 —— 「两个房间合并后少了一间」，连通性判断错；
 * 3. 拆分丢掉最后一段 —— 墙段总长变短，地板边缘露到墙外；
 * 4. `polygonArea` 符号取反 —— 外环被当成洞，整块地板净面积为 0。
 * 前两个与第 4 个在 `plan/geometry-polygons.ts`（多边形内核后来从 `geometry.ts` 拆出），
 * 第 3 个仍在 `plan/geometry.ts`；运行器一次只接受一个源文件，因此分两个 case。
 *
 * **`scene-payload`**：证「场景归一化不变量检查」能抓住真实事故。前两个突变**逐字复现了
 * `studio-scene-payload.ts` 注释里记录过的真实事故**：
 * 1. 删掉 `windowDesign` 的搬运 —— 保存一次，自定义窗型全部退回普通窗；
 * 2. 删掉 `remark` 的搬运 —— 3D 里窗扇的显示名丢失。
 * 后三个覆盖引用完整性、取值夹取与退化剪除。
 *
 * 第二组（楼层文档净化，0.8.9 新字段）同源：白名单少挑一个字段，用户保存一次就永久丢失。
 * 它与场景层失败模式相同但文件不同，运行器一次只接受一个源文件，所以另列一个 case。
 *
 * 不进 `gate:static`（会临时改动源树），由人显式运行。
 *
 * 用法
 * ----
 *     node ops/checks/studio/mutation-suites.mjs                      # 两组都跑
 *     node ops/checks/studio/mutation-suites.mjs --suite plan-geometry
 *     node ops/checks/studio/mutation-suites.mjs --suite scene-payload
 */
import path from 'node:path'
import process from 'node:process'

import { reportMutationCheck, runMutationCheck } from '../../lib/mutation-check.mjs'

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..')

/** 每组的检查器（`--entry` 由运行器传入，指向同目录下的突变体）。 */
const CHECKERS = {
  'plan-geometry': 'ops/checks/studio/plan-geometry-invariants.mjs',
  'scene-payload': 'ops/checks/studio/scene-payload-invariants.mjs',
}

/**
 * 突变表：`source` 是仓库相对路径，`mutations[].find` 必须在源文件里唯一出现。
 * `note` 只出现在用法/日志里，用来区分同一检查器下的多个源文件。
 */
const SUITES = {
  'plan-geometry': [
    {
      note: '多边形布尔内核',
      source: 'homeos/frontend/src/studio/authoring/plan/geometry.ts',
      mutations: [
        {
          label: '差集忽略洞（subtract 吞掉 holeLoops）',
          find: '  return unionPolygonLoops(targetLoops, loopTolerance, holeLoops)',
          replace: '  return unionPolygonLoops(targetLoops, loopTolerance)',
        },
        {
          label: '并集丢弃额外环（additionalLoops 不参与）',
          find: 'for (const sourceLoop of [...primaryLoops, ...variantLoops])',
          replace: 'for (const sourceLoop of [...primaryLoops])',
        },
        {
          label: 'polygonArea 符号取反（外环被当成洞）',
          find: 'export function polygonArea(polygonPoints: any) {',
          replace:
            'export function polygonArea(polygonPoints: any) {\n  return -polygonAreaRaw(polygonPoints)\n}\nfunction polygonAreaRaw(polygonPoints: any) {',
        },
      ],
    },
    {
      note: '墙段拆分',
      source: 'homeos/frontend/src/studio/authoring/plan/geometry.ts',
      mutations: [
        {
          label: '拆分丢掉最后一段（墙段总长变短）',
          find: 'for (let splitIndex = 0; splitIndex < sortedSplitParams.length - 1; splitIndex += 1) {',
          replace: 'for (let splitIndex = 0; splitIndex < sortedSplitParams.length - 2; splitIndex += 1) {',
        },
      ],
    },
  ],
  'scene-payload': [
    {
      source: 'homeos/frontend/src/studio/authoring/scene/payload/studio-scene-payload.ts',
      mutations: [
        {
          label: '删掉 windowDesign 搬运（真实事故：窗型全退回普通窗）',
          find: '...(rawWindow?.windowDesign ? { windowDesign: structuredClone(rawWindow.windowDesign) } : {}),',
          replace: '',
        },
        {
          label: '删掉 remark 搬运（真实事故：窗扇显示名丢失）',
          find: "...(typeof rawWindow?.remark === 'string' && rawWindow.remark ? { remark: rawWindow.remark } : {}),",
          replace: '',
        },
        {
          label: '窗不再校验宿主墙（产生孤儿窗）',
          find: '.filter((windowCandidate: any) => wallIdSet.has(windowCandidate.wallId))',
          replace: '.filter(() => true)',
        },
        {
          label: '去掉数值夹取上限（越界值原样透传）',
          find: 'height: clamp2(finite2(rawWall?.height, rawScene.settings?.wallHeight || 2.8), 0.01, 6),',
          replace: 'height: finite2(rawWall?.height, rawScene.settings?.wallHeight || 2.8),',
        },
        {
          label: '去掉短墙剪除（零长度墙进入地板多边形）',
          find: '.filter((wallCandidate: any) => distance2(wallCandidate.start, wallCandidate.end) > 0.1)',
          replace: '.filter(() => true)',
        },
        {
          label: '删掉自定义装饰字段搬运（真实风险：装饰退化成普通桌子）',
          find: '...normalizeUserDecorationRecord(rawItemRecord),',
          replace: '',
        },
      ],
    },
    {
      note: '楼层文档净化（0.8.9 新字段）',
      source: 'homeos/frontend/src/studio/authoring/scene/payload/studio-document-payload.ts',
      mutations: [
        {
          label: '删掉 floorRegions 搬运（真实风险：保存一次全部铺面丢失）',
          find: 'floorRegions: normalizeFloorRegions(rawFloor?.floorRegions),',
          replace: 'floorRegions: [],',
        },
        {
          label: '删掉 floorFinishTones 搬运（真实风险：深浅档位丢失）',
          find: 'floorFinishTones: normalizeFloorTones(rawFloor?.floorFinishTones),',
          replace: 'floorFinishTones: { wood: 0, tile: 0 },',
        },
        {
          label: '删掉 lightRegionOverrides 搬运（真实风险：柔光范围无法共享）',
          find: 'lightRegionOverrides: normalizeLightRegionOverrides(rawDocument?.lightRegionOverrides),',
          replace: 'lightRegionOverrides: {},',
        },
      ],
    },
  ],
}

const SUITE_NAMES = Object.keys(SUITES)

function fail(message) {
  console.error(message)
  process.exit(2)
}

/** 解析 `--suite`；缺省（或 `all`）跑全部。非法值直接报错，不静默退回全部。 */
function parseSuiteArg(argv) {
  const index = argv.indexOf('--suite')
  if (index < 0) return SUITE_NAMES
  const value = argv[index + 1]
  if (!value) fail(`--suite 缺少取值。可选：${SUITE_NAMES.join(' / ')} / all`)
  if (value === 'all') return SUITE_NAMES
  if (!SUITE_NAMES.includes(value)) fail(`未知的 --suite：${value}。可选：${SUITE_NAMES.join(' / ')}`)
  return [value]
}

const argv = process.argv.slice(2)
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(
    [
      '突变测试入口（两组：plan-geometry / scene-payload）',
      '',
      '  node ops/checks/studio/mutation-suites.mjs                      # 两组都跑',
      '  node ops/checks/studio/mutation-suites.mjs --suite plan-geometry',
      '  node ops/checks/studio/mutation-suites.mjs --suite scene-payload',
      '',
      '每组会临时把突变体写进源文件同目录，并在 finally 里删除；退出码 1 表示有突变未被检出。',
    ].join('\n'),
  )
  process.exit(0)
}

const selected = parseSuiteArg(argv)
let failed = 0

for (const suiteName of selected) {
  const checker = path.join(REPO_ROOT, CHECKERS[suiteName])
  for (const testCase of SUITES[suiteName]) {
    console.log(`\n== ${suiteName}${testCase.note ? ` · ${testCase.note}` : ''} · ${testCase.source}`)
    const result = runMutationCheck({
      repoRoot: REPO_ROOT,
      source: path.join(REPO_ROOT, testCase.source),
      checker,
      mutations: testCase.mutations,
    })
    if (reportMutationCheck(result) !== 0) failed = 1
  }
}

process.exit(failed)
