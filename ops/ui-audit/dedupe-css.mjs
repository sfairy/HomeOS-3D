#!/usr/bin/env node
/**
 * CSS 清理器：删除「文件内完全重复的规则块」与「空规则块」，并可合并同文件内同值的重复令牌声明。
 *
 * 安全性：只在**同一文件、同一 @media 上下文、同选择器、同声明体**时判重（后出现的完全等价），
 * 删除的是纯冗余；跨文件、镜像文件、vendor、`.min.css` 一律不动。默认 dry-run。
 *
 * 用法：
 *   node ops/ui-audit/dedupe-css.mjs            # dry-run，打印将删除的内容
 *   node ops/ui-audit/dedupe-css.mjs --write    # 实际写入
 *   node ops/ui-audit/dedupe-css.mjs --write --include-empty
 *
 * 产出：reports/css-cleanup.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { walk, STYLE_EXTS, rel, writeJson, isVendored, extractStyleText } from './lib/scan.mjs'
import { TARGETS, scanDirs, OUT_DIR, isMirror, REPO_ROOT } from './targets.mjs'

const WRITE = process.argv.includes('--write')

/** 在一个 CSS 文本里定位所有叶子规则块（含真实偏移），并带 @media 上下文栈。 */
function locateRules(css) {
  const text = css
  const blocks = []
  const stack = []
  let bufStart = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '{') {
      const prelude = text.slice(bufStart, i).trim().replace(/\s+/g, ' ')
      // selStart 指向选择器首字符（跳过前导空白/换行），保证「整行删除」判定正确
      const rawSel = text.slice(bufStart, i)
      const leading = rawSel.length - rawSel.trimStart().length
      stack.push({ prelude, selStart: bufStart + leading, braceOpen: i })
      bufStart = i + 1
    } else if (c === '}') {
      const frame = stack.pop()
      if (frame) {
        const body = text.slice(frame.braceOpen + 1, i)
        const context = stack.filter((f) => f.prelude.startsWith('@')).map((f) => f.prelude)
        const inKeyframes = stack.some((f) => /^@(-webkit-)?keyframes/.test(f.prelude))
        if (!inKeyframes) {
          blocks.push({
            prelude: frame.prelude,
            body,
            context,
            selStart: frame.selStart,
            braceOpen: frame.braceOpen,
            braceClose: i,
            isAtRule: frame.prelude.startsWith('@'),
          })
        }
      }
      bufStart = i + 1
    } else if (c === ';' && stack.length === 0) {
      bufStart = i + 1
    }
  }
  return blocks
}

/** 归一化声明列表：去空白/注释，**保持顺序**（回退/覆盖依赖声明先后）。 */
const normDecls = (body) =>
  body
    .split(';')
    .map((d) => d.trim().replace(/\s+/g, ' ').toLowerCase())
    .filter(Boolean)

const canonBody = (body) => normDecls(body).join(';')

const declCount = (body) => normDecls(body).length

/** 把规则体切成声明片段，返回绝对偏移（含尾随 `;`）。 */
function declSpans(body, bodyBase) {
  const out = []
  let start = 0
  for (let i = 0; i <= body.length; i++) {
    if (i === body.length || body[i] === ';') {
      const raw = body.slice(start, i)
      const m = raw.match(/^\s*([a-zA-Z-]+)\s*:\s*([\s\S]+?)\s*$/)
      if (m) {
        out.push({
          prop: m[1].toLowerCase(),
          value: m[2].replace(/\s+/g, ' ').toLowerCase(),
          start: bodyBase + start,
          end: bodyBase + i + 1,
        })
      }
      start = i + 1
    }
  }
  return out
}

/** 处理单个文件，返回删除区间列表 [{start,end,reason,selector,line}]。 */
function planFile(fileAbs, relPath, isVue) {
  const raw = fs.readFileSync(fileAbs, 'utf8')
  // 对 .vue/.html：只在 <style> 区间内定位（映射回原文件偏移）
  const regions = []
  if (isVue) {
    const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi
    for (const m of raw.matchAll(re)) {
      const inner = m[1]
      const base = m.index + m[0].indexOf('>') + 1
      regions.push({ text: inner, base })
    }
  } else {
    regions.push({ text: raw, base: 0 })
  }

  const removals = []
  const seen = new Map() // key -> first block
  for (const region of regions) {
    // 先抹白注释，避免注释内大括号扰乱解析（保持长度）
    const blanked = region.text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    const blocks = locateRules(blanked)
    for (const b of blocks) {
      if (b.isAtRule) continue
      const decls = declCount(b.body)
      if (decls === 0) {
        // 空规则块：`.foo {}` —— 运行期无操作（注释不产生样式）
        removals.push({
          start: region.base + b.selStart,
          end: region.base + b.braceClose + 1,
          reason: 'empty-rule',
          selector: b.prelude,
          line: lineAt(raw, region.base + b.selStart),
        })
        continue
      }
      // 同一块内「同属性 + 同值」的重复声明是纯冗余，只删该声明（不整块删）
      const propSeen = new Map()
      for (const d of declSpans(b.body, region.base + b.braceOpen + 1)) {
        if (propSeen.has(d.prop) && propSeen.get(d.prop) === d.value) {
          removals.push({
            start: d.start,
            end: d.end,
            reason: 'identical-decl',
            noNewlineSwallow: true,
            selector: b.prelude,
            line: lineAt(raw, d.start),
            decl: `${d.prop}: ${d.value}`,
          })
        } else {
          propSeen.set(d.prop, d.value)
        }
      }
      const key = `${b.context.join('&&')}||${b.prelude}||${canonBody(b.body)}`
      if (seen.has(key)) {
        const first = seen.get(key)
        // 仅当与首次出现处于同一 region 或同文件时删除（本函数天然限同文件）
        removals.push({
          start: region.base + b.selStart,
          end: region.base + b.braceClose + 1,
          reason: 'duplicate-rule',
          selector: b.prelude,
          firstLine: first.line,
          line: lineAt(raw, region.base + b.selStart),
        })
      } else {
        seen.set(key, { line: lineAt(raw, region.base + b.selStart) })
      }
    }
  }
  return { raw, removals }
}

function lineAt(text, index) {
  return text.slice(0, index).split('\n').length
}

/** 应用删除：从后往前删除区间。
 *
 * 块级删除按「整行」处理（前提是该块独占其所在行），避免 `}` 与后继规则被并到同一行；
 * 声明级删除只删声明本身，保留缩进与行结构。
 */
function applyRemovals(raw, removals) {
  let out = raw
  const sorted = [...removals].sort((a, b) => b.start - a.start)
  for (const r of sorted) {
    let start = r.start
    let end = r.end
    if (r.noNewlineSwallow) {
      out = out.slice(0, start) + out.slice(end)
      continue
    }
    const lineStart = out.lastIndexOf('\n', start - 1) + 1
    const lineEndIdx = out.indexOf('\n', end)
    const lineEnd = lineEndIdx === -1 ? out.length : lineEndIdx + 1
    const nothingBefore = out.slice(lineStart, start).trim() === ''
    const nothingAfter = out.slice(end, lineEnd).trim() === ''
    if (nothingBefore && nothingAfter) {
      // 整行删除；若前后是连续空行，一并折叠为一行
      start = lineStart
      end = lineEnd
    } else {
      while (start > 0 && (out[start - 1] === ' ' || out[start - 1] === '\t')) start -= 1
      if (out[end] === '\r' && out[end + 1] === '\n') end += 2
      else if (out[end] === '\n') end += 1
    }
    out = out.slice(0, start) + out.slice(end)
    // 仅在删除边界折叠空行，避免重排整份文件既有的空行密度
    const winStart = Math.max(0, start - 2)
    const winEnd = Math.min(out.length, start + 6)
    out = out.slice(0, winStart) + out.slice(winStart, winEnd).replace(/\n{3,}/g, '\n\n') + out.slice(winEnd)
  }
  return out
}

const perFile = []
let totalRemoved = 0
let filesChanged = 0

for (const target of TARGETS) {
  for (const dir of scanDirs(target)) {
    for (const file of walk(dir, STYLE_EXTS)) {
      const relRepo = rel(REPO_ROOT, file)
      const relTarget = `${target.project}:${rel(target.root, file)}`
      if (isVendored(relTarget) || isMirror(relRepo)) continue
      const isVue = file.endsWith('.vue')
      const { raw, removals } = planFile(file, relRepo, isVue)
      if (!removals.length) continue
      const cleaned = applyRemovals(raw, removals)
      if (cleaned !== raw && WRITE) fs.writeFileSync(file, cleaned)
      if (cleaned !== raw) {
        filesChanged += 1
        totalRemoved += removals.length
        perFile.push({
          file: relRepo,
          removed: removals.length,
          byReason: removals.reduce((acc, r) => {
            acc[r.reason] = (acc[r.reason] || 0) + 1
            return acc
          }, {}),
          samples: removals.slice(0, 8).map((r) => ({ reason: r.reason, selector: r.selector.slice(0, 80), line: r.line })),
        })
      }
    }
  }
}

perFile.sort((a, b) => b.removed - a.removed)
const result = {
  generatedAt: new Date().toISOString(),
  mode: WRITE ? 'write' : 'dry-run',
  filesChanged,
  totalRemoved,
  byReason: perFile.reduce((acc, f) => {
    for (const [k, v] of Object.entries(f.byReason)) acc[k] = (acc[k] || 0) + v
    return acc
  }, {}),
  files: perFile,
}
writeJson(`${OUT_DIR}/css-cleanup.json`, result)

console.log(`CSS 清理（${result.mode}）：影响 ${filesChanged} 个文件，删除 ${totalRemoved} 个规则块`)
console.log('  按原因：', result.byReason)
for (const f of perFile.slice(0, 20)) {
  console.log(`\n  ${f.file}  (-${f.removed})`)
  for (const s of f.samples) console.log(`      [${s.reason}] ${s.selector}  @L${s.line}`)
}
if (!WRITE) console.log('\n（dry-run；加 --write 实际写入）')
