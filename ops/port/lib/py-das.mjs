/**
 * 解析 Pyarmor-Static-Unpack-1shot 生成的 `.1shot.das`（纯反汇编，不含解密逻辑）。
 *
 * 之所以以 `.das` 为后端事实来源：`.1shot.cdc.py`（pycdc）会把 `async with`、闭包、
 * 装饰器丢失成 `# WARNING: Decompyle incomplete`，据此判「删除」会误报
 * （0.8.2→0.8.4 的 `DELETE /{project_id}` 就是这么误判的）。反汇编虽然晦涩，
 * 但指令与常量是完整的。
 *
 * 供 diff-classify 使用的三通道：
 *   - constants：字符串/数字常量集合（语义的字面量依据）
 *   - opcodes：指令直方图（结构依据；重加密不改指令，逻辑改动必改指令配比）
 *   - objects：模块内函数/类名（接口依据）
 */

const OPCODE_LINE = /^\s{6,}(\d+)\s+([A-Z][A-Z0-9_]+)\b/
const QUOTED = /^\s+('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*$/

function unquote(literal) {
  const body = literal.slice(1, -1)
  return body.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|.)/g, (_, esc) => {
    if (esc[0] === 'x') return String.fromCharCode(Number.parseInt(esc.slice(1), 16))
    if (esc[0] === 'u') return String.fromCharCode(Number.parseInt(esc.slice(1), 16))
    if (esc === 'n') return '\n'
    if (esc === 't') return '\t'
    if (esc === 'r') return '\r'
    return esc
  })
}

/** @param {string} text .das 文件内容 */
export function parseDas(text) {
  const strings = new Set()
  const numbers = new Set()
  const objects = []
  const opcodes = new Map()
  let section = ''
  let currentObject = null

  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (
      trimmed === '[Names]' ||
      trimmed === '[Locals+Names]' ||
      trimmed === '[Constants]' ||
      trimmed === '[Disassembly]' ||
      trimmed === '[Code]'
    ) {
      section = trimmed.slice(1, -1)
      continue
    }
    if (trimmed.startsWith('Object Name:')) {
      currentObject = trimmed.slice('Object Name:'.length).trim()
      if (currentObject && !currentObject.includes('<')) objects.push(currentObject)
      continue
    }
    if (
      trimmed.startsWith('File Name:') ||
      trimmed.startsWith('Qualified Name:') ||
      trimmed.startsWith('Arg Count') ||
      trimmed.startsWith('Flags')
    )
      continue

    if (section === 'Constants') {
      const m = line.match(QUOTED)
      if (m) {
        const value = unquote(m[1])
        if (value.length > 0 && !value.startsWith('__pyarmor')) strings.add(value)
        continue
      }
      const num = trimmed.match(/^(-?\d+(?:\.\d+)?)$/)
      if (num) numbers.add(num[1])
      continue
    }
    if (section === 'Disassembly') {
      const m = line.match(OPCODE_LINE)
      if (m) opcodes.set(m[2], (opcodes.get(m[2]) ?? 0) + 1)
    }
  }

  return { strings, numbers, objects, opcodes }
}

/** 从 `.1shot.das` 里抽取 FastAPI 路由装饰器目标（`@router.get('/x')` 之类）。 */
export function dasRoutes(text) {
  const routes = new Set()
  // 反汇编里路由字符串与 'get'/'post' 等并列出现在常量池中，配合 LOAD_CONST 顺序不可靠，
  // 因此改为「所有以 / 开头且含至少两个路径段的常量」——用于跨版本集合对比足够。
  const parsed = parseDas(text)
  for (const s of parsed.strings) {
    if (/^\/[A-Za-z0-9_{}./:-]{2,}$/.test(s) && !s.startsWith('//')) routes.add(s)
  }
  return routes
}
