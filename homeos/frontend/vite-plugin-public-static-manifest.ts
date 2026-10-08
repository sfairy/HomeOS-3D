/**
 * 匿名静态白名单清单生成插件。
 *
 * 产出 ``/static`` 匿名白名单（``dist/homeos/frontend/public-static.json``）。
 *
 * 后端用它判定「未登录也必须能加载」的静态资源：白名单**之外**的 ``/static/**`` 一律要求
 * 已登录会话（见 backend/src/studio_shell.py）。种子清单是 ``public-static.seed.json``。
 *
 * 必须排在所有产物写入插件之后：它要按「产物是否真的存在」筛种子条目，而
 * ``classicIifePlugin`` 的 closeBundle 才写入 ``/static/logging/client-log.js`` 这类 IIFE 包。
 * closeBundle 按插件数组顺序串行执行，所以本插件必须放在数组最后一位。
 */
import fs from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { outDir } from './vite-plugin-publish-outdir.ts'

const HERE = fileURLToPath(new URL('.', import.meta.url))

/** SPA 唯一入口。 */
const SPA_ENTRY = 'index.html'

type ManifestPayload = {
  _comment?: unknown
  files: Array<string | { path: string; why?: string }>
  alwaysRevalidate?: Array<string | { path: string; why?: string }>
}

/** 按种子清单与 index.html 实际引用，筛出落盘后才存在的匿名静态资源白名单。 */
export function updatePublicStaticManifest(): void {
  const seedPath = resolve(HERE, 'public-static.seed.json')
  const manifestPath = resolve(outDir, 'public-static.json')
  const seed = fs.existsSync(seedPath) ? seedPath : manifestPath
  if (!fs.existsSync(seed)) return
  let payload: ManifestPayload
  try {
    payload = JSON.parse(fs.readFileSync(seed, 'utf8'))
  } catch {
    return
  }
  const discovered = new Set<string>()
  // SPA 入口是未登录唯一会下发的 HTML：它引用的 `/static/**`（入口 chunk、其
  // modulepreload 依赖、外壳样式、经典启动脚本）就是未登录也必须可加载的全集。
  // 认证后视图是懒加载 chunk，不出现在这里，因此继续受登录门禁保护。
  const htmlPath = resolve(outDir, SPA_ENTRY)
  if (fs.existsSync(htmlPath)) {
    const html = fs.readFileSync(htmlPath, 'utf8')
    for (const match of html.matchAll(/(?:src|href)=["'](\/static\/[^"']+)["']/g)) {
      discovered.add(match[1].replace(/\?v=[^"']+$/i, ''))
    }
  }
  for (const stable of [
    '/static/logging/client-log.js',
    '/static/display/display-boot.js',
    '/static/display/display-startup.js',
    '/static/auth/scene/scene-depth.js',
    // 认证页样式表由 App.vue 在运行时插入 <head>，不在 SPA 入口里，需显式登记。
    '/static/auth/scene/fonts.css',
    '/static/auth/scene/page.css',
    '/static/auth/scene/scene.css',
    '/static/auth/scene/panel.css',
    '/static/appearance.css',
  ]) {
    discovered.add(stable)
  }
  const kept: Array<{ path: string; why: string }> = []
  const seen = new Set<string>()
  const pruned: string[] = []
  for (const item of payload.files || []) {
    const p = typeof item === 'string' ? item : item.path
    if (!p?.startsWith('/static/')) continue
    if (seen.has(p)) continue
    // 种子清单记的是逻辑路径，而产物可能带内容哈希或按域归入子目录，因此按产物
    // 实际存在与否筛一遍，只保留真正落盘的路径。
    // 注意：被剪掉的条目**不占用 seen** —— 否则「种子缺条目 → 剪掉 → 又被 HTML
    // 发现」的同一路径会被 seen 挡在补回分支之外，最终静默 401（见下方 discovered 循环）。
    if (!fs.existsSync(resolve(outDir, p.replace(/^\//, '')))) {
      pruned.push(p)
      continue
    }
    seen.add(p)
    kept.push({ path: p, why: typeof item === 'object' && item.why ? item.why : '' })
  }
  // index.html 与登记清单引用的静态资源是**硬要求**：产物缺失就是每个页面稳定 404
  // （静态处理回 JSON 错误信封，浏览器还会再报一次「MIME 类型不可执行」）。
  // 这类缺口不能只 warn —— 曾经 ``auth/scene/scene-depth.ts`` 在应用树合并时随
  // ``app/auth/**`` 一并丢失，``vite-studio.ts`` 的入口指向不存在的文件却**不报错、
  // 只是不产出**，白名单照样登记，于是登录页首帧前 404、``hos-touch`` 手持档全失效。
  const missing: string[] = []
  for (const p of [...discovered].sort()) {
    if (!fs.existsSync(resolve(outDir, p.replace(/^\//, '')))) {
      missing.push(p)
      continue
    }
    if (seen.has(p)) continue
    seen.add(p)
    kept.push({ path: p, why: 'SPA 入口引用的匿名静态资源，必须匿名可加载。' })
  }
  if (missing.length > 0) {
    throw new Error(
      `以下匿名静态资源被 index.html 或登记清单引用，但构建产物里不存在（线上会稳定 404）：\n  ${missing.join('\n  ')}\n` +
        '常见原因：vite-studio.ts / vite.config.ts 的入口指向了不存在的源文件 —— ' +
        '这不会让构建报错，只会不产出该产物。请补齐源文件或移除引用。',
    )
  }
  payload.files = kept
  // 记录被筛掉的种子条目，方便核对「是不是真有资源漏了」而不是被静默吞掉。
  ;(payload as Record<string, unknown>)._prunedStaleSeed = pruned.sort()
  if (pruned.length > 0) {
    console.warn(
      `[homeos] 匿名白名单筛掉 ${pruned.length} 条不存在的种子条目：\n  ${pruned.join('\n  ')}`,
    )
  }
  const revalidate = new Set<string>()
  for (const p of discovered) {
    if (p.endsWith('.js') || p.endsWith('.css')) revalidate.add(p)
  }
  payload.alwaysRevalidate = [...revalidate].sort().map((p) => ({
    path: p,
    why: '入口页构建产物，内容变化即换 URL/必须回源。',
  }))
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(manifestPath, JSON.stringify(payload, null, 2) + '\n', 'utf8')
}

export default function publicStaticManifestPlugin(): Plugin {
  return {
    name: 'homeos-public-static-manifest',
    apply: 'build',
    closeBundle() {
      updatePublicStaticManifest()
    },
  }
}
