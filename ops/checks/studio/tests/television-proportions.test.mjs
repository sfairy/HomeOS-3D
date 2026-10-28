/**
 * 电视面板比例 + 演示画面贴图的契约测试。
 *
 * 这两个失败模式在渲染里都表现为同一句话「电视画面没有全屏」，但根因完全不同：
 * - 面板不是 16:9 → 贴图被横向拉伸（物件框偏矮时 `height × 0.98` 那一支会生效）；
 * - 贴图自己留了边 → 屏幕四周露出机身黑边（旧版宣传画底部空了 70 px，约 13% 屏高）。
 * 所以这里锁死：面板恒 16:9 且落在机身内；贴图内容铺到画布的四条边、且没有大段空带。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const PROPORTIONS = fileURLToPath(
  new URL('../../../../homeos/frontend/src/studio/app/3d-studio/authoring/items/studio-television-proportions.ts',
    import.meta.url),
)
const POSTER = fileURLToPath(
  new URL('../../../../homeos/frontend/src/studio/app/3d-studio/materials/studio-television-poster.ts',
    import.meta.url),
)

const { computeTelevisionProportions } = await import(PROPORTIONS)
const { drawTelevisionPoster } = await import(POSTER)

const TV_CASES = [
  { tvMountStyle: 'standard', width: 1.8, height: 1.2 },
  { tvMountStyle: 'standard', width: 2.2, height: 1.3 },
  { tvMountStyle: 'standard', width: 1.8, height: 0.9 },
  { tvMountStyle: 'tabletop', width: 2.0, height: 0.7 },
  { tvMountStyle: 'mobile', width: 1.4, height: 1.6 },
  { tvMountStyle: 'mobile', width: 3.0, height: 0.8 },
]

test('屏幕面板恒为 16:9，且永远收在机身内', () => {
  for (const tvCase of TV_CASES) {
    const proportions = computeTelevisionProportions(tvCase, tvCase.width, tvCase.height)
    const ratio = proportions.screenWidth / proportions.screenHeight
    assert.ok(
      Math.abs(ratio - 16 / 9) < 1e-9,
      `${tvCase.width}×${tvCase.height} ${tvCase.tvMountStyle}: 面板比例 ${ratio.toFixed(3)} 不是 16:9`,
    )
    assert.ok(
      proportions.screenWidth < tvCase.width,
      `${tvCase.width}×${tvCase.height} ${tvCase.tvMountStyle}: 屏幕比物件还宽`,
    )
    assert.ok(
      proportions.bodyHeight <= tvCase.height * 0.98 + 1e-9,
      `${tvCase.width}×${tvCase.height} ${tvCase.tvMountStyle}: 机身 ${proportions.bodyHeight.toFixed(3)} 超出物件高`,
    )
    assert.ok(
      proportions.screenHeight < proportions.bodyHeight,
      `${tvCase.width}×${tvCase.height} ${tvCase.tvMountStyle}: 屏幕没有收进机身（无边框）`,
    )
    assert.ok(
      proportions.centerY > 0 && proportions.centerY < tvCase.height,
      `${tvCase.width}×${tvCase.height} ${tvCase.tvMountStyle}: 中心高 ${proportions.centerY} 落在物件外`,
    )
  }
})

/** 记录 2D 绘制盒的假 painter（只模拟等比 scale，够本测试用）。 */
function createRecordingPainter(canvas) {
  const boxes = []
  const state = { scaleX: 1, scaleY: 1 }
  const stack = []
  const record = (kind, x, y, width, height) => {
    boxes.push({
      kind,
      x0: x * state.scaleX,
      x1: (x + width) * state.scaleX,
      y0: y * state.scaleY,
      y1: (y + height) * state.scaleY,
    })
  }
  return {
    boxes,
    canvas,
    fillStyle: '',
    font: '',
    textAlign: 'left',
    save() {
      stack.push({ ...state })
    },
    restore() {
      Object.assign(state, stack.pop() ?? { scaleX: 1, scaleY: 1 })
    },
    scale(x, y) {
      state.scaleX *= x
      state.scaleY *= y
    },
    beginPath() {},
    fill() {},
    fillRect(x, y, width, height) {
      record('rect', x, y, width, height)
    },
    roundRect(x, y, width, height) {
      record('roundRect', x, y, width, height)
    },
    arc(x, y, radius) {
      record('arc', x - radius, y - radius, radius * 2, radius * 2)
    },
    fillText(text, x, y) {
      const metrics = 0.6 * Number.parseFloat(/(\d+)px/.exec(this.font)?.[1] ?? '16')
      const align = this.textAlign === 'center' ? -0.5 : this.textAlign === 'right' ? -1 : 0
      record('text', Number(x) + align * text.length * metrics, y - metrics, text.length * metrics, metrics)
    },
  }
}

test('演示画面铺满整张画布：四条边都有内容、没有大段空带', () => {
  const canvas = { width: 960, height: 540 }
  const painter = createRecordingPainter(canvas)
  drawTelevisionPoster(canvas, painter)

  const isBackground = (box) => box.kind === 'rect' && box.x0 <= 0.5 && box.x1 >= canvas.width - 0.5 &&
    box.y0 <= 0.5 && box.y1 >= canvas.height - 0.5
  const content = painter.boxes.filter((box) => !isBackground(box))
  assert.ok(content.length > 20, `绘制内容太少（${content.length} 个图元），贴图可能没画出来`)

  const minY = Math.min(...content.map((box) => box.y0))
  const maxY = Math.max(...content.map((box) => box.y1))
  const minX = Math.min(...content.map((box) => box.x0))
  const maxX = Math.max(...content.map((box) => box.x1))
  assert.ok(minY <= 10, `画布顶部空了 ${minY.toFixed(0)} px，电视上缘会露出黑边`)
  assert.ok(maxY >= canvas.height - 10, `画布底部空了 ${(canvas.height - maxY).toFixed(0)} px，电视下缘会露出黑边`)
  assert.ok(minX <= 10, `画布左侧空了 ${minX.toFixed(0)} px`)
  assert.ok(maxX >= canvas.width - 10, `画布右侧空了 ${(canvas.width - maxX).toFixed(0)} px`)

  const bands = content
    .map((box) => [box.y0, box.y1])
    .sort((left, right) => left[0] - right[0])
    .reduce((merged, [start, end]) => {
      const last = merged[merged.length - 1]
      if (last && start <= last[1]) last[1] = Math.max(last[1], end)
      else merged.push([start, end])
      return merged
    }, [])
  let widestGap = 0
  for (let index = 1; index < bands.length; index += 1)
    widestGap = Math.max(widestGap, bands[index][0] - bands[index - 1][1])
  assert.ok(widestGap <= 60, `画面里有一段 ${widestGap.toFixed(0)} px 的竖向空带，看上去就是没铺满`)
})
