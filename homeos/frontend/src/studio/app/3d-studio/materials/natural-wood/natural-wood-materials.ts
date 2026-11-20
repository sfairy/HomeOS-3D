/**
 * 「自然木语」材质包（0.8.7 `natural-wood-materials.js` 的对应实现）。
 *
 * 与 0.8.7 的关系：上游用一份带 6 张 CC0 贴图的 `MeshPhysicalMaterial` 工厂 +
 * 一段按「材质种类」分支的 GLSL（木纹 / 织物 / 皮革 / 石材 / 叶簇）在 `onBeforeCompile`
 * 里注入。这里保留**同一套语义**（种类分支、按米计的世界坐标采样、屏幕导数抗锯齿、
 * 扫描贴图 + 程序化回退），代码结构与命名按本项目重写。
 *
 * 为什么必须按**世界坐标**采样而不是 UV：模型的 UV 来自各家 GLB，密度与朝向都不统一，
 * 同一块木纹贴在衣柜和地板上会是两种尺度。按米采样后，1.6m 的地板条与 0.18m 的板宽
 * 在任意模型上都是同一尺寸。
 *
 * 贴图来源：`public/static/3d-studio/materials/natural-wood/` 下的 6 张 jpg，
 * 均为 PolyHaven CC0（归属与派生记录见同目录 `sources.json`）。
 */

/** 自然木语主色板（与 0.8.7 同名同值）。 */
export const NATURAL_WOOD_PALETTE = Object.freeze({
  cream: 0xe9dfce,
  linen: 0xd3c3a9,
  oak: 0xa77b4e,
  lightOak: 0xbf9c6d,
  walnut: 0x775236,
  caramel: 0xac7049,
  stone: 0xddd5c5,
  wall: 0xede7db,
  rug: 0xc8bba4,
  bronze: 0x51473a,
  leaf: 0x43563a,
  bedding: 0xf0e7d8,
  accent: 0xab8262,
  glass: 0xc4d1cb,
  metal: 0x8a765c,
})

/**
 * 材质种类。**数值顺序是 shader 契约**（`nwKind` uniform 直接比较大小）：
 * `0` 木、`1` 织物、`2` 地毯、`3` 皮革、`4` 石材、`5` 木地板（带板缝）、`6+` 叶簇。
 * 改顺序必须同步改 `NATURAL_WOOD_SHADER` 里的分支。
 */
export const NATURAL_WOOD_KIND_INDEX = Object.freeze({
  wood: 0,
  linen: 1,
  rug: 2,
  leather: 3,
  stone: 4,
  floor: 5,
  leaf: 6,
  grass: 7,
  soil: 8,
  // 以下种类不参与表面细节 shader（只走基础 PBR 参数），索引值不影响渲染分支。
  metal: 9,
  glass: 10,
  water: 11,
  lacquer: 12,
  ceramic: 13,
})

export type NaturalWoodKind = keyof typeof NATURAL_WOOD_KIND_INDEX

/** 需要扫描贴图的种类（其余走程序化细节）。 */
const SCANNED_KINDS = new Set<NaturalWoodKind>(['wood', 'floor', 'leather'])

/** 参与 shader 注入的种类（其余只用基础 PBR 参数）。 */
const SHADED_KINDS = new Set<NaturalWoodKind>([
  'wood',
  'floor',
  'linen',
  'rug',
  'leather',
  'stone',
  'leaf',
  'grass',
  'soil',
])

/** 贴图目录（相对站点根）。 */
const TEXTURE_BASE = '/static/3d-studio/materials/natural-wood'
export const NATURAL_WOOD_TEXTURE_FILES = Object.freeze([
  'oak-color.jpg',
  'oak-roughness.jpg',
  'oak-height.jpg',
  'leather-color.jpg',
  'leather-roughness.jpg',
  'leather-height.jpg',
])

/** 材质版本：贴图或 shader 变化时递增，用于让持久化缓存失效。 */
export const NATURAL_WOOD_MATERIAL_REVISION = 'natural-wood-materials-v1'

type ThreeLike = {
  MeshPhysicalMaterial: new (params: Record<string, unknown>) => any
  Color: new (value: number | string) => any
  TextureLoader: new () => {
    load: (url: string, onLoad?: (texture: any) => void, onProgress?: () => void, onError?: (e: unknown) => void) => any
  }
  RepeatWrapping: number
  SRGBColorSpace: string
  Vector2: new (x?: number, y?: number) => any
}

export interface NaturalWoodMaterialOptions {
  /** 材质种类，决定 shader 分支与默认 PBR 参数。 */
  kind: NaturalWoodKind
  /** 基础色（十六进制）。 */
  color: number | string
  /** 同款材质的色彩微差（0.03 ≈ ±3%），避免一排柜门完全一致。 */
  variation?: number
  roughness?: number
  metalness?: number
  opacity?: number
  side?: number
  transparent?: boolean
  /** 木纹沿竖直方向（柜门 / 墙板）。 */
  verticalGrain?: boolean
  /** 细节强度倍数。 */
  detailScale?: number
  /** 使用模型自身局部坐标采样（小件家具避免世界坐标错位）。 */
  localCoordinates?: boolean
}

export interface NaturalWoodMaterialLibrary {
  /** 预载 6 张贴图；必须 await 后才能建材质（否则第一帧会是纯色）。 */
  loadTextures: (options?: { anisotropy?: number }) => Promise<void>
  /** 贴图是否已就绪。 */
  readonly textureReady: boolean
  /** 建一个材质（按参数缓存，同参数复用同一实例）。 */
  create: (options: NaturalWoodMaterialOptions) => any
  /** 地板：带板条缝与逐板色差的木地板材质。 */
  createFloor: (options?: { color?: number; anisotropy?: number }) => any
  /** 庭院地面（碎石 / 泥土 / 草地）。 */
  courtyardSurface: (surface: string, color?: number) => any
  /** 该模型类型是否在自然木语覆盖范围内（决定要不要换材质）。 */
  modelCoverage: (itemType: string) => boolean
  /** 装载后处理几何（法线 / 切线，供按米采样使用）。 */
  prepareGeometry: (mesh: any) => void
  /** 把已有材质的 shader 钩子复制到克隆体（合批 / 实例化时用）。 */
  retainShader: (target: any, source: any) => boolean
  /** 释放贴图与材质。 */
  dispose: () => void
  readonly palette: typeof NATURAL_WOOD_PALETTE
}

/** 各「部位」对应的材质种类：把语义（model role）映射到种类。 */
/** 部位语义 → 材质种类（单表，避免 switch 的分支数进复杂度棘轮）。 */
const ROLE_TO_KIND: Readonly<Record<string, NaturalWoodKind>> = Object.freeze({
  wood: 'wood',
  legs: 'wood',
  frame: 'wood',
  fabric: 'linen',
  upholstery: 'linen',
  bedding: 'linen',
  rug: 'rug',
  leather: 'leather',
  top: 'stone',
  stone: 'stone',
  countertop: 'stone',
  plant: 'leaf',
  leaf: 'leaf',
  grass: 'grass',
  ground: 'grass',
  soil: 'soil',
})

export function naturalWoodKindForRole(role: string): NaturalWoodKind | null {
  return ROLE_TO_KIND[role] ?? null
}

/** 该模型类型是否由自然木语接管（0.8.7 的 `naturalWoodModelCoverage` 语义）。 */
const NATURAL_WOOD_MODEL_TYPES = new Set([
  'sofa',
  'sofa-single',
  'sofa-l',
  'coffeetable',
  'squarecoffeetable',
  'tea-table-set',
  'tvstand',
  'side-table',
  'wardrobe',
  'drawer-chest',
  'sideboard',
  'cabinet',
  'glasscabinet',
  'shelf',
  'wallcabinet',
  'storage-cart',
  'storage-box',
  'single-glass-cabinet',
  'shoecabinet',
  'bed',
  'loft-bed-circle',
  'double-open-wardrobe',
  'bunk-bed',
  'nightstand',
  'desk',
  'bookcase',
  'diningtable',
  'rounddiningtable',
  'chair',
  'diningchair',
  'bar',
  'kitchenbase',
  'kitchen-island',
  'kitchenisland',
  'vanity',
  'plant',
  'planlabel',
])

export function naturalWoodModelCoverage(itemType: string): boolean {
  return NATURAL_WOOD_MODEL_TYPES.has(itemType) || itemType.startsWith('plant-') || itemType.startsWith('flower-')
}

/**
 * 按「种类」分支的 GLSL 片段。
 *
 * 三件事：
 * 1. `nwSurface` 把世界坐标投影到当前朝向的主平面上（墙面取 zy、地板取 xz），
 *    并用屏幕导数把采样尺度归一到「米」，这样任意缩放的模型纹理密度一致；
 * 2. 扫描贴图（橡木 / 皮革）提供真实纹理，同时用亮度归一化把它拉回目标色相，
 *    使同一张贴图能服务 cream / oak / walnut 三种色板；
 * 3. 无贴图时用 fbm 噪声生成木纹 / 织纹 / 石纹 / 叶脉，保证首帧（贴图未就绪）也有细节。
 */
const NATURAL_WOOD_SHADER = {
  uniforms: `
uniform float nwKind;
uniform float nwHasScan;
uniform sampler2D nwOakColor;
uniform sampler2D nwOakRoughness;
uniform sampler2D nwOakHeight;
uniform sampler2D nwLeatherColor;
uniform sampler2D nwLeatherRoughness;
uniform sampler2D nwLeatherHeight;
uniform vec2 nwGrainOffset;
uniform float nwVerticalGrain;
varying vec3 nwPosition;
varying vec3 nwSurfaceNormal;

float nwHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float nwNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(nwHash(i), nwHash(i + vec2(1.0, 0.0)), f.x),
             mix(nwHash(i + vec2(0.0, 1.0)), nwHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float nwFbm(vec2 p) {
  return nwNoise(p) * 0.57 + nwNoise(p * 2.03 + 8.7) * 0.28 + nwNoise(p * 4.11 + 3.4) * 0.15;
}

/**
 * 世界坐标 -> 主平面二维坐标（米）。
 * 依据法线选投影面，避免斜面上出现拉伸；「nwVerticalGrain」 时对竖直面改用 (y, 水平轴)。
 */
vec2 nwPlanar(vec3 p, vec3 n) {
  vec3 a = abs(n);
  vec2 q = a.y > a.x && a.y > a.z ? p.xz : (a.x > a.z ? p.zy : p.xy);
  if (nwVerticalGrain > 0.5 && a.y < 0.7) q = vec2(p.y, a.x > a.z ? p.z : p.x);
  return q;
}
`,
  surface: `
vec3 nwSurface(vec3 p, vec3 n) {
  vec2 q = nwPlanar(p, n);
  // 屏幕空间导数：一个像素覆盖多少米。用它做 LOD，远处自动收敛到平均色，不会闪。
  vec3 px = dFdx(-vViewPosition), py = dFdy(-vViewPosition);
  vec2 qx = dFdx(q), qy = dFdy(q);
  float det = qx.x * qy.y - qx.y * qy.x;
  float footprint = max(length(qx), length(qy));
  if (abs(det) > 1e-14) {
    vec2 metric = vec2(length((px * qy.y - py * qx.y) / det), length((py * qx.x - px * qy.x) / det));
    q *= clamp(metric, vec2(0.01), vec2(100.0));
  }
  float fine = 1.0 - smoothstep(0.001, 0.012, footprint);

  // 叶簇：整体明暗起伏 + 细叶脉，不做木纹。
  if (nwKind > 5.5) {
    float broad = nwFbm(q * 11.0);
    float blade = nwNoise(q * 390.0);
    return vec3(0.90 + broad * 0.15 + (blade - 0.5) * 0.045 * fine, (broad - 0.5) * 0.04, 0.0);
  }

  // 木 / 木地板
  if (nwKind < 0.5 || nwKind > 4.5) {
    if (nwHasScan > 0.5) {
      // 扫描图是 1.83m 见方、竖纹沿长轴；转置后用世界米采样。
      vec2 uv = q.yx / 1.83 + nwGrainOffset;
      vec3 scanned = texture2D(nwOakColor, uv).rgb;
      float luminance = dot(scanned, vec3(0.2126, 0.7152, 0.0722));
      // 以贴图平均亮度 0.2346 为基准归一：深色贴图做胡桃、浅色贴图做奶油。
      float tone = mix(1.0, clamp(luminance / 0.23461, 0.55, 1.55), 0.85);
      float rough = texture2D(nwOakRoughness, uv).r;
      float height = (texture2D(nwOakHeight, uv).r - 0.5) * 0.0004 + (luminance - 0.23461) * 0.0002;
      if (nwKind > 4.5) {
        // 地板：1.6m 板长 × 0.18m 板宽，逐板色差 + 板缝压暗。
        float row = floor(q.y / 0.18);
        float seam = smoothstep(0.176, 0.18, abs(mod(q.y, 0.18) - 0.09) + 0.09) * 0.0;
        float joint = step(0.994, fract(q.x / 1.6 + nwHash(vec2(row, 1.0)) * 0.37));
        tone *= 0.98 + nwHash(vec2(row, floor(q.x / 1.6))) * 0.04 - max(seam, joint) * 0.12;
      }
      return vec3(tone, (rough - 0.6) * 0.30, height);
    }
    // 程序化木纹：环纹（沿宽度）+ 长纹（沿长度）+ 毛孔，全部按米。
    float warp = nwFbm(vec2(q.x * 1.8, q.y * 5.0));
    float rings = sin(q.y * 235.0 + warp * 10.0 + sin(q.x * 2.5) * 1.7);
    float grain = nwFbm(vec2(q.x * 5.0, q.y * 130.0 + warp * 3.0));
    float pores = nwNoise(vec2(q.x * 70.0, q.y * 1600.0));
    float tone = 0.95 + nwFbm(q * vec2(1.5, 17.0)) * 0.09
      + (grain - 0.5) * 0.16 + rings * 0.028 * fine + (pores - 0.5) * 0.025 * fine;
    return vec3(tone, (grain - 0.5) * 0.12, (grain * 0.00012 + rings * 0.000025) * fine);
  }

  // 织物 / 地毯：经纬交织
  if (nwKind < 2.5) {
    bool rug = nwKind > 1.5;
    float scale = rug ? 110.0 : 230.0;
    float weaveFine = 1.0 - smoothstep(0.65, 2.0, footprint * scale);
    vec2 thread = q * scale;
    float weave = sin(thread.x * 6.283) * sin(thread.y * 6.283);
    float slub = nwFbm(q * vec2(85.0, 16.0));
    float broad = nwFbm(q * (rug ? 35.0 : 13.0));
    return vec3(0.95 + broad * 0.065 + (slub - 0.5) * 0.05 + weave * 0.04 * weaveFine,
      weave * 0.035 * weaveFine,
      (weave * (rug ? 0.00036 : 0.00013) + (slub - 0.5) * 0.00016) * weaveFine);
  }

  // 皮革
  if (nwKind < 3.5) {
    if (nwHasScan > 0.5) {
      vec2 uv = q / 0.65;
      float luminance = dot(texture2D(nwLeatherColor, uv).rgb, vec3(0.2126, 0.7152, 0.0722));
      float rough = texture2D(nwLeatherRoughness, uv).r;
      float height = (texture2D(nwLeatherHeight, uv).r - 0.5) * 0.0011 * fine;
      float tone = mix(1.0, clamp(luminance / 0.03771, 0.65, 1.45), 0.26);
      return vec3(tone, (rough - 0.6) * 0.24, height);
    }
    float pore = nwNoise(q * 1250.0);
    float natural = nwFbm(q * 27.0);
    return vec3(0.94 + natural * 0.10 + (pore - 0.5) * 0.022 * fine,
      (natural - 0.5) * 0.10, (pore * 0.00009 + natural * 0.00013) * fine);
  }

  // 石材：云状斑驳 + 细脉 + 颗粒
  float cloud = nwFbm(q * 4.0);
  float vein = smoothstep(0.89, 0.99, sin(q.x * 18.0 + q.y * 7.0 + cloud * 9.0)) * 0.035;
  float speck = nwNoise(q * 700.0);
  return vec3(0.98 + (cloud - 0.5) * 0.07 - vein + (speck - 0.5) * 0.018 * fine,
    (cloud - 0.5) * 0.07, speck * 0.000035 * fine);
}

/** 高度场 -> 扰动后的法线（屏幕导数法，避免依赖切线）。 */
vec3 nwBump(vec3 position, vec3 surfaceNormal, float height) {
  vec3 dx = dFdx(position), dy = dFdy(position);
  vec3 r1 = cross(dy, surfaceNormal), r2 = cross(surfaceNormal, dx);
  float det = dot(dx, r1);
  vec3 gradient = sign(det) * (dFdx(height) * r1 + dFdy(height) * r2);
  return normalize(abs(det) * surfaceNormal - gradient);
}
`,
}

/** 按种类的默认 PBR 参数（与 0.8.7 的取值一致）。 */
function defaultRoughness(kind: NaturalWoodKind): number {
  if (kind === 'linen' || kind === 'rug') return 0.96
  if (kind === 'leather') return 0.53
  if (kind === 'stone') return 0.58
  if (kind === 'metal') return 0.31
  if (kind === 'glass') return 0.13
  if (kind === 'grass' || kind === 'leaf' || kind === 'soil') return 0.95
  return 0.49
}

function defaultMetalness(kind: NaturalWoodKind): number {
  return kind === 'metal' ? 0.86 : 0
}

/** 材质库的可变状态（模块级函数都作用在它上面，避免巨型闭包）。 */
interface NaturalWoodState {
  three: ThreeLike
  materialCache: Map<string, any>
  textures: Record<string, any>
  disposed: boolean
  loaded: boolean
  loadPromise: Promise<void> | null
}

const TEXTURE_ENTRIES: ReadonlyArray<readonly [string, string]> = Object.freeze([
  ['oakColor', 'oak-color.jpg'],
  ['oakRoughness', 'oak-roughness.jpg'],
  ['oakHeight', 'oak-height.jpg'],
  ['leatherColor', 'leather-color.jpg'],
  ['leatherRoughness', 'leather-roughness.jpg'],
  ['leatherHeight', 'leather-height.jpg'],
])

/** 预载 6 张贴图；失败只告警（程序化分支仍能出细节）。 */
function loadTexturesInto(state: NaturalWoodState): Promise<void> {
  if (state.disposed || state.loadPromise) return state.loadPromise ?? Promise.resolve()
  const loader = new state.three.TextureLoader()
  state.loadPromise = Promise.all(
    TEXTURE_ENTRIES.map(
      ([key, file]) =>
        new Promise<void>((resolve, reject) => {
          loader.load(
            `${TEXTURE_BASE}/${file}`,
            (texture: any) => {
              state.textures[key] = texture
              resolve()
            },
            undefined,
            (loadError) => reject(loadError),
          )
        }),
    ),
  )
    .then(() => {
      state.loaded = true
    })
    .catch((loadError) => {
      console.warn('[natural-wood] 贴图加载失败，将使用程序化纹理。', loadError)
    })
  return state.loadPromise
}

function applyTextureSettings(state: NaturalWoodState, key: string, isColor: boolean, anisotropy: number): void {
  const texture = state.textures[key]
  if (!texture) return
  texture.wrapS = texture.wrapT = state.three.RepeatWrapping
  texture.anisotropy = anisotropy
  if (isColor) texture.colorSpace = state.three.SRGBColorSpace
  texture.needsUpdate = true
}

/** 贴图到位后把已建材质的 shader 开关与采样器切过去（首帧纯色 -> 真实纹理）。 */
function refreshTexturedMaterials(state: NaturalWoodState): void {
  for (const material of state.materialCache.values()) {
    const uniforms = material.userData?.naturalWoodUniforms
    if (!uniforms) continue
    uniforms.nwHasScan.value = SCANNED_KINDS.has(material.userData.naturalWoodKind) ? 1 : 0
    uniforms.nwOakColor.value = state.textures.oakColor ?? null
    uniforms.nwOakRoughness.value = state.textures.oakRoughness ?? null
    uniforms.nwOakHeight.value = state.textures.oakHeight ?? null
    uniforms.nwLeatherColor.value = state.textures.leatherColor ?? null
    uniforms.nwLeatherRoughness.value = state.textures.leatherRoughness ?? null
    uniforms.nwLeatherHeight.value = state.textures.leatherHeight ?? null
    material.needsUpdate = true
  }
}

/** 清漆层：只有木与皮革有薄薄一层。 */
function clearcoatFor(kind: NaturalWoodKind): number {
  if (kind === 'wood' || kind === 'floor') return 0.09
  return kind === 'leather' ? 0.07 : 0
}

/** 默认透明度：玻璃 0.2 / 水 0.68 / 其余不透明。 */
function opacityFor(kind: NaturalWoodKind, opacity: number | undefined): number {
  if (kind === 'glass') return opacity ?? 0.2
  if (kind === 'water') return opacity ?? 0.68
  return 1
}

/** MeshPhysicalMaterial 的参数：按种类取默认值，调用方给的优先。 */
function physicalParamsFor(state: NaturalWoodState, options: NaturalWoodMaterialOptions): Record<string, unknown> {
  const { kind, color, variation = 0, roughness, metalness, opacity, side, transparent } = options
  const isFabric = kind === 'linen' || kind === 'rug'
  const isGlassLike = kind === 'glass' || kind === 'water'
  return {
    color: new state.three.Color(color).multiplyScalar(1 + variation),
    roughness: roughness ?? defaultRoughness(kind),
    metalness: metalness ?? defaultMetalness(kind),
    clearcoat: clearcoatFor(kind),
    clearcoatRoughness: 0.55,
    sheen: isFabric ? 0.24 : 0,
    sheenRoughness: 0.95,
    sheenColor: new state.three.Color(color),
    transparent: transparent ?? isGlassLike,
    opacity: opacityFor(kind, opacity),
    depthWrite: kind !== 'glass' && kind !== 'water',
    side: side ?? (state.three as unknown as { FrontSide: number }).FrontSide,
    forceSinglePass: true,
  }
}

function materialCacheKey(options: NaturalWoodMaterialOptions): string {
  return [
    options.kind,
    options.color,
    options.variation ?? 0,
    options.roughness ?? '',
    options.metalness ?? '',
    options.opacity ?? '',
    options.side ?? '',
    options.transparent ? 1 : 0,
    options.verticalGrain ? 1 : 0,
    options.detailScale ?? 1,
    options.localCoordinates ? 1 : 0,
  ].join('|')
}

/** 顶点着色器：把世界坐标（或局部坐标）与法线传给片元。 */
function naturalWoodVertexPatch(localCoordinates: boolean): { common: string; worldpos: string } {
  const position = localCoordinates ? 'nwLocalPosition' : 'nwWorld.xyz'
  const normal = localCoordinates ? 'nwLocalNormal' : 'mat3(modelMatrix) * objectNormal'
  return {
    common: `#include <common>
uniform mat4 nwProjection;
${localCoordinates ? 'attribute vec3 nwLocalPosition;\nattribute vec3 nwLocalNormal;' : ''}
varying vec3 nwPosition;
varying vec3 nwSurfaceNormal;`,
    worldpos: `#include <worldpos_vertex>
  vec4 nwWorld = modelMatrix * vec4(transformed, 1.0);
  nwPosition = ${position};
  nwSurfaceNormal = normalize(${normal});`,
  }
}

/**
 * 往 `MeshPhysicalMaterial` 注入按种类分支的表面细节。
 *
 * 三处替换：
 * - 顶点：带出世界坐标与法线；
 * - 片元顶部：放函数库（噪声 / 投影 / 凹凸）；
 * - `normal_fragment_maps` 之后：改 albedo / 粗糙度 / 法线。
 */
function injectNaturalWoodShader(
  state: NaturalWoodState,
  material: any,
  kind: NaturalWoodKind,
  { verticalGrain, localCoordinates }: { verticalGrain: boolean; localCoordinates: boolean },
): void {
  const uniforms = {
    nwKind: { value: NATURAL_WOOD_KIND_INDEX[kind] },
    nwHasScan: { value: SCANNED_KINDS.has(kind) && state.loaded ? 1 : 0 },
    nwOakColor: { value: state.textures.oakColor ?? null },
    nwOakRoughness: { value: state.textures.oakRoughness ?? null },
    nwOakHeight: { value: state.textures.oakHeight ?? null },
    nwLeatherColor: { value: state.textures.leatherColor ?? null },
    nwLeatherRoughness: { value: state.textures.leatherRoughness ?? null },
    nwLeatherHeight: { value: state.textures.leatherHeight ?? null },
    // 每块板 / 每扇门的纹理起点错开，避免一整排完全重复。
    nwGrainOffset: { value: new state.three.Vector2(Math.random(), Math.random()) },
    nwVerticalGrain: { value: verticalGrain ? 1 : 0 },
  }
  material.userData.naturalWoodUniforms = uniforms
  const vertex = naturalWoodVertexPatch(localCoordinates)

  material.onBeforeCompile = (shader: any) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', vertex.common)
      .replace('#include <worldpos_vertex>', vertex.worldpos)
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\n${NATURAL_WOOD_SHADER.uniforms}\n${NATURAL_WOOD_SHADER.surface}`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
  {
    vec3 nwSurfaceAlbedo = nwSurface(nwPosition, normalize(nwSurfaceNormal));
    diffuseColor.rgb *= nwSurfaceAlbedo.x;
    roughnessFactor = clamp(roughnessFactor + nwSurfaceAlbedo.y, 0.04, 1.0);
    normal = nwBump(nwPosition, nwSurfaceNormal, nwSurfaceAlbedo.z);
  }`,
      )
  }
  // 让 three 当成独立 program（否则会与普通 PBR 共用编译结果）。
  material.customProgramCacheKey = () => `natural-wood-${kind}-${localCoordinates ? 'local' : 'world'}`
}

function createMaterial(state: NaturalWoodState, options: NaturalWoodMaterialOptions): any {
  const key = materialCacheKey(options)
  const cached = state.materialCache.get(key)
  if (cached) return cached
  const material = new state.three.MeshPhysicalMaterial(physicalParamsFor(state, options))
  material.name = `自然木语 / ${options.kind}`
  material.userData.naturalWoodKind = options.kind
  material.userData.naturalWoodFinish = {
    verticalGrain: options.verticalGrain === true,
    detailScale: options.detailScale ?? 1,
    localCoordinates: options.localCoordinates === true,
  }
  material.userData.naturalWoodSamplerUnits = SCANNED_KINDS.has(options.kind) ? 3 : 0
  if (SHADED_KINDS.has(options.kind)) {
    injectNaturalWoodShader(state, material, options.kind, {
      verticalGrain: options.verticalGrain === true,
      localCoordinates: options.localCoordinates === true,
    })
  }
  state.materialCache.set(key, material)
  return material
}

export function createNaturalWoodMaterials(three: ThreeLike): NaturalWoodMaterialLibrary {
  const state: NaturalWoodState = {
    three,
    materialCache: new Map(),
    textures: {},
    disposed: false,
    loaded: false,
    loadPromise: null,
  }
  return {
    loadTextures: async (options) => {
      await loadTexturesInto(state)
      const anisotropy = Math.max(1, options?.anisotropy ?? 4)
      for (const [key, file] of TEXTURE_ENTRIES) applyTextureSettings(state, key, file.includes('color'), anisotropy)
      refreshTexturedMaterials(state)
    },
    get textureReady() {
      return state.loaded
    },
    create: (options) => createMaterial(state, options),
    createFloor: (options = {}) =>
      createMaterial(state, { kind: 'floor', color: options.color ?? NATURAL_WOOD_PALETTE.oak, roughness: 0.42 }),
    courtyardSurface: (surface, color) => {
      // 庭院/露台的地面种类：草坪、泥土、木平台、水面各走各的细节；其余按石材。
      const kindBySurface: Readonly<Record<string, NaturalWoodKind>> = {
        grass: 'grass',
        soil: 'soil',
        wood: 'wood',
        water: 'water',
        leaf: 'leaf',
        stone: 'stone',
      }
      const kind = kindBySurface[surface] ?? 'stone'
      return createMaterial(state, {
        kind,
        color: color ?? (kind === 'grass' || kind === 'leaf' ? NATURAL_WOOD_PALETTE.leaf : NATURAL_WOOD_PALETTE.stone),
      })
    },
    modelCoverage: naturalWoodModelCoverage,
    prepareGeometry: (mesh) => {
      // 两条采样路径：
      // - 默认按**世界坐标**取米（墙面 / 家具立面），只需要法线；
      // - `localCoordinates: true`（帘布、灯带这类随物体旋转的软性面）按**局部坐标**取米，
      //   着色器读 `nwLocalPosition` / `nwLocalNormal` —— 这两个属性必须在这里补，
      //   否则走该分支的材质拿到的是未定义属性，采样退化成 0（整片纯色）。
      const geometry = mesh?.geometry
      if (!geometry) return
      if (!geometry.attributes?.normal && geometry.computeVertexNormals) geometry.computeVertexNormals()
      if (mesh.material?.userData?.naturalWoodLocalCoordinates !== true) return
      if (geometry.attributes && !geometry.attributes.nwLocalPosition)
        geometry.setAttribute('nwLocalPosition', geometry.attributes.position.clone())
      if (geometry.attributes?.normal && !geometry.attributes.nwLocalNormal)
        geometry.setAttribute('nwLocalNormal', geometry.attributes.normal.clone())
    },
    retainShader: (target, source) => {
      if (!source?.userData?.naturalWoodKind) return false
      target.onBeforeCompile = source.onBeforeCompile
      target.customProgramCacheKey = source.customProgramCacheKey
      target.userData.naturalWoodKind = source.userData.naturalWoodKind
      target.userData.naturalWoodUniforms = source.userData.naturalWoodUniforms
      target.runtimeSourceMaterial = source
      return true
    },
    dispose: () => {
      state.disposed = true
      for (const texture of Object.values(state.textures)) texture?.dispose?.()
      for (const material of state.materialCache.values()) material?.dispose?.()
      state.materialCache.clear()
      state.textures = {}
    },
    palette: NATURAL_WOOD_PALETTE,
  }
}
