/**
 * 金属件的**程序化环境贴图**：给「只反射、不发光」的高金属度材质补一份 IBL 替身。
 *
 * 背景（2026-10-24 的「出风口/冰箱/电梯/衣柜发黑」）：
 * 工作室场景**没有** `scene.environment`（全仓检索确认，没有 PMREM / RoomEnvironment），
 * 而 `SURFACE_FINISH.metal` 给的是 `metalness 0.72 / roughness 0.32`。`MeshStandardMaterial`
 * 的金属度越高，漫反射项越被 `(1 - metalness)` 吃掉 —— 没有环境贴图时，金属只剩
 * 「方向光的高光条」，其余全是黑的。审计里 `metallicFactor ≥ 0.5` 的材质有 278 个、
 * 分布在 136 个模型上，所以这不是个别模型的调色问题，是缺了一整条 IBL 链路。
 *
 * 这里不设 `scene.environment`（那会连带改掉墙面 / 地面 / 布艺的明暗，属于全局外观变更），
 * 而是**只给金属材质挂 `envMap`**：
 * - 一张 512×256 的等距柱状（equirectangular）贴图，内容是一间「灰天棚 + 暖白灯箱 + 深地面」
 *   的摄影棚；
 * - three 的 `WebGLCubeUVMaps` 会自动把 equirect 转成 PMREM（按 roughness 取 mip），
 *   所以不需要在调用方持有 `PMREMGenerator`；
 * - 全场景共享同一张（按 THREE 实例 `WeakMap` 缓存），显存与模型数量无关。
 *
 * 边界：
 * 1. 只处理 `metalness ≥ 0.5`、无图集贴图、不透明的标准材质；
 * 2. 车 / 楼梯 / 镜子等**自带假环境**的模型显式豁免（见 `METAL_ENVIRONMENT_EXEMPT_ITEM_TYPES`），
 *    否则会和它们自己的 shader 叠成两层反射；
 * 3. 强度是常量（`METAL_ENVIRONMENT_INTENSITY`），由一次离线渲染探针标定，
 *    改这一个数就能整体调亮 / 调暗金属，不需要动配色。
 */

/** 环境贴图尺寸：等距柱状 2:1；512×256 对「模糊反射」足够，PMREM 后会继续降采样。 */
const ENVIRONMENT_WIDTH = 512;
const ENVIRONMENT_HEIGHT = 256;

/** `envMapIntensity` 初值：由离线渲染探针的 darkRatio / mean 标定。 */
export const METAL_ENVIRONMENT_INTENSITY = 0.85;

/** 低于这个金属度就不算「金属」：`0.5` 与审计 M4 规则同口径。 */
export const METAL_ENVIRONMENT_MIN_METALNESS = 0.5;

/**
 * 自带假环境的模型：再挂一张 envMap 会叠成两层反射 / 洗掉自身高光。
 *
 * - `smallcar` / `suv` / `scooter`：`applyCarFinish` 用 `onBeforeCompile` 自己算天空与灯箱；
 * - `steelstairs`：加载器显式 `envMap = null`（金属楼梯要配合踏板贴图，不吃 IBL）；
 * - `glassstairs`：透明玻璃件，法线 / 环境都不挂；
 * - `mirror`：反射通道自己接管。
 *
 * **`floatingstairs` 不在此列**：它只有 46/282 个三角面是玻璃（`floatingstairs-glass*`，
 * metalness 0.06 本来就吃不到这条规则），剩下 116 个面是金属框架（`body` / `trim`，
 * metalness 0.72）。按「楼梯 = 玻璃件」整件豁免，金属框架就退化成没有 IBL 的纯黑轮廓 ——
 * 探针实测 darkRatio 0.108、metalDark 0.885，挂上环境贴图后是 0 / 0.499。
 */
export const METAL_ENVIRONMENT_EXEMPT_ITEM_TYPES: ReadonlySet<string> = new Set([
  "smallcar",
  "suv",
  "scooter",
  "steelstairs",
  "glassstairs",
  "mirror",
  "curtain_left",
  "curtain_right",
  "curtain_split",
]);

/** 每个 THREE 实例一张缓存：纹理带着 three 的类型，不能跨实例复用。 */
const environmentCacheByThree = new WeakMap<object, any>();

const clampUnit = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;

/** 平滑阶跃（比线性更像摄影棚的柔光过渡）。 */
function smoothstep(edge0: number, edge1: number, value: number) {
  if (edge1 <= edge0) return value < edge0 ? 0 : 1;
  const t = clampUnit((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** 方位角环形距离（0..0.5），保证灯箱在贴图左右边界处不断裂。 */
function azimuthDistance(u: number, center: number) {
  const delta = Math.abs(u - center) % 1;
  return Math.min(delta, 1 - delta);
}

/**
 * 纯函数版的环境图画师：不碰 DOM，供审计 / 单测直接验证「金属面反射到了多亮的环境」。
 *
 * 坐标：`u` 为方位角（0..1，接缝在 +X 轴），`up` 为方向余弦（+1 天顶、0 地平线、-1 地面）。
 * 输出为 sRGB 8 位，写入时按行优先（第 0 行 = 天顶，`CanvasTexture` 默认 flipY）。
 */
export function paintMetalEnvironmentPixels(): {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
} {
  const pixels = new Uint8ClampedArray(ENVIRONMENT_WIDTH * ENVIRONMENT_HEIGHT * 4);

  /** 摄影棚配色：天棚冷灰、地平线暖白、地面深灰。 */
  const ceilingColor = [124, 133, 148];
  const skyColor = [176, 184, 196];
  const horizonColor = [246, 243, 236];
  const floorColor = [46, 49, 55];

  /** 两盏灯箱：方位角与半宽（相对贴图宽度），高度在 `up ≈ 0.55`。 */
  const softboxes = [
    { azimuth: 0.16, halfWidth: 0.075, up: 0.52 },
    { azimuth: 0.62, halfWidth: 0.105, up: 0.44 },
  ];

  for (let row = 0; row < ENVIRONMENT_HEIGHT; row += 1) {
    const up = 1 - (2 * row) / (ENVIRONMENT_HEIGHT - 1);
    const skyAmount = smoothstep(-0.12, 0.62, up);
    const upperAmount = smoothstep(0.2, 1, up);
    // 地平线附近的一条柔光带：抬住垂直金属面（电梯门 / 冰箱门 / 衣柜门）的中段亮度。
    const horizonGlow = Math.exp(-Math.pow(up / 0.22, 2));

    const baseR = mix(floorColor[0], skyColor[0], skyAmount);
    const baseG = mix(floorColor[1], skyColor[1], skyAmount);
    const baseB = mix(floorColor[2], skyColor[2], skyAmount);

    for (let column = 0; column < ENVIRONMENT_WIDTH; column += 1) {
      const u = column / ENVIRONMENT_WIDTH;
      let red = mix(baseR, ceilingColor[0], upperAmount * 0.55);
      let green = mix(baseG, ceilingColor[1], upperAmount * 0.55);
      let blue = mix(baseB, ceilingColor[2], upperAmount * 0.55);

      red = mix(red, horizonColor[0], horizonGlow * 0.72);
      green = mix(green, horizonColor[1], horizonGlow * 0.72);
      blue = mix(blue, horizonColor[2], horizonGlow * 0.72);

      let softboxLight = 0;
      for (const softbox of softboxes) {
        const horizontal = azimuthDistance(u, softbox.azimuth) / softbox.halfWidth;
        if (horizontal > 2.5) continue;
        const vertical = (up - softbox.up) / 0.2;
        if (Math.abs(vertical) > 2.5) continue;
        softboxLight += Math.exp(-(horizontal * horizontal + vertical * vertical));
      }
      softboxLight = clampUnit(softboxLight);

      const offset = (row * ENVIRONMENT_WIDTH + column) * 4;
      pixels[offset] = Math.round(mix(red, 255, softboxLight));
      pixels[offset + 1] = Math.round(mix(green, 252, softboxLight));
      pixels[offset + 2] = Math.round(mix(blue, 246, softboxLight));
      pixels[offset + 3] = 255;
    }
  }

  return { width: ENVIRONMENT_WIDTH, height: ENVIRONMENT_HEIGHT, pixels };
}

/**
 * 取共享的金属环境贴图（懒生成 + 缓存）。
 *
 * 失败（没有 DOM / 拿不到 2d 上下文 / 没有 `EquirectangularReflectionMapping`）返回 `null`，
 * 调用方直接不挂 `envMap`，退回修复前的表现，不影响渲染。
 */
export function createMetalEnvironmentTexture(threeApi: any): any {
  if (!threeApi?.CanvasTexture || !threeApi?.EquirectangularReflectionMapping) return null;
  const cached = environmentCacheByThree.get(threeApi);
  if (cached !== undefined) return cached;

  let texture = null;
  try {
    const { width, height, pixels } = paintMetalEnvironmentPixels();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    const imageData = context.createImageData(width, height);
    imageData.data.set(pixels);
    context.putImageData(imageData, 0, 0);
    texture = new threeApi.CanvasTexture(canvas);
    // 环境贴图描述的是「屏幕上的颜色」，不是数据：必须走 sRGB 解码。
    texture.colorSpace = threeApi.SRGBColorSpace ?? texture.colorSpace;
    texture.mapping = threeApi.EquirectangularReflectionMapping;
    texture.needsUpdate = true;
  } catch {
    texture = null;
  }
  environmentCacheByThree.set(threeApi, texture);
  return texture;
}

/**
 * 给高金属度材质补环境贴图（IBL 替身）。
 *
 * 放在材质链的**最后一道**（颜色 / 粗糙度 / 档位都算完），只按最终 `metalness` 判定，
 * 因此档位把某个槽位改成金属漆（`lacquer`）时不会误挂。
 */
export function applyMetalEnvironmentFinish(
  targetMaterial: any,
  threeApi: any,
  itemType?: string | null,
): any {
  if (!targetMaterial?.isMeshStandardMaterial) return targetMaterial;
  if (itemType && METAL_ENVIRONMENT_EXEMPT_ITEM_TYPES.has(itemType)) return targetMaterial;
  // 车漆自带假环境，叠一层 envMap 会洗掉它自己的天空与灯箱。
  if (targetMaterial.userData?.hbCarFinish) return targetMaterial;
  // 图集贴图负责显色，环境贴图会把它压成一层灰。
  if (targetMaterial.map?.isTexture) return targetMaterial;
  // 半透明件（玻璃 / 纱帘）走 transmission，不吃金属 IBL。
  if (targetMaterial.transparent || targetMaterial.opacity < 1) return targetMaterial;
  if (!(targetMaterial.metalness >= METAL_ENVIRONMENT_MIN_METALNESS)) return targetMaterial;

  const environmentTexture = createMetalEnvironmentTexture(threeApi);
  if (!environmentTexture) return targetMaterial;

  targetMaterial.envMap = environmentTexture;
  targetMaterial.envMapIntensity = METAL_ENVIRONMENT_INTENSITY;
  targetMaterial.userData = {
    ...(targetMaterial.userData || {}),
    homeosMetalEnvironment: true,
  };
  targetMaterial.needsUpdate = true;
  return targetMaterial;
}
