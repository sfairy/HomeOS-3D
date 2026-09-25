/**
 * 工作室模型库的程序化表面贴图：3D 工作室「挂画墙」的装饰画与「背景墙」的饰面材质都在线生成，
 * 模型库无需附带外部图片资源。风格常量表、样式归一化与两个贴图工厂（createMuralArtTexture /
 * createFeatureWallTexture，结果按风格缓存）。
 *
 * 关键约定：每个绘制函数用「带种子的 LCG」取随机数，同一风格每次刷新与每次导出都画出逐字节相同的图像。
 * 坐标：绘制尺寸是贴图像素（挂画 768×512、背景墙 1024×768），内部一律用宽高比例值定位，与分辨率解耦。
 */

// 挂画墙可选的艺术风格。
const MURAL_ART_STYLES = Object.freeze([
  "bauhaus",
  "colorfield",
  "linework",
  "blocks",
  "ink",
  "terrazzo"
]);

// 背景墙可选饰面：大理石、木饰面、格栅、石材、清水混凝土、织物、金属。
const FEATURE_WALL_STYLES = Object.freeze([
  "marble",
  "wood",
  "slat",
  "stone",
  "concrete",
  "fabric",
  "metal"
]);

/**
 * 各饰面对应的材质参数：让同一种饰面在 3D 里除了贴图之外，粗糙度与金属度也各不相同。
 * 只靠贴图无法体现材质差异（如混凝土的漫反射与金属的高光），因此每种风格各配一组
 * 颜色 / 粗糙度 / 金属度。
 */
export const FEATURE_WALL_STYLE_MATERIAL = Object.freeze({
  marble: { color: 0xf7f7f5, roughness: 0.34, metalness: 0.03 },
  wood: { color: 0x9a6f42, roughness: 0.72, metalness: 0.02 },
  slat: { color: 0x6f523a, roughness: 0.74, metalness: 0.02 },
  stone: { color: 0xcec8bd, roughness: 0.46, metalness: 0.02 },
  concrete: { color: 0xb4b1ab, roughness: 0.94, metalness: 0 },
  fabric: { color: 0xc9c0b2, roughness: 0.98, metalness: 0 },
  metal: { color: 0x9ba0a6, roughness: 0.38, metalness: 0.28 }
});

// 用 Set 做白名单查询：归一化函数会被频繁调用，线性查找没必要。
const muralArtStyleSet = new Set(MURAL_ART_STYLES);
const featureWallStyleSet = new Set(FEATURE_WALL_STYLES);

/**
 * 归一化挂画风格，非法值回落到第一个风格。
 */
export function normalizeMuralArtStyle(styleValue) {
  return muralArtStyleSet.has(styleValue) ? styleValue : MURAL_ART_STYLES[0];
}

/**
 * 归一化背景墙饰面风格，非法值回落到第一个风格。
 */
export function normalizeFeatureWallStyle(styleValue) {
  return featureWallStyleSet.has(styleValue) ? styleValue : FEATURE_WALL_STYLES[0];
}

/**
 * 确定性伪随机数源。
 */
function seededRandomSource(seed) {
  let randomSeed = seed >>> 0;
  return () => {
    // 常数取自 Numerical Recipes 的 LCG（乘 1664525、加 1013904223），
    // 再除以 2^32 归一化到 [0, 1)；>>> 0 保证中间结果留在 32 位无符号范围内。
    randomSeed = (randomSeed * 1664525 + 1013904223) >>> 0;
    return randomSeed / 4294967296;
  };
}

/**
 * 按系数调整颜色明度。
 */
function shadeColor(hexColor, factor) {
  const red = Math.min(255, Math.max(0, Math.round(((hexColor >> 16) & 255) * factor)));
  const green = Math.min(255, Math.max(0, Math.round(((hexColor >> 8) & 255) * factor)));
  const blue = Math.min(255, Math.max(0, Math.round((hexColor & 255) * factor)));
  return "rgb(" + red + ", " + green + ", " + blue + ")";
}

/**
 * 用二次曲线平滑地串起一串采样点并描边。
 * 直接连线会得到明显的折线感；这里以相邻点的中点为锚、采样点本身为控制点做
 * 二次贝塞尔，让石纹与木纹看起来是自然生长的。
 */
function strokeSmoothPath(canvasCtx, points) {
  if (points.length < 2) {
    return;
  }
  canvasCtx.beginPath();
  canvasCtx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length - 1; index += 1) {
    // 相邻两点的中点作为二次贝塞尔的锚点：曲线终点落在中点，才能自然接上下一段。
    const midX = (points[index].x + points[index + 1].x) / 2;
    // 锚点的纵向分量。
    const midY = (points[index].y + points[index + 1].y) / 2;
    canvasCtx.quadraticCurveTo(points[index].x, points[index].y, midX, midY);
  }
  const lastPoint = points[points.length - 1];
  canvasCtx.lineTo(lastPoint.x, lastPoint.y);
  canvasCtx.stroke();
}

/**
 * 包豪斯风格挂画：几何色块 + 一条手绘曲线 + 右侧刻度短线。
 */
function paintMuralBauhaus(canvasCtx, width, height) {
  const muralBase = canvasCtx.createLinearGradient(0, 0, width, height);
  muralBase.addColorStop(0, "#f5f0e6");
  muralBase.addColorStop(0.55, "#ead9c6");
  muralBase.addColorStop(1, "#d8ccba");
  canvasCtx.fillStyle = muralBase;
  canvasCtx.fillRect(0, 0, width, height);
  canvasCtx.fillStyle = "rgba(47, 90, 102, .9)";
  canvasCtx.beginPath();
  canvasCtx.arc(width * 0.28, height * 0.42, height * 0.3, 0, Math.PI * 2);
  canvasCtx.fill();
  canvasCtx.fillStyle = "rgba(216, 161, 63, .9)";
  canvasCtx.fillRect(width * 0.61, height * 0.14, width * 0.25, height * 0.27);
  canvasCtx.fillStyle = "rgba(201, 111, 74, .88)";
  canvasCtx.beginPath();
  canvasCtx.arc(width * 0.53, height * 0.64, height * 0.27, Math.PI * 1.05, Math.PI * 1.95);
  canvasCtx.closePath();
  canvasCtx.fill();
  canvasCtx.fillStyle = "rgba(217, 163, 160, .85)";
  canvasCtx.beginPath();
  canvasCtx.arc(width * 0.73, height * 0.75, height * 0.115, 0, Math.PI * 2);
  canvasCtx.fill();
  canvasCtx.save();
  canvasCtx.translate(width * 0.43, height * 0.28);
  canvasCtx.rotate(Math.PI / 5);
  canvasCtx.fillStyle = "rgba(43, 47, 56, .9)";
  canvasCtx.fillRect(-height * 0.055, -height * 0.055, height * 0.11, height * 0.11);
  canvasCtx.restore();
  canvasCtx.lineCap = "round";
  canvasCtx.strokeStyle = "rgba(43, 47, 56, .92)";
  canvasCtx.lineWidth = height * 0.022;
  canvasCtx.beginPath();
  canvasCtx.moveTo(width * 0.09, height * 0.83);
  canvasCtx.bezierCurveTo(
    width * 0.34,
    height * 0.61,
    width * 0.56,
    height * 0.99,
    width * 0.91,
    height * 0.71
  );
  canvasCtx.stroke();
  canvasCtx.strokeStyle = "rgba(43, 47, 56, .36)";
  canvasCtx.lineWidth = 2;
  canvasCtx.beginPath();
  canvasCtx.moveTo(width * 0.5, height * 0.07);
  canvasCtx.lineTo(width * 0.5, height * 0.93);
  canvasCtx.stroke();
  for (let stripe = 0; stripe < 7; stripe += 1) {
    const stripeY = height * (0.13 + stripe * 0.055);
    canvasCtx.beginPath();
    canvasCtx.moveTo(width * 0.84, stripeY);
    canvasCtx.lineTo(width * 0.94, stripeY);
    canvasCtx.stroke();
  }
}

/**
 * 色域风格挂画：几块大面积的半透明圆角色块叠在竖向浅色条带上。
 *
 * 圆角半径由随机数决定，让每块色域的柔和程度略有差别。
 */
function paintMuralColorField(canvasCtx, width, height) {
  const colorFieldRandom = seededRandomSource(74123);
  const muralBase = canvasCtx.createLinearGradient(0, 0, 0, height);
  muralBase.addColorStop(0, "#f7f3ec");
  muralBase.addColorStop(1, "#e7ded0");
  canvasCtx.fillStyle = muralBase;
  canvasCtx.fillRect(0, 0, width, height);
  const colorFields = [
    { x: 0.12, y: 0.26, w: 0.46, h: 0.54, color: "rgba(72, 122, 148, .5)" },
    { x: 0.44, y: 0.14, w: 0.4, h: 0.46, color: "rgba(213, 156, 88, .5)" },
    { x: 0.56, y: 0.47, w: 0.36, h: 0.44, color: "rgba(184, 101, 94, .44)" },
    { x: 0.24, y: 0.58, w: 0.36, h: 0.3, color: "rgba(120, 133, 97, .4)" }
  ];
  for (const colorField of colorFields) {
    const fieldRadius = Math.min(width, height) * (0.05 + colorFieldRandom() * 0.09);
    canvasCtx.fillStyle = colorField.color;
    canvasCtx.beginPath();
    canvasCtx.roundRect(
      width * colorField.x,
      height * colorField.y,
      width * colorField.w,
      height * colorField.h,
      fieldRadius
    );
    canvasCtx.fill();
  }
  canvasCtx.fillStyle = "rgba(255, 253, 248, .3)";
  for (let band = 0; band < 5; band += 1) {
    canvasCtx.fillRect(width * (0.06 + band * 0.19), 0, width * 0.045, height);
  }
  canvasCtx.strokeStyle = "rgba(53, 62, 70, .5)";
  canvasCtx.lineWidth = 2;
  canvasCtx.strokeRect(width * 0.07, height * 0.09, width * 0.86, height * 0.82);
}

/**
 * 线条风格挂画：46 条随机长度与透明度的斜线，加一段深蓝圆弧与红点、一条水平参考线。
 */
function paintMuralLinework(canvasCtx, width, height) {
  const lineworkRandom = seededRandomSource(90211);
  canvasCtx.fillStyle = "#f6f3ec";
  canvasCtx.fillRect(0, 0, width, height);
  canvasCtx.lineCap = "round";
  for (let line = 0; line < 46; line += 1) {
    const lineOffset = lineworkRandom();
    const lineLength = height * (0.24 + lineworkRandom() * 0.55);
    const lineStartX = width * (-0.08 + lineOffset * 1.16);
    const lineStartY = height * (lineworkRandom() * 0.5);
    canvasCtx.strokeStyle = "rgba(48, 55, 63, " + (0.1 + lineworkRandom() * 0.36).toFixed(2) + ")";
    canvasCtx.lineWidth = 1 + lineworkRandom() * 2.4;
    canvasCtx.beginPath();
    canvasCtx.moveTo(lineStartX, lineStartY);
    canvasCtx.lineTo(lineStartX + lineLength * 0.34, lineStartY + lineLength);
    canvasCtx.stroke();
  }
  canvasCtx.strokeStyle = "rgba(43, 92, 112, .82)";
  canvasCtx.lineWidth = height * 0.032;
  canvasCtx.beginPath();
  canvasCtx.arc(width * 0.62, height * 0.68, height * 0.34, Math.PI * 1.06, Math.PI * 1.72);
  canvasCtx.stroke();
  canvasCtx.fillStyle = "rgba(201, 96, 68, .92)";
  canvasCtx.beginPath();
  canvasCtx.arc(width * 0.26, height * 0.34, height * 0.045, 0, Math.PI * 2);
  canvasCtx.fill();
  canvasCtx.strokeStyle = "rgba(48, 55, 63, .55)";
  canvasCtx.lineWidth = 1.6;
  canvasCtx.beginPath();
  canvasCtx.moveTo(0, height * 0.5);
  canvasCtx.lineTo(width, height * 0.5);
  canvasCtx.stroke();
}

/**
 * 色块风格挂画：四列自下而上堆叠的矩形色块，列间留竖向浅色缝。
 */
function paintMuralBlocks(canvasCtx, width, height) {
  const blocksRandom = seededRandomSource(31577);
  canvasCtx.fillStyle = "#f2ece1";
  canvasCtx.fillRect(0, 0, width, height);
  const blockColumns = [0.06, 0.3, 0.52, 0.72];
  const blockPalette = [
    "#2f5a66",
    "#c98f45",
    "#b8604c",
    "#8f9c74",
    "#3d4550",
    "#d9a3a0",
    "#5d7f92"
  ];
  for (let column = 0; column < blockColumns.length; column += 1) {
    let blockCursor = 0.07;
    const columnWidth = column === blockColumns.length - 1 ? 0.22 : 0.18 + blocksRandom() * 0.06;
    while (blockCursor < 0.92) {
      const blockHeight = 0.12 + blocksRandom() * 0.3;
      canvasCtx.fillStyle = blockPalette[Math.floor(blocksRandom() * blockPalette.length)];
      canvasCtx.fillRect(
        width * blockColumns[column],
        height * blockCursor,
        width * columnWidth,
        height * Math.min(blockHeight, 0.93 - blockCursor)
      );
      blockCursor += blockHeight + 0.015;
    }
  }
  canvasCtx.fillStyle = "rgba(255, 252, 246, .9)";
  for (let gap = 0; gap < blockColumns.length - 1; gap += 1) {
    canvasCtx.fillRect(width * (blockColumns[gap] + 0.19), 0, width * 0.012, height);
  }
  canvasCtx.fillStyle = "rgba(255, 252, 246, .9)";
  canvasCtx.fillRect(width * 0.52, height * 0.44, width * 0.06, height * 0.14);
}

/**
 * 水墨风格挂画：14 团径向渐变的墨晕 + 一条黑色笔触 + 一道红色横笔与朱点。
 */
function paintMuralInk(canvasCtx, width, height) {
  const inkRandom = seededRandomSource(60413);
  canvasCtx.fillStyle = "#f7f2e8";
  canvasCtx.fillRect(0, 0, width, height);
  for (let wash = 0; wash < 14; wash += 1) {
    const washCenterX = width * (0.08 + inkRandom() * 0.84);
    const washCenterY = height * (0.12 + inkRandom() * 0.76);
    const washRadius = height * (0.08 + inkRandom() * 0.24);
    const washGradient = canvasCtx.createRadialGradient(
      washCenterX,
      washCenterY,
      0,
      washCenterX,
      washCenterY,
      washRadius
    );
    const washTone = Math.floor(40 + inkRandom() * 60);
    washGradient.addColorStop(
      0,
      "rgba(" +
        washTone +
        ", " +
        (washTone + 6) +
        ", " +
        (washTone + 14) +
        ", " +
        (0.1 + inkRandom() * 0.2).toFixed(2) +
        ")"
    );
    washGradient.addColorStop(
      1,
      "rgba(" + washTone + ", " + (washTone + 6) + ", " + (washTone + 14) + ", 0)"
    );
    canvasCtx.fillStyle = washGradient;
    canvasCtx.beginPath();
    canvasCtx.arc(washCenterX, washCenterY, washRadius, 0, Math.PI * 2);
    canvasCtx.fill();
  }
  canvasCtx.strokeStyle = "rgba(38, 44, 51, .82)";
  canvasCtx.lineCap = "round";
  canvasCtx.lineWidth = height * 0.018;
  canvasCtx.beginPath();
  canvasCtx.moveTo(width * 0.1, height * 0.68);
  canvasCtx.bezierCurveTo(
    width * 0.32,
    height * 0.42,
    width * 0.52,
    height * 0.78,
    width * 0.78,
    height * 0.44
  );
  canvasCtx.stroke();
  canvasCtx.strokeStyle = "rgba(178, 64, 46, .92)";
  canvasCtx.lineWidth = height * 0.03;
  canvasCtx.beginPath();
  canvasCtx.moveTo(width * 0.58, height * 0.26);
  canvasCtx.lineTo(width * 0.88, height * 0.3);
  canvasCtx.stroke();
  canvasCtx.fillStyle = "rgba(178, 64, 46, .9)";
  canvasCtx.beginPath();
  canvasCtx.arc(width * 0.5, height * 0.3, height * 0.035, 0, Math.PI * 2);
  canvasCtx.fill();
}

/**
 * 水磨石风格挂画：340 颗随机旋转的多边形石粒，叠两段粗圆弧与一块浅色遮盖圆。
 */
function paintMuralTerrazzo(canvasCtx, width, height) {
  const terrazzoRandom = seededRandomSource(52019);
  canvasCtx.fillStyle = "#f3eee4";
  canvasCtx.fillRect(0, 0, width, height);
  const chipPalette = [
    "#2f5a66",
    "#c98f45",
    "#b8604c",
    "#8f9c74",
    "#3d4550",
    "#d9a3a0",
    "#5d7f92",
    "#b9a88f"
  ];
  for (let chip = 0; chip < 340; chip += 1) {
    const chipCenterX = terrazzoRandom() * width;
    const chipCenterY = terrazzoRandom() * height;
    const chipSize = 3 + terrazzoRandom() * 12;
    canvasCtx.save();
    canvasCtx.translate(chipCenterX, chipCenterY);
    canvasCtx.rotate(terrazzoRandom() * Math.PI);
    canvasCtx.fillStyle = chipPalette[Math.floor(terrazzoRandom() * chipPalette.length)];
    canvasCtx.beginPath();
    canvasCtx.moveTo(-chipSize, -chipSize * 0.5);
    canvasCtx.lineTo(chipSize * 0.8, -chipSize);
    canvasCtx.lineTo(chipSize, chipSize * 0.7);
    canvasCtx.lineTo(-chipSize * 0.6, chipSize);
    canvasCtx.closePath();
    canvasCtx.fill();
    canvasCtx.restore();
  }
  canvasCtx.fillStyle = "rgba(243, 238, 228, .72)";
  canvasCtx.beginPath();
  canvasCtx.arc(width * 0.3, height * 0.42, height * 0.28, 0, Math.PI * 2);
  canvasCtx.fill();
  canvasCtx.strokeStyle = "rgba(47, 90, 102, .8)";
  canvasCtx.lineWidth = height * 0.026;
  canvasCtx.beginPath();
  canvasCtx.arc(width * 0.3, height * 0.42, height * 0.28, Math.PI * 0.9, Math.PI * 1.9);
  canvasCtx.stroke();
  canvasCtx.strokeStyle = "rgba(184, 96, 76, .82)";
  canvasCtx.lineWidth = height * 0.02;
  canvasCtx.beginPath();
  canvasCtx.arc(width * 0.72, height * 0.62, height * 0.19, Math.PI * 1.7, Math.PI * 0.7);
  canvasCtx.stroke();
}

// 风格名 → 绘制函数；新增风格需要同时更新 MURAL_ART_STYLES 与本表。
const muralPainters = Object.freeze({
  bauhaus: paintMuralBauhaus,
  colorfield: paintMuralColorField,
  linework: paintMuralLinework,
  blocks: paintMuralBlocks,
  ink: paintMuralInk,
  terrazzo: paintMuralTerrazzo
});

// 贴图按风格缓存：Canvas 绘制开销不小，同一风格全场景只生成一次。
const muralArtTextures = new Map();

/**
 * 生成（或取回缓存的）挂画贴图。
 */
export function createMuralArtTexture(threeApi, styleValue, maxAnisotropy = 1) {
  const muralStyle = normalizeMuralArtStyle(styleValue);
  if (muralArtTextures.has(muralStyle)) {
    return muralArtTextures.get(muralStyle);
  }
  // 768×512 是挂画在两米宽墙面上仍够清晰的折中尺寸，再大对内存不划算。
  const canvasElement = document.createElement("canvas");
  canvasElement.width = 768;
  canvasElement.height = 512;
  const canvasCtx = canvasElement.getContext("2d");
  if (!canvasCtx) {
    return null;
  }
  muralPainters[muralStyle](canvasCtx, canvasElement.width, canvasElement.height);
  // 基色贴图必须标为 sRGB，否则渲染器会按线性空间解释导致颜色发灰。
  const texture = new threeApi.CanvasTexture(canvasElement);
  texture.colorSpace = threeApi.SRGBColorSpace;
  // 各向异性上限取 8：足以让斜视角度下的纹路不糊，又不会在小设备上耗费过多采样。
  texture.anisotropy = Math.min(maxAnisotropy || 1, 8);
  texture.needsUpdate = true;
  muralArtTextures.set(muralStyle, texture);
  return texture;
}

/**
 * 大理石的两个色号。**画法只有一套**（同一个随机结构、同一组云斑与纹路数量），色号只换调色：
 * 底色渐变、云斑明暗、主纹 / 细纹的颜色与透明度、噪点色，以及随机种子。
 *
 * 为什么做成「色号」而不是两份画法：白石与黑石在实物上是同一种石头（都是抛光大理岩），
 * 差别只在底色与纹路反差 —— 若各写一套，两边的纹路风格、疏密必然慢慢跑偏，
 * 同一件家具上的上下两块石板会像两种完全不同的材料。
 *
 * ⚠️ 白色色号（`white`）的每一项都必须是**原值**：背景墙的大理石饰面与餐桌台面用的是同一张图，
 * 动这里的数字会连带改掉背景墙。加色号请只加新对象，不要改 white。
 */
const MARBLE_TONES = Object.freeze({
  white: Object.freeze({
    seed: 88117,
    baseStops: Object.freeze([
      [0, "#ffffff"],
      [0.5, "#fbfbfa"],
      [1, "#f2f2f0"]
    ]),
    cloudLightTone: "255, 255, 255",
    cloudLightAlpha: Object.freeze([0.08, 0.18]),
    cloudDarkTone: "214, 216, 220",
    cloudDarkAlpha: Object.freeze([0.03, 0.08]),
    mainVeinTone: "16, 17, 20",
    mainVeinAlpha: Object.freeze([0.34, 0.42]),
    mainVeinWidth: Object.freeze([1.6, 5.2]),
    fineVeinTone: "38, 40, 45",
    fineVeinAlpha: Object.freeze([0.14, 0.3]),
    fineVeinWidth: Object.freeze([0.7, 1.9]),
    speckLightTone: "255, 255, 255",
    speckLightAlpha: ".5",
    speckDarkTone: "24, 25, 28",
    speckDarkAlpha: ".3"
  }),
  // 黑金大理石（黑底白纹）：实物参考里黑石座就是这一支 —— 近黑的底上飘着灰白纹路，
  // 纹路比白石那支更细更亮（黑底上只有亮纹才看得见，暗纹等于没有）。
  dark: Object.freeze({
    seed: 20260924,
    baseStops: Object.freeze([
      [0, "#14161a"],
      [0.5, "#1b1e23"],
      [1, "#0d0f12"]
    ]),
    cloudLightTone: "122, 130, 142",
    cloudLightAlpha: Object.freeze([0.05, 0.1]),
    cloudDarkTone: "4, 5, 7",
    cloudDarkAlpha: Object.freeze([0.05, 0.12]),
    mainVeinTone: "236, 239, 244",
    mainVeinAlpha: Object.freeze([0.34, 0.42]),
    mainVeinWidth: Object.freeze([1.4, 4.0]),
    fineVeinTone: "176, 186, 198",
    fineVeinAlpha: Object.freeze([0.12, 0.26]),
    fineVeinWidth: Object.freeze([0.6, 1.6]),
    speckLightTone: "235, 240, 246",
    speckLightAlpha: ".34",
    speckDarkTone: "6, 7, 9",
    speckDarkAlpha: ".42"
  })
});

/**
 * 抛光大理岩：底色渐变 + 柔和的云斑 + 9 条粗主纹 + 46 条细纹 + 明暗噪点。
 * @param {object} tone MARBLE_TONES 里的一档。
 */
function paintMarbleSlab(canvasCtx, width, height, tone) {
  const marbleRandom = seededRandomSource(tone.seed);
  const surfaceBase = canvasCtx.createLinearGradient(0, 0, width, height);
  for (const [stopOffset, stopColor] of tone.baseStops) {
    surfaceBase.addColorStop(stopOffset, stopColor);
  }
  canvasCtx.fillStyle = surfaceBase;
  canvasCtx.fillRect(0, 0, width, height);
  for (let cloud = 0; cloud < 24; cloud += 1) {
    const cloudX = marbleRandom() * width;
    const cloudY = marbleRandom() * height;
    const cloudRadius = Math.min(width, height) * (0.08 + marbleRandom() * 0.32);
    const cloudLighter = marbleRandom() > 0.35;
    const cloudTone = cloudLighter ? tone.cloudLightTone : tone.cloudDarkTone;
    // 偏亮 / 偏暗两路各自一对「基准 + 浮动」，与 tone 里的两对区间一一对应。
    const cloudAlphaRange = cloudLighter ? tone.cloudLightAlpha : tone.cloudDarkAlpha;
    const cloudAlpha = cloudAlphaRange[0] + marbleRandom() * cloudAlphaRange[1];
    const cloudGradient = canvasCtx.createRadialGradient(
      cloudX,
      cloudY,
      0,
      cloudX,
      cloudY,
      cloudRadius
    );
    cloudGradient.addColorStop(0, "rgba(" + cloudTone + ", " + cloudAlpha.toFixed(2) + ")");
    cloudGradient.addColorStop(1, "rgba(" + cloudTone + ", 0)");
    canvasCtx.fillStyle = cloudGradient;
    canvasCtx.fillRect(
      cloudX - cloudRadius,
      cloudY - cloudRadius,
      cloudRadius * 2,
      cloudRadius * 2
    );
  }
  canvasCtx.lineCap = "round";
  // 粗主纹是抛光大理石最典型的对比特征，宽度与透明度随随机数变化。
  for (let vein = 0; vein < 9; vein += 1) {
    const veinPoints = [];
    let veinX = width * (-0.04 + marbleRandom() * 1.08);
    let veinY = -height * 0.12;
    veinPoints.push({ x: veinX, y: veinY });
    while (veinY < height * 1.1) {
      veinX += (marbleRandom() - 0.5) * width * 0.23;
      veinY += height * (0.07 + marbleRandom() * 0.13);
      veinPoints.push({ x: veinX, y: veinY });
    }
    canvasCtx.strokeStyle =
      "rgba(" +
      tone.mainVeinTone +
      ", " +
      (tone.mainVeinAlpha[0] + marbleRandom() * tone.mainVeinAlpha[1]).toFixed(2) +
      ")";
    canvasCtx.lineWidth = tone.mainVeinWidth[0] + marbleRandom() * tone.mainVeinWidth[1];
    strokeSmoothPath(canvasCtx, veinPoints);
  }
  // 再补一层更细、更淡的分支纹：只有主纹的话会像印刷的条纹而不像石材。
  for (let fine = 0; fine < 46; fine += 1) {
    const finePoints = [];
    let fineX = marbleRandom() * width;
    let fineY = -height * 0.06;
    finePoints.push({ x: fineX, y: fineY });
    const fineSteps = 3 + Math.floor(marbleRandom() * 5);
    for (let step = 0; step < fineSteps; step += 1) {
      fineX += (marbleRandom() - 0.5) * width * 0.16;
      fineY += height * (0.05 + marbleRandom() * 0.1);
      finePoints.push({ x: fineX, y: fineY });
    }
    canvasCtx.strokeStyle =
      "rgba(" +
      tone.fineVeinTone +
      ", " +
      (tone.fineVeinAlpha[0] + marbleRandom() * tone.fineVeinAlpha[1]).toFixed(2) +
      ")";
    canvasCtx.lineWidth = tone.fineVeinWidth[0] + marbleRandom() * tone.fineVeinWidth[1];
    strokeSmoothPath(canvasCtx, finePoints);
  }
  canvasCtx.fillStyle = "rgba(" + tone.speckLightTone + ", " + tone.speckLightAlpha + ")";
  for (let speck = 0; speck < 700; speck += 1) {
    canvasCtx.fillRect(marbleRandom() * width, marbleRandom() * height, 1.2, 1.2);
  }
  canvasCtx.fillStyle = "rgba(" + tone.speckDarkTone + ", " + tone.speckDarkAlpha + ")";
  for (let speck = 0; speck < 260; speck += 1) {
    canvasCtx.fillRect(marbleRandom() * width, marbleRandom() * height, 1.3, 1.3);
  }
}

/**
 * 大理石饰面：白色色号（与石材板共用同一套画法，见 MARBLE_TONES）。
 */
function paintFeatureWallMarble(canvasCtx, width, height) {
  paintMarbleSlab(canvasCtx, width, height, MARBLE_TONES.white);
}

/**
 * 木饰面：四块竖向拼板，每块带横向渐变的底色、120 条木纹与若干年轮节疤。
 */
function paintFeatureWallWood(canvasCtx, width, height) {
  const woodRandom = seededRandomSource(45119);
  const grainPalette = [0xa4713f, 0x8c5c31, 0xb98a54];
  const plankCount = 4;
  const plankWidth = width / plankCount;
  for (let plank = 0; plank < plankCount; plank += 1) {
    const plankX = plank * plankWidth;
    const plankTone = 0.86 + woodRandom() * 0.3;
    const plankGradient = canvasCtx.createLinearGradient(plankX, 0, plankX + plankWidth, 0);
    plankGradient.addColorStop(
      0,
      shadeColor(grainPalette[plank % grainPalette.length], plankTone * 0.92)
    );
    plankGradient.addColorStop(
      0.45,
      shadeColor(grainPalette[plank % grainPalette.length], plankTone * 1.08)
    );
    plankGradient.addColorStop(
      1,
      shadeColor(grainPalette[plank % grainPalette.length], plankTone * 0.88)
    );
    canvasCtx.fillStyle = plankGradient;
    canvasCtx.fillRect(plankX, 0, plankWidth, height);
    canvasCtx.lineCap = "round";
    for (let grain = 0; grain < 120; grain += 1) {
      const grainPoints = [];
      let grainX = plankX + woodRandom() * plankWidth;
      let grainY = -height * 0.06;
      // 木纹整体沿板宽方向的漂移量（±4.5% 板宽）：让纹路不总是与板长方向平行。
      const grainDrift = (woodRandom() - 0.5) * plankWidth * 0.09;
      grainPoints.push({ x: grainX, y: grainY });
      while (grainY < height * 1.06) {
        grainX += grainDrift + (woodRandom() - 0.5) * plankWidth * 0.045;
        grainY += height * (0.1 + woodRandom() * 0.2);
        grainPoints.push({ x: grainX, y: grainY });
      }
      const grainDark = woodRandom() > 0.35;
      canvasCtx.strokeStyle = grainDark
        ? "rgba(62, 38, 18, " + (0.05 + woodRandom() * 0.2).toFixed(2) + ")"
        : "rgba(246, 214, 172, " + (0.04 + woodRandom() * 0.14).toFixed(2) + ")";
      canvasCtx.lineWidth = 0.6 + woodRandom() * 3;
      strokeSmoothPath(canvasCtx, grainPoints);
    }
    const knotCount = woodRandom() > 0.5 ? 2 : 1;
    for (let knot = 0; knot < knotCount; knot += 1) {
      const knotX = plankX + plankWidth * (0.2 + woodRandom() * 0.6);
      const knotY = height * (0.12 + woodRandom() * 0.76);
      const knotRadius = Math.min(plankWidth, height) * (0.04 + woodRandom() * 0.05);
      for (let ring = 4; ring >= 1; ring -= 1) {
        canvasCtx.strokeStyle = "rgba(58, 34, 15, " + (0.1 + ring * 0.05).toFixed(2) + ")";
        canvasCtx.lineWidth = 1.1;
        canvasCtx.beginPath();
        canvasCtx.ellipse(
          knotX,
          knotY,
          knotRadius * ring * 0.5,
          knotRadius * ring * 0.82,
          0,
          0,
          Math.PI * 2
        );
        canvasCtx.stroke();
      }
    }
    canvasCtx.fillStyle = "rgba(46, 28, 12, .5)";
    canvasCtx.fillRect(plankX, 0, 2.4, height);
  }
  canvasCtx.fillStyle = "rgba(46, 28, 12, .5)";
  canvasCtx.fillRect(width - 2.4, 0, 2.4, height);
}

/**
 * 木格栅饰面：深色凹槽底 + 等距竖条，竖条中间有一条高光细线。
 */
function paintFeatureWallSlat(canvasCtx, width, height) {
  const slatRandom = seededRandomSource(70841);
  const slatCount = Math.max(12, Math.round(width / 34));
  const slatPitch = width / slatCount;
  const recessGradient = canvasCtx.createLinearGradient(0, 0, 0, height);
  recessGradient.addColorStop(0, "#241b14");
  recessGradient.addColorStop(0.5, "#180f0a");
  recessGradient.addColorStop(1, "#241b14");
  canvasCtx.fillStyle = recessGradient;
  canvasCtx.fillRect(0, 0, width, height);
  for (let slat = 0; slat < slatCount; slat += 1) {
    const slatX = slatPitch * slat;
    const slatGradient = canvasCtx.createLinearGradient(slatX, 0, slatX + slatPitch, 0);
    slatGradient.addColorStop(0, "rgba(20, 12, 7, .94)");
    slatGradient.addColorStop(0.5, "rgba(46, 32, 21, .5)");
    slatGradient.addColorStop(1, "rgba(20, 12, 7, .94)");
    canvasCtx.fillStyle = slatGradient;
    canvasCtx.fillRect(slatX, 0, slatPitch * 0.96, height);
    canvasCtx.strokeStyle = "rgba(148, 112, 76, " + (0.06 + slatRandom() * 0.1).toFixed(2) + ")";
    canvasCtx.lineWidth = 1;
    canvasCtx.beginPath();
    canvasCtx.moveTo(slatX + slatPitch * 0.5, 0);
    canvasCtx.lineTo(slatX + slatPitch * 0.5, height);
    canvasCtx.stroke();
  }
  const castShadow = canvasCtx.createLinearGradient(0, 0, 0, height);
  castShadow.addColorStop(0, "rgba(0, 0, 0, .4)");
  castShadow.addColorStop(0.16, "rgba(0, 0, 0, 0)");
  castShadow.addColorStop(0.84, "rgba(0, 0, 0, 0)");
  castShadow.addColorStop(1, "rgba(0, 0, 0, .4)");
  canvasCtx.fillStyle = castShadow;
  canvasCtx.fillRect(0, 0, width, height);
}

/**
 * 石材墙面：3×2 块板材，每块在基准色上做明度浮动，并叠加云斑、细纹与白色噪点。
 */
function paintFeatureWallStone(canvasCtx, width, height) {
  const stoneRandom = seededRandomSource(25309);
  const slabColumns = 3;
  const slabRows = 2;
  canvasCtx.fillStyle = "#6f6b64";
  canvasCtx.fillRect(0, 0, width, height);
  const slabWidth = width / slabColumns;
  const slabHeight = height / slabRows;
  const slabBases = [214, 208, 197, 201, 197, 186, 224, 218, 208];
  for (let row = 0; row < slabRows; row += 1) {
    for (let column = 0; column < slabColumns; column += 1) {
      const slabX = column * slabWidth;
      const slabY = row * slabHeight;
      const slabTone = 0.9 + stoneRandom() * 0.24;
      canvasCtx.fillStyle = shadeColor(slabBases[row * slabColumns + column], slabTone);
      canvasCtx.fillRect(slabX + 1.6, slabY + 1.6, slabWidth - 3.2, slabHeight - 3.2);
      for (let mottle = 0; mottle < 20; mottle += 1) {
        const mottleX = slabX + stoneRandom() * slabWidth;
        const mottleY = slabY + stoneRandom() * slabHeight;
        const mottleRadius = Math.min(slabWidth, slabHeight) * (0.1 + stoneRandom() * 0.4);
        const mottleDark = stoneRandom() > 0.5;
        const mottleTone = mottleDark ? "150, 144, 133" : "246, 243, 236";
        const mottleGradient = canvasCtx.createRadialGradient(
          mottleX,
          mottleY,
          0,
          mottleX,
          mottleY,
          mottleRadius
        );
        mottleGradient.addColorStop(
          0,
          "rgba(" + mottleTone + ", " + (0.08 + stoneRandom() * 0.2).toFixed(2) + ")"
        );
        mottleGradient.addColorStop(1, "rgba(" + mottleTone + ", 0)");
        canvasCtx.fillStyle = mottleGradient;
        canvasCtx.fillRect(
          mottleX - mottleRadius,
          mottleY - mottleRadius,
          mottleRadius * 2,
          mottleRadius * 2
        );
      }
      canvasCtx.lineCap = "round";
      for (let vein = 0; vein < 3; vein += 1) {
        const veinPoints = [];
        let veinX = slabX + stoneRandom() * slabWidth;
        let veinY = slabY + stoneRandom() * slabHeight;
        veinPoints.push({ x: veinX, y: veinY });
        for (let step = 0; step < 4; step += 1) {
          veinX += (stoneRandom() - 0.5) * slabWidth * 0.4;
          veinY += (stoneRandom() - 0.4) * slabHeight * 0.4;
          veinPoints.push({ x: veinX, y: veinY });
        }
        canvasCtx.strokeStyle =
          "rgba(126, 120, 110, " + (0.1 + stoneRandom() * 0.22).toFixed(2) + ")";
        canvasCtx.lineWidth = 0.8 + stoneRandom() * 2.2;
        strokeSmoothPath(canvasCtx, veinPoints);
      }
    }
  }
  canvasCtx.fillStyle = "rgba(255, 255, 255, .34)";
  for (let speck = 0; speck < 900; speck += 1) {
    canvasCtx.fillRect(stoneRandom() * width, stoneRandom() * height, 1.3, 1.3);
  }
}

/**
 * 清水混凝土饰面：中性灰底 + 34 团云斑 + 16 道抹刀弧痕 + 两层噪点。
 */
function paintFeatureWallConcrete(canvasCtx, width, height) {
  const concreteRandom = seededRandomSource(13627);
  const surfaceBase = canvasCtx.createLinearGradient(0, 0, width, height);
  surfaceBase.addColorStop(0, "#bcb9b3");
  surfaceBase.addColorStop(0.5, "#b2afa9");
  surfaceBase.addColorStop(1, "#a8a5a0");
  canvasCtx.fillStyle = surfaceBase;
  canvasCtx.fillRect(0, 0, width, height);
  for (let cloud = 0; cloud < 34; cloud += 1) {
    const cloudX = concreteRandom() * width;
    const cloudY = concreteRandom() * height;
    const cloudRadius = Math.min(width, height) * (0.1 + concreteRandom() * 0.4);
    const cloudLighter = concreteRandom() > 0.5;
    const cloudTone = cloudLighter ? "226, 224, 219" : "138, 136, 131";
    const cloudGradient = canvasCtx.createRadialGradient(
      cloudX,
      cloudY,
      0,
      cloudX,
      cloudY,
      cloudRadius
    );
    cloudGradient.addColorStop(
      0,
      "rgba(" + cloudTone + ", " + (0.1 + concreteRandom() * 0.22).toFixed(2) + ")"
    );
    cloudGradient.addColorStop(1, "rgba(" + cloudTone + ", 0)");
    canvasCtx.fillStyle = cloudGradient;
    canvasCtx.fillRect(
      cloudX - cloudRadius,
      cloudY - cloudRadius,
      cloudRadius * 2,
      cloudRadius * 2
    );
  }
  for (let trowel = 0; trowel < 16; trowel += 1) {
    const trowelX = concreteRandom() * width;
    const trowelY = concreteRandom() * height;
    const trowelRadius = Math.min(width, height) * (0.18 + concreteRandom() * 0.34);
    canvasCtx.strokeStyle =
      "rgba(240, 238, 233, " + (0.05 + concreteRandom() * 0.12).toFixed(2) + ")";
    canvasCtx.lineWidth = 6 + concreteRandom() * 22;
    canvasCtx.beginPath();
    canvasCtx.arc(
      trowelX,
      trowelY,
      trowelRadius,
      Math.PI * (0.7 + concreteRandom() * 0.6),
      Math.PI * (1.3 + concreteRandom() * 0.7)
    );
    canvasCtx.stroke();
  }
  canvasCtx.fillStyle = "rgba(255, 255, 255, .3)";
  for (let speck = 0; speck < 1100; speck += 1) {
    canvasCtx.fillRect(concreteRandom() * width, concreteRandom() * height, 1.3, 1.3);
  }
  canvasCtx.fillStyle = "rgba(64, 62, 59, .12)";
  for (let speck = 0; speck < 900; speck += 1) {
    canvasCtx.fillRect(concreteRandom() * width, concreteRandom() * height, 1.6, 1.6);
  }
}

/**
 * 织物饰面：底色 + 22 团柔斑 + 3 像素间距的经纬织纹 + 90 道横向竹节纱。
 *
 * 织纹用奇偶列 / 行交替的明暗线模拟平纹织物，间距 3 像素是像素与观感的折中。
 */
function paintFeatureWallFabric(canvasCtx, width, height) {
  const fabricRandom = seededRandomSource(38971);
  canvasCtx.fillStyle = shadeColor(0xc9c0b2, 1);
  canvasCtx.fillRect(0, 0, width, height);
  for (let blotch = 0; blotch < 22; blotch += 1) {
    const blotchX = fabricRandom() * width;
    const blotchY = fabricRandom() * height;
    const blotchRadius = Math.min(width, height) * (0.12 + fabricRandom() * 0.38);
    const blotchLighter = fabricRandom() > 0.5;
    const blotchGradient = canvasCtx.createRadialGradient(
      blotchX,
      blotchY,
      0,
      blotchX,
      blotchY,
      blotchRadius
    );
    blotchGradient.addColorStop(
      0,
      blotchLighter ? "rgba(238, 232, 220, .22)" : "rgba(150, 140, 124, .18)"
    );
    blotchGradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    canvasCtx.fillStyle = blotchGradient;
    canvasCtx.fillRect(
      blotchX - blotchRadius,
      blotchY - blotchRadius,
      blotchRadius * 2,
      blotchRadius * 2
    );
  }
  const weavePitch = 3;
  for (let column = 0; column < width; column += weavePitch) {
    canvasCtx.fillStyle =
      (column / weavePitch) % 2 === 0 ? "rgba(96, 86, 72, .12)" : "rgba(252, 248, 240, .14)";
    canvasCtx.fillRect(column, 0, 1.2, height);
  }
  for (let row = 0; row < height; row += weavePitch) {
    canvasCtx.fillStyle =
      (row / weavePitch) % 2 === 0 ? "rgba(96, 86, 72, .1)" : "rgba(252, 248, 240, .12)";
    canvasCtx.fillRect(0, row, width, 1.2);
  }
  for (let slub = 0; slub < 90; slub += 1) {
    const slubY = fabricRandom() * height;
    const slubLength = width * (0.04 + fabricRandom() * 0.16);
    const slubX = fabricRandom() * (width - slubLength);
    canvasCtx.fillStyle = "rgba(255, 252, 246, " + (0.08 + fabricRandom() * 0.2).toFixed(2) + ")";
    canvasCtx.fillRect(slubX, slubY, slubLength, 1.6 + fabricRandom() * 1.6);
  }
}

/**
 * 金属饰面：多段竖向灰度渐变模拟反射 + 900 道拉丝 + 12 道高光条。
 */
function paintFeatureWallMetal(canvasCtx, width, height) {
  const metalRandom = seededRandomSource(19237);
  const surfaceBase = canvasCtx.createLinearGradient(0, 0, 0, height);
  surfaceBase.addColorStop(0, "#8f959c");
  surfaceBase.addColorStop(0.24, "#b3b8be");
  surfaceBase.addColorStop(0.52, "#9aa0a7");
  surfaceBase.addColorStop(0.78, "#b8bdc3");
  surfaceBase.addColorStop(1, "#8b9198");
  canvasCtx.fillStyle = surfaceBase;
  canvasCtx.fillRect(0, 0, width, height);
  for (let brush = 0; brush < 900; brush += 1) {
    const brushY = metalRandom() * height;
    const brushLength = width * (0.2 + metalRandom() * 0.8);
    const brushX = metalRandom() * (width - brushLength);
    const brushLighter = metalRandom() > 0.5;
    canvasCtx.fillStyle = brushLighter
      ? "rgba(255, 255, 255, " + (0.03 + metalRandom() * 0.12).toFixed(2) + ")"
      : "rgba(56, 60, 66, " + (0.03 + metalRandom() * 0.11).toFixed(2) + ")";
    canvasCtx.fillRect(brushX, brushY, brushLength, 0.6 + metalRandom() * 1.4);
  }
  for (let streak = 0; streak < 12; streak += 1) {
    const streakY = metalRandom() * height;
    const streakGradient = canvasCtx.createLinearGradient(
      0,
      streakY - height * 0.05,
      0,
      streakY + height * 0.05
    );
    streakGradient.addColorStop(0, "rgba(255, 255, 255, 0)");
    streakGradient.addColorStop(
      0.5,
      "rgba(255, 255, 255, " + (0.06 + metalRandom() * 0.12).toFixed(2) + ")"
    );
    streakGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    canvasCtx.fillStyle = streakGradient;
    canvasCtx.fillRect(0, streakY - height * 0.05, width, height * 0.1);
  }
}

// 饰面名 → 绘制函数；新增饰面需要同时更新 FEATURE_WALL_STYLES 与本表。
const featureWallPainters = Object.freeze({
  marble: paintFeatureWallMarble,
  wood: paintFeatureWallWood,
  slat: paintFeatureWallSlat,
  stone: paintFeatureWallStone,
  concrete: paintFeatureWallConcrete,
  fabric: paintFeatureWallFabric,
  metal: paintFeatureWallMetal
});

// 背景墙饰面贴图同样按风格缓存。
const featureWallTextures = new Map();

/**
 * 生成（或取回缓存的）背景墙饰面贴图。
 */
export function createFeatureWallTexture(threeApi, styleValue, maxAnisotropy = 1) {
  const wallStyle = normalizeFeatureWallStyle(styleValue);
  if (featureWallTextures.has(wallStyle)) {
    return featureWallTextures.get(wallStyle);
  }
  // 背景墙尺寸更大，用 1024×768，纹理细节（木纹、拉丝）才经得起近看。
  const canvasElement = document.createElement("canvas");
  canvasElement.width = 1024;
  canvasElement.height = 768;
  const canvasCtx = canvasElement.getContext("2d");
  if (!canvasCtx) {
    return null;
  }
  featureWallPainters[wallStyle](canvasCtx, canvasElement.width, canvasElement.height);
  const texture = new threeApi.CanvasTexture(canvasElement);
  texture.colorSpace = threeApi.SRGBColorSpace;
  texture.anisotropy = Math.min(maxAnisotropy || 1, 8);
  texture.needsUpdate = true;
  featureWallTextures.set(wallStyle, texture);
  return texture;
}

/**
 * 石材板整图的色号表：**整块石材**（茶几的上下两块石板、餐桌台面）走这里，
 * 与「细节层」（studio-surface-fabrics.js 的 SURFACE_TEXTURE_ALIAS）不是一回事 ——
 * 细节层是均值≈1 的中性灰图，只能压暗、不能提亮，所以黑底白纹的石材**做不出来**
 * （近黑底上再乘什么都还是黑的）。石材板要的是自带颜色的整图，因此单独走一条路。
 *
 * 白色色号直接复用背景墙那张大理石图：同一种石材在背景墙与茶几上必须是同一张，
 * 否则近看会发现两种纹路（与 studio-surface-fabrics.js 的分工注释同一条约定）。
 * 黑色色号不登记进 FEATURE_WALL_STYLES —— 它不是背景墙的饰面选项，加了会平白多出一个
 * 用户可见的墙面色号，而这里要的只是家具上的一块灰石。
 */
const STONE_SLAB_TONES = Object.freeze({
  marble: MARBLE_TONES.white,
  "marble-dark": MARBLE_TONES.dark
});

const stoneSlabTextures = new Map();

/**
 * 生成（或取回缓存的）石材板整图。
 * @param {object} threeApi THREE 命名空间（必须与场景同一份）。
 * @param {string} flavor 色号：marble（白）/ marble-dark（黑金）。
 * @param {number} [maxAnisotropy] 各向异性上限。
 * @returns {object|null} 取不到时返回 null（调用方退化成纯色，不影响其余部件）。
 */
export function createStoneSlabTexture(threeApi, flavor, maxAnisotropy = 1) {
  if (flavor === "marble") {
    // 与背景墙共用同一份缓存实例；调用方负责 clone 后再改平铺方式。
    return createFeatureWallTexture(threeApi, "marble", maxAnisotropy);
  }
  const tone = STONE_SLAB_TONES[flavor];
  if (!tone || typeof document === "undefined" || typeof threeApi?.CanvasTexture !== "function") {
    return null;
  }
  if (stoneSlabTextures.has(flavor)) {
    return stoneSlabTextures.get(flavor);
  }
  // 与背景墙同尺寸：石材近看的纹路要经得起贴到 1.7m 长的板面上。
  const canvasElement = document.createElement("canvas");
  canvasElement.width = 1024;
  canvasElement.height = 768;
  const canvasCtx = canvasElement.getContext("2d");
  if (!canvasCtx) {
    return null;
  }
  paintMarbleSlab(canvasCtx, canvasElement.width, canvasElement.height, tone);
  const texture = new threeApi.CanvasTexture(canvasElement);
  texture.colorSpace = threeApi.sRGBColorSpace ?? threeApi.SRGBColorSpace;
  texture.anisotropy = Math.min(maxAnisotropy || 1, 8);
  texture.needsUpdate = true;
  stoneSlabTextures.set(flavor, texture);
  return texture;
}
