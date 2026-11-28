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

const backendEmits = collect(backendFiles, /emit(?:_soon|_sync)?\(\s*["']([A-Za-z][\w.:-]*)["']/g)
const backendHandlers = collect(backendFiles, /\.on\(\s*["']([A-Za-z][\w.:-]*)["']/g)
const bridge = collect(
  backendFiles.filter((file) => file.endsWith('domain_events.py') || file.endsWith('bootstrap/lifespan.py')),
  /^\s*["']([A-Za-z][\w.:-]*)["']\s*:\s*(?:self\._handle|_handle|_on_)/gm,
)
const gatewayEmits = collect(backendFiles, /(?:sio\.emit|_emit_domain)\(\s*["']([A-Za-z][\w.:-]*)["']/g)
const clientEvents = collect(frontendFiles, /^\s*[A-Z0-9_]+:\s*['"]([A-Za-z][\w.:-]*)['"]/gm)
const socketHandlers = collect(frontendFiles, /socket\.on\(\s*['"]([A-Za-z][\w.:-]*)['"]/g)

const frontendConsumes = new Set([...clientEvents.names, ...socketHandlers.names])
const backendConsumes = new Set([...backendHandlers.names, ...bridge.names])

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

if (VERBOSE) {
  console.log(`check-event-contract：后端内部事件 ${backendEmits.names.size} 个，`)
  console.log(`  后端订阅 ${backendHandlers.names.size} 个 + 桥接 ${bridge.names.size} 个；`)
  console.log(`  网关事件 ${gatewayEmits.names.size} 个，前端消费 ${frontendConsumes.size} 个。`)
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
