#!/usr/bin/env bun
/**
 * 生成一块**实心石材板**（`<outId>.glb` / `<outId>-lite.glb`），供「台面」这类单件素材用。
 *
 * 为什么不从 `basin.glb` 里抽那张台面：台盆的台面是块 2.6cm 的**壳**
 * （中间按盆口挖空），抽出来单摆就是「中间空一圈」的台面沿；把洞口补起来也只是把壳封成
 * 一张又薄、又带着原坐标（板面浮在 y = 0.507m）的板 —— 那不是一个能自己成立的素材。
 *
 * 台面要的是一块**从地面往上长**的实心板，所以这里直接建几何：
 *
 * - 外轮廓 0.90 × 0.50m（与 `basin` 的台面同尺寸，能和台盆柜对齐），板厚 0.05m（整件就是
 *   一块 5cm 的板，属性面板「高（m）」的下限同样钉在 0.05 —— 见 `studio-normalization.ts`
 *   的 `itemMinimumHeight`）；底面落在 `y = 0`，与其它落地件同一套坐标约定 —— 离地高度由目录的
 *   `elevation` 给（`collection-item-catalog.ts` 的 0.80m → 台面高 0.85m），不烘进几何。
 * - 槽位 / 材质名按 0.7.6 的约定 `<outId>-candidate-<slot>`，角色由 `model-slot-roles.ts`
 *   解析。台面只用**台盆那张台面的同一套材质**：`--slot light` → 角色 `rim`
 *   （见 `MODEL_SLOT_ROLES_SEMANTIC.countertop` 与 `FAMILY_TOKEN_ROLES.ceramic`），
 *   档位组 `countertop` 复用台盆那两块台面档位，于是「盆沿什么颜色，台面就什么颜色」。
 * - 烘焙色沿用 0.7.6 批次的 `light` 占位色（与 `basin-candidate-light` 逐位相同）：它只在
 *   角色配方缺席时兜底，正常运行路径由角色 / 档位出图。
 *
 * 自检（`--dry-run` 只自检、不写文件）：
 *
 * - 六个面**封闭且法线朝外**：按几何位置统计无向边（每条恰好 2 次）与有向边（每条恰好 1 次），
 *   并用散度定理算有向体积，必须等于 `宽 × 深 × 厚`；
 * - 原生包围盒 = `COLLECTION_MODELS.size` = `COLLECTION_ITEM_CATALOG` 的宽 / 高 / 深
 *   （三处任一不一致，加载器就会按比例缩放着件模型 —— 见 `studio-external-models.ts`）。
 *
 * 用法（`homeos/frontend` 下）：
 *
 * ```bash
 * bun run scripts/models/build-glb-slab.mjs --out countertop --width 0.9 --depth 0.5 --thickness 0.05
 * bun run scripts/models/build-glb-slab.mjs --out countertop --width 0.9 --depth 0.5 --thickness 0.05 --dry-run
 * ```
 *
 * 输出目录取 `model-asset-folders.ts` 的分类（如 `home/bathroom/`）；新素材还没登记时可用
 * `--group <大类/分区>` 指定，登记后由 `organize-models.mjs --write` 统一归位。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const hereDir = path.dirname(fileURLToPath(import.meta.url))
/** `homeos/frontend`：脚本位于 `<frontend>/scripts/models/`。 */
const frontendDir = path.resolve(hereDir, '..', '..')
const modelsDir = path.join(frontendDir, 'public/static/3d-studio/models')

/** 模型分类映射（唯一真值）：英文 id → 中文目录，决定新板的落盘目录。 */
const { modelAssetFolder, modelAssetFolderPath, modelAssetFileStem } = await import(
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

/**
 * 0.7.6 批次给候选色槽位烘的**占位蓝灰**（`light` 那一档）。
 *
 * 与 `basin-candidate-light` 的 `baseColorFactor` 逐位相同：台面与台盆那张台面在「角色配方
 * 缺席」的兜底路径上也要长一样。真实运行路径由角色 `rim` + 档位组出图，用不到它。
 */
const LIGHT_PLACEHOLDER_BASE_COLOR = [
  0.5271151256969157, 0.5906188409113381, 0.6795424696265424, 1,
]

/** 命令行参数：`--key value` / `--flag`。 */
function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[index + 1]
    if (next === undefined || next.startsWith('--')) args[key] = true
    else {
      args[key] = next
      index += 1
    }
  }
  return args
}

/** 写 GLB：JSON chunk 用空格补齐到 4 字节，BIN chunk 用 0 补齐。 */
function writeGlb(glbPath, json, bin) {
  const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8')
  const jsonPad = Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20)
  const binPad = Buffer.alloc((4 - (bin.length % 4)) % 4, 0)
  const jsonChunk = Buffer.concat([jsonBytes, jsonPad])
  const binChunk = Buffer.concat([bin, binPad])
  const header = Buffer.alloc(12)
  header.writeUInt32LE(GLB_MAGIC, 0)
  header.writeUInt32LE(GLB_VERSION, 4)
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8)
  const jsonHeader = Buffer.alloc(8)
  jsonHeader.writeUInt32LE(jsonChunk.length, 0)
  jsonHeader.writeUInt32LE(CHUNK_JSON, 4)
  const binHeader = Buffer.alloc(8)
  binHeader.writeUInt32LE(binChunk.length, 0)
  binHeader.writeUInt32LE(CHUNK_BIN, 4)
  fs.writeFileSync(glbPath, Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]))
}

/* ------------------------------------------------------------------ *
 * 几何：一块长方体板（六个面各 4 个顶点 —— 平板要的是硬边，不是共享顶点的圆滑壳）
 * ------------------------------------------------------------------ */

/**
 * 长方体的六个面。角点用**单位立方体**坐标给出（`x` / `z` 取 ±1，`y` 取 0 = 板底 / 1 = 板面），
 * 再按实际尺寸映射；绕序由脚本自己用叉积验一遍（对不上直接报错，不靠手写顺序的对错）。
 */
const SLAB_FACES = [
  { name: 'top', normal: [0, 1, 0], corners: [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]] },
  { name: 'bottom', normal: [0, -1, 0], corners: [[-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1]] },
  { name: 'front', normal: [0, 0, 1], corners: [[-1, 0, 1], [1, 0, 1], [1, 1, 1], [-1, 1, 1]] },
  { name: 'back', normal: [0, 0, -1], corners: [[1, 0, -1], [-1, 0, -1], [-1, 1, -1], [1, 1, -1]] },
  { name: 'right', normal: [1, 0, 0], corners: [[1, 0, 1], [1, 0, -1], [1, 1, -1], [1, 1, 1]] },
  { name: 'left', normal: [-1, 0, 0], corners: [[-1, 0, -1], [-1, 0, 1], [-1, 1, 1], [-1, 1, -1]] },
]

const cross = (left, right) => [
  left[1] * right[2] - left[2] * right[1],
  left[2] * right[0] - left[0] * right[2],
  left[0] * right[1] - left[1] * right[0],
]
const subtract = (left, right) => [left[0] - right[0], left[1] - right[1], left[2] - right[2]]
const dot = (left, right) => left[0] * right[0] + left[1] * right[1] + left[2] * right[2]

/** 建板几何：`POSITION` + `NORMAL`（无 UV —— 与台盆那张台面一致，石材整图按角色补平面 UV）。 */
function buildSlabGeometry({ width, depth, thickness }) {
  const halfWidth = width / 2
  const halfDepth = depth / 2
  const positions = []
  const normals = []
  const indices = []
  const problems = []

  /** 单位立方体角点 → 实际尺寸（板底 y=0、板面 y=thickness）。 */
  const toWorld = ([x, y, z]) => [x * halfWidth, y ? thickness : 0, z * halfDepth]

  for (const face of SLAB_FACES) {
    const corners = face.corners.map(toWorld)
    // 绕序自检：前三个角点的叉积必须指向该面的外法线。
    const computed = cross(
      subtract(corners[1], corners[0]),
      subtract(corners[2], corners[0]),
    )
    if (dot(computed, face.normal) <= 0)
      problems.push(`${face.name} 面的绕序反了（法线 ${face.normal.join(',')}）`)
    const base = positions.length
    for (const corner of corners) {
      positions.push(corner)
      normals.push([...face.normal])
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  return { positions, normals, indices, problems }
}

/* ------------------------------------------------------------------ *
 * 自检
 * ------------------------------------------------------------------ */

/** 顶点位置的四位小数字符串（判「同一条几何边」用，避免浮点误差）。 */
const positionKey = (position) => position.map((value) => value.toFixed(4)).join(',')

/**
 * 封闭性 + 朝向：按**几何位置**统计无向边与有向边。
 *
 * 每个面各带 4 个顶点（硬边），所以不能按顶点下标配对，必须按坐标配对：封闭的实体每条边
 * 恰好被 2 个面用到，且两个面的绕序相反（有向边各出现 1 次）。
 */
function checkClosedSurface({ positions, indices }) {
  const keys = positions.map(positionKey)
  const undirected = new Map()
  const directed = new Map()
  for (let offset = 0; offset < indices.length; offset += 3) {
    const triangle = [indices[offset], indices[offset + 1], indices[offset + 2]].map(
      (index) => keys[index],
    )
    for (let corner = 0; corner < 3; corner += 1) {
      const from = triangle[corner]
      const to = triangle[(corner + 1) % 3]
      const undirectedKey = from < to ? `${from}|${to}` : `${to}|${from}`
      undirected.set(undirectedKey, (undirected.get(undirectedKey) ?? 0) + 1)
      directed.set(`${from}|${to}`, (directed.get(`${from}|${to}`) ?? 0) + 1)
    }
  }
  const problems = []
  const halfUsed = [...undirected].filter(([, count]) => count !== 2)
  if (halfUsed.length)
    problems.push(`有 ${halfUsed.length} 条边不是恰好被 2 个面共用（表面没封闭）`)
  const duplicateDirected = [...directed].filter(([, count]) => count !== 1)
  if (duplicateDirected.length)
    problems.push(`有 ${duplicateDirected.length} 条有向边重复（相邻面朝向不一致）`)
  return problems
}

/** 散度定理算有向体积：绕序全部朝外时等于实体体积，朝向反了会变成负数。 */
function signedVolume({ positions, indices }) {
  let volume = 0
  for (let offset = 0; offset < indices.length; offset += 3) {
    const [a, b, c] = [indices[offset], indices[offset + 1], indices[offset + 2]].map(
      (index) => positions[index],
    )
    volume += (
      a[0] * (b[1] * c[2] - b[2] * c[1]) -
      a[1] * (b[0] * c[2] - b[2] * c[0]) +
      a[2] * (b[0] * c[1] - b[1] * c[0])
    ) / 6
  }
  return volume
}

/** 原生包围盒 `[[minX,maxX],[minY,maxY],[minZ,maxZ]]`。 */
const boundsOf = (positions) =>
  [0, 1, 2].map((axis) => [
    Math.min(...positions.map((position) => position[axis])),
    Math.max(...positions.map((position) => position[axis])),
  ])

const round4 = (value) => Math.round(value * 10000) / 10000

function selfCheck(geometry, { width, depth, thickness }) {
  const problems = [...geometry.problems]
  problems.push(...checkClosedSurface(geometry))

  const volume = signedVolume(geometry)
  const expectedVolume = width * depth * thickness
  if (Math.abs(volume - expectedVolume) > 1e-9)
    problems.push(`有向体积 ${volume} ≠ 宽×深×厚 ${expectedVolume}（绕序或尺寸不对）`)
  if (geometry.normals.length !== geometry.positions.length)
    problems.push('法线数与顶点数不一致')
  const badNormal = geometry.normals.find(
    (normal) =>
      Math.abs(normal[0]) + Math.abs(normal[1]) + Math.abs(normal[2]) !== 1 ||
      Math.abs(Math.hypot(...normal) - 1) > 1e-9,
  )
  if (badNormal) problems.push(`法线不是单位轴向量：${badNormal.join(',')}`)
  if (geometry.positions.length % 4 !== 0 || geometry.indices.length % 6 !== 0)
    problems.push('顶点 / 索引数不是「每面 4 顶点 2 三角」的整数倍')
  if (geometry.indices.some((index) => !Number.isInteger(index) || index < 0 || index >= geometry.positions.length))
    problems.push('有越界 / 非法索引')

  const bounds = boundsOf(geometry.positions)
  const actual = bounds.map(([min, max]) => round4(max - min))
  const declared = [round4(width), round4(thickness), round4(depth)]
  for (const axis of [0, 1, 2])
    if (actual[axis] !== declared[axis])
      problems.push(`原生 ${'宽高深'[axis]} ${actual[axis]} ≠ 声明 ${declared[axis]}`)
  if (bounds[1][0] !== 0) problems.push(`板底没有落在 y=0（实际 ${bounds[1][0]}）`)
  return { problems, bounds, actual, volume, expectedVolume }
}

/* ------------------------------------------------------------------ *
 * GLB 组装
 * ------------------------------------------------------------------ */

/** 把 `{positions, normals, indices}` 写成单 primitive 的 GLB JSON。 */
function buildSlabGlb({ outId, slot, geometry, dimensionExtras }) {
  const { positions, normals, indices } = geometry
  const positionBytes = Buffer.alloc(positions.length * 12)
  positions.forEach((position, index) =>
    position.forEach((component, axis) => positionBytes.writeFloatLE(component, index * 12 + axis * 4)),
  )
  const normalBytes = Buffer.alloc(normals.length * 12)
  normals.forEach((normal, index) =>
    normal.forEach((component, axis) => normalBytes.writeFloatLE(component, index * 12 + axis * 4)),
  )
  const useShortIndices = positions.length <= 65535
  const indexBytes = Buffer.alloc(indices.length * (useShortIndices ? 2 : 4))
  indices.forEach((value, index) =>
    useShortIndices
      ? indexBytes.writeUInt16LE(value, index * 2)
      : indexBytes.writeUInt32LE(value, index * 4),
  )

  const bufferViews = []
  const chunks = []
  let binaryLength = 0
  const appendBufferView = (bytes, target) => {
    const padding = (4 - (binaryLength % 4)) % 4
    if (padding) {
      chunks.push(Buffer.alloc(padding, 0))
      binaryLength += padding
    }
    chunks.push(bytes)
    const view = { buffer: 0, byteOffset: binaryLength, byteLength: bytes.length, target }
    binaryLength += bytes.length
    bufferViews.push(view)
    return bufferViews.length - 1
  }

  const bounds = boundsOf(positions)
  const json = {
    asset: {
      generator: 'homeos build-glb-slab.mjs',
      version: '2.0',
      extras: { solidSlab: dimensionExtras },
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { name: outId, extras: { staticModel: true, mount: 'floor' }, children: [1] },
      {
        name: slot,
        extras: {
          approvedRender: { castShadow: true, receiveShadow: true, renderOrder: 0 },
        },
        mesh: 0,
      },
    ],
    meshes: [
      {
        name: slot,
        primitives: [
          {
            attributes: {
              POSITION: 0,
              NORMAL: 1,
            },
            indices: 2,
            mode: 4,
            material: 0,
          },
        ],
      },
    ],
    materials: [
      {
        name: `${outId}-candidate-${slot}`,
        extras: {
          approvedSurface: {
            depthWrite: true,
            polygonOffset: false,
            polygonOffsetFactor: 0,
            polygonOffsetUnits: 0,
          },
        },
        pbrMetallicRoughness: {
          baseColorFactor: [...LIGHT_PLACEHOLDER_BASE_COLOR],
          roughnessFactor: 0.82,
          metallicFactor: 0,
        },
      },
    ],
    accessors: [
      {
        bufferView: appendBufferView(positionBytes, 34962),
        componentType: 5126,
        count: positions.length,
        type: 'VEC3',
        min: bounds.map(([min]) => min),
        max: bounds.map(([, max]) => max),
      },
      {
        bufferView: appendBufferView(normalBytes, 34962),
        componentType: 5126,
        count: normals.length,
        type: 'VEC3',
      },
      {
        bufferView: appendBufferView(indexBytes, 34963),
        componentType: useShortIndices ? 5123 : 5125,
        count: indices.length,
        type: 'SCALAR',
      },
    ],
    bufferViews,
    buffers: [{ byteLength: binaryLength }],
  }
  return { json, bin: Buffer.concat(chunks, binaryLength) }
}

/* ------------------------------------------------------------------ *
 * 登记自检：「原生包围盒 = 注册表尺寸 = 目录尺寸」
 * ------------------------------------------------------------------ */

/**
 * 加载器按「目录尺寸 ÷ 注册表尺寸」缩放模型（`studio-external-models.ts`）：三处尺寸
 * 只要有一项对不上，这件模型就会被悄悄缩放（离地高度、与台盆的对齐全跟着变），所以生成
 * 完就拿原生包围盒把两边都对一遍。
 */
async function registryCheck(outId, actual) {
  const [{ COLLECTION_MODELS }, { COLLECTION_ITEM_CATALOG }] = await Promise.all([
    import(
      pathToFileURL(
        path.join(frontendDir, 'src/studio/app/3d-studio/loaders/external-models/collection-models.ts'),
      ).href
    ),
    import(
      pathToFileURL(
        path.join(frontendDir, 'src/studio/app/3d-studio/authoring/items/collection-item-catalog.ts'),
      ).href
    ),
  ])
  const registrySize = COLLECTION_MODELS[outId]?.size
  const catalogEntry = COLLECTION_ITEM_CATALOG[outId]
  // 还没登记时只提醒（首次生成时登记通常还没写），登记了就必须对得上。
  const warnings = [
    ...(registrySize ? [] : [`${outId} 还没登记进 COLLECTION_MODELS`]),
    ...(catalogEntry ? [] : [`${outId} 还没登记进 COLLECTION_ITEM_CATALOG`]),
  ]
  if (!registrySize || !catalogEntry) return { errors: [], warnings }
  const declared = [
    ['COLLECTION_MODELS.size', registrySize],
    ['COLLECTION_ITEM_CATALOG 的宽/高/深', [catalogEntry.width, catalogEntry.height, catalogEntry.depth]],
  ]
  return {
    warnings,
    errors: declared.flatMap(([label, sizes]) =>
      [0, 1, 2]
        .filter((axis) => round4(sizes[axis]) !== actual[axis])
        .map(
          (axis) =>
            `${label}[${'宽高深'[axis]}] ${sizes[axis]} ≠ 原生 ${actual[axis]}（加载器会缩放 ${(sizes[axis] / actual[axis]).toFixed(3)}）`,
        ),
    ),
  }
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

const args = parseArgs(process.argv.slice(2))
const outId = args.out
const slot = args.slot ?? 'light'
const width = Number(args.width)
const depth = Number(args.depth)
const thickness = Number(args.thickness)
const dryRun = args['dry-run'] === true
if (!outId || !(width > 0) || !(depth > 0) || !(thickness > 0))
  throw new Error(
    '用法：--out <itemType> --width <m> --depth <m> --thickness <m> [--slot <槽位 token>] [--group <大类/分区>] [--dry-run]',
  )

/**
 * 落盘目录：`--group <大类/分区>` 优先，其次按 `model-asset-folders.ts` 的分类
 * （英文分区 id → 中文目录）。还没登记的新素材先留在 `models/` 根目录
 * （与迁移前的行为一致），并提示先登记再归位。
 */
const groupFolder = typeof args.group === 'string' ? args.group : modelAssetFolder(outId)
if (!groupFolder)
  console.warn(
    `⚑ ${outId} 还没登记到 model-asset-folders.ts，暂时写到 models 根目录；登记后运行 organize-models.mjs --write 归位。`,
  )
const outFolderPath = groupFolder ? modelAssetFolderPath(groupFolder) : ''
const outDir = groupFolder ? path.join(modelsDir, outFolderPath) : modelsDir
/** 磁盘文件名用中文主干；没登记中文名时退回 id。 */
const outStem = modelAssetFileStem(outId)

const dimensions = { width, depth, thickness }
const geometry = buildSlabGeometry(dimensions)
const { json, bin } = buildSlabGlb({
  outId,
  slot,
  geometry,
  dimensionExtras: {
    width: round4(width),
    depth: round4(depth),
    thickness: round4(thickness),
    baseY: 0,
    slot,
  },
})
const check = selfCheck(geometry, dimensions)

console.log(
  `实心板：${width} × ${depth} × ${thickness}m（底面 y=0），槽位 ${slot}，` +
    `材质 ${json.materials[0].name}`,
)
console.log(
  `几何：POSITION ${geometry.positions.length} 顶点，索引 ${geometry.indices.length}，` +
    `面 ${SLAB_FACES.length}，有向体积 ${check.volume.toFixed(6)} m³（期望 ${check.expectedVolume.toFixed(6)}）`,
)
console.log(
  `原生包围盒：${check.bounds.map(([min, max]) => `${round4(min)}~${round4(max)}`).join(' × ')}`,
)
console.log(
  check.problems.length
    ? `✗ 自检不通过：${check.problems.join('；')}`
    : '✓ 自检通过：六面封闭、法线朝外、体积等于宽×深×厚、板底落在 y=0',
)
const { errors: registrationErrors, warnings: registrationWarnings } = await registryCheck(
  outId,
  check.actual,
)
for (const warning of registrationWarnings) console.log(`⚑ ${warning}`)
console.log(
  registrationErrors.length
    ? `✗ 登记自检不通过：${registrationErrors.join('；')}`
    : registrationWarnings.length
      ? '· 登记自检跳过（还没登记）'
      : `✓ 登记自检通过：原生 ${check.actual.join(' × ')}m = 注册表尺寸 = 目录尺寸（加载器不缩放）`,
)

if (check.problems.length || registrationErrors.length) process.exit(1)
if (!dryRun) {
  // `-lite` 与完整件写同一份字节：这块板只有 36 个三角面（BIN 不到 1KB），Draco 省不出东西，
  // 而运行时取的是 `-lite.glb`、`fallbackUrl` 才是完整件（见 `all-item-models.ts`），两份都得有。
  for (const fileName of [`${outStem}.glb`, `${outStem}-lite.glb`]) {
    const outPath = path.join(outDir, fileName)
    fs.mkdirSync(outDir, { recursive: true })
    writeGlb(outPath, json, bin)
    console.log(`→ ${path.relative(frontendDir, outPath)}（${fs.statSync(outPath).size} 字节）`)
  }
}
