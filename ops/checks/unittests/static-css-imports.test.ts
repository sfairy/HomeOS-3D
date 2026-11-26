/**
 * `public/static` 下 CSS 的 `@import` 必须指向真实文件（0.8.9 现场缺陷回归）。
 *
 * 现象：浏览器控制台 `GET /static/renderer/range-control.css 404`。
 * 真因：`renderer/renderer.css` 写的是 `@import "./range-control.css"`，
 * 而该文件在上一级目录 —— `@import` 由浏览器自己发请求，构建期不校验，
 * 于是**样式整块静默丢失**：滑条几何退化，但不报任何构建错误。
 *
 * 这类缺陷只能靠「解析路径 + 检查存在」来发现，所以固化成门禁。
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const STATIC_ROOT = resolve(import.meta.dir, '../../../homeos/frontend/public/static')

/** 递归列出所有 `.css`。 */
function listCssFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry)
    if (statSync(fullPath).isDirectory()) return listCssFiles(fullPath)
    return entry.endsWith('.css') ? [fullPath] : []
  })
}

/** 抽出相对路径（以 `./` 或 `../` 开头）的 `@import` 目标。 */
function relativeImportsOf(cssText: string): string[] {
  const pattern = /@import\s+["']((?:\.\.?\/)[^"']+)["']/g
  return [...cssText.matchAll(pattern)].map((match) => match[1])
}

describe('public/static 的 CSS @import', () => {
  test('相对路径的 @import 全部指向存在的文件', () => {
    const brokenImports: string[] = []
    for (const cssPath of listCssFiles(STATIC_ROOT)) {
      for (const importTarget of relativeImportsOf(readFileSync(cssPath, 'utf8'))) {
        const resolvedPath = resolve(dirname(cssPath), importTarget)
        if (!existsSync(resolvedPath)) {
          brokenImports.push(`${cssPath.replace(STATIC_ROOT, '/static')} → ${importTarget}`)
        }
      }
    }
    expect(brokenImports).toEqual([])
  })

  test('renderer.css 引用的是上一级的 range-control.css', () => {
    // 精确锁住曾经写错的那一行：写 `./` 会解析成 /static/renderer/range-control.css。
    const rendererCss = readFileSync(join(STATIC_ROOT, 'renderer/renderer.css'), 'utf8')
    expect(rendererCss).toContain('@import "../range-control.css"')
    expect(rendererCss).not.toContain('@import "./range-control.css"')
  })
})
