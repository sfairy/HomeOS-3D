/* eslint-disable no-console -- 冒烟脚本的唯一交付物就是控制台 PASS/FAIL 记录 */
/**
 * 全局 Esc 层级栈（useEscStack）回归。
 *
 * 守护的故障：浮层各自在 `window` 上挂 keydown 监听时，一次 Esc 会被**所有**在场浮层收到
 * ——层级修好之后这个 bug 才显形：「安防全屏查看器 + 全局确认框」同时在场上，按一次 Esc
 * 两层一起关（`stopPropagation()` 挡不住同一目标上的多个监听器）。
 *
 * 这里不依赖浏览器：`window` 被替身接管，只验证「栈顶独占 + 顺序稳定 + 出栈幂等」这套
 * 编排逻辑；同时用两条**静态护栏**盯住源码，防止有人再把 Esc 散装挂回 window。
 *
 * 用法：``bun run scripts/_esc_stack_smoke.ts``（在 homeos/frontend 下执行）。
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/* ------------------------------------------------------------------ *
 * 替身 window：必须先装好再 import 被测模块（模块内的监听是懒挂的，
 * 但替身要在任何 push 之前生效）。
 * ------------------------------------------------------------------ */

type KeydownListener = (event: KeyboardEvent) => void

// 捕获到的 keydown 监听器（栈非空时应当恰好一个）
const captured = new Set<KeydownListener>()
let addCount = 0
let removeCount = 0

;(globalThis as unknown as { window: unknown }).window = {
  addEventListener(type: string, listener: KeydownListener) {
    if (type !== 'keydown') return
    addCount += 1
    captured.add(listener)
  },
  removeEventListener(type: string, listener: KeydownListener) {
    if (type !== 'keydown') return
    removeCount += 1
    captured.delete(listener)
  },
}

const { pushEscLayer, getEscStackLabels } = await import('../src/composables/ui/useEscStack')

/* ------------------------------------------------------------------ *
 * 断言工具
 * ------------------------------------------------------------------ */

const failures: string[] = []

function check(label: string, condition: boolean, detail: unknown = ''): void {
  console.log(`  [${condition ? 'PASS' : 'FAIL'}] ${label}${condition ? '' : ` ${String(detail)}`}`)
  if (!condition) failures.push(label)
}

/** 造一个只带 Esc 层派发所需字段的事件对象（并记录 preventDefault 是否被调用）。 */
function makeKeyboardEvent(key = 'Escape', alreadyPrevented = false) {
  let prevented = alreadyPrevented
  return {
    key,
    get defaultPrevented() {
      return prevented
    },
    preventDefault() {
      prevented = true
    },
  } as unknown as KeyboardEvent
}

/** 把事件派发给当前挂在 window 上的监听器（模拟浏览器冒泡到 window）。 */
function dispatchToWindow(event: KeyboardEvent): void {
  for (const listener of [...captured]) listener(event)
}

/** 记录被触发的层标签，用来验证「只关栈顶」。 */
function makeRecorder(log: string[], label: string) {
  return () => {
    log.push(label)
  }
}

/* ------------------------------------------------------------------ *
 * 1. 栈生命周期
 * ------------------------------------------------------------------ */

console.log('1. 栈生命周期')

check('空栈不常驻监听（addEventListener 次数为 0）', addCount === 0, `add=${addCount}`)

const popBottomOnly = pushEscLayer('底层', makeRecorder([], '底层'))
check('首次压栈挂上一个监听器', addCount === 1, `add=${addCount}`)
check('栈快照为 [底层]', getEscStackLabels().join(',') === '底层', getEscStackLabels())

const popTopOnly = pushEscLayer('顶层', makeRecorder([], '顶层'))
check('第二次压栈不重复挂监听（仍为 1）', addCount === 1, `add=${addCount}`)
check(
  '栈快照自底向顶为 [底层, 顶层]',
  getEscStackLabels().join(',') === '底层,顶层',
  getEscStackLabels(),
)

popTopOnly()
popBottomOnly()
check('全部出栈后摘掉监听（remove 为 1）', removeCount === 1, `remove=${removeCount}`)
check('出栈后栈为空', getEscStackLabels().length === 0, getEscStackLabels())
dispatchToWindow(makeKeyboardEvent())
check('栈空时派发 Esc 不报错', true)

/* ------------------------------------------------------------------ *
 * 2. 只派发给栈顶
 * ------------------------------------------------------------------ */

console.log('2. 只派发给栈顶')

const hits: string[] = []
const popA = pushEscLayer('A-底层', makeRecorder(hits, 'A'))
const popB = pushEscLayer('B-中层', makeRecorder(hits, 'B'))
const popC = pushEscLayer('C-顶层', makeRecorder(hits, 'C'))

dispatchToWindow(makeKeyboardEvent())
check('一次 Esc 只触发栈顶 C', hits.join(',') === 'C', hits)
check('底层 A / 中层 B 未被触发', !hits.includes('A') && !hits.includes('B'), hits)

const escEvent = makeKeyboardEvent()
dispatchToWindow(escEvent)
check('派发前栈已 preventDefault（避免原生 dialog 重复关闭）', escEvent.defaultPrevented)

/* ------------------------------------------------------------------ *
 * 3. 不抢别人已经消费的事件
 * ------------------------------------------------------------------ */

console.log('3. 不抢已消费的事件')

hits.length = 0
dispatchToWindow(makeKeyboardEvent('Enter'))
check('非 Escape 键不分发', hits.length === 0, hits)

dispatchToWindow(makeKeyboardEvent('Escape', true))
check('defaultPrevented 的 Esc 不分发（下拉 @keydown.escape.prevent 优先）', hits.length === 0, hits)

/* ------------------------------------------------------------------ *
 * 4. 出栈顺序稳定 / 幂等
 * ------------------------------------------------------------------ */

console.log('4. 出栈顺序稳定与幂等')

popB()
check(
  '中间层出栈后栈为 [A-底层, C-顶层]',
  getEscStackLabels().join(',') === 'A-底层,C-顶层',
  getEscStackLabels(),
)
hits.length = 0
dispatchToWindow(makeKeyboardEvent())
check('中间层出栈不改变栈顶（仍只触发 C）', hits.join(',') === 'C', hits)

const removeBeforeRepeat = removeCount
popB()
check(
  '重复出栈不改动其它层',
  getEscStackLabels().join(',') === 'A-底层,C-顶层',
  getEscStackLabels(),
)
check(
  '重复出栈不重复摘监听',
  removeCount === removeBeforeRepeat,
  `remove=${removeCount - removeBeforeRepeat}`,
)

popC()
popA()
check(
  '全部出栈后监听被摘掉',
  captured.size === 0 && removeCount === removeBeforeRepeat + 1,
  `remove=${removeCount}`,
)

/* ------------------------------------------------------------------ *
 * 5. 真实场景回放：查看器 + 确认框
 * ------------------------------------------------------------------ */

console.log('5. 场景回放：安防全屏查看器（底） + 全局确认框（顶）')

const closed: string[] = []
const popViewer = pushEscLayer('安防全屏查看器', makeRecorder(closed, '查看器'))
const popConfirm = pushEscLayer('全局确认框', makeRecorder(closed, '确认框'))

dispatchToWindow(makeKeyboardEvent())
check('第一次 Esc 只关确认框', closed.join(',') === '确认框', closed)

popConfirm() // 确认框关闭 → 出栈
dispatchToWindow(makeKeyboardEvent())
check('第二次 Esc 关查看器', closed.join(',') === '确认框,查看器', closed)

popViewer()
check(
  '两层都出栈后不再监听',
  captured.size === 0 && removeCount === removeBeforeRepeat + 2,
  `remove=${removeCount}`,
)

/* ------------------------------------------------------------------ *
 * 6. 静态护栏 1：window/document 级 Esc 监听白名单
 * ------------------------------------------------------------------ */

console.log('6. 静态护栏：keydown 监听白名单')

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url))

/**
 * 允许直接挂 window/document 级 keydown 的模块及其理由。
 * 新增条目必须在这里显式登记 —— 否则说明有浮层绕过了 Esc 层级栈。
 */
const KEYDOWN_ALLOWLIST: Record<string, string> = {
  'composables/ui/useEscStack.ts': '层级栈本体：唯一的 Esc 派发口',
  'composables/ui/useFocusTrap.ts': '只处理 Tab，做焦点陷阱',
  'composables/ui/useScreensaver.ts': '任意按键唤醒屏保（不消费 Esc 语义）',
  'components/common/base/VConfirmModal.vue': '只处理 Enter 确认；Esc 已走 useEscLayer',
  'composables/settings/system/system-config-sidebar.internals.ts': '“/” 聚焦搜索框',
  'views/settings/shared/layout/useSettingsSidebar.ts': '“/” 聚焦 + Esc 清空搜索（已 preventDefault）',
  'views/settings/system/system-config/useSystemConfigPanelShell.ts': 'Alt+方向键切换分区',
}

const KEYDOWN_PATTERN = /(?:window|document)\.addEventListener\(\s*['"]keydown/
const sourceFiles: string[] = []
const skippedDirs = new Set(['node_modules', 'dist', 'studio']) // studio 是并存的旧运行时，另有自己的 Esc 处理

function collectSourceFiles(dir: string): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (skippedDirs.has(entry)) continue
      collectSourceFiles(full)
      continue
    }
    if (/\.(ts|vue|js|mts)$/.test(entry)) sourceFiles.push(full)
  }
}
collectSourceFiles(SRC_DIR)

const offenders: string[] = []
for (const file of sourceFiles) {
  if (!KEYDOWN_PATTERN.test(readFileSync(file, 'utf8'))) continue
  const rel = relative(SRC_DIR, file).split(sep).join('/')
  if (!(rel in KEYDOWN_ALLOWLIST)) offenders.push(rel)
}

check(
  `src 下所有 window/document keydown 监听都已登记（共 ${Object.keys(KEYDOWN_ALLOWLIST).length} 条白名单）`,
  offenders.length === 0,
  offenders,
)

/* ------------------------------------------------------------------ *
 * 7. 静态护栏 2：浮层必须走 useEscLayer
 * ------------------------------------------------------------------ */

console.log('7. 静态护栏：浮层接入层级栈')

const ESC_LAYER_USERS = [
  'views/SecurityView.vue',
  'components/common/base/VConfirmModal.vue',
  'components/common/base/VPromptModal.vue',
  'components/common/base/VFolderCreateModal.vue',
  'components/devices/DeviceRow.vue',
  'components/modals/DoorbellAlertModal.vue',
  'layouts/MainLayout.vue',
]

for (const rel of ESC_LAYER_USERS) {
  const text = sourceFiles.some((file) => relative(SRC_DIR, file).split(sep).join('/') === rel)
    ? readFileSync(join(SRC_DIR, rel), 'utf8')
    : ''
  check(`${rel} 已接入 useEscLayer`, text.includes('useEscLayer('))
}

/* ------------------------------------------------------------------ */

console.log('')
if (failures.length > 0) {
  console.error(`Esc 层级栈回归失败：${failures.length} 项`)
  for (const label of failures) console.error(`  - ${label}`)
  process.exit(1)
}
console.log('Esc 层级栈回归全部通过。')
