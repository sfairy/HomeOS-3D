/**
 * 预渲染贴图缓存。
 *
 * 天气层每帧要对几百个粒子做绘制，用 `arc` / `stroke` 逐个体画代价太高
 * （雨丝 300+ 次路径描边、雪花 200+ 次圆），而 `ctx.filter` 模糊在 Safari 与低端机上
 * 又太贵。折中方案：**贴图只在参数变化时生成一次**，运行时只做 `drawImage`。
 */

export type SpritePainter = (ctx: CanvasRenderingContext2D, width: number, height: number) => void

/** 缓存上限：参数抖动（尺寸变化、画质切换）不该把贴图无限堆在内存里。 */
const SPRITE_CACHE_LIMIT = 64

/**
 * 雨丝的倾斜档位（贴图内的水平位移，px）。
 *
 * 8 档而不是 4 档：阵风是连续变化的，档位太粗时倾角会在几个角度之间来回跳，
 * 观感是「雨丝每隔几十毫秒抖一下」。5px 一档后跳变幅度低于 1°，肉眼已经连续。
 */
export const RAIN_TILT_BUCKETS = [0, 5, 10, 15, 20, 25, 30, 35] as const
/** 档位宽度：绘制端据此把连续倾角归到最近的档。 */
export const RAIN_TILT_STEP = 5
const RAIN_SPRITE_WIDTH = 48
const RAIN_SPRITE_HEIGHT = 96

/** 档位 → 贴图斜率（水平位移 / 纵向高度）。绘制端据此算横向漂移，动画方向才与贴图一致。 */
export function rainTiltRatio(tiltIndex: number): number {
  const index = Math.max(0, Math.min(RAIN_TILT_BUCKETS.length - 1, Math.round(tiltIndex)))
  return RAIN_TILT_BUCKETS[index] / RAIN_SPRITE_HEIGHT
}

/** 连续倾角（px）→ 最近的贴图档位下标。 */
export function rainTiltBucket(tilt: number): number {
  const index = Math.round(tilt / RAIN_TILT_STEP)
  return Math.max(0, Math.min(RAIN_TILT_BUCKETS.length - 1, index))
}

/**
 * 亮头 + 渐隐尾的雨丝，倾斜角随档位变化。
 *
 * 斜率必须由 `tilt` 真正决定：旧实现把 `tilt` 只当成整体平移、末点固定偏 -6px，
 * 于是贴图永远是近乎竖直的，而粒子按倾角飞快横移，观感是「雨丝竖直下坠、
 * 同时整片横着飘」。
 *
 * `soft` 档是近景雨：用三条不同线宽的描边叠加出柔焦边，而不是 `ctx.filter` 模糊 ——
 * 贴图只生成一次，这里的额外描边不进热循环。
 */
function paintRainStreak(
  paintCtx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tilt: number,
  soft: boolean,
) {
  const gradient = paintCtx.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, 'rgba(255,246,221,0)')
  gradient.addColorStop(0.55, 'rgba(255,246,221,0.62)')
  gradient.addColorStop(1, 'rgba(255,250,236,1)')
  paintCtx.strokeStyle = gradient
  paintCtx.lineCap = 'round'
  paintCtx.beginPath()
  paintCtx.moveTo(width / 2 + tilt / 2, 0)
  paintCtx.lineTo(width / 2 - tilt / 2, height)
  if (!soft) {
    paintCtx.lineWidth = 3
    paintCtx.stroke()
    return
  }
  // 近景雨：宽而淡的外晕 + 稍窄的中层 + 细亮内芯，叠出「失焦镜头上的雨」。
  paintCtx.lineWidth = 7
  paintCtx.globalAlpha = 0.22
  paintCtx.stroke()
  paintCtx.lineWidth = 4.2
  paintCtx.globalAlpha = 0.5
  paintCtx.stroke()
  paintCtx.lineWidth = 1.9
  paintCtx.globalAlpha = 1
  paintCtx.stroke()
}

/** 通用柔光球：近景雪花、闪电辉光、星点都用它。 */
function paintGlow(paintCtx: CanvasRenderingContext2D, size: number, rgb: string) {
  const radius = size / 2
  const gradient = paintCtx.createRadialGradient(radius, radius, 0, radius, radius, radius)
  gradient.addColorStop(0, `rgba(${rgb},0.9)`)
  gradient.addColorStop(0.45, `rgba(${rgb},0.32)`)
  gradient.addColorStop(1, `rgba(${rgb},0)`)
  paintCtx.fillStyle = gradient
  paintCtx.fillRect(0, 0, size, size)
}

/**
 * 一片雪花的柔光球：比通用 glow 更「实」一点的核心。
 *
 * 通用 glow 的中段太透明，放大成近景雪花后像一团雾；雪花要有可见的核心，
 * 边缘才散开，这样落在深色背景上才有「一片片的雪」而不是「一片白光」。
 */
function paintSnowflake(paintCtx: CanvasRenderingContext2D, size: number, rgb: string) {
  const radius = size / 2
  const gradient = paintCtx.createRadialGradient(radius, radius, 0, radius, radius, radius)
  gradient.addColorStop(0, `rgba(${rgb},1)`)
  gradient.addColorStop(0.35, `rgba(${rgb},0.78)`)
  gradient.addColorStop(0.7, `rgba(${rgb},0.2)`)
  gradient.addColorStop(1, `rgba(${rgb},0)`)
  paintCtx.fillStyle = gradient
  paintCtx.fillRect(0, 0, size, size)
}

/**
 * 一朵云：几个重叠的径向渐变团拼成，**贴图本身就是云的全部**。
 *
 * 关键约束：云是「一片片具体的物体」，所以只能靠这张贴图 `drawImage` 出来，
 * 绝不能用一条铺满画面宽度的渐变带（那会变成背景遮盖层，压住户型）。
 * 贴图四周留足透明边，避免相邻云朵相互切出硬边。
 *
 * 三种 `variant` 是不同团块布局：同一片天空里如果每朵云都长一样，
 * 云层会立刻显得像贴纸。底部另用一层更暗的冷灰压出体积感（云底朝下更暗）。
 */
const CLOUD_LAYOUTS: readonly (readonly (readonly [number, number, number])[])[] = [
  [
    [0.32, 0.62, 0.34],
    [0.5, 0.52, 0.4],
    [0.68, 0.64, 0.3],
    [0.44, 0.7, 0.28],
    [0.58, 0.72, 0.24],
  ],
  [
    [0.28, 0.58, 0.3],
    [0.42, 0.48, 0.36],
    [0.58, 0.5, 0.34],
    [0.72, 0.6, 0.28],
    [0.5, 0.68, 0.3],
    [0.36, 0.7, 0.22],
  ],
  [
    [0.36, 0.54, 0.32],
    [0.54, 0.46, 0.34],
    [0.66, 0.56, 0.32],
    [0.46, 0.64, 0.26],
    [0.6, 0.7, 0.22],
  ],
]

function paintCloud(
  paintCtx: CanvasRenderingContext2D,
  width: number,
  height: number,
  rgb: string,
  bottomRgb: string,
  variant: number,
) {
  const blobs = CLOUD_LAYOUTS[variant % CLOUD_LAYOUTS.length]
  const paintBlob = (centerX: number, centerY: number, relativeRadius: number, color: string, alpha: number) => {
    const radius = width * relativeRadius * 0.5
    const x = width * centerX
    const y = height * centerY
    const gradient = paintCtx.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, `rgba(${color},${alpha})`)
    gradient.addColorStop(0.6, `rgba(${color},${alpha * 0.43})`)
    gradient.addColorStop(1, `rgba(${color},0)`)
    paintCtx.fillStyle = gradient
    paintCtx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
  }
  for (const [centerX, centerY, relativeRadius] of blobs) paintBlob(centerX, centerY, relativeRadius, rgb, 0.92)
  // 云底：同一批团块整体下移一点点、用更暗的冷色，压出「上方亮、下方沉」的体积。
  for (const [centerX, centerY, relativeRadius] of blobs)
    paintBlob(centerX, centerY + relativeRadius * 0.16, relativeRadius * 0.92, bottomRgb, 0.34)
}

export function createSpriteCache(doc: Document) {
  const sprites = new Map<string, HTMLCanvasElement>()

  /**
   * 命中即移到最后：Map 的插入顺序即「最近使用顺序」，满了就从最久未用的一条开始淘汰。
   *
   * 旧实现满了直接 `clear()`：长会话里参数抖动（尺寸 / 画质 / 云色变化）会把整张表
   * 清空，之后每一帧都要重新描一遍雨丝与云，表现为「过一阵子突然卡一下」。
   */
  function touch(key: string, sprite: HTMLCanvasElement) {
    sprites.delete(key)
    sprites.set(key, sprite)
    return sprite
  }

  function get(key: string, width: number, height: number, paint: SpritePainter) {
    const cached = sprites.get(key)
    if (cached) return touch(key, cached)
    const canvas = doc.createElement('canvas')
    canvas.width = Math.max(1, Math.ceil(width))
    canvas.height = Math.max(1, Math.ceil(height))
    const spriteCtx = canvas.getContext('2d')
    if (!spriteCtx) return null
    paint(spriteCtx, canvas.width, canvas.height)
    while (sprites.size >= SPRITE_CACHE_LIMIT) {
      const oldestKey = sprites.keys().next().value
      if (oldestKey === undefined) break
      sprites.delete(oldestKey)
    }
    sprites.set(key, canvas)
    return canvas
  }

  return {
    /** 雨丝贴图；`tiltIndex` 取 0~7，对应 0/5/…/35px 的水平位移。`soft` 为近景柔焦档。 */
    rainSprite(tiltIndex: number, soft = false) {
      const index = Math.max(0, Math.min(RAIN_TILT_BUCKETS.length - 1, Math.round(tiltIndex)))
      const tilt = RAIN_TILT_BUCKETS[index]
      return get(`rain:${tilt}:${soft ? 's' : 'h'}`, RAIN_SPRITE_WIDTH, RAIN_SPRITE_HEIGHT, (paintCtx, width, height) =>
        paintRainStreak(paintCtx, width, height, tilt, soft),
      )
    },
    glowSprite(rgb: string) {
      return get(`glow:${rgb}`, 96, 96, (paintCtx, width) => paintGlow(paintCtx, width, rgb))
    },
    /** 近景雪花的柔光球（有可见核心）。 */
    snowSprite(rgb: string) {
      return get(`snow:${rgb}`, 96, 96, (paintCtx, width) => paintSnowflake(paintCtx, width, rgb))
    },
    /** 云朵贴图（整朵云，含透明边）；`variant` 选团块布局，`bottomRgb` 是云底色。 */
    cloudSprite(rgb: string, bottomRgb: string, variant: number) {
      const layout = ((variant % CLOUD_LAYOUTS.length) + CLOUD_LAYOUTS.length) % CLOUD_LAYOUTS.length
      return get(`cloud:${rgb}:${bottomRgb}:${layout}`, 512, 288, (paintCtx, width, height) =>
        paintCloud(paintCtx, width, height, rgb, bottomRgb, layout),
      )
    },
    clear() {
      sprites.clear()
    },
  }
}

export type SpriteCache = ReturnType<typeof createSpriteCache>
