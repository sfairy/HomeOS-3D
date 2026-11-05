#!/usr/bin/env node
/**
 * 生成代码的格式化出口：把「生成器拼出来的字符串」过一遍仓库的 Biome 配置。
 *
 * 为什么需要一个共用出口
 * --------------------
 * 仓库里有一批 `*.generated.ts`，门禁是**逐字节**比对「重新生成的文本」与「磁盘文件」。
 * 生成器若按自己的口味拼接（`JSON.stringify` 出来的是双引号 + 分号），而全仓
 * `biome format` 会把落盘文件改成单引号 + 无分号，那么**每一次格式化都会让这些门禁变红**，
 * 且红得毫无信息量 —— 文件内容其实完全正确。
 *
 * 让生成结果先过一次 formatter，「生成」与「格式化」恒等：
 * - `--check` 只剩真正的语义漂移会失败；
 * - 将来调 `biome.json`（引号风格 / 行宽 / 尾逗号）也不必逐个改生成器。
 *
 * 走 stdin 而不是「先写盘再格式化」：`--check` 模式不允许碰磁盘，两条路径必须是同一份口径。
 */
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

/**
 * @param {string} text 生成器拼好的文本（不要求已含结尾换行）
 * @param {string} filePath 该文本最终落盘的**绝对路径**：Biome 用它定位属于哪一片
 *   `files.includes` 与哪一条 `overrides`（例如 `homeos-store/**` 仍是双引号 + 分号）。
 * @returns {string} 与磁盘文件应逐字节一致的文本
 */
export function formatGenerated(text, filePath) {
  const require = createRequire(import.meta.url)
  const biome = path.join(path.dirname(require.resolve('@biomejs/biome/package.json')), 'bin', 'biome')
  const result = spawnSync(biome, ['format', `--stdin-file-path=${path.resolve(filePath)}`], {
    input: text,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    // 静默回退会直接重现「格式化一次、门禁红一次」的老问题，所以这里必须硬失败。
    throw new Error(
      `Biome 格式化生成物失败（${path.basename(filePath)}）：` +
        `${(result.stderr || '').trim() || result.error || '未知错误'}`,
    )
  }
  return result.stdout
}
