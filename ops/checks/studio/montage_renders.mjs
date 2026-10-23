#!/usr/bin/env bun
/**
 * 把 `render_glb.mjs --baseline` 产出的 before / after 成对渲染拼成对照表。
 *
 * 逐款看图需要 672 张 PNG，人工翻阅不现实；这里按「左原始、右损坏」成对平铺，
 * 每张贴图旁不写字（PNG 无字体渲染），由同名 `.md` 按行优先顺序给出 id 索引。
 */
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'

const args = process.argv.slice(2)
const valueOf = (name) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : undefined
}

const dir = path.resolve(valueOf('dir'))
const out = path.resolve(valueOf('out'))
const perSheet = Number(valueOf('per') ?? 60)
const pairsPerRow = Number(valueOf('cols') ?? 6)
const tile = Number(valueOf('tile') ?? 128)

const ids = fs
  .readdirSync(dir)
  .filter((file) => file.endsWith('-before-iso.png'))
  .map((file) => file.replace(/-before-iso\.png$/, ''))
  .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))

const sheets = []
for (let start = 0; start < ids.length; start += perSheet) {
  const chunk = ids.slice(start, start + perSheet)
  const rows = Math.ceil(chunk.length / pairsPerRow)
  const width = pairsPerRow * tile * 2
  const height = rows * tile
  const sheet = new PNG({ width, height })
  sheet.data.fill(18)
  chunk.forEach((id, index) => {
    const row = Math.floor(index / pairsPerRow)
    const column = index % pairsPerRow
    const x0 = column * tile * 2
    const y0 = row * tile
    for (const [offset, stage] of [
      [0, 'before'],
      [tile, 'after'],
    ]) {
      const source = path.join(dir, `${id}-${stage}-iso.png`)
      if (!fs.existsSync(source)) continue
      const png = PNG.sync.read(fs.readFileSync(source))
      for (let y = 0; y < Math.min(tile, png.height); y += 1) {
        for (let x = 0; x < Math.min(tile, png.width); x += 1) {
          const sourceIndex = (y * png.width + x) * 4
          const targetIndex = ((y0 + y) * width + x0 + offset + x) * 4
          sheet.data[targetIndex] = png.data[sourceIndex]
          sheet.data[targetIndex + 1] = png.data[sourceIndex + 1]
          sheet.data[targetIndex + 2] = png.data[sourceIndex + 2]
          sheet.data[targetIndex + 3] = 255
        }
      }
    }
  })
  const name = `sheet-${String(sheets.length + 1).padStart(2, '0')}.png`
  fs.writeFileSync(path.join(out, name), PNG.sync.write(sheet))
  sheets.push({ name, ids: chunk })
}

const lines = [
  '# 对照渲染索引（左 = HEAD 原始件，右 = 当前损坏件）',
  '',
  '每个单元格左侧是 `git show HEAD:` 的原始 GLB，右侧是当前工作区的同名文件；',
  '渲染为正交 iso 视图、按各自包围盒自动取景，因此**比例差异不可见**，只看结构、缺件、穿模。',
  '',
]
for (const sheet of sheets) {
  lines.push(`## ${sheet.name}`, '')
  sheet.ids.forEach((id, index) => {
    lines.push(`${index + 1}. \`${id}\``)
  })
  lines.push('')
}
fs.writeFileSync(path.join(out, 'INDEX.md'), `${lines.join('\n')}\n`)
console.log(JSON.stringify({ sheets: sheets.map((sheet) => [sheet.name, sheet.ids.length]), ids: ids.length }))
