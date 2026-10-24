/**
 * GLB 容器读写与文件清单（**不碰顶点数据**）。
 *
 * 这一层只做三件事，目的是把「只改材质 JSON」和「改几何」彻底分开：
 * 1. 解析 / 写出 GLB 容器（12 字节头 + JSON chunk + BIN chunk）；
 * 2. 原地替换 JSON chunk 时**逐字节保留 BIN chunk** —— 材质回填、槽位改名都属于这一类，
 *    改完的 GLB 与原件只差 JSON 里的那几个字段，几何/animation/extras 一个字节都不动；
 * 3. 递归列模型文件、算模型 id（去掉 `-lite`）。
 *
 * 顶点数据、世界包围盒、拓扑统计走 `model-document.mjs`（glTF-Transform + Draco 解码），
 * 因为 Draco 压缩的 256 个文件必须先解码才拿得到 POSITION。
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const hereDir = path.dirname(fileURLToPath(import.meta.url))
/** `homeos/frontend`：本文件位于 `<frontend>/scripts/models/lib/`。 */
export const frontendDir = path.resolve(hereDir, '..', '..', '..')
export const repoRoot = path.resolve(frontendDir, '..', '..')
export const modelsDir = path.join(frontendDir, 'public/static/3d-studio/models')
/** `homeos/frontend/scripts/models`。 */
export const scriptsDir = path.resolve(hereDir, '..')
export const specsDir = path.join(scriptsDir, 'specs')

/**
 * 磁盘上是中文目录 / 中文文件名，代码里是英文 id。翻译表只有一份
 * （`model-asset-folders.ts`），这里按需加载，避免各脚本各写一套正则。
 */
const { modelAssetFolder, modelAssetFolderFromPath, modelAssetIdForStem } = await import(
  pathToFileURL(
    path.join(
      frontendDir,
      'src/studio/app/3d-studio/loaders/external-models/model-asset-folders.ts',
    ),
  ).href
)

const GLB_MAGIC = 0x46546c67 // "glTF"
const GLB_VERSION = 2
const CHUNK_JSON = 0x4e4f534a // "JSON"
const CHUNK_BIN = 0x004e4942 // "BIN\0"

/** 递归列出模型目录下的 GLB 相对路径（分隔符统一为 `/`，排序稳定）。 */
export function listModelFiles(dir = modelsDir, relativePrefix = '') {
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relativePath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) files.push(...listModelFiles(path.join(dir, entry.name), relativePath))
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.glb')) files.push(relativePath)
  }
  return files.sort()
}

/**
 * `家居/客厅家具/沙发-lite.glb` → `{ id: 'sofa', variant: 'lite', folder: 'home/living' }`。
 *
 * 磁盘上是中文路径，`folder` / `id` 一律是代码里的英文键（存档、规格与基线都用它）；
 * `folderPath` / `stem` 保留磁盘原名，用于日志和 `git show`。
 * 迁移中途可能还有旧英文目录 / 文件名，`modelAssetIdForStem` 两种都认。
 */
export function parseModelPath(relativePath) {
  const slash = relativePath.lastIndexOf('/')
  const folderPath = slash >= 0 ? relativePath.slice(0, slash) : ''
  const fileName = relativePath.slice(slash + 1)
  const stem = fileName.replace(/-lite\.glb$/i, '').replace(/\.glb$/i, '')
  const folder = folderPath ? modelAssetFolderFromPath(folderPath) : undefined
  return {
    folder: folder ?? folderPath,
    folderPath,
    fileName,
    stem,
    id: modelAssetIdForStem(stem, folder) ?? stem,
    variant: /-lite\.glb$/i.test(fileName) ? 'lite' : 'full',
  }
}

/** 模型静态资源的公共前缀。 */
export const MODELS_URL_PREFIX = '/static/3d-studio/models/'

/**
 * 模型 URL → 英文 id。
 *
 * `.../models/家居/客厅家具/沙发-lite.glb?v=1` → `sofa`；迁移前的
 * `.../models/home/living/sofa-lite.glb` 同样认。不是模型 URL 时返回 `null`。
 */
export function modelIdFromUrl(url) {
  if (typeof url !== 'string' || !url.includes(MODELS_URL_PREFIX)) return null
  const tail = decodeURIComponent(
    url.slice(url.indexOf(MODELS_URL_PREFIX) + MODELS_URL_PREFIX.length).split('?')[0],
  )
  const segments = tail.split('/').filter(Boolean)
  const fileName = segments.pop() ?? ''
  if (!/\.glb$/i.test(fileName)) return null
  const folder = segments.length ? modelAssetFolderFromPath(segments.slice(-2).join('/')) : undefined
  const stem = fileName.replace(/-lite\.glb$/i, '').replace(/\.glb$/i, '')
  return modelAssetIdForStem(stem, folder) ?? stem
}

/**
 * 读模型在某个 git 版本里的字节。
 *
 * 改名迁移期间 HEAD 里还是英文路径，提交之后又只剩中文路径 —— 两条都试一次，
 * 让「当前 vs HEAD」这类比较门禁在迁移前后都能工作。
 */
export function readModelAtRevision(relativePath, revision = 'HEAD') {
  const parsed = parseModelPath(relativePath)
  const folder = modelAssetFolder(parsed.id)
  const legacyPath = folder
    ? `${folder}/${parsed.id}${parsed.variant === 'lite' ? '-lite' : ''}.glb`
    : null
  for (const candidate of [relativePath, legacyPath].filter(Boolean)) {
    try {
      return execFileSync(
        'git',
        [
          'show',
          `${revision}:homeos/frontend/public/static/3d-studio/models/${candidate}`,
        ],
        { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] },
      )
    } catch {
      // 换下一个候选
    }
  }
  return null
}

/** 模型 id → { lite, full } 相对路径（缺的变体不出现）。 */
export function collectModelVariants(files = listModelFiles()) {
  const byId = new Map()
  for (const relativePath of files) {
    const parsed = parseModelPath(relativePath)
    const entry = byId.get(parsed.id) ?? {}
    entry[parsed.variant] = relativePath
    byId.set(parsed.id, entry)
  }
  return byId
}

/**
 * 解析 GLB 容器。
 * @returns {{json: any, bin: Buffer, jsonOffset: number, jsonLength: number, binOffset: number, binLength: number, byteLength: number, declaredLength: number, version: number}}
 */
export function parseGlb(buffer) {
  if (buffer.length < 12) throw new Error('文件不足 12 字节，不是 GLB')
  const magic = buffer.readUInt32LE(0)
  if (magic !== GLB_MAGIC) throw new Error(`magic 不是 glTF（0x${magic.toString(16)}）`)
  const version = buffer.readUInt32LE(4)
  const declaredLength = buffer.readUInt32LE(8)
  if (declaredLength > buffer.length) {
    throw new Error(`头部声明 ${declaredLength} 字节，实际只有 ${buffer.length} 字节（文件被截断）`)
  }
  let offset = 12
  let json = null
  let bin = Buffer.alloc(0)
  let jsonOffset = -1
  let jsonLength = 0
  let binOffset = -1
  let binLength = 0
  while (offset + 8 <= buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset)
    const chunkType = buffer.readUInt32LE(offset + 4)
    const bodyStart = offset + 8
    if (bodyStart + chunkLength > buffer.length) throw new Error('chunk 长度越界（文件被截断）')
    if (chunkType === CHUNK_JSON) {
      const text = buffer.subarray(bodyStart, bodyStart + chunkLength).toString('utf8')
      json = JSON.parse(text)
      jsonOffset = bodyStart
      jsonLength = chunkLength
    } else if (chunkType === CHUNK_BIN) {
      bin = buffer.subarray(bodyStart, bodyStart + chunkLength)
      binOffset = bodyStart
      binLength = chunkLength
    }
    offset = bodyStart + chunkLength
  }
  if (!json) throw new Error('没有 JSON chunk')
  return { json, bin, jsonOffset, jsonLength, binOffset, binLength, byteLength: buffer.length, declaredLength, version }
}

/** 读 GLB 文件。 */
export function readGlbFile(filePath) {
  return parseGlb(fs.readFileSync(filePath))
}

/** 拼 GLB：JSON 用空格补齐到 4 字节，BIN 用 0 补齐（与规范一致）。 */
export function buildGlbBuffer(json, bin) {
  const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8')
  const jsonPad = Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20)
  const binBytes = bin ?? Buffer.alloc(0)
  const binPad = Buffer.alloc((4 - (binBytes.length % 4)) % 4, 0)
  const jsonChunk = Buffer.concat([jsonBytes, jsonPad])
  const binChunk = Buffer.concat([binBytes, binPad])
  const header = Buffer.alloc(12)
  header.writeUInt32LE(GLB_MAGIC, 0)
  header.writeUInt32LE(GLB_VERSION, 4)
  header.writeUInt32LE(12 + 8 + jsonChunk.length + (binChunk.length ? 8 + binChunk.length : 0), 8)
  const jsonHeader = Buffer.alloc(8)
  jsonHeader.writeUInt32LE(jsonChunk.length, 0)
  jsonHeader.writeUInt32LE(CHUNK_JSON, 4)
  if (!binChunk.length) return Buffer.concat([header, jsonHeader, jsonChunk])
  const binHeader = Buffer.alloc(8)
  binHeader.writeUInt32LE(binChunk.length, 0)
  binHeader.writeUInt32LE(CHUNK_BIN, 4)
  return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk])
}

/**
 * 只替换 JSON chunk（BIN 逐字节保留）。
 *
 * `mutate(json)` 直接改传入对象；返回 `false` 表示这一次不动（用于「本来就没问题」的模型）。
 * @returns {{changed: boolean, bytesBefore: number, bytesAfter: number}}
 */
export function patchGlbJson(filePath, mutate, { dryRun = false } = {}) {
  const original = fs.readFileSync(filePath)
  const parsed = parseGlb(original)
  const json = JSON.parse(JSON.stringify(parsed.json))
  const result = mutate(json)
  if (result === false) return { changed: false, bytesBefore: original.length, bytesAfter: original.length }
  const next = buildGlbBuffer(json, parsed.bin)
  if (next.equals(original)) {
    return { changed: false, bytesBefore: original.length, bytesAfter: original.length }
  }
  if (!dryRun) fs.writeFileSync(filePath, next)
  return { changed: true, bytesBefore: original.length, bytesAfter: next.length }
}

/** 写 GLB（几何重建用，BIN 由调用方给）。 */
export function writeGlbFile(filePath, json, bin, { dryRun = false } = {}) {
  const buffer = buildGlbBuffer(json, bin)
  if (!dryRun) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, buffer)
  }
  return buffer.length
}

/* ------------------------------------------------------------------ *
 * 数值工具
 * ------------------------------------------------------------------ */

export const round = (value, digits = 4) => Number(Number(value).toFixed(digits))
export const ratio = (value, total, digits = 3) => (total > 0 ? round(value / total, digits) : 0)

/** 相对偏差（0–1，`target` 为 0 时用绝对差兜底）。 */
export function relativeDeviation(actual, target) {
  if (!Number.isFinite(actual) || !Number.isFinite(target)) return null
  if (target === 0) return Math.abs(actual)
  return Math.abs(actual - target) / Math.abs(target)
}

/** glTF 的 16 元素矩阵是列主序；取 3×3 线性部分的各轴绝对和（用于最大缩放估计）。 */
export function maxAxisScale(matrix) {
  const axes = [
    Math.hypot(matrix[0], matrix[1], matrix[2]),
    Math.hypot(matrix[4], matrix[5], matrix[6]),
    Math.hypot(matrix[8], matrix[9], matrix[10]),
  ]
  return Math.max(...axes)
}

/** 由 TRS 组 4×4 列主序矩阵（world 变换的兜底路径）。 */
export function composeMatrix({ translation = [0, 0, 0], rotation = [0, 0, 0, 1], scale = [1, 1, 1] }) {
  const [x, y, z, w] = rotation
  const x2 = x + x
  const y2 = y + y
  const z2 = z + z
  const xx = x * x2
  const xy = x * y2
  const xz = x * z2
  const yy = y * y2
  const yz = y * z2
  const zz = z * z2
  const wx = w * x2
  const wy = w * y2
  const wz = w * z2
  const [sx, sy, sz] = scale
  return [
    (1 - (yy + zz)) * sx,
    (xy + wz) * sx,
    (xz - wy) * sx,
    0,
    (xy - wz) * sy,
    (1 - (xx + zz)) * sy,
    (yz + wx) * sy,
    0,
    (xz + wy) * sz,
    (yz - wx) * sz,
    (1 - (xx + yy)) * sz,
    0,
    translation[0],
    translation[1],
    translation[2],
    1,
  ]
}

/** 两个列主序 4×4 相乘（`a * b`）。 */
export function multiplyMatrix(a, b) {
  const out = new Array(16).fill(0)
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0
      for (let index = 0; index < 4; index += 1) sum += a[index * 4 + row] * b[column * 4 + index]
      out[column * 4 + row] = sum
    }
  }
  return out
}

/** 平移矩阵（列主序）。 */
export function translationMatrix(x, y, z) {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]
}

/** 缩放矩阵（列主序）；`scale` 可以是标量或 `[x, y, z]`。 */
export function scalingMatrix(scale) {
  const [x, y, z] = Array.isArray(scale) ? scale : [scale, scale, scale]
  return [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]
}

/** 原样读回模型文件字节长度（报告用）。 */
export const fileSize = (relativePath) => fs.statSync(path.join(modelsDir, relativePath)).size
