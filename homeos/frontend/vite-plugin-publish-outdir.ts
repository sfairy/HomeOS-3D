/**
 * 旁路产物目录原子发布插件。
 *
 * 构建先写到旁路 ``frontend.building``，closeBundle 末尾再原子替换，避免 watch-build
 * 清空窗口里 ``index.html`` / ``modules/runtime`` 失踪（stage.html 500、动态 import 404）。
 *
 * 旧实现 ``rename(live→prev) + rename(building→live)`` 中间有空窗：``/assets`` mount
 * 找不到目录时请求会落到 SPA 外壳（text/html），浏览器对 ``shared-*.js`` 报 Strict MIME。
 * 这里改为：先覆盖拷贝（``index.html`` 最后），再修剪旧 hash 文件，全程根路径常在。
 */
import fs from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const HERE = fileURLToPath(new URL('.', import.meta.url))

/** 线上产物目录（后端 / 8801 直接伺服）。 */
export const finalOutDir = resolve(HERE, '../../dist/homeos/frontend')
/** 旁路构建目录；构建期写这里，closeBundle 末尾再发布进线上。 */
export const outDir = `${finalOutDir}.building`

/** 递归收集 ``root`` 下的全部文件（不含目录本身）。 */
export function walkFiles(root: string): string[] {
  const out: string[] = []
  if (!fs.existsSync(root)) return out
  const stack = [root]
  while (stack.length) {
    const dir = stack.pop()!
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (entry.isFile()) out.push(full)
    }
  }
  return out
}

/** 修剪线上目录里「新构建里不存在」的旧 hash 文件，避免无限堆积。 */
export function pruneStale(liveRoot: string, buildRoot: string): void {
  if (!fs.existsSync(liveRoot) || !fs.existsSync(buildRoot)) return
  const keep = new Set(
    walkFiles(buildRoot).map((f) => f.slice(buildRoot.length + 1).replace(/\\/g, '/')),
  )
  for (const file of walkFiles(liveRoot)) {
    const rel = file.slice(liveRoot.length + 1).replace(/\\/g, '/')
    if (!keep.has(rel)) fs.rmSync(file, { force: true })
  }
}

/**
 * 把旁路 ``frontend.building`` 发布进线上 ``frontend/``，且**不删掉线上根目录**。
 *
 * 资源先于外壳覆盖：避免新 index 已上线却仍缺新 hash chunk。``modules`` 由 runtime
 * 子构建维护，不参与本次覆盖。
 */
export default function publishOutDirPlugin(): Plugin {
  return {
    name: 'homeos-publish-outdir',
    apply: 'build',
    closeBundle() {
      if (!fs.existsSync(outDir)) return
      fs.mkdirSync(finalOutDir, { recursive: true })
      const entries = fs.readdirSync(outDir).filter((name) => name !== 'modules')
      // 先资源后外壳：避免新 index 已上线却仍缺新 hash chunk。
      const ordered = [
        ...entries.filter((name) => name !== 'index.html'),
        ...entries.filter((name) => name === 'index.html'),
      ]
      for (const name of ordered) {
        const from = resolve(outDir, name)
        const to = resolve(finalOutDir, name)
        fs.cpSync(from, to, { recursive: true, force: true })
      }
      for (const bucket of ['assets', 'static'] as const) {
        pruneStale(resolve(finalOutDir, bucket), resolve(outDir, bucket))
      }
      fs.rmSync(outDir, { recursive: true, force: true })
    },
  }
}
