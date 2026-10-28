/**
 * `studio-preview-scope`（0.8.1 新增）的契约测试。
 *
 * 这组判定决定「改一处要重绘多少」，判错的代价是**掉帧**或**看起来没生效**，
 * 两者都不会报错，所以必须靠用例钉住：
 *
 * - 判宽（`'all'`）：安全但慢，只允许出现在「拿不准」的情况下；
 * - 判窄（`'lights'` / `'items'` / `'architecture'`）：必须能证明只动了这一类；
 * - `'none'`：两份内容真的完全相同 —— 尤其是**键顺序不同不能算不同**。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const moduleUrl = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/studio/app/3d-studio/authoring/scene/studio-preview-scope.ts',
    import.meta.url,
  ),
)
const { itemPreviewScope, entriesPreviewScope, selectionPreviewScope, historyChangePreviewScope } =
  await import(moduleUrl)

const lightTypes = new Set(['ceilinglamp', 'spotlight', 'striplight'])
const courtyardIds = new Set(['fence', 'pond', 'paving'])
const options = {
  lightTypes,
  // 生产端传 `isCourtyardDrawing(item) || isCourtyardGate(item)`；这里用 id 前缀模拟。
  isCourtyardItem: (item) => courtyardIds.has(String(item.id)),
  courtyardScope: () => 'architecture',
}

test('单个物品：灯光 / 普通 / 庭院 / 整层牵连', () => {
  assert.equal(itemPreviewScope({ id: 'a', type: 'ceilinglamp' }, options), 'lights')
  assert.equal(itemPreviewScope({ id: 'a', type: 'sofa' }, options), 'items')
  assert.equal(itemPreviewScope({ id: 'fence', type: 'sofa' }, options), 'architecture')
  // 洞口 = 墙体布尔，排气扇 = 墙体附着：都会改建筑几何，必须整层重建。
  assert.equal(itemPreviewScope({ id: 'a', type: 'flooropening' }, options), 'all')
  assert.equal(itemPreviewScope({ id: 'a', type: 'exhaust-fan' }, options), 'all')
  assert.equal(itemPreviewScope(null, options), 'all')
})

test('多条条目：全建筑档 → architecture；全灯光 → lights；混合 → all', () => {
  assert.equal(
    entriesPreviewScope([{ id: 'd1', kind: 'door' }, { id: 'w1', kind: 'window' }], [], options),
    'architecture',
  )
  assert.equal(
    entriesPreviewScope([{ id: 'l1', kind: 'item' }], [{ id: 'l1', type: 'spotlight' }], options),
    'lights',
  )
  assert.equal(
    entriesPreviewScope(
      [{ id: 'l1', kind: 'item' }, { id: 's1', kind: 'item' }],
      [{ id: 'l1', type: 'spotlight' }, { id: 's1', type: 'sofa' }],
      options,
    ),
    'all',
  )
  // 非 item 的条目（楼层/设置）一律整屏。
  assert.equal(entriesPreviewScope([{ id: 'f1', kind: 'floor' }], [], options), 'all')
  // 纯庭院物件才能收窄到 courtyardScope。
  assert.equal(
    entriesPreviewScope([{ id: 'fence', kind: 'item' }], [{ id: 'fence', type: 'sofa' }], options),
    'architecture',
  )
  // 庭院 + 普通物件混选：仍然能按庭院那一档收窄（两者都不是灯光）。
  assert.equal(
    entriesPreviewScope(
      [{ id: 'fence', kind: 'item' }, { id: 's1', kind: 'item' }],
      [{ id: 'fence', type: 'sofa' }, { id: 's1', type: 'sofa' }],
      options,
    ),
    'architecture',
  )
  // 但庭院里混进灯光就不行：灯光和几何是两个通道，只能整屏。
  assert.equal(
    entriesPreviewScope(
      [{ id: 'fence', kind: 'item' }, { id: 'l1', kind: 'item' }],
      [{ id: 'fence', type: 'sofa' }, { id: 'l1', type: 'spotlight' }],
      options,
    ),
    'all',
  )
})

test('选中高亮：空选中返回 null；灯带按「非灯光」放大作用域', () => {
  assert.equal(selectionPreviewScope([], [], options), null)
  assert.equal(
    selectionPreviewScope([{ id: 'w1', kind: 'wall' }], [], options),
    'architecture',
  )
  // 纯灯光选中不产生额外重绘面（高亮本身就是灯光效果），返回 null 表示「不必放大」。
  assert.equal(
    selectionPreviewScope([{ id: 'l1', kind: 'item' }], [{ id: 'l1', type: 'ceilinglamp' }], options),
    null,
  )
  assert.equal(
    selectionPreviewScope([{ id: 's1', kind: 'item' }], [{ id: 's1', type: 'sofa' }], options),
    'items',
  )
  // 灯带即使不在 lightTypes 里也要参与高亮重绘（它的高亮会牵动相邻墙面）。
  assert.equal(
    selectionPreviewScope([{ id: 'l1', kind: 'item' }], [{ id: 'l1', type: 'striplight' }], {
      ...options,
      lightTypes: new Set(['ceilinglamp']),
    }),
    'items',
  )
})

test('历史对比：内容完全相同 → none，且键顺序不影响判定', () => {
  const historyOptions = {
    itemScope: (item) => itemPreviewScope(item, options),
    selectionScope: () => null,
  }
  const first = { floors: [{ id: 'f1' }], items: [{ id: 'a', type: 'sofa', meta: { x: 1, y: 2 } }], lightGroups: [] }
  // 键顺序打乱 + 备注不同：内容没变，必须是 none（否则改个备注就白刷整屏）。
  const reordered = {
    items: [{ type: 'sofa', meta: { y: 2, x: 1 }, id: 'a', remark: '客厅' }],
    lightGroups: [],
    floors: [{ id: 'f1' }],
  }
  assert.equal(historyChangePreviewScope(first, reordered, historyOptions), 'none')
})

test('历史对比：只有灯光组变化 → lights；只有物品变化 → 该物品的作用域', () => {
  const historyOptions = {
    itemScope: (item) => itemPreviewScope(item, options),
    selectionScope: () => null,
  }
  const base = { floors: [{ id: 'f1' }], items: [{ id: 'a', type: 'sofa' }], lightGroups: [] }
  assert.equal(
    historyChangePreviewScope(base, { ...base, lightGroups: [{ id: 'g1' }] }, historyOptions),
    'lights',
  )
  assert.equal(
    historyChangePreviewScope(
      base,
      { ...base, items: [{ id: 'a', type: 'sofa', x: 3 }] },
      historyOptions,
    ),
    'items',
  )
  // 一灯一物件同时变了 → 作用域不唯一，必须整屏。
  assert.equal(
    historyChangePreviewScope(
      base,
      { ...base, items: [{ id: 'a', type: 'ceilinglamp', x: 3 }], lightGroups: [{ id: 'g1' }] },
      historyOptions,
    ),
    'all',
  )
})

test('历史对比：楼层/设置变化 → all（不再逐物品比对）', () => {
  const historyOptions = {
    itemScope: (item) => itemPreviewScope(item, options),
    selectionScope: () => null,
  }
  const base = { floors: [{ id: 'f1' }], items: [], lightGroups: [] }
  assert.equal(
    historyChangePreviewScope(base, { ...base, floors: [{ id: 'f1', height: 3 }] }, historyOptions),
    'all',
  )
})

test('历史对比：选中项的 scope 也会并进来，作用域不唯一时整屏', () => {
  const historyOptions = {
    itemScope: () => 'items',
    selectionScope: () => 'lights',
  }
  const base = { floors: [], items: [{ id: 'a', type: 'sofa' }], lightGroups: [] }
  assert.equal(
    historyChangePreviewScope(base, { ...base, items: [{ id: 'a', type: 'sofa', x: 1 }] }, historyOptions),
    'all',
    'items + lights 混合 → all',
  )
  const sameScope = {
    itemScope: () => 'lights',
    selectionScope: () => 'lights',
  }
  assert.equal(
    historyChangePreviewScope(base, { ...base, items: [{ id: 'a', type: 'sofa', x: 1 }] }, sameScope),
    'lights',
    '同一档可以合并',
  )
})
