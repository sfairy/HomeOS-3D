#!/usr/bin/env node
/**
 * 构建期压缩 `public/static` 原样拷进产物的 CSS（Vite 只压 `assets/` 下经过打包的样式）。
 *
 * - 只改 `dist/homeos/frontend/static/**\/*.css`，跳过 `assets/`（已压）与 `vendor/`（第三方原样）；
 * - lightningcss 只做 minify，不给 targets，不降级、不加前缀；
 * - 解析失败的文件保留原文并告警，不让构建失败；
 * - 必须在 `precompress-static.mjs` 之前跑，sidecar 才对应压缩后的内容。
 *
 * 回滚：从 `build:frontend` 去掉这一步。
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform } from 'lightningcss'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const STATIC_DIR = join(REPO_ROOT, 'dist/homeos/frontend/static')
const SKIP_DIRS = new Set(['assets', 'vendor'])

function* cssFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!(dir === STATIC_DIR && SKIP_DIRS.has(entry.name))) yield* cssFiles(join(dir, entry.name))
    } else if (entry.name.endsWith('.css')) yield join(dir, entry.name)
  }
}

let before = 0
let after = 0
let skipped = 0
for (const file of cssFiles(STATIC_DIR)) {
  const code = readFileSync(file)
  before += code.length
  try {
    const { code: minified } = transform({ filename: relative(STATIC_DIR, file), code, minify: true })
    if (minified.length < code.length) writeFileSync(file, minified)
    after += Math.min(minified.length, code.length)
  } catch (error) {
    skipped++
    after += code.length
    console.warn(`[minify-static-css] 保留原文 ${relative(REPO_ROOT, file)}：${error.message}`)
  }
}
console.log(
  `[minify-static-css] ${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB` +
    (skipped ? `（${skipped} 个文件解析失败已保留原文）` : ''),
)
