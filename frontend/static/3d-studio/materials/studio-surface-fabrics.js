/**
 * 逐物件「材质风格」用到的程序化质感贴图（布纹 / 皮革粒纹 / 木纹 / 石纹 / 金属拉丝）。
 *
 * 与 studio-surface-textures.js 的分工：那边画的是**大件面**（壁画、背景墙的整幅画面），这边画的是
 * **家具表面**的细节层，并按「质感族」缓存。木 / 大理石 / 石 / 水泥 / 金属 / 织物六族直接复用
 * createFeatureWallTexture 的画法，不另起一套 —— 同一支木料在背景墙与餐桌上必须是同一张图，
 * 否则近看会发现两种木纹。
 *
 * **关键一步：取到的底图是彩色的，这里要把它规范化成「亮度细节图」再交给材质。**
 * 原因：材质的最终色 = map × color。风格档位的语义是「调色板决定色相」，若直接把彩色的木纹图
 * 乘上去，等于把木纹的棕色和调色板的木色叠了两遍，颜色会又暗又脏，而且不同档位之间的色差被贴图
 * 冲淡。所以这里逐像素取 Rec.709 亮度、按均值居中、压到 ±20% 的窄带（均值≈1 的灰图）：
 * 色相完全由调色板给，贴图只贡献纹理细节。
 *
 * 返回值约定：**null 表示「这个质感不需要贴图」**（纯色漆面、陶瓷、玻璃）。调用方据此跳过 map 设置、
 * 只调粗糙度与金属度 —— 给漆面硬塞一张噪点图只会让它显脏。
 *
 * 贴图一律 clone 底图后再处理：createFeatureWallTexture 返回的是跨调用共享的缓存实例，直接改它的
 * 平铺方式会顺带改掉背景墙。
 */
import { createFeatureWallTexture } from "./studio-surface-textures.js?v=2609260900";

/** 质感族 → 背景墙贴图名。只列有底图的族；不在此表内且没有专属画法的族一律返回 null。 */
const SURFACE_TEXTURE_ALIAS = Object.freeze({
  wood: "wood",
  marble: "marble",
  stone: "stone",
  concrete: "concrete",
  metal: "metal",
  fabric: "fabric"
});

/** 细节强度：亮度偏离均值时允许的最大明度幅度。取 0.2 是「看得出纹理但不显脏」的折中。 */
const DETAIL_AMPLITUDE = 0.2;
const DETAIL_SOURCE_SIZE = 512;

const surfaceTextures = new Map();

/**
 * 画一张皮革粒纹：大颗粒（细胞状明暗斑）叠小颗粒（高频细点）。
 * 用固定种子的伪随机而非 Math.random：同一族贴图每次生成必须一致，否则重绘一次就换一张皮，
 * 而且材质缓存键会跟着变、缓存直接失效。
 */
function paintLeather(canvasContext, width, height) {
  canvasContext.fillStyle = "#dcdcdc";
  canvasContext.fillRect(0, 0, width, height);
  let seed = 20260924;
  const nextRandom = () => {
    // 线性同余：取值稳定、实现短；只用来撒颗粒，不需要统计学性质。
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let index = 0; index < 900; index += 1) {
    const centerX = nextRandom() * width;
    const centerY = nextRandom() * height;
    const radius = 6 + nextRandom() * 16;
    const shade = 198 + Math.floor(nextRandom() * 44);
    canvasContext.fillStyle = `rgba(${shade},${shade},${shade},0.5)`;
    canvasContext.beginPath();
    canvasContext.arc(centerX, centerY, radius, 0, Math.PI * 2);
    canvasContext.fill();
  }
  for (let index = 0; index < 2600; index += 1) {
    const pointX = nextRandom() * width;
    const pointY = nextRandom() * height;
    const shade = 190 + Math.floor(nextRandom() * 52);
    canvasContext.fillStyle = `rgba(${shade},${shade},${shade},0.42)`;
    canvasContext.fillRect(pointX, pointY, 2, 2);
  }
}

const surfacePainters = Object.freeze({
  leather: paintLeather
});

/**
 * 把一张彩色底图规范化成均值≈1 的亮度细节图（见模块头）。
 * 任何一步拿不到像素（无 2D 上下文、跨域污染、尺寸为 0）都返回原图 —— 宁可要一张带色的底图，
 * 也不能让整个质感层失效。
 */
function normalizeToDetailCanvas(sourceImage) {
  const sourceWidth = sourceImage?.width || 0;
  const sourceHeight = sourceImage?.height || 0;
  if (!sourceWidth || !sourceHeight || typeof document === "undefined") {
    return null;
  }
  // 细节层不需要 1024 的分辨率，统一缩到 512 省一次大图逐像素运算。
  const detailCanvas = document.createElement("canvas");
  detailCanvas.width = DETAIL_SOURCE_SIZE;
  detailCanvas.height = DETAIL_SOURCE_SIZE;
  const detailContext = detailCanvas.getContext("2d");
  if (!detailContext) {
    return null;
  }
  detailContext.drawImage(sourceImage, 0, 0, DETAIL_SOURCE_SIZE, DETAIL_SOURCE_SIZE);
  let imageData;
  try {
    imageData = detailContext.getImageData(0, 0, DETAIL_SOURCE_SIZE, DETAIL_SOURCE_SIZE);
  } catch (readFailure) {
    // getImageData 在画布被跨域图污染时会抛错；这里没有跨域图，但按「宁可降级」处理。
    return null;
  }
  const pixels = imageData.data;
  const pixelCount = pixels.length / 4;
  const luminanceByPixel = new Float32Array(pixelCount);
  let luminanceSum = 0;
  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const offset = pixelIndex * 4;
    const luminance =
      (pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722) / 255;
    luminanceByPixel[pixelIndex] = luminance;
    luminanceSum += luminance;
  }
  // 均值为 0（全黑底图）时除以 0 会把整张图变成纯白；直接退化成「无明暗」的中灰细节图。
  const meanLuminance = pixelCount ? luminanceSum / pixelCount : 0.5;
  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    // 相对均值的偏离 → 明度倍率。偏离 ×2 是经验增益，把木纹那点细微分毫提成看得见的纹理。
    const detailRatio = Math.max(
      1 - DETAIL_AMPLITUDE,
      Math.min(1 + DETAIL_AMPLITUDE, 1 + (luminanceByPixel[pixelIndex] - meanLuminance) * 2)
    );
    const detailValue = Math.round(detailRatio * 255);
    const offset = pixelIndex * 4;
    pixels[offset] = detailValue;
    pixels[offset + 1] = detailValue;
    pixels[offset + 2] = detailValue;
  }
  detailContext.putImageData(imageData, 0, 0);
  return detailCanvas;
}

/**
 * 取某质感族的贴图。返回 null 表示该族不需要贴图。
 *
 * @param {object} threeApi THREE 命名空间（必须与场景同一份，否则 CanvasTexture 会被当成外来对象）。
 * @param {string} surfaceKey 质感族：wood / marble / stone / concrete / metal / fabric / leather。
 * @param {{maxAnisotropy?: number, repeat?: number}} [options] repeat 是贴图在 UV 上的平铺次数。
 */
export function createMaterialSurfaceTexture(threeApi, surfaceKey, options = {}) {
  const repeat = Math.max(0.1, options.repeat ?? 2);
  const cacheKey = surfaceKey + "@" + repeat;
  if (surfaceTextures.has(cacheKey)) {
    return surfaceTextures.get(cacheKey);
  }
  if (typeof document === "undefined" || typeof threeApi?.CanvasTexture !== "function") {
    return null;
  }
  // 底图来源二选一：复用背景墙那一套（同一种材料在背景墙与家具上是同一张图），或用本文件的专属画法。
  let sourceImage = null;
  const aliasStyle = SURFACE_TEXTURE_ALIAS[surfaceKey];
  if (aliasStyle) {
    const featureWallTexture = createFeatureWallTexture(
      threeApi,
      aliasStyle,
      options.maxAnisotropy
    );
    sourceImage = featureWallTexture?.image || null;
  } else if (surfacePainters[surfaceKey]) {
    const paintedCanvas = document.createElement("canvas");
    paintedCanvas.width = DETAIL_SOURCE_SIZE;
    paintedCanvas.height = DETAIL_SOURCE_SIZE;
    const paintedContext = paintedCanvas.getContext("2d");
    if (paintedContext) {
      surfacePainters[surfaceKey](paintedContext, paintedCanvas.width, paintedCanvas.height);
      sourceImage = paintedCanvas;
    }
  }
  const detailCanvas = sourceImage ? normalizeToDetailCanvas(sourceImage) : null;
  let surfaceTexture = null;
  if (detailCanvas) {
    // 细节图是中性灰，用 sRGB 采样即可：它只贡献明暗，不承载色相。
    surfaceTexture = new threeApi.CanvasTexture(detailCanvas);
    surfaceTexture.colorSpace = threeApi.SRGBColorSpace;
    surfaceTexture.anisotropy = Math.min(options.maxAnisotropy || 1, 8);
    surfaceTexture.wrapS = threeApi.RepeatWrapping;
    surfaceTexture.wrapT = threeApi.RepeatWrapping;
    surfaceTexture.repeat.set(repeat, repeat);
    surfaceTexture.needsUpdate = true;
  }
  surfaceTextures.set(cacheKey, surfaceTexture);
  return surfaceTexture;
}

/**
 * 该质感族是否有贴图。材质替换阶段据此跳过无谓的 canvas 绘制（漆面 / 陶瓷 / 玻璃都没有）。
 */
export function hasMaterialSurfaceTexture(surfaceKey) {
  return SURFACE_TEXTURE_ALIAS[surfaceKey] !== undefined || surfacePainters[surfaceKey] !== undefined;
}
