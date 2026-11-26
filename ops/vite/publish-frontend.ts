/**
 * 主应用前端的「旁路 → 线上」发布：覆盖拷贝、修剪陈旧产物、复用未变内容的预压缩 sidecar。
 *
 * 从 `homeos/frontend/vite.config.ts` 下沉到这里，原因有两个：
 *
 *   1. 那段逻辑与 Vite 配置无关，只依赖两个目录路径 —— 留在配置里会让本已很大的
 *      配置文件继续膨胀；
 *   2. sidecar 复用的正确性条件（逐字节相同 + mtime 口径一致）值得单独成文件写清楚，见
 *      `ops/vite/sidecar-reuse.ts`。
 *
 * 发布顺序不能变：先拷贝资源、最后 `index.html`（新外壳上线时新 hash chunk 必须已经在了），
 * 再按旁路清单修剪旧 hash 文件 / 旧 sidecar。全程线上根目录常在，不能先 rename 掉 —— 空窗期
 * `/static` 挂载找不到目录，请求会落到 SPA 外壳（text/html），浏览器对 `shared-*.js` 报
 * Strict MIME。
 */
import fs from 'node:fs'
import path from 'node:path'
import { adoptUnchangedSidecars, syncSidecarMtimes } from './sidecar-reuse.js'

export interface PublishFrontendOptions {
  /** 本轮构建的旁路目录（`frontend.building.<pid>`）。 */
  staging: string
  /** 线上目录（`dist/homeos/frontend`），保留不删。 */
  live: string
  /** 顶层条目名，调用方已把 `index.html` 排到最后。 */
  ordered: readonly string[]
}

/** 删掉 `liveRoot` 里本轮旁路没有的文件（旧 hash chunk、已删除的入口、过期 sidecar）。 */
function pruneStale(liveRoot: string, buildRoot: string): void {
  if (!fs.existsSync(liveRoot) || !fs.existsSync(buildRoot)) return
  const keep = new Set(walkFiles(buildRoot).map((file) => path.relative(buildRoot, file)))
  for (const file of walkFiles(liveRoot)) {
    if (!keep.has(path.relative(liveRoot, file))) fs.rmSync(file, { force: true })
  }
}

function walkFiles(root: string): string[] {
  const out: string[] = []
  if (!fs.existsSync(root)) return out
  const stack = [root]
  while (stack.length > 0) {
    const dir = stack.pop() as string
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (entry.isFile()) out.push(full)
    }
  }
  return out
}

export function publishFrontendEntries(options: PublishFrontendOptions): void {
  const { staging, live, ordered } = options
  const liveStatic = path.join(live, 'static')
  const stagingStatic = path.join(staging, 'static')
  // sidecar 是构建收尾才生成的，旁路里永远没有；先复用线上「内容未变」的那份，
  // 否则下面的 pruneStale 会把它们当陈旧文件删掉，要等下一次 precompress 才补回来。
  const reused = adoptUnchangedSidecars(liveStatic, stagingStatic)
  for (const name of ordered) {
    fs.cpSync(path.join(staging, name), path.join(live, name), { recursive: true, force: true })
  }
  pruneStale(liveStatic, stagingStatic)
  // cpSync 重写了源文件 mtime；不对齐的话复用过来的 sidecar 会被判成「过期」而白重压。
  syncSidecarMtimes(liveStatic, reused)
}
