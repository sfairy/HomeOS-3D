#!/usr/bin/env bun
/**
 * 0.8.7 ↔ 本地实现的 A/B 视觉对照（**人工验收工具，不进 gate**）。
 *
 * 为什么单独一个脚本：这两项功能（主视图切换 / 3D 视口编辑 / 灯带三轴 / 毫米标尺）的
 * 差异大量出现在**画布像素**里（手柄描边、虚拟化透明度、圆环采样、标尺端点），
 * DOM 断言看不出「颜色差一档」「少了虚线」。只有同一视口、同一 DPR、同一份草稿的两张
 * 截图并排看，差异才是可证伪的。
 *
 * 前置：
 *   1) `bun ops/dev/ref-087-proxy.mjs`（0.8.7 参考页，:8912）
 *   2) `bun run dev`（本地实现，:8805 或 :8801）
 *   3) 一个开了调试端口的 Chrome：
 *      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *        --remote-debugging-port=9222 --user-data-dir=/tmp/homeos-parity --no-first-run
 *      在该 Chrome 里先用 :8801 登录一次，登录态即可被 :8912 复用。
 *
 * 用法：
 *   bun ops/checks/studio/visual-parity.mjs
 *   bun ops/checks/studio/visual-parity.mjs --states plan,three,selectedItem --out /tmp/parity
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '../../..')

function argValue(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const CDP = argValue('cdp', 'http://127.0.0.1:9222')
const REF_URL = argValue('ref', 'http://localhost:8912/3d-studio.html')
const OURS_URL = argValue('ours', 'http://localhost:8805/3d-studio')
const OUT_DIR = path.resolve(REPO_ROOT, argValue('out', 'docs/analysis/studio-parity'))
const VIEWPORT = { width: 1224, height: 810, deviceScaleFactor: 2, mobile: false }
const STATE_TIMEOUT_MS = 45_000

/** 状态脚本：同一段代码在两边的页面里跑（两边是同一套 DOM 契约）。 */
const STATES = {
  plan: {
    label: '平面为主',
    script: `(() => {
      const button = document.querySelector('[data-workspace-action="plan"]')
      if (button && !button.classList.contains('active')) button.click()
      return true
    })()`,
  },
  three: {
    label: '3D为主',
    script: `(() => {
      const button = document.querySelector('[data-workspace-action="three"]')
      if (button && !button.classList.contains('active')) button.click()
      return true
    })()`,
  },
  selectedItem: {
    label: '平面为主 + 选中单件（标尺/手柄）',
    script: `(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      document.querySelector('[data-workspace-action="plan"]')?.click()
      await wait(500)
      const tab = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === '已放置')
      if (tab && !tab.classList.contains('active')) { tab.click(); await wait(400) }
      const locate = Array.from(document.querySelectorAll('button')).find((b) => /^定位/.test(b.textContent.trim()))
      locate?.click()
      await wait(900)
      return Boolean(locate)
    })()`,
  },
  selectedItem3D: {
    label: '3D为主 + 选中单件（旋转环/中心十字）',
    script: `(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      document.querySelector('[data-workspace-action="three"]')?.click()
      await wait(700)
      const tab = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === '已放置')
      if (tab && !tab.classList.contains('active')) { tab.click(); await wait(400) }
      const locate = Array.from(document.querySelectorAll('button')).find((b) => /^定位/.test(b.textContent.trim()))
      locate?.click()
      await wait(900)
      return Boolean(locate)
    })()`,
  },
}

/** 度量探针：把「看不见的差异」变成可比较的数字。 */
const PROBE = `(() => {
  const canvas = document.querySelector('#plan-canvas')
  let canvasColors = null
  if (canvas) {
    const context = canvas.getContext('2d')
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data
    const near = (r, g, b, tr, tg, tb, tol) =>
      Math.abs(r - tr) <= tol && Math.abs(g - tg) <= tol && Math.abs(b - tb) <= tol
    let accentNew = 0, accentOld = 0, markerFill = 0, rulerLine = 0, ring = 0
    for (let index = 0; index < data.length; index += 4) {
      const r = data[index], g = data[index + 1], b = data[index + 2], a = data[index + 3]
      if (a < 32) continue
      if (near(r, g, b, 255, 177, 79, 12)) accentNew += 1
      if (near(r, g, b, 255, 157, 46, 12)) accentOld += 1
      if (near(r, g, b, 14, 21, 27, 4)) markerFill += 1
      if (near(r, g, b, 145, 183, 203, 10)) rulerLine += 1
      if (near(r, g, b, 115, 201, 239, 10)) ring += 1
    }
    canvasColors = { size: [canvas.width, canvas.height], accentNew, accentOld, markerFill, rulerLine, ring }
  }
  const rulerLabels = Array.from(document.querySelectorAll('.distance-ruler-label')).filter((el) => !el.hidden)
  const handles = Array.from(document.querySelectorAll('.editor-light-gizmo [data-light-handle]')).map((el) => ({
    key: el.dataset.lightHandle,
    display: el.style.display,
    aria: el.getAttribute('aria-label'),
  }))
  const stage = document.querySelector('#plan-stage')?.getBoundingClientRect()
  const preview = document.querySelector('#preview-3d')?.getBoundingClientRect()
  return {
    primary: document.querySelector('.studio-shell')?.dataset.workspacePrimary ?? null,
    barParent: document.querySelector('.editor-workspace-bar')?.parentElement?.id || null,
    stage: stage ? [Math.round(stage.width), Math.round(stage.height)] : null,
    preview: preview ? [Math.round(preview.width), Math.round(preview.height)] : null,
    planView: window.__homeosStudioPlanView
      ? { zoom: window.__homeosStudioPlanView.zoom, offsetX: window.__homeosStudioPlanView.offsetX, offsetY: window.__homeosStudioPlanView.offsetY }
      : null,
    rulers: rulerLabels.map((el) => ({
      mm: el.querySelector('input')?.value ?? null,
      width: el.offsetWidth,
      height: el.offsetHeight,
      fontSize: getComputedStyle(el).fontSize,
    })),
    heightArrow: (() => {
      const arrow = document.querySelector('.editor-height-arrow')
      if (!arrow) return null
      return { hidden: arrow.hidden, disabled: arrow.disabled, text: document.querySelector('.editor-height-value')?.textContent ?? null }
    })(),
    handles,
    canvasColors,
  }
})()`

// ---------------------------------------------------------------- CDP 客户端

class CdpSession {
  #socket
  #nextId = 1
  #pending = new Map()

  static async open(webSocketDebuggerUrl) {
    const session = new CdpSession()
    session.#socket = new WebSocket(webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      session.#socket.addEventListener('open', resolve, { once: true })
      session.#socket.addEventListener('error', reject, { once: true })
    })
    session.#socket.addEventListener('message', (event) => {
      const payload = JSON.parse(String(event.data))
      const pending = session.#pending.get(payload.id)
      if (!pending) return
      session.#pending.delete(payload.id)
      if (payload.error) pending.reject(new Error(payload.error.message))
      else pending.resolve(payload.result)
    })
    return session
  }

  send(method, params = {}) {
    const id = this.#nextId++
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject })
      this.#socket.send(JSON.stringify({ id, method, params }))
    })
  }

  close() {
    this.#socket.close()
  }
}

async function openTab(url) {
  const response = await fetch(`${CDP}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
  const target = await response.json()
  const session = await CdpSession.open(target.webSocketDebuggerUrl)
  await session.send('Page.enable')
  await session.send('Runtime.enable')
  return session
}

async function waitForStudio(session) {
  const deadline = Date.now() + STATE_TIMEOUT_MS
  while (Date.now() < deadline) {
    const { result } = await session.send('Runtime.evaluate', {
      expression: `Boolean(document.querySelector('#plan-canvas'))`,
      returnByValue: true,
    })
    if (result.value === true) return true
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return false
}

async function capture(session, filePath) {
  const { data } = await session.send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(filePath, Buffer.from(data, 'base64'))
}

async function runState(session, stateKey, filePath) {
  const state = STATES[stateKey]
  await session.send('Runtime.evaluate', { expression: state.script, awaitPromise: true, returnByValue: true })
  await new Promise((resolve) => setTimeout(resolve, 900))
  await capture(session, filePath)
  const { result } = await session.send('Runtime.evaluate', {
    expression: PROBE,
    awaitPromise: true,
    returnByValue: true,
  })
  return result.value
}

// ---------------------------------------------------------------- 主流程

const summary = { generatedAt: new Date().toISOString(), viewport: VIEWPORT, ref: REF_URL, ours: OURS_URL, states: {} }
fs.mkdirSync(OUT_DIR, { recursive: true })

const requestedStates = argValue('states', 'plan,three,selectedItem,selectedItem3D')
  .split(',')
  .map((name) => name.trim())
  .filter((name) => name in STATES)
if (!requestedStates.length) {
  console.error(`没有可执行的状态。可选：${Object.keys(STATES).join(', ')}`)
  process.exit(2)
}

let refSession
let oursSession
try {
  refSession = await openTab(REF_URL)
  oursSession = await openTab(OURS_URL)
  for (const session of [refSession, oursSession]) {
    await session.send('Emulation.setDeviceMetricsOverride', VIEWPORT)
  }
  const [refReady, oursReady] = await Promise.all([waitForStudio(refSession), waitForStudio(oursSession)])
  if (!refReady || !oursReady) {
    console.error(`页面未就绪：0.8.7=${refReady} / 本地=${oursReady}（检查 :8912 与 :8805 是否在跑）`)
    process.exit(1)
  }
  for (const stateKey of requestedStates) {
    summary.states[stateKey] = {
      label: STATES[stateKey].label,
      ref: await runState(refSession, stateKey, path.join(OUT_DIR, `${stateKey}-ref.png`)),
      ours: await runState(oursSession, stateKey, path.join(OUT_DIR, `${stateKey}-ours.png`)),
    }
    console.log(`已采集 ${stateKey}: ${STATES[stateKey].label}`)
  }
} finally {
  for (const session of [refSession, oursSession]) session?.close()
}

fs.writeFileSync(path.join(OUT_DIR, 'metrics.json'), `${JSON.stringify(summary, null, 2)}\n`)
console.log(`\n截图与度量已写入 ${path.relative(REPO_ROOT, OUT_DIR)}/`)
console.log('逐条比对 metrics.json 的 canvasColors / rulers / heightArrow / handles 与成对截图。')
