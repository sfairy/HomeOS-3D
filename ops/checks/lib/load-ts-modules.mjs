/**
 * 门禁脚本的公共工具：把若干 TS 源文件打成一个临时 ESM 再 `import`。
 *
 * 为什么需要：这些脚本要断言的是**源码里的纯函数**，而源码用 `@app/*` 别名与无扩展名
 * 相对导入，原生 Node 解析不了。每个脚本各写一份 esbuild 调用会被 `check:duplicates`
 * 判成重复（它按行的相似度算），所以收进一处。
 *
 * 临时目录用完即删；调用方拿到的是模块命名空间，按需解构。
 */
import { build } from 'esbuild'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * @param {string[]} entryFiles 要合并导出的 TS 源文件（绝对路径）
 * @param {{ alias?: Record<string, string>, prefix?: string }} [options]
 *   `alias` 透传给 esbuild（如 `{'@app': '<repo>/homeos/frontend/src/studio/app'}`）；
 *   `prefix` 只用于临时目录名，便于排查。
 * @returns {Promise<Record<string, unknown>>} 合并后的模块导出
 */
export async function loadTsModules(entryFiles, options = {}) {
  const { alias, prefix = 'gate' } = options
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`))
  const entry = path.join(dir, 'entry.ts')
  fs.writeFileSync(entry, entryFiles.map((file) => `export * from ${JSON.stringify(file)}`).join('\n'), 'utf8')
  const outfile = path.join(dir, 'bundle.mjs')
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    logLevel: 'silent',
    ...(alias ? { alias } : {}),
  })
  const modules = await import(`file://${outfile}`)
  fs.rmSync(dir, { recursive: true, force: true })
  return modules
}
