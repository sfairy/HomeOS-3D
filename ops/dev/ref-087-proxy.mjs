#!/usr/bin/env bun
/**
 * 参考前端本地反代（**只用于 A/B 视觉对照**，不参与构建与发布）。默认 0.8.7，`--ref` 可切版本。
 *
 * 为什么需要它：`源代码/0.8.7/frontend` 是只读快照，页面里的资源路径是
 * `/bridge-static/**`（线上由后端挂载），且 `/api/**` 需要登录态。直接起 `http.server`
 * 会得到「样式全丢 + 接口 401」的空壳，无法和本地实现对比。
 *
 * 做法：
 * - `/**`             → `源代码/0.8.7/frontend/**`
 * - `/bridge-static/*` → `源代码/0.8.7/frontend/static/*`
 * - `/api/*`          → 反代到本机正在运行的后端（默认 8801），并把 Origin / Referer
 *                       改写成后端认识的来源，从而复用同一份登录 Cookie 与同一份草稿。
 *
 * 用法：
 *   bun ops/dev/ref-087-proxy.mjs              # http://localhost:8912/3d-studio.html（0.8.7）
 *   bun ops/dev/ref-087-proxy.mjs --ref 0.8.9  # 同一端口反代 0.8.9（当前对齐目标）
 *   bun ops/dev/ref-087-proxy.mjs --port 8913 --upstream 8801
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '../..')
// 参考版本可切换：默认 0.8.7（历史用法），`--ref 0.8.9` 用于当前对齐目标的并排比图。
const REF_VERSION = argValue('ref', '0.8.7')
const REF_ROOT = path.join(REPO_ROOT, '源代码', REF_VERSION, 'frontend')
const STATIC_ROOT = path.join(REF_ROOT, 'static')

function argValue(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const PORT = Number(argValue('port', '8912'))
const UPSTREAM_PORT = Number(argValue('upstream', '8801'))
/** 后端白名单里的来源：改写头部比伪造 Cookie 更可靠（写请求会校验 Origin）。 */
const UPSTREAM_ORIGIN = `http://localhost:${UPSTREAM_PORT}`

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
  '.bin': 'application/octet-stream',
}

function proxy(req, res) {
  const headers = { ...req.headers, host: `127.0.0.1:${UPSTREAM_PORT}` }
  for (const key of ['origin', 'referer']) {
    if (headers[key]) headers[key] = String(headers[key]).replace(`localhost:${PORT}`, `localhost:${UPSTREAM_PORT}`)
  }
  const upstream = http.request(
    { host: '127.0.0.1', port: UPSTREAM_PORT, method: req.method, path: req.url, headers },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers)
      upstreamRes.pipe(res)
    },
  )
  upstream.on('error', (error) => {
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(`proxy error: ${error.message}`)
  })
  req.pipe(upstream)
}

function serveFile(res, filePath) {
  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found')
      return
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
      'service-worker-allowed': '/',
    })
    fs.createReadStream(filePath).pipe(res)
  })
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`)
  if (url.pathname.startsWith('/api/') || url.pathname === '/socket.io') {
    proxy(req, res)
    return
  }
  const relative = url.pathname.startsWith('/bridge-static/')
    ? path.join(STATIC_ROOT, url.pathname.slice('/bridge-static/'.length))
    : path.join(REF_ROOT, url.pathname)
  // 目录穿越防护：解析后必须仍在快照目录内。
  const resolved = path.resolve(relative)
  if (!resolved.startsWith(REF_ROOT)) {
    res.writeHead(403).end('forbidden')
    return
  }
  serveFile(res, resolved)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`${REF_VERSION} 参考前端：http://localhost:${PORT}/3d-studio.html（/api → :${UPSTREAM_PORT}）`)
  console.log(`登录态来源：先在 ${UPSTREAM_ORIGIN} 登录，再用同一个浏览器打开上面的地址`)
})
