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
 * 新文件出现即失败；已有文件计数上涨即失败。降低后跑 `--update` 更新基线。
 *
 * 用法（单跑；批量入口 `bun run check:frontend` 也会带上它）：
 *   node ops/checks/ui_overflow_ratchet.mjs --check
 *   node ops/checks/ui_overflow_ratchet.mjs --update   # 原 `--write`，保留为别名
 */
import { join } from 'node:path'

import { isMain } from '../../lib/cli.mjs'
import { createCli, createContext, perFileProblems, readBaseline, writeBaseline } from '../../lib/ratchet.mjs'

const BASELINE_REL = 'ops/checks/baselines/frontend/ui-overflow-baseline.json'
const TARGET = 'homeos/frontend/src'
const EXTENSIONS = new Set(['.css'])
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'third-party'])

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

/**
 * @param {ReturnType<typeof createContext>} ctx
 */
export function scan(ctx) {
  const ratio = {}
  const overflow = {}
  for (const file of ctx.walk(TARGET, EXTENSIONS, SKIP_DIRS)) {
    const rel = ctx.rel(file)
    // 去掉注释，避免把注释里的示例当成规则
    const source = ctx.text(file).replace(/\/\*[\s\S]*?\*\//g, '')
    const ratioHits = source.split('\n').filter((line) => RATIO_RE.test(line) && !line.includes('minmax(')).length
    const overflowHits = (source.match(new RegExp(OVERFLOW_RE, 'g')) || []).length
    if (ratioHits) ratio[rel] = ratioHits
    if (overflowHits && !OVERFLOW_WHITELIST.has(rel)) overflow[rel] = overflowHits
  }
  return { ratio, overflow }
}

/**
 * @param {ReturnType<typeof createContext>} ctx
 * @param {{update?: boolean}} [options]
 */
export function audit(ctx, { update = false } = {}) {
  const baselinePath = join(ctx.repoRoot, BASELINE_REL)
  const current = scan(ctx)

  if (update) {
    writeBaseline(baselinePath, current)
    return {
      name: 'UI 溢出棘轮',
      summary:
        `基线已更新：裸 1fr ${Object.values(current.ratio).reduce((a, b) => a + b, 0)} 处 / ` +
        `非白名单 overflow-x ${Object.values(current.overflow).reduce((a, b) => a + b, 0)} 处`,
      updated: true,
      problems: [],
    }
  }

  const loaded = readBaseline(baselinePath, ctx.rel(baselinePath))
  // 缺基线时旧实现按空基线判定（全部算新增），这里保持一致语义而不是硬失败。
  const base = loaded.ok ? loaded.data : {}
  const problems = [
    ...perFileProblems(
      current.ratio,
      base.ratio || {},
      ['count'],
      (file, _m, before, after) => `${file}: 裸 1fr ${before} → ${after}`,
    ),
    ...perFileProblems(
      current.overflow,
      base.overflow || {},
      ['count'],
      (file, _m, before, after) => `${file}: overflow-x:auto ${before} → ${after}`,
    ),
  ]

  return {
    name: 'UI 溢出棘轮',
    summary: '无新增裸 1fr / 非白名单 overflow-x',
    problems,
    hints:
      problems.length > 0 ? ['改法：补 minmax(0, 1fr) + min-width: 0 + overflow-wrap；宽表塞进 .hos-hscroll。'] : [],
    json: { current, problems },
  }
}

/** 单跑入口；`--write` 保留为 `--update` 的别名（旧脚本名沿用）。 */
export const cli = createCli(audit, { repoRoot: join(import.meta.dirname, '../../..'), aliases: ['--write'] })

if (isMain(import.meta.url)) process.exit(cli())
