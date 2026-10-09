/* eslint-disable no-console -- 冒烟脚本的唯一交付物就是控制台 PASS/FAIL 记录 */
/**
 * 场景更新计划（sceneUpdatePlan）纯逻辑回归（P5 性能优化）。
 *
 * 守护的改动：这份 diff 原来对整份场景做两轮 `sortDeep`（每层排序 + `Object.fromEntries`
 * 重建）再各序列化成一个长字符串，编辑一次场景就是两次全量深拷贝 + 两次长字符串比较。
 * 换成结构化比较之后结论必须一致 —— 这里逐条钉住判定口径：
 *
 *  1. 逻辑相等（键顺序不同 / 新对象引用）→ 不算变更；
 *  2. 视图类设置（VIEW_SETTING_KEYS，如 planViewRotation 缩放旋转）变化 → 不算楼层内容变更；
 *  3. 楼层场景内容变化 → 该楼层进入 floors，且 full/visual 为真；
 *  4. 楼层身份字段（name / aligned 等）变化、楼层增删 → full 为真；
 *  5. baseLighting 变化 → lighting 为真；
 *  6. 保守口径：`undefined` 字段、NaN 一律判为「不相等」（旧版按 JSON 语义会判相等，
 *     宁可多报一次变更也不能漏报场景变化）。
 *
 * 用法：``bun run scripts/_scene_update_plan_smoke.ts``（在 homeos/frontend 下执行）。
 */

import { sceneUpdatePlan } from '../src/studio/app/bridge/scene/scene-update'

const failures: string[] = []

function check(label: string, condition: boolean, detail: unknown = ''): void {
  console.log(`  [${condition ? 'PASS' : 'FAIL'}] ${label}${condition ? '' : ` ${String(detail)}`}`)
  if (!condition) failures.push(label)
}

/** 造一份最小可用场景：一层楼 + 一个视图设置 + 一份光照。 */
function scene(overrides: Record<string, unknown> = {}) {
  return {
    name: '我的家',
    floors: [
      {
        id: 'floor-1',
        name: '一楼',
        aligned: true,
        scene: { shapes: [{ id: 'shape-1', x: 1, y: 2 }], settings: { planViewRotation: 0 } },
      },
    ],
    baseLighting: { intensity: 0.5 },
    ...overrides,
  }
}

/* ------------------------------------------------------------------ *
 * 1. 逻辑相等不报变更
 * ------------------------------------------------------------------ */

console.log('1. 逻辑相等的判定')

check(
  '同一份内容但新引用 → 无任何变更',
  JSON.stringify(sceneUpdatePlan(scene(), scene())) ===
    JSON.stringify({ full: false, floors: [], lighting: false, visual: false }),
  sceneUpdatePlan(scene(), scene()),
)

const reordered = scene()
// 打乱键顺序（并重建嵌套对象）：结构化比较不应受顺序影响
reordered.baseLighting = { intensity: 0.5 }
reordered.floors[0].scene.settings = { planViewRotation: 0 }

check(
  '键顺序不同不算变更',
  sceneUpdatePlan(scene(), reordered).visual === false,
  sceneUpdatePlan(scene(), reordered),
)

/* ------------------------------------------------------------------ *
 * 2. 视图设置变化不算楼层内容变更
 * ------------------------------------------------------------------ */

console.log('2. 视图设置（交互态）不触发楼层更新')

const rotated = scene()
rotated.floors[0].scene.settings = { planViewRotation: 42 }

check('planViewRotation 变化不进入 floors', sceneUpdatePlan(scene(), rotated).floors.length === 0)
check('planViewRotation 变化不触发 visual', sceneUpdatePlan(scene(), rotated).visual === false)

/* ------------------------------------------------------------------ *
 * 3. 楼层内容变化
 * ------------------------------------------------------------------ */

console.log('3. 楼层内容变化')

const moved = scene()
moved.floors[0].scene.shapes = [{ id: 'shape-1', x: 9, y: 2 }]

const movedPlan = sceneUpdatePlan(scene(), moved)
check('改坐标 → floors 命中该层', JSON.stringify(movedPlan.floors) === JSON.stringify(['floor-1']))
// 几何内容变化只走「按楼层重建」，shared 部分（full）刻意不置位：full 表示整份场景重建。
check('改坐标 → full 保持 false（只重建该层）', movedPlan.full === false)
check('改坐标 → visual 为真', movedPlan.visual === true)
check('改坐标 → lighting 不受影响', movedPlan.lighting === false)

/* ------------------------------------------------------------------ *
 * 4. 楼层身份变化与增删
 * ------------------------------------------------------------------ */

console.log('4. 楼层身份字段 / 增删')

const renamed = scene()
renamed.floors[0] = { ...renamed.floors[0], name: '二楼' }
const renamedPlan = sceneUpdatePlan(scene(), renamed)

// 改名不在本函数的判定范围内：调用方在「无场景变化」分支里直接用服务端文档覆盖楼层名
// （见 studio-app 的 loadedFloor.name 同步），所以这里既不该 full 也不该进 floors。
check('楼层改名 → full 为 false', renamedPlan.full === false)
check('楼层改名 → 不触发楼层重建', renamedPlan.floors.length === 0)
check('楼层改名 → visual 为 false', renamedPlan.visual === false)

const added = scene()
added.floors = [
  ...added.floors,
  { id: 'floor-2', name: '二楼', aligned: false, scene: { shapes: [], settings: {} } },
]

const addedPlan = sceneUpdatePlan(scene(), added)
check('新增楼层 → full 为真', addedPlan.full === true)
check(
  '新增楼层 → 新楼层进入 floors',
  JSON.stringify(addedPlan.floors) === JSON.stringify(['floor-2']),
  addedPlan.floors,
)

check(
  '删除楼层 → full 为真',
  sceneUpdatePlan(added, scene()).full === true,
)

/* ------------------------------------------------------------------ *
 * 5. 光照变化
 * ------------------------------------------------------------------ */

console.log('5. 光照变化')

const lit = scene()
lit.baseLighting = { intensity: 0.9 }

const litPlan = sceneUpdatePlan(scene(), lit)
check('光照变化 → lighting 为真', litPlan.lighting === true)
check('光照变化 → visual 为真', litPlan.visual === true)
check('光照变化不算楼层内容变更', litPlan.floors.length === 0)

/* ------------------------------------------------------------------ *
 * 6. 保守口径（宁可多报，不可漏报）
 * ------------------------------------------------------------------ */

console.log('6. 保守口径')

const withUndefined = scene()
withUndefined.floors[0].scene = { shapes: [{ id: 'shape-1', x: 1, y: 2, z: undefined }] }
const withoutZ = scene()

check(
  'undefined 字段：判为不相等（多报 → 该层重建）',
  sceneUpdatePlan(withoutZ, withUndefined).floors.includes('floor-1'),
  sceneUpdatePlan(withoutZ, withUndefined),
)

const withNaN = scene()
withNaN.floors[0].scene = { shapes: [{ id: 'shape-1', x: Number.NaN, y: 2 }] }
const withNullX = scene()
withNullX.floors[0].scene = { shapes: [{ id: 'shape-1', x: null, y: 2 }] }

check(
  'NaN 与 null：判为不相等（多报 → 该层重建）',
  sceneUpdatePlan(withNullX, withNaN).floors.includes('floor-1'),
  sceneUpdatePlan(withNullX, withNaN),
)

const sameReferencePlan = sceneUpdatePlan(withNaN, withNaN)
check(
  '同一份引用 → 不报变更（引用短路）',
  sameReferencePlan.full === false && sameReferencePlan.floors.length === 0,
  sameReferencePlan,
)

/* ------------------------------------------------------------------ *
 * 结果
 * ------------------------------------------------------------------ */

console.log('')
if (failures.length) {
  console.log(`场景更新计划回归失败：${failures.length} 项`)
  for (const label of failures) console.log(`  - ${label}`)
  process.exit(1)
}
console.log('场景更新计划回归全部通过（18 项）。')
