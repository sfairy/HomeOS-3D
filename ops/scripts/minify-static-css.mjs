#!/usr/bin/env node
/**
 * 构建期压缩 `public/static` 原样拷进产物的 CSS（Vite 只压 `assets/` 下经过打包的样式）。
 *
 * - 范围：`dist/homeos/frontend/static/**` 与 `dist/homeos-store/frontend/static/**`；
 *   两者各跳过自己顶层的 `assets/`（已由 Vite 打包压缩）与 `vendor/`（第三方原样分发）；
 * - lightningcss 只做 minify，不给 targets，不降级、不加前缀；
 * - 解析失败：写入模式保留原文并告警（第三方 CSS 语法不支持时构建不能中断）；
 *   `--check` 模式直接失败 —— 产物 CSS 解析不了通常意味着文件被写坏了；
 * - 写入走「临时文件 + rename」：就地截断写在构建被打断时会留下半截 CSS，
 *   而半截文件恰好压不动，`--check` 会把它当成「已压缩」放过；
 * - 必须在 `precompress-static.mjs` 之前跑，sidecar 才对应压缩后的内容。
 *
 * 两个前端都要压的理由：商店外壳引的是 `/store-static/theme.css`、`store.css`、
 * `scene/*.css` 这类**固定路径**样式（不能加哈希、因此也不进打包器），实测未压缩合计
 * 约 286KB / 11k 行 —— 与 homeos 侧 `3d-studio/studio.css`（124KB / 5694 行）同源同因。
 *
 * 为什么要 `--check`
 * ------------------
 * 这一步在 `build:frontend` 链条里（`build:vite && minify:static-css && precompress:static`），
 * 单独跑 `vite build` 会**跳过它**：产物里留着 124KB / 5694 行的 `studio.css`，页面照常能跑，
 * 只是白传多一倍字节 —— 没有任何构建错误、没有类型错误，肉眼也只在打开产物时才看得出来。
 * 本仓库真实发生过：排查 chunk 体积时连跑了几次裸 `vite build`，线上目录的 CSS 全部退回未压缩，
 * 而 `check:precompress` 只校验 sidecar 是否最新（照样通过）。
 *
 * 判定口径与写入路径完全同源：对每个文件再压一次，若「压完比现在小」就说明它没被压过。
 * 因此 `--check` 不会误报已压缩文件（对已压文件再压长度相等）。
 * **解析失败在 `--check` 里是硬失败**：截断/写坏的文件压不动，按「已压缩」放过会让
 * 门禁全绿而产物是残缺的（写入模式仍保留原文，原因见上）。
 *
 * 用法
 * ----
 *   node ops/scripts/minify-static-css.mjs            # 就地压缩（构建链调用）
 *   node ops/scripts/minify-static-css.mjs --check    # 只校验：有未压缩的 CSS 即 exit 1（CI）
 *
 * 回滚：从 `build:frontend` 去掉这一步。
 */
import { existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform } from 'lightningcss'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
/** 两棵前端产物树的静态目录；各自顶层再跳过 `assets/`（已打包压缩）与 `vendor/`（第三方）。 */
const STATIC_ROOTS = [
  join(REPO_ROOT, 'dist/homeos/frontend/static'),
  join(REPO_ROOT, 'dist/homeos-store/frontend/static'),
]
const SKIP_DIRS = new Set(['assets', 'vendor'])
const CHECK_ONLY = process.argv.includes('--check')
/**
 * 「判定为未压缩」的最小收益：512 字节。
 *
 * 不用 `minified.length < code.length` 直判，是因为 lightningcss 对**已压缩**的个别文件
 * 会因 BOM / `@import` 归一化再省掉 1 个字节 —— 那种差值不是「没压过」，直判会让
 * `--check` 在刚压完的下一次运行里报红（CI 随机失败）。真实未压缩文件的收益是 40%+、
 * 单文件动辄上万字节（`studio.css` 可省 42KB），512 字节的门槛不会漏。
 */
const MIN_SAVING_BYTES = 512

/**
 * 结构自检：花括号必须配平，且不能停在注释 / 字符串中间。
 *
 * 为什么需要它：lightningcss 对**被截断**的 CSS 是宽容的（不闭合的块照样解析成功），
 * 所以「解析失败」这一条抓不到「文件写了一半」。而半截文件再压一次也省不掉 512 字节，
 * 于是会被「未压缩」判定当成已压缩放过 —— 门禁全绿、产物却是残缺样式。
 * 配平扫描是这类损坏最直接的特征。
 *
 * @returns 描述问题的文本；正常返回 null
 */
function cssStructureError(code) {
  let depth = 0
  let i = 0
  let quote = null
  let inComment = false
  const text = code.toString('utf8')
  while (i < text.length) {
    const ch = text[i]
    const next = text[i + 1]
    if (inComment) {
      if (ch === '*' && next === '/') {
        inComment = false
        i += 2
        continue
      }
      i += 1
      continue
    }
    if (quote) {
      if (ch === '\\') {
        i += 2
        continue
      }
      if (ch === quote) quote = null
      i += 1
      continue
    }
    if (ch === '/' && next === '*') {
      inComment = true
      i += 2
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      i += 1
      continue
    }
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth < 0) return '出现多余的 }'
    }
    i += 1
  }
  if (inComment) return '文件停在未闭合的注释里'
  if (quote) return '文件停在未闭合的字符串里'
  if (depth !== 0) return `花括号不配平（缺少 ${depth} 个 }）`
  return null
}

function* cssFiles(dir, isRoot) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!(isRoot && SKIP_DIRS.has(entry.name))) yield* cssFiles(join(dir, entry.name), false)
    } else if (entry.name.endsWith('.css')) yield join(dir, entry.name)
  }
}

let before = 0
let after = 0
let skipped = 0
/** 未压缩文件（仅 --check 收集；写入模式会就地压掉）。 */
const unminified = []
/** 解析失败的文件：写入模式保留原文，校验模式直接失败（见下方说明）。 */
const unparsable = []
for (const root of STATIC_ROOTS.filter((dir) => existsSync(dir))) {
  for (const file of cssFiles(root, true)) {
    const code = readFileSync(file)
    before += code.length
    if (CHECK_ONLY) {
      const structureError = cssStructureError(code)
      if (structureError) {
        unparsable.push({ file, message: structureError })
        after += code.length
        skipped++
        continue
      }
    }
    try {
      const { code: minified } = transform({ filename: relative(root, file), code, minify: true })
      const saving = code.length - minified.length
      if (saving >= (CHECK_ONLY ? MIN_SAVING_BYTES : 1)) {
        if (CHECK_ONLY) unminified.push({ file, saved: saving })
        else {
          // 原子替换：`writeFileSync` 会先截断再写，构建在这一刻被打断就留下半截 CSS。
          // 而 `--check` 只看「再压一次能不能省 ≥512 字节」—— 截断片段压不动，于是被判成
          // 「已压缩」，门禁全绿、镜像里却是一份残缺样式。
          const tmp = `${file}.minify-${process.pid}`
          try {
            writeFileSync(tmp, minified)
            renameSync(tmp, file)
          } finally {
            rmSync(tmp, { force: true })
          }
        }
      }
      after += Math.min(minified.length, code.length)
    } catch (error) {
      skipped++
      after += code.length
      unparsable.push({ file, message: error.message })
      console.warn(`[minify-static-css] 保留原文 ${relative(REPO_ROOT, file)}：${error.message}`)
    }
  }
}

if (CHECK_ONLY) {
  // 解析失败**不能**在 --check 里被放过：这正是「文件被外部截断/写坏」的表现，
  // 而截断片段压不动、会被下面「已压缩」的判定当成功。写入模式下仍保留原文（第三方
  // CSS 语法不支持时必须让构建继续），但校验模式下产物解析不了就是问题。
  if (unparsable.length) {
    console.error(`[minify-static-css] 有 ${unparsable.length} 个产物 CSS 结构损坏：`)
    for (const item of unparsable.slice(0, 10)) {
      console.error(`  ${relative(REPO_ROOT, item.file)}：${item.message}`)
    }
    console.error('修法：重新跑 `bun run build:frontend`（会先重建 dist 再压缩）。')
    process.exit(1)
  }
  if (unminified.length) {
    const saved = unminified.reduce((total, item) => total + item.saved, 0)
    console.error(`[minify-static-css] 有 ${unminified.length} 个 CSS 未压缩（可省 ${(saved / 1024).toFixed(0)} KB）：`)
    for (const item of unminified.slice(0, 10)) {
      console.error(`  ${relative(REPO_ROOT, item.file)}（可省 ${(item.saved / 1024).toFixed(0)} KB）`)
    }
    if (unminified.length > 10) console.error(`  …… 另有 ${unminified.length - 10} 个`)
    console.error(
      '产物很可能没走完整构建链：请跑 `bun run build:frontend`（含本步与预压缩）；' +
        '若刚跑过完整构建，说明该文件所在目录未被本脚本覆盖。',
    )
    process.exit(1)
  }
  console.log(`[minify-static-css] 校验通过：所有可压缩 CSS 均已压缩（${skipped} 个无法解析已跳过）`)
  process.exit(0)
}

console.log(
  `[minify-static-css] ${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB` +
    (skipped ? `（${skipped} 个文件解析失败已保留原文）` : ''),
)
