/**
 * 预渲染贴图缓存。
 *
 * 天气层每帧要对几百个粒子做绘制，用 `arc` / `stroke` 逐个体画代价太高
 * （雨丝 300+ 次路径描边、雪花 200+ 次圆），而 `ctx.filter` 模糊在 Safari 与低端机上
 * 又太贵。折中方案：**贴图只在参数变化时生成一次**，运行时只做 `drawImage`。
 */

export type SpritePainter = (ctx: CanvasRenderingContext2D, width: number, height: number) => void;

/** 缓存上限：参数抖动（尺寸变化、画质切换）不该把贴图无限堆在内存里。 */
const SPRITE_CACHE_LIMIT = 64;

/** 雨丝的倾斜档位（贴图内的水平位移），运行时按阵风选最近一档。 */
export const RAIN_TILT_BUCKETS = [0, 10, 20, 30] as const;
const RAIN_SPRITE_WIDTH = 40;
const RAIN_SPRITE_HEIGHT = 96;

/** 亮头 + 渐隐尾的雨丝，倾斜角随档位变化。 */
function paintRainStreak(paintCtx: CanvasRenderingContext2D, width: number, height: number, tilt: number) {
  const gradient = paintCtx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "rgba(255,246,221,0)");
  gradient.addColorStop(0.55, "rgba(255,246,221,0.62)");
  gradient.addColorStop(1, "rgba(255,250,236,1)");
  paintCtx.strokeStyle = gradient;
  paintCtx.lineWidth = 3;
  paintCtx.beginPath();
  paintCtx.moveTo(width - tilt, 0);
  paintCtx.lineTo(width - tilt - 6, height);
  paintCtx.stroke();
}

/** 通用柔光球：近景雪花、太阳/月亮光晕、雷电辉光都用它。 */
function paintGlow(paintCtx: CanvasRenderingContext2D, size: number, rgb: string) {
  const radius = size / 2;
  const gradient = paintCtx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  gradient.addColorStop(0, `rgba(${rgb},0.9)`);
  gradient.addColorStop(0.45, `rgba(${rgb},0.32)`);
  gradient.addColorStop(1, `rgba(${rgb},0)`);
  paintCtx.fillStyle = gradient;
  paintCtx.fillRect(0, 0, size, size);
}

/** 云团：几个重叠的径向渐变拼成一朵，取色随天气压暗。 */
function paintCloud(paintCtx: CanvasRenderingContext2D, width: number, height: number, rgb: string) {
  const blobs = [
    [0.34, 0.66, 0.4],
    [0.52, 0.56, 0.46],
    [0.68, 0.68, 0.36],
    [0.44, 0.74, 0.32],
    [0.6, 0.78, 0.28],
  ];
  for (const [centerX, centerY, relativeRadius] of blobs) {
    const radius = width * relativeRadius * 0.5;
    const x = width * centerX;
    const y = height * centerY;
    const gradient = paintCtx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(${rgb},0.92)`);
    gradient.addColorStop(0.6, `rgba(${rgb},0.42)`);
    gradient.addColorStop(1, `rgba(${rgb},0)`);
    paintCtx.fillStyle = gradient;
    paintCtx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
}

/** 横向雾带：中间厚、上下缘散开的条状贴图，拉宽后就是一层雾。 */
function paintFogBand(paintCtx: CanvasRenderingContext2D, width: number, height: number, tint: string) {
  const gradient = paintCtx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, `rgba(${tint},0)`);
  gradient.addColorStop(0.45, `rgba(${tint},0.5)`);
  gradient.addColorStop(0.62, `rgba(${tint},0.42)`);
  gradient.addColorStop(1, `rgba(${tint},0)`);
  paintCtx.fillStyle = gradient;
  paintCtx.fillRect(0, 0, width, height);
  // 左右两端再压一道，避免雾带边缘出现硬直切边。
  const edge = paintCtx.createLinearGradient(0, 0, width, 0);
  edge.addColorStop(0, "rgba(0,0,0,0)");
  edge.addColorStop(0.5, "rgba(0,0,0,1)");
  edge.addColorStop(1, "rgba(0,0,0,0)");
  paintCtx.globalCompositeOperation = "destination-in";
  paintCtx.fillStyle = edge;
  paintCtx.fillRect(0, 0, width, height);
}

/** 落叶：一片带叶脉的椭圆叶子，风大时才用。 */
function paintLeaf(paintCtx: CanvasRenderingContext2D, size: number) {
  paintCtx.translate(size / 2, size / 2);
  paintCtx.rotate(-0.5);
  paintCtx.fillStyle = "rgba(198,148,74,0.9)";
  paintCtx.beginPath();
  paintCtx.ellipse(0, 0, size * 0.3, size * 0.14, 0, 0, Math.PI * 2);
  paintCtx.fill();
  paintCtx.strokeStyle = "rgba(126,92,44,0.75)";
  paintCtx.lineWidth = 1.2;
  paintCtx.beginPath();
  paintCtx.moveTo(-size * 0.3, 0);
  paintCtx.lineTo(size * 0.28, 0);
  paintCtx.stroke();
}

export function createSpriteCache(doc: Document) {
  const sprites = new Map<string, HTMLCanvasElement>();

  function get(key: string, width: number, height: number, paint: SpritePainter) {
    const cached = sprites.get(key);
    if (cached) return cached;
    const canvas = doc.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(width));
    canvas.height = Math.max(1, Math.ceil(height));
    const spriteCtx = canvas.getContext("2d");
    if (!spriteCtx) return null;
    paint(spriteCtx, canvas.width, canvas.height);
    if (sprites.size >= SPRITE_CACHE_LIMIT) sprites.clear();
    sprites.set(key, canvas);
    return canvas;
  }

  return {
    /** 雨丝贴图；`tiltIndex` 取 0~3，对应 0/10/20/30px 的水平位移。 */
    rainSprite(tiltIndex: number) {
      const tilt = RAIN_TILT_BUCKETS[Math.max(0, Math.min(3, tiltIndex))];
      return get(`rain:${tilt}`, RAIN_SPRITE_WIDTH, RAIN_SPRITE_HEIGHT, (paintCtx, width, height) =>
        paintRainStreak(paintCtx, width, height, tilt),
      );
    },
    glowSprite(rgb: string) {
      return get(`glow:${rgb}`, 96, 96, (paintCtx, width) => paintGlow(paintCtx, width, rgb));
    },
    cloudSprite(tone: string, rgb: string) {
      return get(`cloud:${tone}`, 512, 288, (paintCtx, width, height) =>
        paintCloud(paintCtx, width, height, rgb),
      );
    },
    fogBandSprite(tint: string) {
      return get(`fogband:${tint}`, 512, 160, (paintCtx, width, height) =>
        paintFogBand(paintCtx, width, height, tint),
      );
    },
    leafSprite() {
      return get("leaf", 40, 40, (paintCtx, width) => paintLeaf(paintCtx, width));
    },
    clear() {
      sprites.clear();
    },
  };
}

export type SpriteCache = ReturnType<typeof createSpriteCache>;
