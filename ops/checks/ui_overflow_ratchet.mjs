#!/usr/bin/env node
/**
 * UI 溢出棘轮：防止「裸 `1fr` 网格」与「非白名单横向滚动」继续增长。
 *
 * 背景（审计 P16 / U-01）：
 * - `grid-template-columns` 里的 `1fr` 默认最小尺寸是 `auto`（= min-content）。
 *   中文长串 / 长实体 ID 没有断行机会时会撑破列宽，而设置页滚动容器是
 *   `overflow-x: hidden`，于是内容被**静默裁掉**（宽屏验收看不出来）。
 * - 修法是 `minmax(0, 1fr)` + `min-width: 0` + 换行/省略号；宽表只允许塞进
 *   `.hos-hscroll`（组件内部横滑，页面本身永不横滚）。
 *
 * 存量太多，一次性全改风险高，因此按棘轮处理：**只许降，不许增**。
 * 新文件出现即失败；已有文件计数上涨即失败。降低后跑 `--write` 更新基线。
 *
 * 用法：
 *   node ops/checks/ui_overflow_ratchet.mjs --check
 *   node ops/checks/ui_overflow_ratchet.mjs --write
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const TARGET = join(ROOT, 'homeos/frontend/src')
const BASELINE = join(ROOT, 'ops/checks/ui-overflow-baseline.json')

/**
 * 组件内横滑的**已登记实现**：文件 → 用途说明。
 *
 * 版面契约是「页面永不横向滚动」，但「一排标签页 / 表格 / 缩略图条在容器内横滑」
 * 是正常交互模式，不该被一刀切禁掉。因此这里逐条登记：每个条目都是**叶子级**
 * 容器（标签条、表格包装、缩略图带），不是页面或整块面板。
 *
 * 新增横滑必须：
 * 1) 优先复用 `.hos-hscroll`；
 * 2) 若确有专用样式需求，登记到本表并写清「为什么是叶子级」；
 * 3) 保证容器内可聚焦元素能 Tab 到（浏览器会自动把它滚进视野）。
 */
const INTENTIONAL_SCROLLERS = new Map([
  ['homeos/frontend/src/assets/styles/hos-hscroll.css', '唯一通用实现（可键盘聚焦的叶子表格容器）'],
  ['homeos/frontend/src/assets/styles/list-page.css', '列表页工具栏筛选条与标签条'],
  ['homeos/frontend/src/assets/styles/widget-hub-theme.css', '部件库分类横滑条'],
  ['homeos/frontend/src/components/common/styles/presence-person-list-input.css', '成员选择器的标签条'],
  ['homeos/frontend/src/components/common/styles/status-hint.css', '长提示文案的横向滚动（不换行挤压）'],
  ['homeos/frontend/src/components/dashboard/styles/footer.css', '底部能耗面板的指标条'],
  ['homeos/frontend/src/components/widgets/media/styles/mini-widget.css', '媒体迷你部件的进度滑杆'],
  ['homeos/frontend/src/components/widgets/system/styles/notification-center.css', '通知中心的筛选标签条'],
  ['homeos/frontend/src/features/device/styles/devices-theme.css', '设备榜榜单与历史列表的文件内横滑'],
  ['homeos/frontend/src/features/home-mode/editor/styles/home-mode.css', '家庭模式编辑器的分段/快捷项标签条'],
  ['homeos/frontend/src/features/home-mode/styles/mode-trigger-logs.css', '模式触发日志的表格包装'],
  ['homeos/frontend/src/features/security/styles/security-view.css', '安防中心的标签条'],
  [
    'homeos/frontend/src/features/settings/shared/config-fields/styles/system-config-params-sidebar.css',
    '高级参数侧栏的分组导航与链接行',
  ],
  ['homeos/frontend/src/features/settings/shared/styles/settings-hub.css', '设置页二级导航标签条'],
  ['homeos/frontend/src/features/settings/shared/styles/settings-orch-tabs.css', '设置页编排器轨道（可拖动标签条）'],
  ['homeos/frontend/src/features/settings/shared/styles/settings-utilities.css', '标签编辑器里的示例标签条'],
  ['homeos/frontend/src/layouts/styles/main-layout.css', '顶栏主导航标签条'],
  ['homeos/frontend/src/studio/chrome/studio-chrome.css', '3D 创作页的工作流步骤条'],
])

/** 允许出现横滑的文件集合（新文件不在其中即失败）。 */
const OVERFLOW_WHITELIST = new Set(INTENTIONAL_SCROLLERS.keys())

const RATIO_RE = /grid-template-columns\s*:[^;{}]*1fr/
const OVERFLOW_RE = /overflow-x\s*:\s*(auto|scroll)/

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'third-party' || name === 'node_modules') continue
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) walk(full, out)
    else if (name.endsWith('.css')) out.push(full)
  }
  return out
}

function collect() {
  const ratio = {}
  const overflow = {}
  for (const file of walk(TARGET)) {
    const rel = relative(ROOT, file).split('\\').join('/')
    // 去掉注释，避免把注释里的示例当成规则
    const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const ratioHits = source.split('\n').filter((line) => RATIO_RE.test(line) && !line.includes('minmax(')).length
    const overflowHits = (source.match(new RegExp(OVERFLOW_RE, 'g')) || []).length
    if (ratioHits) ratio[rel] = ratioHits
    if (overflowHits && !OVERFLOW_WHITELIST.has(rel)) overflow[rel] = overflowHits
  }
  return { ratio, overflow }
}

function loadBaseline() {
  try {
    return JSON.parse(readFileSync(BASELINE, 'utf8'))
  } catch {
    return { ratio: {}, overflow: {} }
  }
}

function compare(label, current, base) {
  const failures = []
  for (const [file, count] of Object.entries(current)) {
    const allowed = base[file] ?? 0
    if (count > allowed) failures.push(`${file}: ${label} ${allowed} → ${count}`)
  }
  return failures
}

function main() {
  const write = process.argv.includes('--write')
  const current = collect()
  if (write) {
    writeFileSync(BASELINE, `${JSON.stringify(current, null, 2)}\n`, 'utf8')
    console.log(
      `UI 溢出基线已更新：裸 1fr ${Object.values(current.ratio).reduce((a, b) => a + b, 0)} 处 / ` +
        `非白名单 overflow-x ${Object.values(current.overflow).reduce((a, b) => a + b, 0)} 处`,
    )
    return 0
  }
  const base = loadBaseline()
  const failures = [
    ...compare('裸 1fr', current.ratio, base.ratio || {}),
    ...compare('overflow-x:auto', current.overflow, base.overflow || {}),
  ]
  if (failures.length) {
    console.error('UI 溢出棘轮失败（这些新增会带来静默裁切 / 页面横滚）：')
    for (const item of failures) console.error(`  - ${item}`)
    console.error('改法：补 minmax(0, 1fr) + min-width: 0 + overflow-wrap；宽表塞进 .hos-hscroll。')
    return 1
  }
  console.log('UI 溢出棘轮通过（无新增裸 1fr / 非白名单 overflow-x）')
  return 0
}

process.exit(main())
