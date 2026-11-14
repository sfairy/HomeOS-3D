/**
 * 在 TypeScript **源码文本**上定位一次函数调用的顶层参数。
 *
 * 为什么不用 AST 而按字符扫：这些脚本要处理的是「调用点长什么样」——参数表达式的原文、
 * 中间断行、注释位置。改写（codemod）必须**逐字节**保留参数表达式，只有原文切片能做到；
 * AST 会规范化掉空白与括号，改写结果就不再是「仅重排参数」。
 *
 * 括号层数而不是语法分析：`(`/`[`/`{` 一律 +1，对应的右括号 -1，深度回到 0 即调用结束；
 * 只有深度恰好为 1 的逗号才是参数分隔符。模板字符串里的括号会干扰，因此调用前先用
 * `maskStringLiterals` 把字符串内容抹成等长空白（保住字符偏移），再在原文上切片。
 */

/**
 * 把字符串 / 模板字符串 / 注释的内容抹成等长空白，保留换行。
 *
 * 抹平而不是删除：调用方按偏移回原文切片，长度必须一致。
 *
 * 为什么注释也要抹：文档注释里常写 `` `box(父节点, [宽, 高, 深], …)` `` 这种示例，
 * 不抹掉会被当成真实调用点记进快照 —— 基线里凭空多出几条「调用点」，将来改注释
 * 就会让门禁报红。只抹字符串不够：示例本身是用**反引号**包起来的，反引号又会
 * 被当成模板字符串的开头，把后面的真代码一起吞掉。
 */
export function maskLiterals(source) {
  let out = ''
  let index = 0
  while (index < source.length) {
    const char = source[index]
    const next = source[index + 1]
    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', index)
      const stop = end === -1 ? source.length : end
      out += ' '.repeat(stop - index)
      index = stop
      continue
    }
    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2)
      const stop = end === -1 ? source.length : end + 2
      out += source.slice(index, stop).replace(/[^\n]/g, ' ')
      index = stop
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      const quote = char
      let cursor = index + 1
      while (cursor < source.length && source[cursor] !== quote) {
        if (source[cursor] === '\\') cursor += 1
        cursor += 1
      }
      const stop = Math.min(cursor + 1, source.length)
      out += source.slice(index, stop).replace(/[^\n]/g, ' ')
      index = stop
      continue
    }
    out += char
    index += 1
  }
  return out
}

/**
 * 从 `(` 起切出顶层参数。
 *
 * @param {string} source 原文
 * @param {number} openParenIndex `(` 的下标
 * @param {string} [masked] 已抹平字面量的同长文本；不传则内部生成
 * @returns {{text: string, end: number}[] | null} 每个参数的原文（未 trim）与右括号下标；
 *   括号不闭合时返回 `null`
 */
export function splitCallArgs(source, openParenIndex, masked = maskLiterals(source)) {
  const collected = []
  let depth = 0
  let currentStart = openParenIndex + 1
  for (let index = openParenIndex; index < masked.length; index += 1) {
    const char = masked[index]
    if (char === '(' || char === '[' || char === '{') depth += 1
    else if (char === ')' || char === ']' || char === '}') {
      depth -= 1
      if (depth === 0) {
        collected.push({ text: source.slice(currentStart, index), end: index })
        return collected
      }
    } else if (char === ',' && depth === 1) {
      collected.push({ text: source.slice(currentStart, index), end: index })
      currentStart = index + 1
    }
  }
  return null
}

/** 表达式文本的比较口径：只折叠空白，不动任何标识符或字面量。 */
export function normalizeExpression(text) {
  return text.trim().replace(/\s+/g, ' ')
}

/**
 * 从 `cursor` 起找**最靠前**的一个 `名字(` 调用点。
 *
 * 为什么取最靠前而不是逐个名字扫完：同一段源码里可能交替出现 `addBoxMesh(` 与
 * `addCylinderMesh(`，必须按出现顺序处理，否则「第 n 个调用点」的编号会漂移。
 *
 * 标识符边界：`addBoxMesh(` 不能匹配到 `myaddBoxMesh(`；`.` 之后（`x.addBoxMesh`）照常匹配。
 *
 * @param {string} source 原文
 * @param {number} cursor 起始下标
 * @param {Iterable<string>} names 候选函数名
 * @returns {{index: number, name: string} | null}
 */
export function findNextCall(source, cursor, names) {
  let bestIndex = -1
  let bestName = null
  for (const name of names) {
    const needle = `${name}(`
    let index = source.indexOf(needle, cursor)
    while (index >= 0) {
      const previous = source[index - 1]
      if (previous && /[\w$]/.test(previous)) {
        index = source.indexOf(needle, index + needle.length)
        continue
      }
      break
    }
    if (index >= 0 && (bestIndex < 0 || index < bestIndex)) {
      bestIndex = index
      bestName = name
    }
  }
  return bestIndex < 0 ? null : { index: bestIndex, name: bestName }
}

/** 该名字前面是不是 `function` / `function*`：声明不是调用点。 */
export function isFunctionDeclaration(source, nameIndex) {
  const prefix = source.slice(Math.max(0, nameIndex - 64), nameIndex)
  return /(?:^|[^\w$])function\s*\*?\s*$/.test(prefix)
}

/**
 * 从 `cursor` 起找下一个**真正的调用点**（跳过声明），并切出它的参数。
 *
 * 把「找名字 → 判声明 → 切参数 → 括号不闭合时前进一格」这一串收在一处：
 * 改写脚本与黄金比对脚本都必须用完全相同的口径，否则「同一段源码里数出不同数量的
 * 调用点」，比对结果就没有意义。
 *
 * @param {string} source 原文
 * @param {number} cursor 起始下标
 * @param {Iterable<string>} names 候选函数名
 * @param {string} [masked] 已抹平字面量的同长文本；不传则内部生成一次并复用
 * @returns {{name: string, index: number, args: {text: string, end: number}[] | null, openParen: number} | null}
 *   `args` 为 `null` 表示括号不闭合（调用方应跳到 `openParen + 1` 继续扫）
 */
export function nextCallSite(source, cursor, names, masked = maskLiterals(source)) {
  let position = cursor
  while (position < source.length) {
    const found = findNextCall(source, position, names)
    if (!found) return null
    const openParen = found.index + found.name.length
    if (isFunctionDeclaration(source, found.index)) {
      position = openParen + 1
      continue
    }
    return { name: found.name, index: found.index, args: splitCallArgs(source, openParen, masked), openParen }
  }
  return null
}
