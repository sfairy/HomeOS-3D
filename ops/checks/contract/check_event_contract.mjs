#!/usr/bin/env node
/**
 * 领域事件 / WS 事件契约门禁：发出去的事件必须真的有人接。
 *
 * 这条门禁来自一个真实缺陷：安防「进入延时」早就实现了 `security.entryPending`
 * 事件与 `status()`，但 WS 桥接表里没有它、前端也没有监听 —— 布防后开门进屋，
 * 用户看不到任何倒计时，告警却突然响。类型检查、自检、构建门禁全绿，因为
 * **没有任何一方违约**：事件发了、没人接，编译器看不见。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../../..')
const VERBOSE = process.argv.includes('--verbose')

/** 后端发出、刻意不接的内部事件（每条必须说明理由）。 */
const ALLOWED_UNCONSUMED = new Map([
  ['deviceTimer.fired', '设备倒计时到点直接执行动作；事件保留给外部集成（本仓库无订阅方）'],
  ['notification.delivered', '投递结果已由 _mark_delivered 落库；事件保留给外部集成'],
  ['notification.deliveryFailed', '失败已写站内通知与日志；事件保留给外部集成'],
  ['security.emergencyFailed', '紧急求助失败由同步 API 直接返回调用方；事件保留给外部集成'],
])

/** 浏览器侧收到、但刻意不处理的事件。 */
const ALLOWED_UNHANDLED_CLIENT = new Set()

function walk(dir, exts, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue
    const absolute = join(dir, entry)
    const info = statSync(absolute)
    if (info.isDirectory()) {
      walk(absolute, exts, out)
    } else if (exts.some((ext) => entry.endsWith(ext))) {
      out.push(absolute)
    }
  }
  return out
}

function collect(files, pattern) {
  const names = new Set()
  const hits = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(pattern)) {
      names.add(match[1])
      hits.push({ name: match[1], file: relative(ROOT, file) })
    }
  }
  return { names, hits }
}

const backendFiles = walk(join(ROOT, 'homeos/backend/src'), ['.py'])
const frontendFiles = [
  ...walk(join(ROOT, 'homeos/frontend/src'), ['.ts', '.vue']),
  ...walk(join(ROOT, 'packages/shared/src'), ['.ts']),
]

/**
 * 模块级事件名常量表（``APP_CONFIG_UPDATED = "appConfig.updated"``）。
 *
 * 只认全大写标识符：小写名字在多个模块里语义不同，跨文件解析会制造假命中。
 * 别名（``APP_CONFIG_UPDATED = CONFIG_UPDATED``）需要二次展开 —— 只扫字面量会把
 * 这类「常量指向常量」的调用点当成解析不出来，进而误报或漏检。
 */
const EVENT_CONSTANTS = new Map()
const EVENT_CONSTANT_ALIASES = new Map()
for (const file of backendFiles) {
  const text = readFileSync(file, 'utf8')
  for (const match of text.matchAll(
    /^([A-Z][A-Z0-9_]{2,})\s*(?::\s*[^=\n]+)?=\s*["']([A-Za-z][\w.:-]*)["']\s*(?:#.*)?$/gm,
  )) {
    if (!EVENT_CONSTANTS.has(match[1])) EVENT_CONSTANTS.set(match[1], match[2])
  }
  for (const match of text.matchAll(/^([A-Z][A-Z0-9_]{2,})\s*(?::\s*[^=\n]+)?=\s*([A-Z][A-Z0-9_]{2,})\s*(?:#.*)?$/gm)) {
    if (!EVENT_CONSTANT_ALIASES.has(match[1])) EVENT_CONSTANT_ALIASES.set(match[1], match[2])
  }
}
// 别名最多展开 4 层（足够覆盖「常量 = 另一常量 = 字面量」；环路会在中途停下）。
for (let depth = 0; depth < 4; depth += 1) {
  let changed = false
  for (const [alias, target] of EVENT_CONSTANT_ALIASES) {
    if (EVENT_CONSTANTS.has(alias)) continue
    const value = EVENT_CONSTANTS.get(target)
    if (value) {
      EVENT_CONSTANTS.set(alias, value)
      changed = true
    }
  }
  if (!changed) break
}

/**
 * 逐行收集 emit 站点：字面量、可解析常量、以及「动态但已声明」的转发点。
 *
 * 原来的实现只匹配字面量首参，于是 `emit(APP_CONFIG_UPDATED, …)` /
 * `emit_soon(COOLDOWN_SET_EVENT, …)` / `sio.emit(event, …)` 这些**真实调用点**
 * 从来没被检查过 —— 门禁打印「全部有消费者」只是因为它们根本不在名单里。
 * 这正是它要防的那类缺陷（事件发了没人接）最容易复发的地方。
 */
function collectEmits(files) {
  const names = new Set()
  const hits = []
  const dynamic = []
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n')
    let enclosingDefArgs = ''
    lines.forEach((line, index) => {
      if (/^\s*(async\s+)?def\s+/.test(line)) {
        // 记录当前函数的形参列表：emit 首参若命中它就是「转发助手」。
        const open = line.indexOf('(')
        enclosingDefArgs = open >= 0 ? line.slice(open) : ''
      }
      // `def emit(self, ...)` / `def emit_soon(...)` 是总线自己的定义，不是发出点。
      if (/^\s*(async\s+)?def\s+/.test(line)) return
      for (const match of line.matchAll(/\bemit(?:_soon|_sync)?\(\s*([^,)\n]*)/g)) {
        const raw = match[1].trim()
        if (!raw) continue
        const literal = /^["']([A-Za-z][\w.:-]*)["']/.exec(raw)
        if (literal) {
          names.add(literal[1])
          hits.push({ name: literal[1], file: relative(ROOT, file) })
          continue
        }
        const identifier = /^([A-Za-z_][\w]*)$/.exec(raw)?.[1]
        if (!identifier) continue
        if (eventNameFromConstant(identifier)) {
          const resolved = eventNameFromConstant(identifier)
          names.add(resolved)
          hits.push({ name: resolved, file: relative(ROOT, file) })
          continue
        }
        // 动态名：要求附近（本行或向上 4 行内）有 `# event-contract: forward <原因>`，
        // 否则视为「未经声明的动态发出」直接失败 —— 否则门禁永远查不到这些路径。
        // 允许向上 4 行是因为注释通常写在 `try:` / `for` 之前，而不是紧贴调用行。
        const nearLines = lines.slice(Math.max(0, index - 4), index + 1).join('\n')
        const annotated = /#\s*event-contract:\s*(dynamic|forward)/.test(nearLines)
        if (annotated) {
          dynamic.push({ name: identifier, file: relative(ROOT, file), line: index + 1 })
          continue
        }
        if (identifier === 'self' || identifier === 'cls') continue
        if (enclosingDefArgs.includes(identifier)) {
          dynamic.push({ name: identifier, file: relative(ROOT, file), line: index + 1 })
          continue
        }
        dynamic.push({
          name: identifier,
          file: relative(ROOT, file),
          line: index + 1,
          unannotated: true,
        })
      }
    })
  }
  return { names, hits, dynamic }
}

function eventNameFromConstant(identifier) {
  return EVENT_CONSTANTS.get(identifier) ?? ''
}

/**
 * 收集订阅点：字面量 ``.on("x.y", …)`` 与常量 ``.on(EVENT_CONST, …)``。
 *
 * 只认字面量会把「用常量订阅」的消费者判成不存在 —— 例如
 * ``bus.on(AWAY_SIM_SYNC_EVENT, …)`` 与 ``bus.on(COOLDOWN_SET_EVENT, …)``，
 * 于是两条**已接好**的事件被误报成「发了没人接」。
 */
function collectHandlers(files) {
  const names = new Set()
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/\.on\(\s*([^,\n)]*)/g)) {
      const raw = match[1].trim()
      const literal = /^["']([A-Za-z][\w.:-]*)["']/.exec(raw)
      const resolved = literal?.[1] || eventNameFromConstant(/^([A-Za-z_][\w]*)$/.exec(raw)?.[1] ?? '')
      if (resolved) names.add(resolved)
    }
  }
  return names
}

function collectGatewayEmits(files) {
  const names = new Set()
  const hits = []
  for (const file of files) {
    for (const match of readFileSync(file, 'utf8').matchAll(/(?:sio\.emit|_emit_domain)\(\s*([^,)\n]*)/g)) {
      const raw = match[1].trim()
      const literal = /^["']([A-Za-z][\w.:-]*)["']/.exec(raw)
      const resolved = literal?.[1] || eventNameFromConstant(/^([A-Za-z_][\w]*)$/.exec(raw)?.[1] ?? '')
      if (!resolved) continue
      names.add(resolved)
      hits.push({ name: resolved, file: relative(ROOT, file) })
    }
  }
  return { names, hits }
}

const backendEmits = collectEmits(backendFiles)
const backendHandlers = collectHandlers(backendFiles)
const bridge = collect(
  backendFiles.filter((file) => file.endsWith('domain_events.py') || file.endsWith('bootstrap/lifespan.py')),
  /^\s*["']([A-Za-z][\w.:-]*)["']\s*:\s*(?:self\._handle|_handle|_on_)/gm,
)
const gatewayEmits = collectGatewayEmits(backendFiles)
const clientEvents = collect(frontendFiles, /^\s*[A-Z0-9_]+:\s*['"]([A-Za-z][\w.:-]*)['"]/gm)
const socketHandlers = collect(frontendFiles, /socket\.on\(\s*['"]([A-Za-z][\w.:-]*)['"]/g)

const frontendConsumes = new Set([...clientEvents.names, ...socketHandlers.names])
const backendConsumes = new Set([...backendHandlers, ...bridge.names])

const failures = []

for (const { name, file } of backendEmits.hits) {
  if (!name.includes('.')) continue
  if (backendConsumes.has(name)) continue
  if (ALLOWED_UNCONSUMED.has(name)) continue
  failures.push(`后端发出但无人订阅：${name}（${file}）`)
}

for (const { name, file } of gatewayEmits.hits) {
  if (frontendConsumes.has(name)) continue
  if (ALLOWED_UNHANDLED_CLIENT.has(name)) continue
  failures.push(`后端广播但前端未监听：${name}（${file}）`)
}

// 未经声明的动态发出点：门禁看不见它们的名字，也就无法保证有人接。
for (const site of backendEmits.dynamic.filter((item) => item.unannotated)) {
  failures.push(
    `动态事件名未经声明：emit(${site.name}) ${site.file}:${site.line} —— ` +
      '名字在运行期决定，门禁无法校验；请加 `# event-contract: forward <原因>`（转发助手）' +
      '或改成常量 / 字面量',
  )
}

if (VERBOSE) {
  console.log(`check-event-contract：后端内部事件 ${backendEmits.names.size} 个，`)
  console.log(`  后端订阅 ${backendHandlers.size} 个 + 桥接 ${bridge.names.size} 个；`)
  console.log(`  网关事件 ${gatewayEmits.names.size} 个，前端消费 ${frontendConsumes.size} 个。`)
  console.log(`  事件名常量 ${EVENT_CONSTANTS.size} 个；转发 / 动态站点 ${backendEmits.dynamic.length} 个。`)
}

if (failures.length) {
  console.error(`\n事件契约不成立（${failures.length} 条）：`)
  for (const failure of failures) console.error(`  FAIL  ${failure}`)
  console.error(
    '\n修法：补上消费者（后端 .on / domain_events 桥接 / 前端 WS_CLIENT_EVENTS + socket.on），' +
      '或在 ALLOWED_UNCONSUMED / ALLOWED_UNHANDLED_CLIENT 里写明「为什么没人接」。',
  )
  process.exit(1)
}

console.log('check-event-contract：所有发出的事件都有消费者（或已登记豁免）。')
