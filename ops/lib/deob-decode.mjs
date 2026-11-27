/**
 * 混淆产物的「解码取明文」公共实现。
 *
 * `ops/tools/deob-strings.mjs`（两版语义差集）与 `ops/tools/config-ui-parity.mjs`
 * （配置 UI 文案对账）要做的是同一件事：把 `javascript-obfuscator` 的
 * 「字符串数组 + 十六进制下标 + 数组轮转 + 解码器别名」解回明文。
 * 两份各自实现会立刻长出同构样板 —— 而且解码器一旦有一处写错（漏了轮转、漏了别名递归），
 * 工具就会**静默返回少量串**，看起来像「0 差异」，比报错更危险。所以只留这一份。
 *
 * ## 解码三件套（缺一不可）
 *
 * 1. 字符串数组：`function _0xa(){const _0xb=['...'];...return _0xa();}`
 * 2. 解码器：`function _0xc(i,j){const s=_0xa();return _0xc=function(k,l){k=k-0x99;...},_0xc(i,j);}`
 * 3. 轮转 IIFE：`(function(arr,n){while(1){try{...arr.push(arr.shift())}catch{...}}}(_0xa,0xNNN));`
 *
 * 把 1+3 在 `vm` 里跑一遍，数组就被轮转到正确相位；再调解码器就能把 `_0xc(0x1a2)`
 * 换成明文。单文件里常有多组别名（`_0xd=_0xc`），故按「赋值右值」递归解析到真正的解码器。
 */

import fs from 'node:fs'
import vm from 'node:vm'

const JUNK = /^\d+[A-Za-z]{3,}$|^[A-Za-z]{3,}\d{4,}$|^\d+$|^[0-9a-f]{6,}$/i

/**
 * 值不值得报告。
 *
 * 前端与后端（`.das`）命名风格不同：后端是 snake_case，用前端的 camelCase/kebab
 * 规则会把 `document_entity_references` 这类真实差异**全部过滤掉**。
 *
 * @param {string} text
 * @param {{ backend?: boolean, quoted?: boolean }} [options]
 *   `quoted`：本地该串来自带引号的字面量（后端一律保留）
 */
export function interestingString(text, options = {}) {
  if (!text || text.length < 2 || JUNK.test(text)) return false
  if (/[\u4e00-\u9fff]/.test(text)) return true
  if (options.quoted) return text.trim().length >= 2
  if (/^#[0-9a-f]{3,8}$/i.test(text)) return true
  if (/^\[data-[a-z-]+\]$/.test(text)) return true
  if (/\.(js|glb|css|png|webp)$/.test(text) && text.length < 80) return true
  if (/^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/.test(text) && text.length >= 4) return true
  if (/^[a-z][A-Za-z0-9]{3,}$/.test(text) && /[A-Z]/.test(text)) return true
  // 后端 snake_case：必须带下划线且够长，否则会混入 `item`/`name` 这类噪声。
  if (options.backend && /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(text) && text.length >= 6) return true
  return false
}

/** 该串是否是混淆器产出的噪声（纯数字 / 数字+随机字母 / 十六进制哈希）。 */
export function isJunkString(text) {
  return !text || JUNK.test(text)
}

/**
 * 从 `start` 起做括号配平，返回从该处的 `function` 到函数体结束 `}` 的完整源码。
 *
 * 为什么不能再用正则：解码器的函数体里有嵌套箭头函数与 `,` 表达式，`{0,600}` 这种
 * 长度窗口在真实文件里会**匹配到别的函数**（0.9.0 的 `config-editor.js` 就匹配到了
 * 文件末尾那个同名签名的小函数），于是解码命中数是 0，而工具只报告「字符串字面量差集」，
 * 看起来像「有差异」——这是最危险的一类假阴性。
 */
function sliceFunctionAt(source, start) {
  const braceStart = source.indexOf('{', start)
  if (braceStart < 0) return ''
  let depth = 0
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index]
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, index + 1)
    }
  }
  return ''
}

/** 找到调用数组函数的那个解码器（`const _0x…=_0xa();` 是其唯一稳定特征）。 */
function locateDecoder(source, arrayName) {
  const anchor = source.indexOf(`=${arrayName}();`)
  if (anchor < 0) return null
  const fnStart = source.lastIndexOf('function ', anchor)
  if (fnStart < 0) return null
  const text = sliceFunctionAt(source, fnStart)
  if (!text) return null
  const nameMatch = text.match(/^function (_0x[0-9a-f]+)/)
  return nameMatch ? { name: nameMatch[1], text, index: fnStart } : null
}

/**
 * 解一个混淆的浏览器脚本，返回明文串集合。
 *
 * @param {string} filePath
 * @returns {{ strings: Set<string>, decoded: number, total: number }}
 */
export function decodeObfuscatedFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8')
  const strings = new Set()

  // 字面量串先全部收进来（未混淆的部分，如 export 名、模板字符串）。
  for (const match of source.matchAll(/["']([^"'\n]{2,160})["']/g)) strings.add(match[1])

  const arrayFn = source.match(/function (_0x[0-9a-f]+)\(\)\{const _0x[0-9a-f]+=\[[\s\S]*?return \1\(\);\}/)
  if (!arrayFn) return { strings, decoded: 0, total: 0 }
  const arrayName = arrayFn[1]
  const decoder = locateDecoder(source, arrayName)
  if (!decoder) return { strings, decoded: 0, total: 0 }

  // 轮转 IIFE 在文件里的位置与解码器**无关**（0.9.0 的 config-editor.js 里 IIFE 在顶部、
  // 解码器在文件末尾，中间隔着一串 import）。所以只能按 `}(_0xa,` 反查。
  const iifeTail = source.indexOf(`}(${arrayName},`)
  if (iifeTail < 0) return { strings, decoded: 0, total: 0 }
  const iifeStart = source.lastIndexOf('(function(', iifeTail)
  const iifeEnd = source.indexOf('));', iifeTail)
  if (iifeStart < 0 || iifeEnd < 0) return { strings, decoded: 0, total: 0 }
  const iife = source.slice(iifeStart, iifeEnd + 3)

  const context = { console, parseInt, parseFloat, Math, String, Number, Array, Object, JSON }
  vm.createContext(context)
  try {
    vm.runInContext(`${arrayFn[0]}\n${decoder.text}\n${iife}`, context)
  } catch {
    return { strings, decoded: 0, total: 0 }
  }

  const decoders = Object.keys(context).filter((key) => key.startsWith('_0x') && typeof context[key] === 'function')

  // `_0xd=_0xc` 形式的别名：递归解析到真正的解码器。
  const alias = new Map()
  for (const match of source.matchAll(/(_0x[0-9a-f]+)=(_0x[0-9a-f]+)(?=[,;)])/g)) alias.set(match[1], match[2])
  const resolve = (name) => {
    let current = name
    for (let hop = 0; hop < 12 && alias.has(current) && !decoders.includes(current); hop += 1) {
      current = alias.get(current)
    }
    return current
  }

  let decoded = 0
  let total = 0
  for (const match of source.matchAll(/(_0x[0-9a-f]+)\((0x[0-9a-f]+)\)/g)) {
    total += 1
    const decoder = resolve(match[1])
    if (!decoders.includes(decoder)) continue
    try {
      const value = context[decoder](Number.parseInt(match[2], 16))
      if (typeof value === 'string' && value.length > 1) {
        strings.add(value)
        decoded += 1
      }
    } catch {
      // 越界下标：混淆器自己会兜底，这里直接跳过。
    }
  }
  return { strings, decoded, total }
}

/** 后端 `.das` 里的 PyArmor 噪声（序号变化 / 字节码助记符）。 */
export const PYARMOR_NOISE =
  /^(__pyarmor_|LOAD_|STORE_|CALL_|COMPARE_|JUMP|POP_|PUSH_|BUILD_|UNPACK|IMPORT_|RETURN_|FOR_|GET_|SET_|COPY_|SWAP_|NOP|EXTENDED|SETUP_|MAKE_|IS_|WITH_|BEFORE_|RERAISE|PRINT_|LIST_|DICT_|TUPLE_|CONTAINS|KW_|FORMAT_|GEN_|YIELD_)/

/** Python 内置名 / 通用字段名：出现在每个 `.das` 里，不能当差异。 */
export const PY_BUILTINS = new Set([
  'None',
  'True',
  'False',
  'self',
  'lambda',
  'return',
  'def',
  'class',
  'import',
  'from',
  'async',
  'await',
  'yield',
  'pass',
  'raise',
  'with',
  'while',
  'for',
  'elif',
  'else',
  'and',
  'not',
  'is',
  'in',
  'try',
  'except',
  'finally',
  'global',
  'nonlocal',
  'assert',
  'del',
  'name',
  'code',
  'args',
  'kwargs',
  'type',
  'object',
  'value',
  'values',
  'items',
  'keys',
  'get',
  'set',
  'add',
  'pop',
  'copy',
  'len',
  'str',
  'int',
  'float',
  'list',
  'dict',
  'bool',
  'tuple',
  'range',
  'min',
  'max',
  'abs',
  'super',
  'repr',
  'iter',
  'next',
  'map',
  'filter',
  'zip',
  'sorted',
  'sum',
])

/**
 * 读一个后端 `.das`：只留常量区可读的标识符与字符串字面量。
 *
 * 反汇编里 90% 的差异是 `__pyarmor_enter_NNNN__` 序号变化，必须先剔掉，
 * 否则「11 个模块有语义变更」会被算成「96 个全变了」。
 */
export function decodeBackendFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8')
  const strings = new Set()
  const quoted = new Set()
  for (const match of source.matchAll(/["']([\w .:\/-]{4,120})["']/g)) {
    if (PYARMOR_NOISE.test(match[1])) continue
    strings.add(match[1])
    quoted.add(match[1])
  }
  for (const match of source.matchAll(/\b([A-Za-z_][A-Za-z0-9_]{3,})\b/g)) {
    const token = match[1]
    if (PYARMOR_NOISE.test(token) || PY_BUILTINS.has(token)) continue
    strings.add(token)
  }
  return { strings, quoted, decoded: 0, total: 0 }
}
