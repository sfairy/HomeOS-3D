#!/usr/bin/env node
/**
 * 窗型「删除窗扇 / 墙体合并」的纯函数不变量（只读）。
 *
 * 为什么需要它
 * ------------
 * 这两块行为都是**看不出来的错**：
 * - 合并同一直线墙后窗的开启方向翻到另一侧（位置、尺寸、读数全对，只有内外开反了）；
 * - 撤销「删除窗扇」把之后对其它窗扇的修改一起回滚（用户以为只撤销了删除）。
 * 页面不会报错，只会「怎么和刚才不一样」。
 *
 * 断言的性质
 * ----------
 * - `remapWindowOrientation`：走向同向不动；反向时 `wallDirection` 取反；
 *   非 `version === 1` 的窗型完全不动（普通窗没有朝向字段）。
 * - `windowSashTargets`：固定扇不可删；推拉组的每一扇与组本身都是目标。
 * - `windowDeletionChange`：没有窗扇消失时返回 null；备注只收被删窗扇的。
 * - `restoreWindowDeletion`：只把消失的窗扇加回来，保留之后对其它窗扇的备注与窗型修改；
 *   结构对不上时抛「相关窗扇结构已再次修改…」而不是猜。
 *
 * 用法
 * ----
 *     node ops/checks/studio-window-undo.mjs
 *     node ops/checks/studio-window-undo.mjs --json
 */
import path from 'node:path'
import process from 'node:process'

import { loadTsModules } from './lib/load-ts-modules.mjs'

const AS_JSON = process.argv.includes('--json')
const REPO_ROOT = path.resolve(import.meta.dirname, '../..')
const SHARED_DIR = path.join(REPO_ROOT, 'homeos/frontend/src/studio/app/shared/scene/window')

const failures = []
let assertions = 0

function check(label, condition, detail = '') {
  assertions += 1
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ''}`)
}

const modules = await loadTsModules(
  [
    path.join(SHARED_DIR, 'layout.ts'),
    path.join(SHARED_DIR, 'window-deletion.ts'),
    path.join(REPO_ROOT, 'homeos/frontend/src/studio/app/3d-studio/authoring/store/document-store.ts'),
  ],
  {
    alias: { '@app': path.join(REPO_ROOT, 'homeos/frontend/src/studio/app') },
    prefix: 'studio-window-undo',
  },
)

const {
  leaf,
  entries,
  isCustomWindow,
  windowSashTargets,
  windowDeletionChange,
  restoreWindowDeletion,
  remapWindowOrientation,
  WindowHistory,
  applyDocumentPatch,
  invertDocumentPatch,
} = modules

/** 一片带 id 的可开窗扇。 */
function sash(kind = 'casement') {
  return { ...leaf(kind), id: `sash-${kind}-${Math.random().toString(36).slice(2, 8)}` }
}

/** 两扇横排的自定义窗：左固定、右可开。 */
function twoCellWindow(overrides = {}) {
  const left = sash('fixed')
  const right = sash('casement')
  return {
    id: 'w1',
    width: 2,
    height: 1.4,
    sill: 0.9,
    t: 0.5,
    wallId: 'wall-1',
    windowDesign: {
      version: 1,
      mode: 'custom',
      interiorSide: 1,
      layout: { id: 'split-1', axis: 'x', ratio: 0.5, children: [left, right] },
      sashRemarks: {},
    },
    ...overrides,
  }
}

// ---- remapWindowOrientation ----
{
  const window = twoCellWindow()
  const sameDirection = remapWindowOrientation(
    window,
    { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
    { start: { x: 0, y: 0 }, end: { x: 200, y: 0 } },
  )
  check('同向合并不改朝向', sameDirection === window)

  const flipped = remapWindowOrientation(
    window,
    { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
    { start: { x: 100, y: 0 }, end: { x: 0, y: 0 } },
  )
  check(
    '反向合并把 wallDirection 取反',
    flipped.windowDesign.wallDirection === -1,
    String(flipped.windowDesign.wallDirection),
  )
  check('取反不修改入参', window.windowDesign.wallDirection === undefined)

  const ordinaryWindow = {
    id: 'w2',
    width: 1,
    height: 1,
    windowDesign: { version: 1, mode: 'ordinary', interiorSide: 1, layout: leaf() },
  }
  // 上游只判 `version === 1`：普通窗的窗框组同样按 `wallDirection` 掉头，所以也要翻。
  const ordinaryFlipped = remapWindowOrientation(
    ordinaryWindow,
    { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
    { start: { x: 1, y: 0 }, end: { x: 0, y: 0 } },
  )
  check('version=1 的普通窗同样翻转朝向', ordinaryFlipped.windowDesign.wallDirection === -1)

  const legacyWindow = { id: 'w3', width: 1, height: 1, windowDesign: { ...ordinaryWindow.windowDesign, version: 2 } }
  check(
    '非 version=1 的窗型不动（未知新版本不猜朝向）',
    remapWindowOrientation(
      legacyWindow,
      { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
      { start: { x: 1, y: 0 }, end: { x: 0, y: 0 } },
    ) === legacyWindow,
  )
}

// ---- windowSashTargets ----
{
  const window = twoCellWindow()
  check('自定义窗被识别', isCustomWindow(window) === true)
  const targets = windowSashTargets(window)
  check(
    '固定扇不是可删目标',
    targets.every((target) => target.kind !== 'fixed'),
    JSON.stringify(targets),
  )
  check('只有一片可开扇', targets.length === 1, String(targets.length))

  const sliding = sash('sliding')
  const slidingWindow = twoCellWindow()
  slidingWindow.windowDesign.layout = { id: 'split-2', axis: 'x', ratio: 0.5, children: [sash('fixed'), sliding] }
  const slidingTargets = windowSashTargets(slidingWindow)
  check(
    '推拉组：组 + 每扇都是目标',
    slidingTargets.length === 1 + sliding.panelIds.length,
    `${slidingTargets.length} vs ${1 + sliding.panelIds.length}`,
  )
  check('推拉目标共享 groupId', new Set(slidingTargets.map((target) => target.groupId)).size === 1)
}

// ---- windowDeletionChange ----
{
  const before = twoCellWindow()
  const removable = entries(before).find((entry) => !entry.node.children && entry.node.kind === 'casement')
  // 被删的那片窗扇原本带备注；删除后 `sashRemarks` 里就不该再有它。
  before.windowDesign.sashRemarks = { [removable.node.id]: '阳台侧' }
  const after = { ...twoCellWindow(), windowDesign: { ...twoCellWindow().windowDesign, layout: leaf('fixed') } }

  const change = windowDeletionChange(before, after)
  check('删掉一片可开扇会产生删除快照', change !== null)
  check('快照带窗 id', change?.id === before.id)
  check(
    '快照只记被删窗扇的备注',
    JSON.stringify(change?.remarks) === JSON.stringify({ [removable.node.id]: '阳台侧' }),
    JSON.stringify(change?.remarks),
  )

  const noChange = windowDeletionChange(before, structuredClone(before))
  check('没有窗扇消失时返回 null', noChange === null)

  // 撤销：当前已经等于「删除后」，应回到删除前。
  const restored = restoreWindowDeletion(after, change)
  check('撤销后窗格数量回到删除前', entries(restored).filter((entry) => !entry.node.children).length === 2)
  check('被删窗扇的备注被恢复', restored.windowDesign.sashRemarks?.[removable.node.id] === '阳台侧')
}

// ---- restoreWindowDeletion：保留之后的改动 ----
{
  const before = twoCellWindow()
  const layoutAfter = leaf('fixed')
  const after = { ...before, windowDesign: { ...before.windowDesign, layout: layoutAfter } }
  const change = windowDeletionChange(before, after)

  // 删除后用户又改了整窗备注 / 尺寸：撤销删除不能把它们回滚。
  const edited = structuredClone(after)
  edited.remark = '后改的备注'
  edited.width = 2.4
  const restored = restoreWindowDeletion(edited, change)
  check('撤销删除保留之后改的备注', restored.remark === '后改的备注', String(restored.remark))
  check('撤销删除保留之后改的宽度', restored.width === 2.4, String(restored.width))

  // 结构被再次改过（当前既不是删除前也不是删除后）：必须抛错而不是猜。
  const mutated = structuredClone(after)
  mutated.windowDesign.layout = { id: 'split-9', axis: 'y', ratio: 0.5, children: [leaf('fixed'), leaf('casement')] }
  let threw = ''
  try {
    restoreWindowDeletion(mutated, change)
  } catch (error) {
    threw = String(error.message)
  }
  check('结构再次变化时拒绝撤销并给出中文原因', threw.includes('相关窗扇结构已再次修改'), threw)
}

// ---- 文档层：删除窗扇 → 撤销删除（真实 patch 路径） ----
// 这段是「整件替换 vs 窗扇级合并」的唯一真实判据：撤销删除时应用的是 invertDocumentPatch
// 的结果，before/after 已被交换。只测纯函数会让方向写反的实现照样通过。
{
  const fixedLeaf = { ...leaf('fixed'), id: 'sash-fixed' }
  const openableLeaf = { ...leaf('casement'), id: 'sash-open' }
  const design = (layout, remarks) => ({
    version: 1,
    mode: 'custom',
    interiorSide: 1,
    layout,
    ...(remarks ? { sashRemarks: remarks } : {}),
  })
  const withSash = () => ({
    id: 'w1',
    width: 2,
    height: 1.4,
    sill: 0.9,
    t: 0.5,
    wallId: 'wall-1',
    windowDesign: design(
      { id: 'split-1', axis: 'x', ratio: 0.5, children: [fixedLeaf, openableLeaf] },
      {
        'sash-open': '阳台侧',
      },
    ),
  })
  const withoutSash = () => ({
    id: 'w1',
    width: 2,
    height: 1.4,
    sill: 0.9,
    t: 0.5,
    wallId: 'wall-1',
    windowDesign: design(fixedLeaf),
  })
  const deletePatch = {
    kind: 'update',
    floorId: 'f1',
    field: 'windows',
    changes: [{ itemId: 'w1', before: withSash(), after: withoutSash() }],
  }
  /** 删完扇、之后又把整窗宽度改成 2.4 的文档。 */
  const documentAfterEdit = () => ({ floors: [{ id: 'f1', scene: { windows: [{ ...withoutSash(), width: 2.4 }] } }] })

  const undoDocument = documentAfterEdit()
  const undoApplied = applyDocumentPatch(undoDocument, invertDocumentPatch(deletePatch))
  const undoWindow = undoDocument.floors[0].scene.windows[0]
  check('撤销删除窗扇：补丁可应用', undoApplied === true)
  check(
    '撤销删除窗扇：消失的窗扇被加回来',
    entries(undoWindow).filter((entry) => !entry.node.children).length === 2,
    String(entries(undoWindow).filter((entry) => !entry.node.children).length),
  )
  check('撤销删除窗扇：保留之后改的宽度', undoWindow.width === 2.4, String(undoWindow.width))
  check('撤销删除窗扇：恢复被删窗扇的备注', undoWindow.windowDesign?.sashRemarks?.['sash-open'] === '阳台侧')

  // redo（前向删除）仍应整件替换：窗扇从 2 变回 1，宽度回到删除时的值。
  const redoDocument = documentAfterEdit()
  const redoApplied = applyDocumentPatch(redoDocument, deletePatch)
  const redoWindow = redoDocument.floors[0].scene.windows[0]
  check('重做删除窗扇：补丁可应用', redoApplied === true)
  check(
    '重做删除窗扇：窗扇数回到 1',
    entries(redoWindow).filter((entry) => !entry.node.children).length === 1,
    String(entries(redoWindow).filter((entry) => !entry.node.children).length),
  )
  check('重做删除窗扇：宽度回到删除时的值', redoWindow.width === 2, String(redoWindow.width))

  // 删除后又重构了分格：撤销删除必须**失败**（返回 false 交给「冲突」出口），不能猜。
  const restructured = documentAfterEdit()
  restructured.floors[0].scene.windows[0].windowDesign = design({
    id: 'split-2',
    axis: 'y',
    ratio: 0.5,
    children: [
      { ...leaf('fixed'), id: 'sash-fixed-b' },
      { ...leaf('casement'), id: 'sash-open-b' },
    ],
  })
  check(
    '删除后重构分格：撤销删除被拒绝（不猜）',
    applyDocumentPatch(restructured, invertDocumentPatch(deletePatch)) === false,
  )

  // 反向用例：**增加**窗扇（窗型编辑器里加一扇）与「撤销删扇」在 before/after 上同形
  // （都是 after 扇更多）。若用数量差推断方向，加扇会被当成撤销删除，于是走三方合并、
  // 把用户刚改的其它属性悄悄拧回。只认 `sashRestore` 标记才安全。
  const addPatch = {
    kind: 'update',
    floorId: 'f1',
    field: 'windows',
    changes: [{ itemId: 'w1', before: withoutSash(), after: withSash() }],
  }
  check('加扇不是删扇（不打还原标记）', invertDocumentPatch(addPatch).changes[0].sashRestore === undefined)
  check('删扇的反向补丁打还原标记', invertDocumentPatch(deletePatch).changes[0].sashRestore === true)

  // 正向加扇：整件替换，调用方给的 width 必须原样写进去（不被合并逻辑改写）。
  const addDocument = { floors: [{ id: 'f1', scene: { windows: [{ ...withoutSash(), width: 2.2 }] } }] }
  check('正向加扇可应用', applyDocumentPatch(addDocument, addPatch) === true)
  check('正向加扇：结构换成加扇后的', entries(addDocument.floors[0].scene.windows[0]).length === 3)
  check('正向加扇：宽度取补丁里的值', addDocument.floors[0].scene.windows[0].width === 2)
}

// ---- WindowHistory：整窗快照栈仍可用（撤销删除走的是文档层，不是这层） ----
{
  const history = new WindowHistory(twoCellWindow())
  // `commit(previous)` 记录的是「改之前」的状态：先经 `change` 改值，再撤销。
  history.change((current) => {
    current.width = 2.4
  })
  check('窗型编辑器历史记录一次提交', history.past.length === 1, String(history.past.length))
  history.undo()
  check('窗型编辑器撤销回到提交前宽度', history.value.width === 2, String(history.value.width))
}

// ---- 输出 ----
if (AS_JSON) {
  process.stdout.write(JSON.stringify({ assertions, failures }, null, 2) + '\n')
} else if (failures.length) {
  process.stdout.write(`studio-window-undo: ${failures.length}/${assertions} 项失败\n`)
  for (const failure of failures) process.stdout.write(`  ✗ ${failure}\n`)
} else {
  process.stdout.write(`studio-window-undo: ${assertions} 项断言通过\n`)
}
process.exit(failures.length ? 1 : 0)
