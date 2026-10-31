#!/usr/bin/env node
/**
 * 认证入口拆包的产物断言。
 *
 * 为什么需要它：P0-1 把 Login/Register/ResetPassword/License/LicenseRecovery 从主包切到
 * auth entry chunk。服务端只给认证页注入 auth-entry.json 里的 preload / stylesheet；
 * 如果清单缺项、路径不是 /static/**、产物没落盘，或者匿名白名单漏了 auth chunk，
 * 登录页会先白屏或首屏样式闪一下 —— 这类回归在本地开发（Vite dev 不写清单）看不出来。
 *
 * 本脚本只读 dist/，不构建；由 ops/ci/build_frontend_verify.sh 在 build 之后调用。
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = path.resolve(import.meta.dirname, '../..')
const FRONTEND = path.join(ROOT, 'dist', 'homeos', 'frontend')
const MANIFEST = path.join(FRONTEND, 'auth-entry.json')

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (!existsSync(MANIFEST)) {
  fail('缺少 dist/homeos/frontend/auth-entry.json：认证入口拆包没有产出清单。')
}

let manifest
try {
  manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
} catch (error) {
  fail('auth-entry.json 不是合法 JSON：' + error.message)
}

const entry = manifest?.entry
const js = manifest?.js
const css = manifest?.css
if (typeof entry !== 'string' || !entry.startsWith('/static/')) {
  fail('auth-entry.json 的 entry 必须是一条 /static/ 路径，实际：' + String(entry))
}
if (!Array.isArray(js) || js.length === 0) {
  fail('auth-entry.json 的 js 必须是非空数组。')
}
if (!Array.isArray(css) || css.length === 0) {
  fail('auth-entry.json 的 css 必须是非空数组。')
}
if (js[0] !== entry) {
  fail('auth-entry.json 的第一个 js 必须是 entry chunk。entry=' + entry + ' js[0]=' + js[0])
}

const urls = [...js, ...css]
for (const url of urls) {
  if (typeof url !== 'string' || !url.startsWith('/static/')) {
    fail('auth-entry.json 含非 /static/ 路径：' + String(url))
  }
  if (url.includes('..')) fail('auth-entry.json 含路径穿越：' + url)
  const file = path.join(FRONTEND, url.slice(1))
  if (!existsSync(file)) fail('auth-entry.json 引用了不存在的产物：' + url)
}

const publicStaticPath = path.join(FRONTEND, 'public-static.json')
if (!existsSync(publicStaticPath)) {
  fail('缺少 dist/homeos/frontend/public-static.json：匿名白名单未生成。')
}
let publicStatic
try {
  publicStatic = JSON.parse(readFileSync(publicStaticPath, 'utf8'))
} catch (error) {
  fail('public-static.json 不是合法 JSON：' + error.message)
}
const publicFiles = new Set(
  (publicStatic?.files ?? [])
    .map((item) => (typeof item === 'string' ? item : item?.path))
    .filter((item) => typeof item === 'string'),
)
for (const url of urls) {
  if (!publicFiles.has(url)) {
    fail('匿名白名单漏了认证入口资源，未登录访问登录页会 401：' + url)
  }
}

const indexHtml = readFileSync(path.join(FRONTEND, 'index.html'), 'utf8')
if (indexHtml.includes(entry)) {
  fail('index.html 直接引用了认证入口 chunk，非认证页会重新把它拉回主包：' + entry)
}

console.log(
  '认证入口清单通过：entry=' + entry + ' js=' + js.length + ' css=' + css.length,
)
