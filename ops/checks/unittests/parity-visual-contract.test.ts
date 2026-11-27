/**
 * 0.8.9 视觉契约的**无浏览器**回归（关键界面像素验收的兜底）。
 *
 * 为什么需要这一层：真正的像素差分（`check:studio-parity`）要
 * 一个带 `--remote-debugging-port` 的 Chrome 和一个已登录会话，在 CI 之外的机器上
 * 经常跑不起来。但「滑条拇指是 43px 还是 16px」「主题滑轨用哪套色」这类**数值契约**
 * 不需要浏览器 —— 它们就在 CSS 里，一旦被人改回去，这里立刻红。
 *
 * 断言口径：只锁「上游公告明确、且本项目已按该值实现」的项。凡是登记为 deviation
 * 的结构差异（input-self 滑条、页面背景内联样式、未移植的 compact-rail）**不在这里锁**。
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FRONTEND = resolve(import.meta.dir, '../../../homeos/frontend')
const REPO = resolve(import.meta.dir, '../../..')

function read(relativePath: string): string {
  return readFileSync(resolve(FRONTEND, relativePath), 'utf8')
}

const rendererCss = read('public/static/renderer/renderer.css')
const appCss = read('public/static/app.css')
const studioCss = read('public/static/3d-studio/studio.css')
const stageCss = read('src/studio/runtime/core/stage.css')
const runtimeCss = read('src/studio/runtime/core/runtime.css')
const coverPanelCss = read('src/studio/runtime/cover/cover-panel.css')
const designTokens = readFileSync(resolve(REPO, 'packages/shared/src/styles/design-tokens.css'), 'utf8')

describe('滑条按组件几何（公告 12）', () => {
  test('2D 窗帘详情使用 43px 拇指', () => {
    expect(rendererCss).toContain('.hb-cover-details-position {')
    expect(rendererCss).toMatch(/\.hb-cover-details-position\s*\{[^}]*--hb-rail-thumb-size:\s*43px/)
  })

  test('灯光详情 25px / 组合弹窗 34px / 风速 22px', () => {
    expect(rendererCss).toMatch(/\.hb-light-details-slider\s*\{[^}]*--hb-rail-thumb-size:\s*25px/)
    expect(rendererCss).toMatch(/--hb-light-combo-thumb-size,\s*34px/)
    expect(rendererCss).toMatch(/\.hb-climate-fan-slider\s*\{[^}]*--hb-rail-thumb-size:\s*22px/)
  })

  test('3D 窗帘详情 37px 拇指 / 43px 轨道高 + 键盘焦点环', () => {
    expect(coverPanelCss).toMatch(
      /\.i3d-cover-panel\s+\.hb-cover-details-position\s*\{[^}]*--hb-rail-thumb-size:\s*37px/,
    )
    expect(coverPanelCss).toMatch(/--hb-rail-input-height:\s*43px/)
    expect(coverPanelCss).toContain('.i3d-cover-panel .hb-cover-details-position input:focus-visible')
  })

  test('取色器色相轨道 15px 拇指 + 彩虹渐变', () => {
    expect(appCss).toMatch(/\.global-color-picker-hue-rail\s*\{[^}]*--hb-rail-thumb-size:\s*15px/)
    expect(appCss).toContain('linear-gradient(90deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)')
  })
})

describe('暖色场景滑轨（主题化）', () => {
  test('配色走令牌，而不是新增硬编码颜色', () => {
    expect(designTokens).toContain('--hos-color-wood-thumb-grad')
    expect(stageCss).toMatch(/--hb-rail-thumb-background:\s*var\(--hos-color-wood-thumb-grad\)/)
  })

  test('四条主题选择器都在（暖木 / 自然木语）', () => {
    expect(stageCss).toContain('[data-scene-style="warm-wood"]')
    expect(stageCss).toContain('[data-scene-style="natural-wood"]')
    expect(stageCss).toMatch(/--hb-rail-background:\s*var\(--hos-color-wood-temperature\)/)
    expect(stageCss).toContain('--hb-cover-track-fill: var(--hos-color-wood-accent)')
  })
})

describe('3D 图形中断恢复（公告 16）', () => {
  test('运行时覆盖层有样式且默认隐藏', () => {
    expect(runtimeCss).toContain('.hb-interaction3d-runtime .i3d-graphics-recovery')
    expect(runtimeCss).toContain('.i3d-graphics-recovery[hidden]')
  })

  test('文案与按钮与上游一致', () => {
    const recovery = read('src/studio/runtime/core/graphics-recovery.ts')
    // 上游三个阶段各一句（`startup-6J4KRQ2I.js` 的 `graphicsRecovery` 分支）。
    expect(recovery).toContain('3D 画面暂时中断，正在等待恢复。')
    expect(recovery).toContain('正在重新加载 3D 画面…')
    expect(recovery).toContain('3D 画面未能重新加载。')
    expect(recovery).toContain("'重新加载 3D'")
    // 不阻止默认行为浏览器不会发 restored —— 这条丢了恢复会变成「永远不恢复」。
    expect(recovery).toContain('event.preventDefault()')
  })
})

describe('失效配置修复（公告 19）', () => {
  const bindingRepair = read('src/studio/platform/navigation/binding-repair.ts')

  test('列表标记与两段标题', () => {
    expect(bindingRepair).toContain("'binding-repair-results'")
    expect(bindingRepair).toContain("'binding-repair-list'")
    expect(bindingRepair).toContain('可以应用的修复')
    expect(bindingRepair).toContain('需要手动处理')
    expect(appCss).toContain('.binding-repair-results')
  })

  test('修复提示与错误码判定', () => {
    expect(bindingRepair).toContain('打开「')
    expect(bindingRepair).toContain('INTERACTION3D_CONFIG_INVALID')
    expect(bindingRepair).toContain('STUDIO3D_BINDING_CONFLICT')
  })
})

describe('3D 屏幕贴图按显示尺寸取图（公告 10）', () => {
  const source = read('src/studio/app/shared/display-image-source.ts')

  test('URL 只加可派生参数', () => {
    expect(source).toContain('displaySize=')
    expect(source).toContain("params.set('displayStill', '1')")
    expect(source).toContain("params.set('displayFit', 'cover')")
  })

  test('电视 cover / 电脑 contain 都走同一入口', () => {
    expect(read('src/studio/runtime/television/television.ts')).toContain('screenUploadSource(')
    expect(read('src/studio/runtime/device/device.ts')).toContain('screenUploadSource(')
  })
})

describe('studio.css 选择器级移植', () => {
  test('应用户型 / 装饰 / 地面分区 / 相机 / 光影', () => {
    for (const selector of [
      '.apply-floorplan-dialog h2',
      '.apply-floorplan-dialog form',
      '.apply-floorplan-branches section',
      '.floor-region-tone input',
      '.floor-region-finishes button[aria-pressed="true"]',
      '.preview-camera-toggle[aria-expanded="true"]',
      '.drawing-fixture-lighting',
      '.tool-button[data-tool="floor-region"] > .hb-ui-icon',
      '#snap-indicator',
    ]) {
      expect(studioCss).toContain(selector)
    }
  })

  test('顶视时自由视角提示互斥', () => {
    expect(studioCss).toContain(
      '.preview-card:has(> .preview-heading [data-camera-view="top"][aria-pressed="true"]) .top-view-hint',
    )
  })
})

describe('stage.css 选择器级移植', () => {
  test('胎压 / 轮廓层 / 楼层页签 / 温度滑条', () => {
    expect(stageCss).toContain('.i3d-car-tires:not([hidden])')
    expect(stageCss).toContain('#preview-3d > .i3d-model-outlines')
    expect(stageCss).toContain('.i3d-floor-tabs:has(button[data-floor="all"][aria-pressed="true"])')
    expect(stageCss).toMatch(/\.interaction3d-stage\s+\.i3d-temperature\s*\{/)
  })
})
