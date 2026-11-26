/**
 * 对齐滑轨（0.8.9）的样式不变量。
 *
 * 这类迁移最容易被**悄悄回退**：某次修 bug 时在宿主里写回 `width: 36px`，
 * 一切看起来正常，直到有人发现两个面板的端点又对不齐了。所以这里对 CSS 文本做断言：
 *
 * 1. `range-control.css` 必须定义两套几何档案（2D / 3D），且 `--hb-rail-inset` 就是拇指半径；
 * 2. 3D 宿主（`stage.css`）**不得**再硬编码拇指尺寸 / 轨道高度 / 描边宽度 ——
 *    必须走 `--hb-rail-*`；
 * 3. 色相轨道必须拿到端点内缩（0° / 360° 的圆心要贴住轨道两端）；
 * 4. `.hb-range` 与 `.global-color-picker-hue` 必须仍被纳入对齐选择器。
 */
import { describe, expect, test } from 'bun:test'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../../..')
const RANGE_CSS = fs.readFileSync(path.join(ROOT, 'homeos/frontend/public/static/range-control.css'), 'utf8')
const STAGE_CSS = fs.readFileSync(path.join(ROOT, 'homeos/frontend/src/studio/runtime/core/stage.css'), 'utf8')

/** 取某个选择器块内的声明文本（只处理“单层”块，够用且不会误配 @media 嵌套）。 */
function blockOf(source: string, selector: string): string {
  const start = source.indexOf(selector)
  if (start < 0) return ''
  const open = source.indexOf('{', start)
  const close = source.indexOf('}', open)
  return open < 0 || close < 0 ? '' : source.slice(open + 1, close)
}

/** 从声明块里取某个自定义属性的值。 */
function tokenValue(block: string, token: string): string | null {
  const matched = block.match(new RegExp(`${token}\\s*:\\s*([^;]+);`))
  return matched ? matched[1]!.trim() : null
}

describe('range-control.css · 两套几何档案', () => {
  const base = blockOf(RANGE_CSS, ':root,\n.hb-interaction3d-runtime,\n.interaction3d-stage {')
  const threeD = blockOf(RANGE_CSS, '.interaction3d-stage,\n.hb-interaction3d-runtime {')

  test('2D 档案：轨道 8px / 拇指 16px', () => {
    expect(tokenValue(base, '--hb-rail-track-height')).toBe('8px')
    expect(tokenValue(base, '--hb-rail-thumb-size')).toBe('16px')
  })

  test('3D 档案：轨道 14px / 拇指 36px（与 stage.css 现值同档）', () => {
    expect(tokenValue(threeD, '--hb-rail-track-height')).toBe('14px')
    expect(tokenValue(threeD, '--hb-rail-thumb-size')).toBe('36px')
  })

  test('端点内缩 = 拇指半径（两套档案共用一个公式）', () => {
    const inset = tokenValue(base, '--hb-rail-inset')
    expect(inset).toBe('calc(var(--hb-rail-thumb-size) / 2)')
  })

  test('填充与槽色都有令牌名（不靠字面色散落）', () => {
    expect(tokenValue(base, '--hb-rail-fill-color')).not.toBeNull()
    expect(tokenValue(base, '--hb-rail-track-color')).not.toBeNull()
  })
})

describe('stage.css · 不得回退成硬编码', () => {
  test('拇指尺寸走令牌', () => {
    const thumb = blockOf(
      STAGE_CSS,
      '.interaction3d-stage :is(.i3d-slider input, input.i3d-control-range)::-webkit-slider-thumb',
    )
    expect(thumb).toContain('var(--hb-rail-thumb-size)')
    expect(thumb).not.toMatch(/width:\s*36px/)
    expect(thumb).not.toMatch(/border:\s*5px solid transparent/)
  })

  test('Firefox 拇指与 WebKit 同尺寸（0.8.9 的对齐目标）', () => {
    const moz = blockOf(
      STAGE_CSS,
      '.interaction3d-stage :is(.i3d-slider input, input.i3d-control-range)::-moz-range-thumb',
    )
    expect(moz).toContain('var(--hb-rail-thumb-size)')
    expect(moz).not.toMatch(/width:\s*27px/)
  })

  test('轨道高度与描边走令牌', () => {
    const track = blockOf(STAGE_CSS, '.interaction3d-stage :is(.i3d-slider input, input.i3d-control-range) {')
    expect(track).toContain('var(--hb-rail-input-height)')
    expect(track).toContain('var(--hb-rail-border-width)')
    expect(track).not.toMatch(/height:\s*14px/)
    expect(track).not.toMatch(/border:\s*4px solid #252322/)
  })
})

describe('2D 补充宿主', () => {
  test('hb-range（窗帘/开窗器/晾衣架位置滑条）被纳入对齐选择器', () => {
    expect(RANGE_CSS).toContain('input.hb-range')
  })

  test('色相轨道拿到端点内缩，且不改配色', () => {
    const hue = blockOf(RANGE_CSS, "input[type='range'].global-color-picker-hue {")
    expect(hue).toContain('margin-inline: var(--hb-rail-inset)')
    expect(hue).toContain('width: calc(100% - var(--hb-rail-inset) * 2)')
    // 彩虹底由 app.css 提供，这里不能覆盖
    expect(hue).not.toContain('linear-gradient')
  })

  test('色相拇指做了纵向居中补偿（轨道 14px / 拇指 15px）', () => {
    expect(RANGE_CSS).toContain('margin-top: calc((14px - 15px) / 2)')
  })
})

describe('包裹层形态仍然可用', () => {
  test('.hb-rail-shell 隐藏态与内缩已定义', () => {
    expect(RANGE_CSS).toContain('.hb-rail-shell:has(> input[hidden])')
    expect(RANGE_CSS).toContain('.hb-rail-shell > .hb-aligned-range')
  })
})
