#!/usr/bin/env bun
/**
 * GLB 场景补全：给「只有 nodes / meshes、没有 scenes」的文件补一个场景（默认 dry-run）。
 *
 * 为什么必须补：`GLTFLoader` 取 `dependencies[0][json.scene || 0]`，`scenes` 缺省时
 * `gltf.scene` 是 `undefined`、`gltf.scenes` 是空数组。加载**不报错**，但整件模型什么都
 * 不显示 —— 2026-10-23 的 30 款精修件（60 个 full/lite）就是这么「空」掉的：
 * `writeFullModel` 只建了 node/mesh，没建 scene，写出去的 GLB 在 three / 各类预览器里
 * 都是空的（`json.scene` 也一起缺）。
 *
 * 只动 JSON chunk：`patchGlbJson` 逐字节保留 BIN，几何 / accessor / 材质一个字节不变。
 * 补出来的结构与全库一致：根节点（名字 = 模型 id，无 mesh）→ children = 原有顶层节点，
 * `scenes = [{ nodes: [root] }]`、`scene = 0`。
 *
 * 幂等：已经有合法场景的文件直接跳过（`--write` 跑两遍，第二遍改动 0 个）。
 *
 * 用法（仓库根目录）：
 * ```bash
 * bun ops/checks/studio/repair_glb_scene.mjs                    # dry-run 全量
 * bun ops/checks/studio/repair_glb_scene.mjs --model basin,bed  # 限量
 * bun ops/checks/studio/repair_glb_scene.mjs --write            # 落盘
 * bun ops/checks/studio/repair_glb_scene.mjs --json             # 机读报告
 * ```
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { listModelFiles, modelsDir, parseGlb, parseModelPath, patchGlbJson } from '../../../homeos/frontend/scripts/models/lib/glb-io.mjs'

const hereDir = path.dirname(fileURLToPath(import.meta.url))
void hereDir

const args = process.argv.slice(2)
const hasFlag = (flag) => args.includes(`--${flag}`)
const valueOf = (flag) => {
  const index = args.indexOf(`--${flag}`)
  return index >= 0 ? args[index + 1] : null
}
const write = hasFlag('write')
const asJson = hasFlag('json')
const only = valueOf('model')
  ?.split(',')
  .map((id) => id.trim())
  .filter(Boolean)

/** 场景是否可用：有 scenes、`scene` 指向存在的下标、scene.nodes 全是合法节点。 */
export function sceneStatus(json) {
  const nodes = json.nodes ?? []
  const scenes = json.scenes ?? []
  if (!scenes.length) return { ok: false, reason: '没有 scenes' }
  const index = json.scene ?? 0
  const scene = scenes[index]
  if (!scene) return { ok: false, reason: `scene 下标 ${index} 越界（scenes 共 ${scenes.length} 个）` }
  const roots = scene.nodes ?? []
  if (!roots.length) return { ok: false, reason: 'scene.nodes 为空' }
  const bad = roots.filter((node) => !(node >= 0 && node < nodes.length))
  if (bad.length) return { ok: false, reason: `scene.nodes 引用了不存在的节点 ${bad.join(',')}` }
  return { ok: true }
}

/** 给 JSON 补场景（原地改），返回是否改动。 */
export function ensureScene(json, { id }) {
  const status = sceneStatus(json)
  if (status.ok) return { changed: false }
  const nodes = json.nodes ?? (json.nodes = [])
  // 极端情况：没有 node 但有 mesh —— 先给每条 mesh 补一个 node，否则场景挂不上任何东西。
  if (!nodes.length && (json.meshes ?? []).length) {
    json.meshes.forEach((mesh, index) => {
      nodes.push({ name: mesh.name ?? `${id}-part-${index}`, mesh: index })
    })
  }
  if (!nodes.length) throw new Error('没有 nodes 也没有 meshes，无法补场景')

  const roots = nodes.map((_, index) => index)
  /*
   * 已有畸形场景（下标越界 / 空 scene.nodes）时**就地修**，不重复挂根：
   * 这种情况少见，但比叠一层新根更安全 —— 不改变原有层级。
   */
  const index = json.scene ?? 0
  const broken = json.scenes?.[index]
  if (broken) {
    broken.nodes = roots
    json.scenes[index] = broken
    json.scene = index
    return { changed: true }
  }
  nodes.push({ name: id, children: roots })
  const rootIndex = nodes.length - 1
  json.scenes = [{ name: id, nodes: [rootIndex] }]
  json.scene = 0
  return { changed: true }
}

function main() {
  const allFiles = listModelFiles()
  const results = []
  for (const relativePath of allFiles) {
    const { id } = parseModelPath(relativePath)
    if (only && !only.includes(id)) continue
    const filePath = path.join(modelsDir, relativePath)
    const before = parseGlb(fs.readFileSync(filePath)).json
    const statusBefore = sceneStatus(before)
    if (statusBefore.ok) continue
    let changed = false
    let error = null
    try {
      const outcome = patchGlbJson(
        filePath,
        (json) => {
          const patched = ensureScene(json, { id })
          changed = patched.changed
          return patched.changed
        },
        { dryRun: !write },
      )
      changed = outcome.changed
    } catch (caught) {
      error = caught.message
    }
    const after = write && !error ? sceneStatus(parseGlb(fs.readFileSync(filePath)).json) : null
    results.push({
      file: relativePath,
      id,
      reason: statusBefore.reason,
      changed,
      wrote: write && changed && !error,
      sceneOkAfter: after ? after.ok : null,
      error,
    })
  }

  const payload = {
    mode: write ? 'write' : 'dry-run',
    scanned: allFiles.length,
    affected: results.length,
    wrote: results.filter((entry) => entry.wrote).length,
    failed: results.filter((entry) => entry.error || entry.sceneOkAfter === false),
    results,
  }

  if (asJson) {
    console.log(JSON.stringify(payload, null, 2))
  } else {
    const lines = results.map(
      (entry) =>
        `  ${entry.wrote ? '✓' : entry.error ? '✗' : '·'} ${entry.file} — ${entry.reason}${entry.error ? `（${entry.error}）` : ''}`,
    )
    console.log(
      `${payload.mode}：${payload.scanned} 个 GLB，${payload.affected} 个缺场景${write ? `，已补 ${payload.wrote} 个` : ''}`,
    )
    if (lines.length) console.log(lines.join('\n'))
    if (payload.failed.length) console.error(`✗ ${payload.failed.length} 个失败`)
  }
  if (payload.failed.length) process.exitCode = 1
}

if (import.meta.main) main()
