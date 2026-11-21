/**
 * 欢迎语笔迹的「按笔顺」揭示（0.8.8 那 12 段 `Path2D` 手感的等价实现）。
 *
 * 上游机制（`源代码/0.8.8/frontend/static/editor-canvas-welcome.js`）：
 * 品牌字被拆成 12 段手写贝塞尔，每段带一个预先量好的路径长度，逐段
 * `setLineDash([已写长度, 段长])` —— 笔尖**沿笔画方向**推进，段与段之间停 13px。
 *
 * 我们的文案是 `Welcome to HomeOS`，没有等价的现成路径数据（canvas 拿不到字体轮廓），
 * 于是复刻同一套语义，把「路径长度」换成从真实笔迹里量出来的距离，并且**以字符为推进单位**：
 *
 * 1. 每个字符有自己的横向区间（由调用方按同一字体量出来），区间内的墨迹像素就是这一笔的料；
 * 2. 段内从最左两列起步做四邻域广度优先，测地距离即笔尖沿笔画走过的距离 —— 所以一个字母
 *    是「一笔一笔长出来」的（`W` 先出第一道斜，再第二道），而不是被竖着切一半；
 * 3. 字符之间按水平间隔补「抬笔移动」的时间，再接一个停顿（上游 13px 的等价物），
 *    于是同一时刻画面上永远是「左边写完了 + 当前字写一半 + 右边还没动」。
 *
 * 为什么不能只按整句测地距离排序：笔迹是一条细带，整句的测地距离几乎单调于 x，
 * 那样露出的边界仍然是一条竖线（实测 730 列里只有个位数是「半露」），观感还是擦除。
 * 以字符为推进单位后，推进的节奏才和真人写字一致。
 *
 * 露出时刻分 256 桶，每帧只把新露出的像素拷进可见层 —— 增量补齐，不重画整幅。
 */

/** 墨迹判定阈值：更低的是抗锯齿边缘，参与排序会让笔迹边缘「提前」露出。 */
const INK_ALPHA = 12
/** 露出时刻的桶数：每桶约等于总笔长的 1/256，2380ms 里约 9ms 一档。 */
const BUCKETS = 256
/** 抬笔停顿（像素当量）：上游段间是 13px 的路径空隙，这里按笔画行进距离折算。 */
const PEN_LIFT_PAUSE = 14
/** 落笔起点取段内最左几列（多源起步，避免把起笔点猜在字中间）。 */
const PEN_DOWN_COLUMNS = 2

/** 排好序的露出计划：`pixels` 按时间先后排列，`bucketEnd[k]` 是前 k 桶的累计像素数。 */
interface InkOrder {
  pixels: Int32Array
  bucketEnd: Int32Array
}

export interface PenWriter {
  /** 按进度（0…1）把新露出的墨迹补上去；可反复调用（增量，进度 1 即整句写完）。 */
  paint: (progress: number) => void
}

/**
 * 把整句墨迹排成「笔尖走过的顺序」，并切成时间桶。
 *
 * `boundaries` 是字符的横向分界（画布设备像素、升序，长度 = 字符数 + 1）；
 * 传空或非法时退化成整句一段，至少不会画不出来。
 */
function buildSchedule(base: ImageData, boundaries: number[]): InkOrder | null {
  const { width, height, data } = base
  const mask = new Uint8Array(width * height)
  let inkCount = 0
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (data[pixel * 4 + 3] > INK_ALPHA) {
      mask[pixel] = 1
      inkCount += 1
    }
  }
  if (!inkCount) return null
  const edges = normalizeBoundaries(boundaries, width)
  const segments = splitByEdges(mask, width, edges)
  return scheduleSegments(segments, width, height, mask.length, inkCount)
}

/** 分界必须是 [0, width] 内、严格升序的有限数；不满足就退化成一段。 */
function normalizeBoundaries(boundaries: number[], width: number): number[] {
  const edges = [0]
  for (const edge of boundaries) {
    if (Number.isFinite(edge) && edge > edges[edges.length - 1] && edge < width) edges.push(edge)
  }
  edges.push(width)
  return edges
}

/** 按分界把墨迹像素分到各字符段（下标与 `edges` 的区间一一对应）。 */
function splitByEdges(mask: Uint8Array, width: number, edges: number[]): Int32Array[] {
  const buckets: number[][] = []
  for (let index = 1; index < edges.length; index += 1) buckets.push([])
  const last = buckets.length - 1
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (!mask[pixel]) continue
    const x = pixel % width
    let segment = 0
    while (segment < last && x >= edges[segment + 1]) segment += 1
    buckets[segment].push(pixel)
  }
  return buckets.map((list) => Int32Array.from(list))
}

/**
 * 逐段排时间：段内按测地距离，段间补抬笔移动与停顿。
 *
 * 空段（空格 / 标点没落在这一格）只贡献停顿 —— 词与词之间本来就该有抬笔的空档。
 */
function scheduleSegments(
  segments: Int32Array[],
  width: number,
  height: number,
  maskSize: number,
  inkCount: number,
): InkOrder {
  const slots = new Int32Array(maskSize).fill(-1)
  const times = new Float32Array(inkCount)
  const order = new Int32Array(inkCount)
  let cursor = 0
  let clock = PEN_LIFT_PAUSE
  for (const segment of segments) {
    if (!segment.length) {
      clock += PEN_LIFT_PAUSE
      continue
    }
    const { distances, max } = measureSegment(segment, width, height, slots)
    for (let local = 0; local < segment.length; local += 1) {
      // 极少数对角相连的像素测不到距离：判到本段最晚，避免它们比周围先冒出来。
      const distance = distances[local] >= 0 ? distances[local] : max
      times[cursor] = clock + distance
      order[cursor] = segment[local]
      cursor += 1
    }
    clock += max + PEN_LIFT_PAUSE
  }
  if (!cursor) return { pixels: new Int32Array(0), bucketEnd: new Int32Array(BUCKETS + 1) }
  return bucketize(order.subarray(0, cursor), times.subarray(0, cursor), clock)
}

/** 段内测地距离：从最左两列起步，波前沿笔画推进。`slots` 是跨段复用的「像素 → 段内下标」。 */
function measureSegment(
  segment: Int32Array,
  width: number,
  height: number,
  slots: Int32Array,
): { distances: Float32Array; max: number } {
  const total = segment.length
  let minX = width
  for (let local = 0; local < total; local += 1) {
    slots[segment[local]] = local
    const x = segment[local] % width
    if (x < minX) minX = x
  }
  const wave: Wave = {
    slots,
    distances: new Float32Array(total).fill(-1),
    queue: new Int32Array(total),
    width,
    height,
    tail: 0,
    max: 0,
  }
  seedWave(wave, segment, minX + PEN_DOWN_COLUMNS)
  spreadWave(wave, segment)
  for (let local = 0; local < total; local += 1) slots[segment[local]] = -1
  return { distances: wave.distances, max: Math.max(1, wave.max) }
}

/** 波前状态：段内广度优先的游标与最大距离。 */
interface Wave {
  slots: Int32Array
  distances: Float32Array
  queue: Int32Array
  width: number
  height: number
  tail: number
  max: number
}

/** 落笔起点：段内最左两列的墨迹像素，多源起步。 */
function seedWave(wave: Wave, segment: Int32Array, limitX: number) {
  for (let local = 0; local < segment.length; local += 1) {
    if (segment[local] % wave.width > limitX) continue
    wave.distances[local] = 0
    wave.queue[wave.tail] = local
    wave.tail += 1
  }
}

/** 逐层推进：四邻域，每次只走一步（步长即笔尖走过的像素距离）。 */
function spreadWave(wave: Wave, segment: Int32Array) {
  const { distances, queue, width, height } = wave
  let head = 0
  while (head < wave.tail) {
    const local = queue[head]
    head += 1
    const index = segment[local]
    const x = index % width
    const y = (index - x) / width
    const step = distances[local] + 1
    if (x + 1 < width) pushWave(wave, index + 1, step)
    if (x > 0) pushWave(wave, index - 1, step)
    if (y + 1 < height) pushWave(wave, index + width, step)
    if (y > 0) pushWave(wave, index - width, step)
  }
}

/** 记录一个还没被量到的邻居。 */
function pushWave(wave: Wave, neighbor: number, step: number) {
  const local = wave.slots[neighbor]
  if (local < 0 || wave.distances[local] >= 0) return
  wave.distances[local] = step
  if (step > wave.max) wave.max = step
  wave.queue[wave.tail] = local
  wave.tail += 1
}

/** 按露出时刻分桶：`pixels` 重排成时间序，`bucketEnd` 供每帧 O(1) 取「该露多少」。 */
function bucketize(order: Int32Array, times: Float32Array, totalClock: number): InkOrder {
  const counts = new Int32Array(BUCKETS)
  const scale = totalClock > 0 ? BUCKETS / totalClock : 0
  for (let index = 0; index < times.length; index += 1) counts[bucketOf(times[index], scale)] += 1
  const bucketEnd = new Int32Array(BUCKETS + 1)
  for (let bucket = 0; bucket < BUCKETS; bucket += 1) bucketEnd[bucket + 1] = bucketEnd[bucket] + counts[bucket]
  const pixels = new Int32Array(times.length)
  const cursor = Int32Array.from(bucketEnd.subarray(0, BUCKETS))
  for (let index = 0; index < times.length; index += 1) {
    const bucket = bucketOf(times[index], scale)
    pixels[cursor[bucket]] = order[index]
    cursor[bucket] += 1
  }
  return { pixels, bucketEnd }
}

function bucketOf(time: number, scale: number): number {
  const bucket = Math.floor(time * scale)
  if (bucket < 0) return 0
  return bucket >= BUCKETS ? BUCKETS - 1 : bucket
}

/** 进度对应的「应露出像素数」。 */
function revealCount(schedule: InkOrder, progress: number): number {
  if (progress >= 1) return schedule.pixels.length
  if (progress <= 0) return 0
  return schedule.bucketEnd[Math.min(BUCKETS, Math.floor(progress * BUCKETS))]
}

/**
 * 建一个笔迹写入器：`base` 是已经画好的整句墨迹，`context` 是可见画布，
 * `boundaries` 是字符的横向分界（设备像素）。
 *
 * 未写到的部分是**真的空白**（不是被裁剪），所以中途任何一帧都是手写态。
 */
export function createPenWriter(
  context: CanvasRenderingContext2D,
  base: ImageData,
  boundaries: number[],
): PenWriter | null {
  const schedule = buildSchedule(base, boundaries)
  if (!schedule || !schedule.pixels.length) return null
  const target = context.createImageData(base.width, base.height)
  const source = base.data
  const output = target.data
  let revealed = 0

  return {
    paint(progress: number) {
      const next = revealCount(schedule, progress)
      if (next <= revealed) return
      for (let index = revealed; index < next; index += 1) {
        const offset = schedule.pixels[index] * 4
        output[offset] = source[offset]
        output[offset + 1] = source[offset + 1]
        output[offset + 2] = source[offset + 2]
        output[offset + 3] = source[offset + 3]
      }
      revealed = next
      // `putImageData` 不受变换影响：写的就是画布设备像素，与离屏画布一一对应。
      context.putImageData(target, 0, 0)
    },
  }
}
