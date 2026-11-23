/**
 * 复用「源文件内容未变」的预压缩 sidecar（`.br` / `.gz`）。
 *
 * 背景：`precompress-static.mjs` 在构建**收尾**才生成 sidecar，而 Vite 的发布步骤
 * （`homeos/frontend/vite.config.ts` 的 `publishStagingToLive`）会 `pruneStale` 掉旁路产物里
 * 没有的文件 —— sidecar 永远不在旁路里，于是每次发布都会把线上 `static/**` 的 sidecar 当成
 * 陈旧文件删掉，要等下一次 `precompress-static.mjs` 跑完才补回来。这段窗口里后端只能退回
 * 未压缩响应（`PrecompressedStaticFiles` 找不到 sidecar 就走 `StaticFiles`），`check:precompress`
 * 也会报缺失。
 *
 * 但**不能只按文件名保留**：`public/**` 是稳定 URL（`boot-guard.js`、`app.css`、`sw.js`），
 * 内容变了名字不变；留着旧 sidecar 会把旧字节配上新的 `Content-Encoding` 发出去，等于把 JS/CSS
 * 直接改坏。所以这里只复用**逐字节相同**的源文件，并且要求 sidecar 当时确实由这份内容产出
 * （sidecar mtime 与源文件对齐 —— 与 `precompress-static.mjs` 的幂等口径完全一致）。
 *
 * 复用后还要把 sidecar 的 mtime 对齐到发布后的新源文件，否则 precompress 仍会判定「过期」并
 * 重压一遍，复用就白做了。
 */
import fs from 'node:fs'
import path from 'node:path'

/** 与 `precompress-static.mjs` 的 `_SIDECARS` 顺序保持一致：br 优先，其次 gz。 */
const SIDECAR_SUFFIXES = ['.br', '.gz'] as const

/** 与 `precompress-static.mjs` 的 `MTIME_TOLERANCE_MS` 一致。 */
const MTIME_TOLERANCE_MS = 1

/**
 * 把 `liveRoot` 里仍有效的 sidecar 拷进本次旁路 `stagingRoot`（发布时随旁路一起上线）。
 *
 * 返回被复用的源文件相对路径（相对 `stagingRoot`），供 {@link syncSidecarMtimes} 在发布后对齐
 * mtime。空数组表示没有可复用的 sidecar（例如首次构建）。
 */
export function adoptUnchangedSidecars(liveRoot: string, stagingRoot: string): string[] {
  if (!fs.existsSync(liveRoot) || !fs.existsSync(stagingRoot)) return []
  const adopted: string[] = []
  const stack = [stagingRoot]
  while (stack.length > 0) {
    const dir = stack.pop() as string
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const staged = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        stack.push(staged)
        continue
      }
      if (!entry.isFile()) continue
      const relative = path.relative(stagingRoot, staged)
      const live = path.join(liveRoot, relative)
      if (!fs.existsSync(live)) continue
      const available = SIDECAR_SUFFIXES.filter((suffix) => fs.existsSync(live + suffix))
      if (available.length === 0) continue
      const stagedStat = fs.statSync(staged)
      const liveStat = fs.statSync(live)
      // 体积不同必然内容不同：先做最便宜的一刀，避免为改动过的文件读两份内容。
      if (stagedStat.size !== liveStat.size) continue
      // sidecar 与源文件 mtime 不一致 = 上一轮压缩的残影（源改过但没重压），不能复用。
      const fresh = available.every(
        (suffix) => Math.abs(fs.statSync(live + suffix).mtimeMs - liveStat.mtimeMs) <= MTIME_TOLERANCE_MS,
      )
      if (!fresh) continue
      if (!fs.readFileSync(staged).equals(fs.readFileSync(live))) continue
      for (const suffix of available) {
        fs.copyFileSync(live + suffix, staged + suffix)
        // 旁路里的 sidecar 先对齐旁路源文件，发布后只需再对齐一次（见 syncSidecarMtimes）。
        fs.utimesSync(staged + suffix, stagedStat.atime, stagedStat.mtime)
      }
      adopted.push(relative)
    }
  }
  return adopted
}

/**
 * 发布完成后，把复用 sidecar 的 mtime 对齐到线上新源文件。
 *
 * `fs.cpSync` 不保留时间戳，源文件在发布时会被写上新 mtime；不对齐的话，precompress 会把
 * 刚复用的 sidecar 全部判成「过期」，等于没省下压缩成本，`--check` 也过不了。
 */
export function syncSidecarMtimes(root: string, relativePaths: readonly string[]): void {
  if (relativePaths.length === 0) return
  for (const relative of relativePaths) {
    const source = path.join(root, relative)
    if (!fs.existsSync(source)) continue
    const sourceStat = fs.statSync(source)
    for (const suffix of SIDECAR_SUFFIXES) {
      const sidecar = source + suffix
      if (!fs.existsSync(sidecar)) continue
      fs.utimesSync(sidecar, sourceStat.atime, sourceStat.mtime)
    }
  }
}
