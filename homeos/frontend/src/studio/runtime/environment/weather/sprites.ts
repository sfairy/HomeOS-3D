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

/** 雨丝的倾斜档位（贴图内的水平位移），运行时按阵风选最近一档。 */
export const RAIN_TILT_BUCKETS = [0, 10, 20, 30] as const
const RAIN_SPRITE_WIDTH = 40
const RAIN_SPRITE_HEIGHT = 96

/** 档位 → 贴图斜率（水平位移 / 纵向高度）。绘制端据此算横向漂移，动画方向才与贴图一致。 */
export function rainTiltRatio(tiltIndex: number): number {
  const index = Math.max(0, Math.min(RAIN_TILT_BUCKETS.length - 1, tiltIndex))
  return RAIN_TILT_BUCKETS[index] / RAIN_SPRITE_HEIGHT
}

/**
 * 亮头 + 渐隐尾的雨丝，倾斜角随档位变化。
 *
 * 斜率必须由 `tilt` 真正决定：旧实现把 `tilt` 只当成整体平移、末点固定偏 -6px，
 * 于是贴图永远是近乎竖直的，而粒子按倾角飞快横移，观感是「雨丝竖直下坠、
 * 同时整片横着飘」。
 */
function paintRainStreak(paintCtx: CanvasRenderingContext2D, width: number, height: number, tilt: number) {
  const gradient = paintCtx.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, 'rgba(255,246,221,0)')
  gradient.addColorStop(0.55, 'rgba(255,246,221,0.62)')
  gradient.addColorStop(1, 'rgba(255,250,236,1)')
  paintCtx.strokeStyle = gradient
  paintCtx.lineWidth = 3
  paintCtx.lineCap = 'round'
  paintCtx.beginPath()
  paintCtx.moveTo(width / 2 + tilt / 2, 0)
  paintCtx.lineTo(width / 2 - tilt / 2, height)
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
 * 一朵云：几个重叠的径向渐变团拼成，**贴图本身就是云的全部**。
 *
 * 关键约束：云是「一片片具体的物体」，所以只能靠这张贴图 `drawImage` 出来，
 * 绝不能用一条铺满画面宽度的渐变带（那会变成背景遮盖层，压住户型）。
 * 贴图四周留足透明边，避免相邻云朵相互切出硬边。
 */
function paintCloud(paintCtx: CanvasRenderingContext2D, width: number, height: number, rgb: string) {
  const blobs = [
    [0.32, 0.62, 0.34],
    [0.5, 0.52, 0.4],
    [0.68, 0.64, 0.3],
    [0.44, 0.7, 0.28],
    [0.58, 0.72, 0.24],
  ]
  for (const [centerX, centerY, relativeRadius] of blobs) {
    const radius = width * relativeRadius * 0.5
    const x = width * centerX
    const y = height * centerY
    const gradient = paintCtx.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, `rgba(${rgb},0.92)`)
    gradient.addColorStop(0.6, `rgba(${rgb},0.4)`)
    gradient.addColorStop(1, `rgba(${rgb},0)`)
    paintCtx.fillStyle = gradient
    paintCtx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
  }
}

export function createSpriteCache(doc: Document) {
  const sprites = new Map<string, HTMLCanvasElement>()

  function get(key: string, width: number, height: number, paint: SpritePainter) {
    const cached = sprites.get(key)
    if (cached) return cached
    const canvas = doc.createElement('canvas')
    canvas.width = Math.max(1, Math.ceil(width))
    canvas.height = Math.max(1, Math.ceil(height))
    const spriteCtx = canvas.getContext('2d')
    if (!spriteCtx) return null
    paint(spriteCtx, canvas.width, canvas.height)
    if (sprites.size >= SPRITE_CACHE_LIMIT) sprites.clear()
    sprites.set(key, canvas)
    return canvas
  }

  return {
    /** 雨丝贴图；`tiltIndex` 取 0~3，对应 0/10/20/30px 的水平位移。 */
    rainSprite(tiltIndex: number) {
      const tilt = RAIN_TILT_BUCKETS[Math.max(0, Math.min(3, tiltIndex))]
      return get(`rain:${tilt}`, RAIN_SPRITE_WIDTH, RAIN_SPRITE_HEIGHT, (paintCtx, width, height) =>
        paintRainStreak(paintCtx, width, height, tilt),
      )
    },
    glowSprite(rgb: string) {
      return get(`glow:${rgb}`, 96, 96, (paintCtx, width) => paintGlow(paintCtx, width, rgb))
    },
    /** 云朵贴图（整朵云，含透明边）。 */
    cloudSprite(rgb: string) {
      return get(`cloud:${rgb}`, 512, 288, (paintCtx, width, height) => paintCloud(paintCtx, width, height, rgb))
    },
    clear() {
      sprites.clear()
    },
  }
}

export type SpriteCache = ReturnType<typeof createSpriteCache>
