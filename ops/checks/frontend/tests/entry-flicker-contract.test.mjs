/**
 * 入户页（注册 / 登录 / 授权 / 激活 / 商店后台登录）首帧与切换的防闪契约。
 *
 * 这些改动单看每个文件都只是「删一行 / 换一个媒体查询」，但失效时不会编译报错，
 * 只会让手机 / 混合平板重新闪一次，因此把关键不变量钉死在测试里：
 *   - boot-guard：延迟揭示 + 最短可见 + 分两帧入场（同一任务全摘 = 整屏瞬盖）
 *   - 触屏：route-fade 与实时毛玻璃必须同时覆盖 pointer: coarse 与 any-pointer: coarse
 *   - 动效档位：多触点即手持档（iPad + 妙控键盘 / Surface 不再落进 full）
 *   - 商店：先等面板入场收敛，再撤占位壳
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const read = (relativePath) =>
  readFileSync(fileURLToPath(new URL('../../../../' + relativePath, import.meta.url)), 'utf8')

const bootGuard = read('homeos/frontend/public/static/boot-guard.js')
const routeTransitions = read('homeos/frontend/src/assets/styles/route-transitions.css')
const panelCss = read('packages/shared/scene/static/panel.css')
const touchProfile = read('packages/shared/src/scene/touch-profile.ts')
const sceneDepth = read('homeos/frontend/public/static/auth/scene/scene-depth.js')
const stylesReady = read('homeos-store/frontend/src/shared/utils/styles-ready.ts')
const storeMain = read('homeos-store/frontend/src/main.ts')

test('boot-guard：延迟揭示盖住 ready 窗口，且露出后至少停留 500ms', () => {
  const delay = Number(bootGuard.match(/var SHOW_DELAY_MS = (\d+)/)[1])
  assert.ok(delay >= 1000, 'SHOW_DELAY_MS=' + delay + ' 过短：会把已画好的页面整屏盖住')
  const minVisible = Number(bootGuard.match(/var MIN_VISIBLE_MS = (\d+)/)[1])
  assert.ok(minVisible >= 400, 'MIN_VISIBLE_MS=' + minVisible + ' 过短：盖上就撤等于没盖，还多一次合成')
})

test('boot-guard：hidden 与 is-deferred 分两帧摘，禁止同一任务里全摘', () => {
  const fn = bootGuard.slice(
    bootGuard.indexOf('function revealOverlay()'),
    bootGuard.indexOf('function armDeferredOverlay'),
  )
  const hidden = fn.indexOf('box.hidden = false')
  const raf = fn.indexOf('window.requestAnimationFrame')
  const deferred = fn.lastIndexOf("box.classList.remove('is-deferred')")
  assert.ok(hidden > 0 && raf > hidden, 'hidden 必须先去掉，下一帧再摘 is-deferred')
  assert.ok(deferred > raf, 'is-deferred 必须在 rAF 回调里摘；同一任务全摘就是整屏瞬盖')
  assert.match(fn, /if \(isReady\(\) && hasVisibleContent\(\)\) return/)
  assert.match(fn, /if \(studioOverlayVisible\(\)\) return/)
})

test('boot-guard：hide 尊重最短可见时长，减动效时直接隐藏', () => {
  const fn = bootGuard.slice(
    bootGuard.indexOf('function hide()'),
    bootGuard.indexOf('function reloadButton()'),
  )
  assert.match(fn, /MIN_VISIBLE_MS - \(Date\.now\(\) - revealedAt\)/)
  assert.match(fn, /prefersReducedMotion\(\)/)
  assert.match(fn, /box\.hidden = true/)
  assert.match(fn, /box\.classList\.add\('is-deferred'\)/)
})

test('启动屏障契约仍成立：3D 遮罩让路与覆盖层黑名单', () => {
  assert.match(bootGuard, /NON_CONTENT_OVERLAY_IDS = \[OVERLAY_ID, 'studio-loading'\]/)
})

test('route-fade：混合触屏平板也必须关掉整屏过渡', () => {
  const start = routeTransitions.indexOf('@media (pointer: coarse)')
  assert.ok(start > 0, '缺少触屏媒体查询')
  const brace = routeTransitions.indexOf('{', start)
  const query = routeTransitions.slice(start, brace)
  assert.match(query, /\(any-pointer: coarse\)/, 'iPad + 妙控键盘 / Surface 的主指针是 fine，少了 any-pointer 仍会滑整屏')
  assert.match(query, /\(hover: none\)/)
})

test('面板毛玻璃：any-pointer: coarse 在 fine 档之后覆盖为 none', () => {
  const fine = panelCss.indexOf('@media (hover: hover) and (pointer: fine)')
  const anyCoarse = panelCss.indexOf('@media (any-pointer: coarse)')
  assert.ok(fine > 0 && anyCoarse > fine, 'any-pointer 兜底必须写在 fine 档之后才有覆盖力')
  const block = panelCss.slice(anyCoarse, anyCoarse + 400)
  assert.match(block, /backdrop-filter: none/)
  assert.match(block, /-webkit-backdrop-filter: none/)
})

test('动效档位：多触点即手持档，且不再只特判 iPad 伪装 Mac', () => {
  assert.match(touchProfile, /\(navigator\.maxTouchPoints \|\| 0\) > 1/)
  assert.equal(/iPadInDisguise/.test(touchProfile), false)
  assert.match(sceneDepth, /\(navigator\.maxTouchPoints \|\| 0\) > 1/)
  assert.equal(/iPadInDisguise/.test(sceneDepth), false)
})

/** 在最小 DOM 桩里跑一遍阻塞版 scene-depth.js，返回它写下的档位。 */
function runSceneDepth({ maxTouchPoints, matches }) {
  const attrs = Object.create(null)
  const classes = new Set()
  const documentElement = {
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
    },
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    setAttribute: (name, value) => {
      attrs[name] = value
    },
  }
  const matchMedia = (query) => ({
    matches: matches.includes(query),
    addEventListener() {},
    addListener() {},
  })
  const context = vm.createContext({
    window: { matchMedia, document: { documentElement } },
    document: { documentElement },
    navigator: { maxTouchPoints, platform: 'MacIntel' },
  })
  vm.runInContext(sceneDepth, context)
  return { motion: attrs['data-hos-motion'], touch: classes.has('hos-touch') }
}

test('动效档位行为：混合平板落 ambient，纯桌面 full，减动效 frozen', () => {
  const hybrid = runSceneDepth({ maxTouchPoints: 5, matches: ['(min-width: 768px)'] })
  assert.equal(hybrid.motion, 'ambient')
  assert.equal(hybrid.touch, true)

  const desktop = runSceneDepth({ maxTouchPoints: 0, matches: ['(min-width: 768px)'] })
  assert.equal(desktop.motion, 'full')
  assert.equal(desktop.touch, false)

  const reduced = runSceneDepth({
    maxTouchPoints: 5,
    matches: ['(min-width: 768px)', '(prefers-reduced-motion: reduce)'],
  })
  assert.equal(reduced.motion, 'frozen')
})

test('商店揭壳：面板入场收敛（或超时）之后才移除占位壳', () => {
  assert.match(stylesReady, /export async function waitForEntrySettled/)
  assert.match(stylesReady, /getComputedStyle\(panel\)\.opacity/)
  assert.match(stylesReady, />= 0\.99/)
  const settle = storeMain.indexOf('await waitForEntrySettled()')
  const remove = storeMain.indexOf('document.getElementById("store-boot-shell")?.remove()')
  assert.ok(settle > 0, 'main.ts 必须在撤壳前 await waitForEntrySettled')
  assert.ok(remove > settle, '等待必须发生在移除占位壳之前')
})
