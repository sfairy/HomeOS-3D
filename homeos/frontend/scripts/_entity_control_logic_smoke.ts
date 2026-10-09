/* eslint-disable no-console -- 冒烟脚本的唯一交付物就是控制台 PASS/FAIL 记录 */
/**
 * 实体控制 / 状态合并纯逻辑回归（P4 前端业务逻辑修复）。
 *
 * 守护的故障（每条都对应线上可复现的错误表现）：
 *  1. cover 的「运动中」判定用反向条件，`unavailable` / `unknown` 被当成运动中 → 离线窗帘永远转圈；
 *     `coverToggleService` 对不可用实体照发 open_cover。
 *  2. HA `hs_color` 是 HSV，`rgbToHs` 却用 HSL 饱和度公式 → 色盘回显位置与实体实际颜色对不上。
 *  3. 燃气 / 水表月年解析复用了电力字段名（monthEleNum / ele）→ 用气曲线渲染成用电量。
 *  4. 乐观更新期间「未确认」的服务端推送被整条丢弃 → 同实体其它真实属性变化（linkquality、
 *     当前温度等）要等下一次推送才恢复。
 *
 * 用法：``bun run scripts/_entity_control_logic_smoke.ts``（在 homeos/frontend 下执行）。
 */

import {
  coverIsMoving,
  coverToggleService,
} from '../src/composables/entity/control/cover-control-core'
import { hsvToRgb, rgbToHs } from '../src/composables/entity/control/light-control-core'
import {
  parseGasMonthItem,
  parseGasYearItem,
  parseWaterMonthItem,
  parseWaterYearItem,
} from '../src/composables/energy/utility-meter-parse-helpers'

const failures: string[] = []

function check(label: string, condition: boolean, detail: unknown = ''): void {
  console.log(`  [${condition ? 'PASS' : 'FAIL'}] ${label}${condition ? '' : ` ${String(detail)}`}`)
  if (!condition) failures.push(label)
}

/* ------------------------------------------------------------------ *
 * 1. cover 状态判定
 * ------------------------------------------------------------------ */

console.log('1. cover 运动态与 toggle 方向')

check('opening 判为运动中', coverIsMoving('opening') === true)
check('closing 判为运动中', coverIsMoving('closing') === true)
check('open 不是运动中', coverIsMoving('open') === false)
check('closed 不是运动中', coverIsMoving('closed') === false)
check('unavailable 不再被判为运动中', coverIsMoving('unavailable') === false)
check('unknown 不再被判为运动中', coverIsMoving('unknown') === false)
check('null 不是运动中', coverIsMoving(null) === false)

check('open → close_cover', coverToggleService('open') === 'close_cover')
check('opening → close_cover（反向）', coverToggleService('opening') === 'close_cover')
check('closed → open_cover', coverToggleService('closed') === 'open_cover')
check('closing → open_cover（反向）', coverToggleService('closing') === 'open_cover')
check('unavailable → null（不下发命令）', coverToggleService('unavailable') === null)
check('unknown → null（不下发命令）', coverToggleService('unknown') === null)
check('空状态 → null', coverToggleService('') === null)

/* ------------------------------------------------------------------ *
 * 2. HSV / RGB 互转
 * ------------------------------------------------------------------ */

console.log('2. HSV 饱和度（HA hs_color 语义）')

const desaturated = rgbToHs(200, 100, 100)
check(
  'rgb(200,100,100) 的饱和度为 HSV 的 50（HSL 公式会算成 48）',
  desaturated.s === 50,
  `s=${desaturated.s}`,
)
check('rgb(200,100,100) 的色相为 0', desaturated.h === 0, `h=${desaturated.h}`)
check('纯红饱和度 100', rgbToHs(255, 0, 0).s === 100)
check('纯绿色相 120', rgbToHs(0, 255, 0).h === 120)
check('灰色饱和度 0', rgbToHs(128, 128, 128).s === 0)

const backToRgb = hsvToRgb(rgbToHs(255, 128, 0).h, rgbToHs(255, 128, 0).s)
check(
  '橙色调色往返不漂移（±3）',
  Math.abs(backToRgb.r - 255) <= 3 &&
    Math.abs(backToRgb.g - 128) <= 3 &&
    Math.abs(backToRgb.b - 0) <= 3,
  JSON.stringify(backToRgb),
)
const preset = hsvToRgb(0, 100)
check('hsvToRgb(0,100) 为纯红', preset.r === 255 && preset.g === 0 && preset.b === 0, preset)

/* ------------------------------------------------------------------ *
 * 3. 燃气 / 水表月年字段解析
 * ------------------------------------------------------------------ */

console.log('3. 燃气 / 水表月年解析不串电力字段')

const mixedRow = { month: '2026-03', usage: 12.5, amount: 30, monthEleNum: 210, monthEleCost: 168 }
const gasMonth = parseGasMonthItem(mixedRow)
check('燃气月用量取 usage（不是 monthEleNum）', gasMonth._usage === 12.5, gasMonth._usage)
check('燃气月费用取 amount（不是 monthEleCost）', gasMonth._cost === 30, gasMonth._cost)

const eleOnlyRow = { month: '2026-03', monthEleNum: 210, monthEleCost: 168 }
const gasMonthEleOnly = parseGasMonthItem(eleOnlyRow)
check('只剩电力字段时燃气用量回退 0（不再误读 ele）', gasMonthEleOnly._usage === 0, gasMonthEleOnly._usage)

const gasYear = parseGasYearItem({ year: '2026', usage: 130, amount: 320, yearEleNum: 2100 })
check('燃气年用量取 usage', gasYear._usage === 130, gasYear._usage)
check('燃气年费用取 amount', gasYear._cost === 320, gasYear._cost)

const waterMonth = parseWaterMonthItem({ month: '2026-03', usage: 3.2, money: 12, monthEleNum: 210 })
check('水表月用量取 usage', waterMonth._usage === 3.2, waterMonth._usage)
check('水表月费用取 money', waterMonth._cost === 12, waterMonth._cost)

const waterYear = parseWaterYearItem({ year: '2026', usage: 41, money: 160 })
check('水表年用量取 usage', waterYear._usage === 41, waterYear._usage)
check('水表年费用取 money', waterYear._cost === 160, waterYear._cost)

/* ------------------------------------------------------------------ *
 * 4. 乐观更新期间未确认推送的字段级合并
 * ------------------------------------------------------------------ */

console.log('4. 未确认推送按字段合并')

const { applyEntityStateUpdate } = await import('../src/composables/entity/state-update')

type Entity = Record<string, unknown>
const entities: Record<string, Entity> = {
  'light.desk': {
    entity_id: 'light.desk',
    state: 'off',
    attributes: { brightness: 0, linkquality: 10 },
  },
}
// 构造「已挂起乐观预测：state=on, brightness=255」的场景
const optimistic = new Map<string, unknown>([
  [
    'light.desk',
    { backup: null, timer: null, expected: { state: 'on', attributes: { brightness: 255 } } },
  ],
])
entities['light.desk'] = {
  ...entities['light.desk'],
  state: 'on',
  attributes: { brightness: 255, linkquality: 10 },
  _optimistic: true,
}

let cleared = 0
let derivedPatches = 0
const deps = {
  entities,
  totalCount: { value: 1 },
  entityVisible: () => true,
  optimisticState: optimistic,
  clearOptimistic: () => {
    cleared += 1
  },
  scheduleRebuildDerived: () => undefined,
  patchDerivedChanges: () => {
    derivedPatches += 1
  },
  entitiesCacheHydrated: { value: true },
  schedulePersistEntityCache: () => undefined,
  markEntityCacheDirty: () => undefined,
  bumpEntityStateRevision: () => undefined,
  haStateChanged: () => true,
  shouldNotifyStateChange: () => false,
  resolveListenerOldState: () => null,
}

applyEntityStateUpdate(deps as unknown as Parameters<typeof applyEntityStateUpdate>[0], {
  entity_id: 'light.desk',
  old_state: { entity_id: 'light.desk', state: 'on' },
  new_state: {
    entity_id: 'light.desk',
    state: 'off',
    attributes: { brightness: 0, linkquality: 42 },
  },
} as never)

const merged = entities['light.desk']
check('未确认推送不再被整条丢弃（已写回缓存）', Boolean(merged), merged)
check('乐观预测字段保持预测值 state=on', merged?.state === 'on', merged?.state)
check(
  '乐观预测字段保持预测值 brightness=255',
  (merged?.attributes as Entity)?.brightness === 255,
  (merged?.attributes as Entity)?.brightness,
)
check(
  '推送中的无关属性 linkquality=42 已落地',
  (merged?.attributes as Entity)?.linkquality === 42,
  (merged?.attributes as Entity)?.linkquality,
)
check('仍未确认，乐观标记保留', merged?._optimistic === true)
check('未确认时不清除乐观条目', cleared === 0)
check('未确认时仍同步派生索引 patch', derivedPatches === 1)

// 与预测一致的推送应当确认并清除乐观标记
optimistic.set('light.desk', {
  backup: null,
  timer: null,
  expected: { state: 'on', attributes: { brightness: 255 } },
})
applyEntityStateUpdate(deps as unknown as Parameters<typeof applyEntityStateUpdate>[0], {
  entity_id: 'light.desk',
  old_state: { entity_id: 'light.desk', state: 'on' },
  new_state: { entity_id: 'light.desk', state: 'on', attributes: { brightness: 255 } },
} as never)
check('命中预测的推送清除乐观条目', cleared === 1, cleared)
check('命中预测后剥离 _optimistic 标记', entities['light.desk']?._optimistic !== true)

/* ------------------------------------------------------------------ */

console.log('')
if (failures.length > 0) {
  console.error(`实体控制逻辑回归失败：${failures.length} 项`)
  for (const label of failures) console.error(`  - ${label}`)
  process.exit(1)
}
console.log('实体控制逻辑回归全部通过。')
