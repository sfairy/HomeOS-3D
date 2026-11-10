/**
 * javascript-obfuscator 反混淆（面向 0.8.2 / 0.8.4 上游产物）。
 *
 * 上游产物由三段「脚手架」+ 业务代码组成，且三段顺序不固定（字符串数组函数可能
 * 在解码器前面，也可能在后面，业务代码甚至可能夹在两者之间）：
 *
 *   1. 字符串数组轮换 IIFE：`(function(a,b){...}(_0xARRAY, 0xHASH));`
 *   2. 字符串数组：`function _0xARRAY(){ const a=['..','..']; ... }`
 *   3. 解码器：`function _0xDECODER(i,k){ i=i-0xNN; return arr[i]; }`
 *
 * 因此这里按「定位每段各自的字符区间 → 在 vm 里只执行这三段 → 用拿到的解码器
 * 把业务代码里的 `_0xDECODER(0xNN)` 还原成字面量 → 把三段从产物里剔除」。
 *
 * 不依赖 @babel/traverse / generator（仓库只装了 parser/types）：我们保留原控制流，
 * 只做「常量还原 + 标识符归一 + 美化」，diff 时人工可读。
 */

import vm from 'node:vm'

const ID = /^_0x[0-9a-fA-F]{3,8}$/
const DECODER_CALL =
  /(_0x[0-9a-fA-F]{3,8})\s*\(\s*(0x[0-9a-fA-F]+|\d+|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*(?:,\s*([^()]*?))?\)/g

/** 从 `{` 开始做括号配平，返回闭合大括号之后的位置。会跳过字符串 / 模板 / 注释。 */
function matchBrace(source, openIndex) {
  let depth = 0
  let i = openIndex
  while (i < source.length) {
    const ch = source[i]
    if (ch === '/' && source[i + 1] === '/') {
      i = source.indexOf('\n', i)
      if (i < 0) return -1
      continue
    }
    if (ch === '/' && source[i + 1] === '*') {
      i = source.indexOf('*/', i + 2)
      if (i < 0) return -1
      i += 2
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch
      i += 1
      while (i < source.length) {
        if (source[i] === '\\') {
          i += 2
          continue
        }
        if (source[i] === quote) break
        i += 1
      }
      i += 1
      continue
    }
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return i + 1
    }
    i += 1
  }
  return -1
}

/** 收集三类脚手架的区间。 */
export function findScaffoldSpans(source) {
  const spans = []

  // 1) 字符串数组函数：无参函数，体内有一个 ≥8 项的全字符串字面量数组
  for (const m of source.matchAll(/function\s+(_0x[0-9a-fA-F]{3,8})\s*\(\s*\)\s*\{/g)) {
    const bodyOpen = source.indexOf('{', m.index + m[0].length - 1)
    const end = matchBrace(source, bodyOpen)
    if (end < 0) continue
    const body = source.slice(bodyOpen, end)
    const arr = body.match(/=\s*\[((?:\s*(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*,?)+)\]/)
    if (!arr) continue
    const items = [...arr[1].matchAll(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g)]
    if (items.length >= 8) spans.push({ kind: 'array', name: m[1], start: m.index, end })
  }

  // 2) 解码器：函数体里出现 `_0xSAME=_0xSAME-0xNN` 形式的自赋值偏移
  for (const m of source.matchAll(/function\s+(_0x[0-9a-fA-F]{3,8})\s*\(\s*(_0x[0-9a-fA-F]{3,8})[^)]*\)\s*\{/g)) {
    const bodyOpen = source.indexOf('{', m.index + m[0].length - 1)
    const end = matchBrace(source, bodyOpen)
    if (end < 0) continue
    const body = source.slice(bodyOpen, end)
    if (new RegExp(`${m[1]}\\s*=\\s*function`).test(body) && /-\s*0x[0-9a-fA-F]+/.test(body)) {
      spans.push({ kind: 'decoder', name: m[1], start: m.index, end })
    }
  }

  // 3) 轮换 IIFE：`(function(...){...}(_0xARR, 0xHASH));`
  for (const m of source.matchAll(/\(\s*function\s*\([^)]*\)\s*\{/g)) {
    const bodyOpen = source.indexOf('{', m.index + m[0].length - 1)
    const bodyEnd = matchBrace(source, bodyOpen)
    if (bodyEnd < 0) continue
    const tail = source.slice(bodyEnd, bodyEnd + 400)
    const call = tail.match(/^\s*\(\s*_0x[0-9a-fA-F]{3,8}\s*,\s*0x[0-9a-fA-F]+\s*\)\s*\)?\s*;?/)
    if (call) spans.push({ kind: 'rotation', name: null, start: m.index, end: bodyEnd + call[0].length })
  }

  return spans.sort((a, b) => a.start - b.start)
}

function buildDecoder(spans, source) {
  const preamble = spans
    .slice()
    .sort((a, b) => (a.kind === 'rotation' ? 1 : 0) - (b.kind === 'rotation' ? 1 : 0))
    .map((s) => source.slice(s.start, s.end))
    .join('\n')
  const context = vm.createContext({})
  try {
    vm.runInContext(preamble, context, { timeout: 5000 })
  } catch {
    return new Map()
  }
  const decoders = new Map()
  const probe = (fn) => {
    // 索引基址不是 0（常见 `i - 0xf0`），所以按范围探测，命中第一个字符串即认定
    for (let i = 0; i <= 0x800; i += 1) {
      try {
        if (typeof fn(i) === 'string') return true
      } catch {
        return false
      }
    }
    return false
  }
  for (const key of Object.getOwnPropertyNames(context)) {
    if (!ID.test(key)) continue
    const fn = context[key]
    if (typeof fn !== 'function' || fn.length > 2) continue
    if (probe(fn)) decoders.set(key, fn)
  }
  return decoders
}

function toIndex(raw) {
  const value = String(raw).trim()
  if (/^0x[0-9a-fA-F]+$/.test(value)) return Number.parseInt(value, 16)
  if (/^\d+$/.test(value)) return Number.parseInt(value, 10)
  const quoted = value.match(/^['"]([\s\S]*)['"]$/)
  if (quoted) return quoted[1]
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : value
}

/** 把仍然剩下的 `_0x1a2b` 标识符按首次出现顺序改成 v1、v2…（结果确定，便于 diff）。 */
export function renameIdentifiers(source) {
  const ids = new Map()
  let counter = 0
  return source.replace(/\b_0x[0-9a-fA-F]{3,8}\b/g, (token) => {
    if (!ids.has(token)) {
      counter += 1
      ids.set(token, `v${counter}`)
    }
    return ids.get(token)
  })
}

/**
 * @param {string} source 上游产物
 * @param {{ rename?: boolean, keepScaffold?: boolean, stats?: boolean }} [options]
 * @returns {string | { code: string, stats: object }}
 */
export function deobfuscate(source, options = {}) {
  const { rename = true, keepScaffold = false, stats = false } = options
  const spans = findScaffoldSpans(source)
  if (!spans.length) return stats ? { code: source, stats: { mode: 'none', replaced: 0 } } : source

  const decoders = buildDecoder(spans, source)

  // 剔除脚手架（从后往前删，避免位移）
  let body = source
  if (!keepScaffold) {
    for (const span of [...spans].sort((a, b) => b.start - a.start)) {
      body = body.slice(0, span.start) + body.slice(span.end)
    }
  }

  // 别名：`const _0xaaa=_0xdecoder;`
  // 也会出现在逗号链中（`…,_0xaaa=_0xdecoder;`）或别名的别名，迭代到不动点
  const aliasPattern = /(?:\b(?:const|let|var)\s+|,\s*)(_0x[0-9a-fA-F]{3,8})\s*=\s*(_0x[0-9a-fA-F]{3,8})\s*(?=[,;])/g
  for (let grew = true; grew; ) {
    grew = false
    for (const m of body.matchAll(aliasPattern)) {
      const fn = decoders.get(m[2])
      if (fn && !decoders.has(m[1])) {
        decoders.set(m[1], fn)
        grew = true
      }
    }
  }

  const cache = new Map()
  let replaced = 0
  let failed = 0

  body = body.replace(DECODER_CALL, (match, fnName, rawIndex, extra) => {
    const decoder = decoders.get(fnName)
    if (!decoder) return match
    const index = toIndex(rawIndex)
    const key = `${fnName}:${index}:${extra ?? ''}`
    if (cache.has(key)) {
      replaced += 1
      return cache.get(key)
    }
    try {
      const value = extra === undefined ? decoder(index) : decoder(index, toIndex(extra))
      if (typeof value !== 'string') return match
      const literal = JSON.stringify(value)
      cache.set(key, literal)
      replaced += 1
      return literal
    } catch {
      failed += 1
      return match
    }
  })

  // 去掉 `const _0xa=_0xb;` 形式的解码器别名声明（已无用）
  body = body.replace(/(?:^|\n)[ \t]*(?:const|let|var)\s+_0x[0-9a-fA-F]{3,8}\s*=\s*_0x[0-9a-fA-F]{3,8}\s*[;,]/g, '\n')

  const code = rename ? renameIdentifiers(body) : body
  void failed
  const result = { code, stats: { replaced, failed, decoders: decoders.size, scaffolds: spans.map((s) => s.kind) } }
  return stats ? result : code
}

/** 剩余未还原的解码器调用（用于人工核对覆盖率）。 */
export function residualDecoderCalls(source) {
  return [...source.matchAll(DECODER_CALL)].map((m) => m[0])
}
