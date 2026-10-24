/**
 * 按**表面族**共享的程序化**细节（bump / 高度）图**（审计 M3 的 S1 策略）。
 *
 * 背景：672 个 GLB 里 660 个既没有 `normalTexture` 也没有 `TANGENT`，645 个连
 * `TEXCOORD_0` 都没有——模型全是「纯色平板」，近看没有任何材质细节。逐模型出贴图
 * 不现实（体积 + 导出流程 + 几十种建模来源），所以按**表面族**各做一张可平铺的
 * 程序化图，共 11 张，运行时按角色配方声明的 `surface` 挂上去：
 *
 * | 表面族 | 细节强度 | 一个纹理单元覆盖 |
 * | --- | --- | --- |
 * | fabric / leather | 0.35 / 0.45 | 0.16m / 0.12m（织纹、皮孔要密） |
 * | wood / marble / stone | 0.5 / 0.25 / 0.55 | 0.8m / 0.9m / 0.6m |
 * | metal / lacquer / glass | 0.4 / 0.2 / 0.15 | 0.4m / 0.7m / 1.2m |
 * | ceramic / foliage / paint | 0.25 / 0.7 / 0.3 | 0.3m / 0.4m / 0.6m |
 *
 * **2026-10-24 的关键切换：`normalMap` → `bumpMap`。**
 * 之前输出的是切线空间法线图，直接喂 `material.normalMap`。three 的 `normalMap`
 * 是「逐纹素查表」——缩小时按像素选 mip 级别，相邻像素落在不同 mip 上而幅度不衰减，
 * 于是 2m 长的电梯门 / 衣柜门 / 出风口上出现**一层层跟随透视的波浪细纹**（实测
 * 衣柜 flicker 0.376 → 关掉法线 0.020）。`bumpMap` 走 `perturbNormalArb` /
 * `dHdxy_fwd`，用 `dFdx`/`dFdy` 在**屏幕空间**取差分：mip 变粗时相邻像素的高度差
 * 同步变小，扰动幅度自动收敛，就不会再有等高条带。所以这里改输出**灰度高度图**。
 *
 * 三条刻意的边界：
 * 1. **不逐材质出图**：11 张纹理全局共享（`CanvasTexture` + 进程内缓存），内存与
 *    显存都是常数，和模型数量无关。
 * 2. **不写进 GLB**：贴图只在加载期生成，GLB 体积 / 导出流程 / 审计基线都不受影响。
 * 3. **可平铺**：高度场只用整数频率的正弦叠加，纹理左右上下都能无缝重复，
 *    配合 `studio-box-uv.ts` 的盒式 UV 才能铺满无 UV 的模型。
 */

/** 与审计 `NORMAL_SCALE_BY_SURFACE` 同一份表面族清单（`ops/checks/studio/audit_glb_materials.mjs`）。 */
export type MaterialSurface =
  | "fabric"
  | "leather"
  | "wood"
  | "marble"
  | "stone"
  | "metal"
  | "lacquer"
  | "glass"
  | "ceramic"
  | "foliage"
  | "paint";

/**
 * 表面细节的各向异性过滤上限。
 *
 * 这些细节图是**按米平铺**的程序化条纹（金属 10 条纹 / 0.4m、布艺 10×10 / 0.16m），
 * 比一般贴图密得多。`anisotropy = 1` 时，大平板在掠射角度上采样不足，采样会欠采 ——
 * 2m 长的出风口、油烟机外壳最容易看出来。取 8 与 `createStoneSlabTexture` /
 * 图集贴图的口径一致；纹理内部还会按设备上限再夹一次。
 */
export const SURFACE_DETAIL_ANISOTROPY = 8;

/**
 * 细节强度（逐表面族）；与审计报告的表格逐项一致。
 *
 * 数值沿用切换到 `bumpMap` 之前的 `normalScale`，由加载器乘上
 * `SURFACE_DETAIL_BUMP_UNIT` 换算成 `material.bumpScale`。
 */
export const SURFACE_DETAIL_SCALE: Readonly<Record<MaterialSurface, number>> = Object.freeze({
  fabric: 0.35,
  leather: 0.45,
  wood: 0.5,
  marble: 0.25,
  stone: 0.55,
  metal: 0.4,
  lacquer: 0.2,
  glass: 0.15,
  ceramic: 0.25,
  foliage: 0.7,
  paint: 0.3,
});

/**
 * `SURFACE_DETAIL_SCALE`（0..0.7）→ `material.bumpScale` 的换算单位。
 *
 * `bumpMap` 的深度是「高度图的梯度」而不是法线倾角，量纲与 `normalScale` 不同，
 * 所以必须有一个乘积系数。初值 0.12 由 `material_render_probe.mjs` 的 before/after
 * 标定：再大布艺会读成「搓衣板」，再小则细节在 1080p 下不可见。
 */
export const SURFACE_DETAIL_BUMP_UNIT = 0.12;

/**
 * 一个纹理单元覆盖的世界尺寸（米）。
 *
 * UV 由盒式投影按**米**生成（见 `studio-box-uv.ts`），所以这里直接用
 * `1 / 米数` 作为 `texture.repeat`：同一表面族的所有材质共享同一张纹理，
 * repeat 是纹理级常量，不会出现「同一个木纹在不同柜子上疏密不同」。
 */
export const SURFACE_TILE_METERS: Readonly<Record<MaterialSurface, number>> = Object.freeze({
  fabric: 0.16,
  leather: 0.12,
  wood: 0.8,
  marble: 0.9,
  stone: 0.6,
  metal: 0.4,
  lacquer: 0.7,
  glass: 1.2,
  ceramic: 0.3,
  foliage: 0.4,
  paint: 0.6,
});

const TEXTURE_SIZE = 256;
/** 纹理边长（导出给审计 M7：用它换算「一个细节周期占几个纹素」）。 */
export const SURFACE_DETAIL_TEXTURE_SIZE = TEXTURE_SIZE;
/**
 * 一个纹理单元内允许的**最高细节周期数**。
 *
 * 这些细节图是按米平铺的假细节，挂在只有几十个三角形的大平板上。频率一旦接近
 * 纹理的 Nyquist（128px 时 41 周期 → 3 像素一个条纹，256px 时也要 6 像素），
 * 远处缩小时会塌成一层层来回摆的波浪 —— 电梯门、衣柜门、餐边柜侧板、2m 长的
 * 出风口最明显（2026-10-24 的「出风口/电梯/衣柜细纹」）。
 *
 * `bumpMap` 的屏幕导数滤波已经能压住条带，但**限频仍然保留**：一是细节本来就该
 * 是「近看才有」的微表面，二是给 `bumpScale` 留出放大深度的余量。
 * 每个单元最多 10 个周期，配合 256px 纹理 = 25 个纹素一个周期。
 */
const MAX_DETAIL_CYCLES = 10;
/** 一个纹理单元内的最高周期数（导出给审计 M7：`纹素/周期 = 纹理边长 / 本值`）。 */
export const SURFACE_DETAIL_MAX_CYCLES = MAX_DETAIL_CYCLES;
/** 限频并保证整数（整数频率是「纹理可平铺」的前提）。 */
const detailCycles = (frequency: number) =>
  Math.max(1, Math.min(MAX_DETAIL_CYCLES, Math.round(frequency)));

const TAU = Math.PI * 2;
/** 整数频率的正弦：`u` / `v` 取 0..1 时天然平铺。 */
const wave = (u: number, v: number, freqU: number, freqV: number, phase = 0) =>
  Math.sin(TAU * (u * detailCycles(freqU) + v * detailCycles(freqV) + phase));

/** 折痕类图案：把正弦取绝对值再压平，得到「一条条」而不是「一片片」。 */
const ridge = (value: number, sharpness = 0.55) => Math.pow(Math.abs(value), sharpness);

type HeightPainter = (u: number, v: number) => number;

const SURFACE_HEIGHT_PAINTERS: Readonly<Record<MaterialSurface, HeightPainter>> = Object.freeze({
  /** 木纹：顺纹长条 + 轻微弯曲 + 细导管。 */
  wood: (u, v) => {
    const warp = 0.05 * wave(u, v, 1, 0, 0.15) + 0.025 * wave(u, v, 2, 1, 0.4);
    const grain = Math.sin(
      TAU * (v * detailCycles(9) + warp * detailCycles(7) + 0.06 * wave(u, v, 3, 0)),
    );
    return 0.66 * grain + 0.2 * wave(u, v, 9, 2, 0.3) + 0.1 * wave(u, v, 5, 1, 0.7);
  },
  /** 大理石：一条主脉络 + 两层细脉。 */
  marble: (u, v) => {
    const veinA = Math.sin(
      TAU * (u * detailCycles(2) + v * detailCycles(3) + 0.3 * wave(u, v, 2, 1, 0.25)),
    );
    const veinB = Math.sin(
      TAU * (u * detailCycles(5) - v * detailCycles(2) + 0.2 * wave(u, v, 3, 2, 0.6)),
    );
    return (
      0.55 * Math.pow(1 - Math.abs(veinA), 6) +
      0.22 * Math.pow(1 - Math.abs(veinB), 8) +
      0.08 * wave(u, v, 7, 5, 0.1)
    );
  },
  /** 石材：多频噪声 + 少量凹坑。 */
  stone: (u, v) =>
    0.5 * wave(u, v, 3, 2, 0.1) +
    0.3 * wave(u, v, 7, 5, 0.35) +
    0.18 * wave(u, v, 9, 8, 0.7) +
    0.1 * wave(u, v, 5, 4, 0.2),
  /** 布艺：十字织纹（经纬各一组正弦），叠一点绒毛噪声。 */
  fabric: (u, v) =>
    0.55 *
      Math.sin(TAU * u * detailCycles(10)) *
      Math.sin(TAU * v * detailCycles(10)) +
    0.22 * wave(u, v, 9, 10, 0.15) +
    0.1 * wave(u, v, 9, 7, 0.5),
  /** 皮革：粒面孔洞，交叉折痕把表面切成不规则小块。 */
  leather: (u, v) =>
    0.5 * ridge(wave(u, v, 9, 7, 0.1), 0.35) * ridge(wave(u, v, 10, 9, 0.35), 0.35) +
    0.2 * wave(u, v, 9, 7, 0.6) +
    0.12 * wave(u, v, 5, 3, 0.2),
  /** 金属：单向拉丝（沿 u 高频、沿 v 低频）。 */
  metal: (u, v) =>
    0.7 * wave(u, v, 10, 1, 0.05) + 0.2 * wave(u, v, 9, 2, 0.4) + 0.08 * wave(u, v, 3, 1, 0.7),
  /** 烤漆：极浅的橘皮纹，只有掠射角度能看见。 */
  lacquer: (u, v) => 0.2 * wave(u, v, 5, 3, 0.2) + 0.14 * wave(u, v, 9, 7, 0.55),
  /** 玻璃：近乎全平，只留极微的波纹。 */
  glass: (u, v) => 0.12 * wave(u, v, 1, 1, 0.1) + 0.07 * wave(u, v, 2, 3, 0.45),
  /** 陶瓷：细密釉面颗粒。 */
  ceramic: (u, v) => 0.45 * wave(u, v, 9, 8, 0.25) + 0.28 * wave(u, v, 10, 9, 0.6),
  /** 枝叶：主脉 + 侧脉 + 叶面起伏。 */
  foliage: (u, v) => {
    const midrib = Math.abs(
      Math.sin(TAU * (v * detailCycles(3) + 0.07 * wave(u, v, 1, 1))),
    );
    const sideVeins = Math.abs(
      Math.sin(
        TAU * (u * detailCycles(6) + v * detailCycles(4) + 0.1 * wave(u, v, 2, 3)),
      ),
    );
    return (
      0.5 * Math.pow(midrib, 4) + 0.35 * Math.pow(sideVeins, 6) + 0.12 * wave(u, v, 9, 7, 0.4)
    );
  },
  /** 乳胶漆 / 塑料：细小橘皮。 */
  paint: (u, v) =>
    0.32 * wave(u, v, 7, 5, 0.1) + 0.2 * wave(u, v, 10, 9, 0.3) + 0.12 * wave(u, v, 6, 4, 0.6),
});

function isMaterialSurface(value: unknown): value is MaterialSurface {
  return typeof value === "string" && value in SURFACE_HEIGHT_PAINTERS;
}

/** 每个 three 实例一张缓存表：纹理带着 three 的类型，不能跨实例复用。 */
const textureCacheByThree = new WeakMap<object, WeakMap<object, any>>();

/**
 * 高度场的编码幅度：painter 的返回值大致落在 ±1.1 内（wood 0.96 / stone 1.08 / metal 0.98）。
 *
 * 固定幅度（而不是「按每张图的最大值归一化」）是刻意的：归一化会把 `glass`（±0.19）
 * 这种本来就该几乎全平的面也拉满对比，玻璃反而变粗糙。固定幅度保留了表面族之间的
 * 相对强弱。
 */
const HEIGHT_ENCODING_AMPLITUDE = 1.1;
/** 灰度高度图只用 8..248：留 8 级余量，避免 `Uint8ClampedArray` 在极值处截断出硬边。 */
const HEIGHT_GRAY_CENTER = 128;
const HEIGHT_GRAY_RANGE = 120;

/**
 * 取某表面族的共享**高度图**（懒生成 + 缓存），供 `material.bumpMap` 使用。
 *
 * 失败（没有 DOM / 拿不到 2d 上下文）返回 `null`，调用方直接不挂细节，不影响渲染。
 */
export function createSurfaceDetailTexture(
  threeApi: any,
  surface: MaterialSurface | null | undefined,
  maxAnisotropy = 1,
): any {
  if (!surface || !isMaterialSurface(surface) || !threeApi?.CanvasTexture) return null;
  let cache = textureCacheByThree.get(threeApi);
  if (!cache) {
    cache = new WeakMap();
    textureCacheByThree.set(threeApi, cache);
  }
  const painter = SURFACE_HEIGHT_PAINTERS[surface];
  const cached = cache.get(painter);
  if (cached) {
    /**
     * 纹理全局共享，先创建者说了算。若后来的调用要更高的各向异性（启动顺序不同时
     * 会发生在 1 → 8 之间），就地升级一次，免得先到的那次把整场景钉死在 1。
     */
    const requestedAnisotropy = Math.min(maxAnisotropy || 1, SURFACE_DETAIL_ANISOTROPY);
    if (requestedAnisotropy > (cached.anisotropy || 1)) {
      cached.anisotropy = requestedAnisotropy;
      cached.needsUpdate = true;
    }
    return cached;
  }

  const canvasElement = document.createElement("canvas");
  canvasElement.width = TEXTURE_SIZE;
  canvasElement.height = TEXTURE_SIZE;
  const canvasCtx = canvasElement.getContext("2d");
  if (!canvasCtx) return null;

  const imageData = canvasCtx.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  for (let row = 0; row < TEXTURE_SIZE; row += 1) {
    const v = row / TEXTURE_SIZE;
    for (let column = 0; column < TEXTURE_SIZE; column += 1) {
      const height = painter(column / TEXTURE_SIZE, v);
      const gray =
        HEIGHT_GRAY_CENTER +
        (height / HEIGHT_ENCODING_AMPLITUDE) * HEIGHT_GRAY_RANGE;
      const level = Math.round(Math.max(8, Math.min(248, gray)));
      const offset = (row * TEXTURE_SIZE + column) * 4;
      // 三通道同值：`bumpMap` 只读红色通道，但灰度图对任何取法都一致。
      imageData.data[offset] = level;
      imageData.data[offset + 1] = level;
      imageData.data[offset + 2] = level;
      imageData.data[offset + 3] = 255;
    }
  }
  canvasCtx.putImageData(imageData, 0, 0);

  const texture = new threeApi.CanvasTexture(canvasElement);
  // 高度图是数据不是颜色：不能进 sRGB 解码（否则高度曲线被 gamma 掰弯）。
  texture.colorSpace = threeApi.NoColorSpace ?? threeApi.LinearSRGBColorSpace;
  texture.wrapS = threeApi.RepeatWrapping;
  texture.wrapT = threeApi.RepeatWrapping;
  texture.repeat.set(1 / SURFACE_TILE_METERS[surface], 1 / SURFACE_TILE_METERS[surface]);
  texture.anisotropy = Math.min(maxAnisotropy || 1, SURFACE_DETAIL_ANISOTROPY);
  texture.needsUpdate = true;
  cache.set(painter, texture);
  return texture;
}

/**
 * 兼容旧名：一期别名，实际返回的是**高度图**（给 `bumpMap` 用）。
 * 审计 M3 会同时检查新旧两个名字是否导出，避免外部脚本在同一轮里断掉。
 */
export const createSurfaceNormalTexture = createSurfaceDetailTexture;
