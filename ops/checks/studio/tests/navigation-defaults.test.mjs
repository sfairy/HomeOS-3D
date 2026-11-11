/**
 * 「默认显示」（`navigationDefaults`）的契约测试。
 *
 * 这段配置最典型的失败模式是「只写不读」：检查器把打开楼层 / 分类写进组件属性，
 * 舞台却只认 `properties.floorSelection`，改完刷新回来还是上次停留的页面 ——
 * 用户看到的就是「这个功能设置没效果」。这里钉死：
 *
 * - 「3D（总览）」也是合法的打开分类（它没有设备配置，但舞台永远有该页签）；
 * - 未配置时打开停在总览，且下拉显示的回落值与实际行为一致；
 * - `same` / `remember` 两种切楼层策略必须真的不同（都映射成 `same` = 设置没反应）；
 * - 前端分类白名单与后端校验白名单逐项一致（少一项 = 选项消失或保存 422）；
 * - 舞台的首次配置分支确实消费了这两个默认值（防止再次退化成只写不读）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const sourceUrl = (relativePath) => new URL(relativePath, import.meta.url)

const defaultsPath = fileURLToPath(
  sourceUrl('../../../../homeos/frontend/src/studio/platform/navigation/navigation-defaults.ts'),
)
const handlersPath = fileURLToPath(
  sourceUrl('../../../../homeos/frontend/src/studio/runtime/core/stage/stage-handlers.ts'),
)
const backendPath = fileURLToPath(
  sourceUrl('../../../../homeos/backend/src/modules/interaction3d/config_sections_core.py'),
)

const { FLOOR_CATEGORY_CHOICES, defaultFloorCategory, defaultOpeningFloor, enteringFloorCategory, floorSwitchMode } =
  await import(defaultsPath)

const ONE = [{ id: 'f1' }]
const TWO = [{ id: 'f1' }, { id: 'f2' }]
const withCategory = (floorId, category) => ({
  navigationDefaults: { categories: { [floorId]: category } },
})
const withSwitch = (floorSwitch) => ({ navigationDefaults: { floorSwitch } })

test('「3D（总览）」是可选分类，且排在页面顺序最前', () => {
  const kinds = FLOOR_CATEGORY_CHOICES.map(([kind]) => kind)
  assert.equal(kinds[0], 'overview')
  for (const [, label] of FLOOR_CATEGORY_CHOICES) assert.ok(label, '每个分类都要有中文名')
})

test('楼层默认分类：未配置停在总览，配置合法才生效', () => {
  assert.equal(defaultFloorCategory({}, 'f1'), 'overview')
  assert.equal(defaultFloorCategory(withCategory('f1', 'light'), 'f1'), 'light')
  assert.equal(defaultFloorCategory(withCategory('f1', 'overview'), 'f1'), 'overview')
  // 该层没有安防设备：配置已失效，回落到总览而不是渲染一个空页签。
  assert.equal(defaultFloorCategory(withCategory('f1', 'security'), 'f1'), 'overview')
  // 只影响被配置的那一层。
  assert.equal(defaultFloorCategory(withCategory('f1', 'light'), 'f2'), 'overview')
})

test('ALL（全部楼层）恒为总览', () => {
  assert.equal(defaultFloorCategory(withCategory('all', 'light'), 'all'), 'overview')
  assert.equal(enteringFloorCategory(withCategory('all', 'light'), 'all', 'light', 'f1'), 'overview')
})

test('打开楼层：显式配置优先，否则多层落到 ALL、单层落到该层', () => {
  assert.equal(defaultOpeningFloor(TWO, {}), 'all')
  assert.equal(defaultOpeningFloor(TWO, { navigationDefaults: { floor: 'f2' } }), 'f2')
  assert.equal(defaultOpeningFloor(ONE, {}), 'f1')
  // 户型改过、配置的楼层已不存在：多层回 ALL，单层回该层。
  assert.equal(defaultOpeningFloor(TWO, { navigationDefaults: { floor: 'f-deleted' } }), 'all')
  assert.equal(defaultOpeningFloor(ONE, { navigationDefaults: { floor: 'f-deleted' } }), 'f1')
})

test('切楼层策略：每种取值都解析成明确模式，不把 remember 吞成 same', () => {
  assert.equal(floorSwitchMode(withSwitch('same')), 'same')
  assert.equal(floorSwitchMode(withSwitch('remember')), 'remember')
  // 旧值 / 缺省：保持上游的「保持当前分类」行为，避免老配置被静默改语义。
  assert.equal(floorSwitchMode(withSwitch('default')), 'same')
  assert.equal(floorSwitchMode({}), 'same')
})

test('same（同类型切换）：保持当前分类，缺失时回落该层默认分类', () => {
  const props = {
    ...withCategory('f2', 'light'),
    navigationDefaults: { ...withCategory('f2', 'light').navigationDefaults, floorSwitch: 'same' },
  }
  // f2 也有灯光：继续显示灯光，即使 f2 配置的是「3D」。
  assert.equal(enteringFloorCategory(props, 'f2', 'light', 'f1'), 'light')
  // f2 没有安防：回落到 f2 的默认分类（这里配置为灯光）。
  assert.equal(enteringFloorCategory({ ...props, security: {} }, 'f2', 'security', 'f1'), 'light')
  // 当前分类在该层完全不存在：回落到该层默认分类（未配置 = 总览）。
  assert.equal(enteringFloorCategory(withSwitch('same'), 'f2', 'vacuum', 'f1'), 'overview')
})

test('remember（跟随自定义）：每次切到该层都用该层设置的分类', () => {
  const props = {
    navigationDefaults: { floorSwitch: 'remember', categories: { f2: 'devices' } },
    devices: { televisions: [{ id: 'tv-1', floorId: 'f2' }] },
  }
  // 无论当前停在哪个分类，切到 f2 都要变成 f2 配置的「设备」。
  assert.equal(enteringFloorCategory(props, 'f2', 'light', 'f1'), 'devices')
  assert.equal(enteringFloorCategory(props, 'f2', 'overview', 'all'), 'devices')
  // 未配置的楼层：用默认分类（总览），而不是继续显示上一层的分类。
  assert.equal(enteringFloorCategory(props, 'f1', 'devices', 'f2'), 'overview')
})

test('resetCategoryFromAll 只在 same 模式下生效', () => {
  const base = {
    navigationDefaults: { floorSwitch: 'same', resetCategoryFromAll: true },
  }
  // 从 ALL 进入：当前分类是总览，开关打开就回落到该层默认分类。
  assert.equal(enteringFloorCategory(base, 'f2', 'overview', 'all'), 'overview')
  // remember 模式本来就忽略「当前分类」，开关无意义。
  const rememberProps = {
    navigationDefaults: { floorSwitch: 'remember', resetCategoryFromAll: true, categories: { f2: 'light' } },
  }
  assert.equal(enteringFloorCategory(rememberProps, 'f2', 'overview', 'all'), 'light')
})

test('前端分类白名单与后端校验白名单一致', () => {
  const backendSource = readFileSync(backendPath, 'utf8')
  const backendList = backendSource.match(/^FLOOR_CATEGORY_CHOICES\s*=\s*\(([^)]*)\)/m)
  assert.ok(backendList, '后端找不到 FLOOR_CATEGORY_CHOICES')
  const backendKinds = backendList[1]
    .split(',')
    .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
  assert.deepEqual(
    FLOOR_CATEGORY_CHOICES.map(([kind]) => kind),
    backendKinds,
    '前后端分类白名单不同步：前端多的分类会被 422 拒掉，后端多的是死配置',
  )
})

test('舞台首次配置时真的消费了默认楼层 / 分类', () => {
  const handlersSource = readFileSync(handlersPath, 'utf8')
  assert.match(handlersSource, /defaultOpeningFloor\(/, '舞台没有读取「打开时显示」的楼层')
  assert.match(handlersSource, /defaultFloorCategory\(/, '舞台没有读取「打开时显示的分类」')
  assert.match(
    handlersSource,
    /hasAutoSelectedFloors\s*=\s*true/,
    '默认值必须只落一次，否则每次状态推送都会把页签拽回默认分类',
  )
})
