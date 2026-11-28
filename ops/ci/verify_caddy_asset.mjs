#!/usr/bin/env node
/**
 * 校验下载到的 Caddy release 资产（tarball）的 sha256。
 *
 * 为什么单独成文件而不写在 shell 里：`node -e '<script>'` 一旦脚本里出现 `${...}`
 * 就会触发 shellcheck 的 SC2016（单引号内不展开），而禁用该告警又会让「真的写错了
 * 引号」永远看不见。抽成文件后 shell 侧只剩一次带位置参数的调用，两边都干净。
 *
 * 为什么必须校验：这个 tarball 解出来的二进制接下来会被**直接执行**。`gzip -t` 只是
 * 格式检查，挡不住被替换的 release 资产，也挡不住会重打包的 TLS 中间层。
 *
 * 用法：
 *   node ops/ci/verify_caddy_asset.mjs <tarball> <version> <os> <arch>
 *
 * 退出码：0 校验通过；1 摘要不匹配或白名单缺条目（均为 fail-closed）。
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PINS_PATH = join(HERE, 'caddy_asset_pins.json')

const [tarball, version, osName, arch] = process.argv.slice(2)
if (!tarball || !version || !osName || !arch) {
  console.error('用法：node ops/ci/verify_caddy_asset.mjs <tarball> <version> <os> <arch>')
  process.exit(1)
}

let pins
try {
  pins = JSON.parse(readFileSync(PINS_PATH, 'utf8')).assets ?? {}
} catch (error) {
  console.error(`::error::读取 ${PINS_PATH} 失败：${error.message}`)
  process.exit(1)
}

const key = `${version}:${osName}_${arch}`
const expected = pins[key]
if (!expected) {
  // fail-closed：不提供「校验不了就跳过」。升级 caddy 时必须同步补摘要。
  console.error(
    `::error::ops/ci/caddy_asset_pins.json 里没有 ${key} 的摘要 —— ` + '升级 caddy 时必须同步补上（取法见该文件 _doc）',
  )
  process.exit(1)
}

const actual = createHash('sha256').update(readFileSync(tarball)).digest('hex')
if (actual !== expected) {
  console.error(`::error::caddy 发包摘要不匹配（${key}）：期望 ${expected}，实际 ${actual}`)
  process.exit(1)
}

console.log(`caddy 发包校验通过（${key}，sha256 ${actual.slice(0, 16)}…）`)
