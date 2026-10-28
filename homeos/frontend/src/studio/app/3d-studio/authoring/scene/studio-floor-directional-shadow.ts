/**
 * 分层方向光阴影（上游 `studio-floor-directional-shadow.js`，0.8.1 新增）。
 *
 * ## 问题
 *
 * 一张方向光阴影贴图是**整栋楼共用**的。大户型里楼下的树、楼上的挑檐都在同一张图上，
 * 512×512 分到每层只剩几十个像素，阴影边缘全是锯齿。0.8.0 只能加大贴图尺寸，显存跟着涨。
 *
 * ## 做法
 *
 * 1. 每层算出自己的**投影裁剪矩形**：把该层的投影物体包围盒投到光空间，取并集，外扩 padding，
 *    再按 32 的整数倍对齐（纹理块对齐，避免每次微调都重分配）；
 * 2. 所有层的裁剪矩形取最大宽度/高度，分配一张 **`DataArrayTexture`**（层数 = 楼层数）；
 * 3. 逐层把方向光移到「该层锚点空间」重新渲染阴影，只画这一层；
 * 4. 着色器按当前楼层取对应层，并用 `cropUv` 把坐标映射回裁剪矩形。
 *
 * 效果：每层都拿满了整张图的分辨率，总显存只涨「层数 × 裁剪面积」，且裁剪矩形是紧贴几何的。
 *
 * ## 为什么带「保留已离开楼层」的 `retainDetachedFloors`
 *
 * 切层瞬间旧层还在淡出（`floorTransitionLeaving`），如果立刻把它的层从纹理数组里拿掉，
 * 淡出的那几帧会采样到别的层的阴影 —— 表现为「楼层切换时阴影闪一下」。默认保留同签名的旧层。
 *
 * 本项目的 three 是浏览器直载的外部模块，编译期只有宽泛的影子声明，所以这里用最小结构化
 * 接口描述用到的部分。
 */
import type { FloorLightNode, FloorMatrix4 } from "./studio-floor-lights";
import { objectFloorId } from "./studio-floor-lights";

/** 阴影裁剪矩形（像素坐标，左上原点）。 */
export interface ShadowCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ShadowCropPlan {
  /** 对齐后的统一裁剪宽度（所有层共用）。 */
  width: number;
  /** 对齐后的统一裁剪高度（所有层共用）。 */
  height: number;
  crops: ShadowCrop[];
}

/** 可参与投影计算的顶点。 */
interface ShadowPoint {
  x: number;
  y: number;
  z: number;
  clone(): ShadowPoint;
  set(x: number, y: number, z: number): ShadowPoint;
  applyMatrix4(matrix: unknown): ShadowPoint;
}

export interface ShadowBox3 {
  min: ShadowPoint;
  max: ShadowPoint;
  isEmpty(): boolean;
  clone(): ShadowBox3;
  applyMatrix4(matrix: unknown): ShadowBox3;
  union(box: ShadowBox3): ShadowBox3;
  intersectsBox?(box: ShadowBox3): boolean;
}

/** `THREE.Vector4` 的最小契约（裁剪 UV）。 */
export interface ShadowVector4 {
  toArray(array: unknown, offset?: number): number[];
}

/** 投影物体（网格 / 实例化网格 / 蒙皮网格）。 */
export interface FloorShadowObject {
  isInstancedMesh?: boolean;
  isSkinnedMesh?: boolean;
  isMesh?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  visible?: boolean;
  matrixWorld: FloorMatrix4;
  parent?: FloorShadowObject | null;
  userData?: Record<string, unknown>;
  geometry?: {
    boundingBox?: ShadowBox3 | null;
    computeBoundingBox?(): void;
  } | null;
  boundingBox?: ShadowBox3 | null;
  computeBoundingBox?(): void;
  traverse?(callback: (node: FloorShadowObject) => void): void;
}

/** 一个楼层的阴影源。 */
export interface FloorShadowSource {
  id: string;
  anchor: FloorLightNode;
  bounds: ShadowBox3;
  shadowObjects: FloorShadowObject[];
  frameFromAnchor: FloorMatrix4;
  /** 由 `planProjections` 填：该层在光空间的投影矩阵。 */
  projection?: FloorMatrix4 | null;
  /** 由 `planFloorShadowCrops` 填：该层在阴影图里占的矩形。 */
  crop?: ShadowCrop;
  /** 影响阴影的「光照签名」，用来判断旧层能否复用。 */
  signature?: string;
  layer?: number;
  /** 以下字段在「已经渲染进纹理数组」之后才存在（`captureFloor` 产出）。 */
  cropUv?: ShadowVector4;
  light?: FloorLightNode;
  matrix?: FloorMatrix4;
  anchorWorld?: FloorMatrix4;
  bias?: number;
  normalBias?: number;
  intensity?: number;
}

/** `THREE.Vector2` / `Vector3` / `Vector4` / `Color` 的粗略面。 */
interface ShadowVec2 {
  x: number;
  y: number;
}

export interface FloorShadowThree {
  Matrix4: new () => FloorMatrix4;
  Vector4: new (x?: number, y?: number, z?: number, w?: number) => { toArray(array: unknown, offset?: number): number[] };
  Vector3: new (x?: number, y?: number, z?: number) => ShadowPoint;
  Vector2: new (x?: number, y?: number) => ShadowVec2;
  Box2: new (min?: ShadowVec2, max?: ShadowVec2) => unknown;
  Box3: new (min?: ShadowPoint, max?: ShadowPoint) => ShadowBox3;
  Color: new (color?: number) => unknown;
  WebGLRenderTarget: new (width: number, height: number, options?: Record<string, unknown>) => ShadowRenderTarget;
  WebGLArrayRenderTarget: new (
    width: number,
    height: number,
    depth: number,
    options?: Record<string, unknown>,
  ) => ShadowArrayRenderTarget;
  RGFormat: number;
  HalfFloatType: number;
  LinearFilter: number;
}

export interface ShadowRenderTarget {
  texture?: unknown;
  depth?: number;
  dispose(): void;
}

export interface ShadowArrayRenderTarget extends ShadowRenderTarget {
  texture: { generateMipmaps?: boolean };
  depth: number;
}

/** `THREE.DirectionalLight` 的最小契约（含 `shadow` 子系统）。 */
export interface FloorDirectionalLight extends Omit<FloorLightNode, "target"> {
  position: { set(x: number, y: number, z: number): void; clone(): unknown; applyMatrix4(matrix: unknown): unknown };
  target: {
    position: { set(x: number, y: number, z: number): void; clone(): unknown; applyMatrix4(matrix: unknown): unknown };
    updateWorldMatrix(updateParents: boolean, updateChildren: boolean): void;
  };
  shadow: {
    map: ShadowRenderTarget | null;
    mapPass: ShadowRenderTarget | null;
    matrix: FloorMatrix4;
    camera: { projectionMatrix: { elements: ArrayLike<number> } };
    mapSize: { x: number; y: number; toArray(): number[] };
    radius: number;
    blurSamples: number;
    bias: number;
    normalBias: number;
    intensity: number;
    autoUpdate: boolean;
    needsUpdate: boolean;
    updateMatrices(light: unknown): void;
  };
  updateWorldMatrix(updateParents: boolean, updateChildren: boolean): void;
}

export interface ShadowRenderer {
  getRenderTarget(): unknown;
  getActiveCubeFace?(): number;
  getActiveMipmapLevel?(): number;
  getViewport(target: unknown): unknown;
  getScissor(target: unknown): unknown;
  getScissorTest(): boolean;
  getClearColor(target: unknown): unknown;
  getClearAlpha(): number;
  setRenderTarget(target: unknown, cubeFace?: number, mipLevel?: number): void;
  setViewport(viewport: unknown): void;
  setScissor(scissor: unknown): void;
  setScissorTest(enabled: boolean): void;
  setClearColor(color: unknown, alpha?: number): void;
  clear?(color: boolean, depth: boolean, stencil: boolean): void;
  initRenderTarget(target: unknown): void;
  copyTextureToTexture(
    source: unknown,
    target: unknown,
    sourceBox: unknown,
    targetOrigin: unknown,
  ): void;
}

export interface FloorDirectionalShadowOptions {
  THREE: FloorShadowThree;
  renderer: ShadowRenderer;
  scene: { updateMatrixWorld(force: boolean): void; traverse(callback: (node: FloorShadowObject) => void): void };
  /** 真正渲染阴影图（内部会 `light.shadow.updateMatrices` + `renderer.render`）。 */
  renderDepth(light: FloorDirectionalLight): void;
  requestFrame(): void;
  /** 楼层淡出期间保留旧层，避免切换时阴影闪烁。 */
  retainDetachedFloors?: boolean;
  /** 楼层锚点空间 → 世界空间（切层动画中的中间态）。 */
  getFloorFrame?(floorId: string): FloorMatrix4;
  /** 纹理拷贝（默认 three 的 `copyTextureToTexture`；WebGL2 下可换成 blit 版）。 */
  copyTexture?(
    source: unknown,
    target: unknown,
    sourceBox: unknown,
    targetOrigin: unknown,
  ): void;
}

export interface FloorDirectionalShadow {
  entries: Map<string, FloorShadowSource>;
  stats: {
    captures: number;
    layers: number;
    bytes: number;
    fullBytes: number;
    width: number;
    height: number;
    scratchTargets: number;
    /** 最近一次构建收集到的楼层分组数。为 0 说明场景里没有按楼层分组的根节点。 */
    floors: number;
    /** 是否找到可用的方向光（`isDirectionalLight && castShadow`）。为 0 时整条链路不会建层。 */
    sun: number;
    /** 最近一次构建的结论：`built` / `no-sun` / `no-floor-groups` / `disabled` / `stale`。 */
    reason: string;
  };
  readonly texture: unknown;
  sync(enabled?: boolean): void;
  build(root: unknown, isStillValid: () => boolean, waitFrame: () => Promise<void>): Promise<void>;
  buildSteps(
    root: unknown,
    /** 返回 false 表示这次构建已被新的一轮取代：立刻停手，别把半成品写回去。 */
    isStillValid: () => boolean,
    options?: { reuse?: boolean },
  ): Generator<undefined, void, undefined>;
  forgetFloor(floorId: string): void;
  refresh(bounds: unknown): boolean;
  release(): void;
  dispose(): void;
}

/** 裁剪矩形按 32 像素对齐：纹理块对齐，切换/微调时不必重新分配整张图。 */
const CROP_ALIGN = 32;

/**
 * 规划每层的阴影裁剪矩形（纯函数）。
 *
 * 输入是「每层的投影物体」，输出「统一裁剪尺寸 + 每层在阴影图里的矩形」。所有坐标都是
 * 光空间 → [0,1] → 乘 mapSize，因此与贴图分辨率无关，可以在建图之前先算出来。
 *
 * 两个退化情况：
 * - 某层没有任何投影物体 → 给 1×1 的最小矩形（保证着色器采样不越界）；
 * - 顶点坐标出现 `NaN` / `Infinity`（模型矩阵坏了）→ 给整张图的矩形（宁可糊，不可黑屏）。
 */
export function planFloorShadowCrops(
  sources: ReadonlyArray<FloorShadowSource>,
  fallbackProjection: FloorMatrix4,
  mapSize: ShadowVec2,
  padding = 16,
): ShadowCropPlan {
  const mapWidth = Math.max(1, Math.floor(mapSize.x)),
    mapHeight = Math.max(1, Math.floor(mapSize.y)),
    rawCrops = sources.map((source) => {
      let minX = mapWidth,
        minY = mapHeight,
        maxX = 0,
        maxY = 0,
        hasBounds = false;
      for (const object of source.shadowObjects || []) {
        const boundsSource =
          object.isInstancedMesh || object.isSkinnedMesh ? object : object.geometry;
        if (!boundsSource) continue;
        if (object.isSkinnedMesh || !boundsSource.boundingBox) boundsSource.computeBoundingBox?.();
        const boundingBox = boundsSource.boundingBox;
        if (!boundingBox || boundingBox.isEmpty()) continue;
        const worldMatrix = (source.projection || fallbackProjection).clone().multiply(object.matrixWorld),
          corner = boundingBox.min.clone();
        // 八个角都要投：只投 min/max 两个角在旋转后的光空间里会漏掉最外侧的角。
        for (const x of [boundingBox.min.x, boundingBox.max.x]) {
          for (const y of [boundingBox.min.y, boundingBox.max.y]) {
            for (const z of [boundingBox.min.z, boundingBox.max.z]) {
              corner.set(x, y, z).applyMatrix4(worldMatrix);
              if (!Number.isFinite(corner.x + corner.y)) {
                return { x: 0, y: 0, right: mapWidth, top: mapHeight };
              }
              ((minX = Math.min(minX, corner.x * mapWidth)),
                (minY = Math.min(minY, corner.y * mapHeight)),
                (maxX = Math.max(maxX, corner.x * mapWidth)),
                (maxY = Math.max(maxY, corner.y * mapHeight)),
                (hasBounds = true));
            }
          }
        }
      }
      if (!hasBounds) return { x: 0, y: 0, right: 1, top: 1 };
      const x = Math.max(0, Math.min(mapWidth - 1, Math.floor(minX - padding))),
        y = Math.max(0, Math.min(mapHeight - 1, Math.floor(minY - padding)));
      return {
        x,
        y,
        right: Math.max(x + 1, Math.min(mapWidth, Math.ceil(maxX + padding))),
        top: Math.max(y + 1, Math.min(mapHeight, Math.ceil(maxY + padding))),
      };
    }),
    width = Math.min(
      mapWidth,
      Math.ceil(Math.max(1, ...rawCrops.map((crop) => crop.right - crop.x)) / CROP_ALIGN) * CROP_ALIGN,
    ),
    height = Math.min(
      mapHeight,
      Math.ceil(Math.max(1, ...rawCrops.map((crop) => crop.top - crop.y)) / CROP_ALIGN) * CROP_ALIGN,
    ),
    // 每层都居中：贴边裁剪会让方向光在楼层边缘产生「漏光条」。
    crops = rawCrops.map((crop) => ({
      x: Math.max(0, Math.min(mapWidth - width, Math.floor((crop.x + crop.right - width) / 2))),
      y: Math.max(0, Math.min(mapHeight - height, Math.floor((crop.y + crop.top - height) / 2))),
      width,
      height,
    }));
  return { width, height, crops };
}

export function createFloorDirectionalShadow({
  THREE,
  renderer,
  scene,
  renderDepth,
  requestFrame,
  retainDetachedFloors = false,
  getFloorFrame = () => new THREE.Matrix4(),
  copyTexture = (...args) => renderer.copyTextureToTexture(...args),
}: FloorDirectionalShadowOptions): FloorDirectionalShadow {
  let light: FloorDirectionalLight | null = null,
    lightCastShadow = true,
    arrayTarget: ShadowArrayRenderTarget | null = null,
    userEnabled = true,
    disposed = false,
    scratchMap: ShadowRenderTarget | null = null,
    scratchMapPass: ShadowRenderTarget | null = null,
    scratchTarget: ShadowRenderTarget | null = null,
    scratchTimer: ReturnType<typeof setTimeout> | null = null;
  const stats = {
      captures: 0,
      layers: 0,
      bytes: 0,
      fullBytes: 0,
      width: 0,
      height: 0,
      scratchTargets: 0,
      floors: 0,
      sun: 0,
      reason: "",
    },
    entries = new Map<string, FloorShadowSource>();

  function resolveLight(): FloorDirectionalLight | null {
    if (!light) {
      scene.traverse((node) => {
        const candidate = node as unknown as FloorDirectionalLight;
        if (!light && candidate.isDirectionalLight && candidate.castShadow) {
          light = candidate;
          lightCastShadow = !!candidate.castShadow;
        }
      });
    }
    return light;
  }

  function sync(enabled = true) {
    userEnabled = enabled;
    if (!userEnabled && !light) return;
    const resolved = resolveLight();
    if (!resolved) return;
    // 接管阴影图期间必须把方向光自身的 `castShadow` 关掉：否则 three 会在每帧末尾用
    // 它自己的阴影图再渲染一次，把我们的数组纹理覆盖掉（表现为阴影忽明忽暗）。
    resolved.castShadow = userEnabled && arrayTarget ? false : lightCastShadow;
  }

  function clearScratch() {
    if (scratchTimer) clearTimeout(scratchTimer);
    scratchTimer = null;
    scratchMap?.dispose();
    scratchMapPass?.dispose();
    scratchMap = scratchMapPass = null;
    stats.scratchTargets = 0;
  }

  /** 切层后延迟释放临时缓冲：立刻释放会让 GPU 在下一帧还在用这块内存（驱动会同步等待）。 */
  function scheduleClearScratch() {
    if (scratchTimer) clearTimeout(scratchTimer);
    scratchTimer = setTimeout(clearScratch, 750);
    (scratchTimer as unknown as { unref?: () => void }).unref?.();
  }

  function withFloorLight<T>(source: FloorShadowSource, fn: (frame: FloorMatrix4) => T): T {
    const resolved = light!,
      savedPosition = resolved.position.clone(),
      savedTargetPosition = resolved.target.position.clone();
    source.anchor.updateWorldMatrix?.(true, false);
    const frame = source.frameFromAnchor
      ? new THREE.Matrix4().multiplyMatrices(source.anchor.matrixWorld!, source.frameFromAnchor)
      : getFloorFrame(source.id);
    try {
      (resolved.position.applyMatrix4(frame), resolved.target.position.applyMatrix4(frame));
      (resolved.updateWorldMatrix(true, false), resolved.target.updateWorldMatrix(true, false));
      return fn(frame);
    } finally {
      ((resolved.position as unknown as { copy(v: unknown): void }).copy(savedPosition),
        (resolved.target.position as unknown as { copy(v: unknown): void }).copy(savedTargetPosition),
        resolved.updateWorldMatrix(true, false),
        resolved.target.updateWorldMatrix(true, false));
    }
  }

  /** 把方向光逐层「挪」到该层锚点空间，记录每层的阴影投影矩阵。 */
  function planProjections(sources: ReadonlyArray<FloorShadowSource>): ShadowCropPlan {
    const resolved = light!;
    (scene.updateMatrixWorld(true), resolved.target.updateWorldMatrix(true, false));
    const savedMatrix = resolved.shadow.matrix.clone();
    try {
      for (const source of sources) {
        withFloorLight(source, () => {
          resolved.shadow.updateMatrices(resolved);
          source.projection = resolved.shadow.matrix.clone();
        });
      }
      return planFloorShadowCrops(
        sources,
        resolved.shadow.matrix,
        resolved.shadow.mapSize,
        Math.max(16, Math.ceil(resolved.shadow.radius * 2 + 4)),
      );
    } finally {
      resolved.shadow.matrix.copy(savedMatrix);
    }
  }

  /** 收集楼层：每层一个锚点（最外层带 `floorId` 的容器）+ 该层的投影物体 + 世界包围盒。 */
  function collectFloors(root: unknown): FloorShadowSource[] {
    const byFloor = new Map<string, FloorShadowSource>();
    (root as { traverse?: (cb: (node: FloorShadowObject) => void) => void })?.traverse?.((object) => {
      if (!object.isMesh || !object.geometry) return;
      const floorId = objectFloorId(object as unknown as FloorLightNode);
      if (!floorId) return;
      if (!byFloor.has(floorId)) {
        // 锚点必须是「楼层容器」而不是网格本身：网格会随家具移动，容器才是楼层坐标系。
        // 正在淡出的旧层（`floorTransitionLeaving`）不参与，否则会把两层阴影叠在一起。
        let anchorNode: FloorShadowObject = object;
        for (let parent = object.parent; parent && parent !== (scene as unknown); parent = parent.parent) {
          if (parent.userData?.floorId === floorId && parent.userData?.floorTransitionLeaving === undefined) {
            anchorNode = parent;
            break;
          }
        }
        byFloor.set(floorId, {
          id: floorId,
          anchor: anchorNode as unknown as FloorLightNode,
          bounds: new THREE.Box3(),
          shadowObjects: [],
          frameFromAnchor: anchorNode.matrixWorld.clone().invert().multiply(getFloorFrame(floorId)),
        });
      }
      if (object.castShadow || object.receiveShadow) byFloor.get(floorId)!.shadowObjects.push(object);
      const boundsSource = object.isInstancedMesh ? object : object.geometry;
      if (!boundsSource.boundingBox) boundsSource.computeBoundingBox?.();
      if (boundsSource.boundingBox) {
        byFloor.get(floorId)!.bounds.union(boundsSource.boundingBox.clone().applyMatrix4(object.matrixWorld));
      }
    });
    return [...byFloor.values()];
  }

  /** 逐层渲染阴影并拷进数组纹理的第 `layer` 层。 */
  function captureFloor(source: FloorShadowSource, target: ShadowArrayRenderTarget, layer: number): FloorShadowSource {
    const shadow = light!.shadow,
      savedState = {
        map: shadow.map,
        mapPass: shadow.mapPass,
        matrix: shadow.matrix.clone(),
        cast: light!.castShadow,
        auto: shadow.autoUpdate,
        needs: shadow.needsUpdate,
        floor: light!.userData?.lightFloorId,
        target: renderer.getRenderTarget(),
        face: renderer.getActiveCubeFace?.() || 0,
        mip: renderer.getActiveMipmapLevel?.() || 0,
        viewport: renderer.getViewport(new THREE.Vector4()),
        scissor: renderer.getScissor(new THREE.Vector4()),
        scissorTest: renderer.getScissorTest(),
        clear: renderer.getClearColor(new THREE.Color()),
        alpha: renderer.getClearAlpha(),
      };
    ((shadow.map = scratchMap),
      (shadow.mapPass = scratchMapPass),
      (shadow.autoUpdate = false),
      (shadow.needsUpdate = true),
      (light!.castShadow = false),
      ((light!.userData as Record<string, unknown>).lightFloorId = source.id));
    try {
      // 1×1 的临时 target 只为「让 three 绑一个非空 framebuffer」，真正的阴影图由
      // `shadow.map`（下面拷成层）承接。
      scratchTarget ||= new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true, stencilBuffer: false });
      renderer.setRenderTarget(scratchTarget);
      withFloorLight(source, () => renderDepth(light!));
      stats.captures += 1;
      if (!shadow.map?.texture) throw new Error("分层基础阴影未生成");
      const crop = source.crop!;
      copyTexture(
        shadow.map.texture,
        target.texture,
        new THREE.Box2(
          new THREE.Vector2(crop.x, crop.y),
          new THREE.Vector2(crop.x + crop.width, crop.y + crop.height),
        ),
        new THREE.Vector3(0, 0, layer),
      );
      source.anchor.updateWorldMatrix?.(true, false);
      const anchorWorld = source.anchor.matrixWorld!.clone();
      return {
        ...source,
        light: light as unknown as FloorLightNode,
        layer,
        // UV 归一化：着色器拿到的是 [0,1] 的裁剪矩形，不依赖贴图分辨率。
        cropUv: new THREE.Vector4(
          crop.x / shadow.mapSize!.x,
          crop.y / shadow.mapSize!.y,
          crop.width / shadow.mapSize!.x,
          crop.height / shadow.mapSize!.y,
        ),
        matrix: shadow.matrix.clone(),
        anchorWorld,
        // 包围盒换到「当前锚点空间」：切层动画期间锚点会动，用旧世界坐标做视锥剔除会误剔。
        bounds: anchorWorld
          ? source.bounds
              .clone()
              .applyMatrix4(
                new THREE.Matrix4().multiplyMatrices(
                  source.anchor.matrixWorld!,
                  anchorWorld.clone().invert(),
                ),
              )
          : source.bounds,
        bias: shadow.bias,
        normalBias: shadow.normalBias,
        intensity: shadow.intensity,
      };
    } finally {
      ((scratchMap = shadow.map),
        (scratchMapPass = shadow.mapPass),
        (stats.scratchTargets = Number(!!scratchMap) + Number(!!scratchMapPass)),
        (shadow.map = savedState.map),
        (shadow.mapPass = savedState.mapPass),
        shadow.matrix.copy(savedState.matrix),
        (shadow.autoUpdate = savedState.auto),
        (shadow.needsUpdate = savedState.needs),
        (light!.castShadow = savedState.cast),
        renderer.setRenderTarget(savedState.target, savedState.face, savedState.mip),
        renderer.setViewport(savedState.viewport),
        renderer.setScissor(savedState.scissor),
        renderer.setScissorTest(savedState.scissorTest),
        renderer.setClearColor(savedState.clear, savedState.alpha));
      if (savedState.floor === undefined) delete (light!.userData as Record<string, unknown>).lightFloorId;
      else (light!.userData as Record<string, unknown>).lightFloorId = savedState.floor;
    }
  }

  function* buildSteps(
    root: unknown,
    isStillValid: () => boolean,
    { reuse = false }: { reuse?: boolean } = {},
  ): Generator<undefined, void, undefined> {
    if (disposed) return;
    const resolved = resolveLight();
    // 灰盒验收的三个「为什么没建层」：没太阳 / 缓冲被关 / 这次构建已被新的一轮取代。
    ((stats.sun = resolved ? 1 : 0), (stats.floors = 0));
    if (!resolved) {
      stats.reason = "no-sun";
      return;
    }
    if (!userEnabled) {
      stats.reason = "disabled";
      return;
    }
    if (!isStillValid()) {
      stats.reason = "stale";
      return;
    }
    scene.updateMatrixWorld(true);
    const floors = collectFloors(root);
    stats.floors = floors.length;
    if (!floors.length) {
      // release() 不会清 reason，所以「为什么没建层」能留到下一轮给灰盒看。
      stats.reason = "no-floor-groups";
      if (!retainDetachedFloors) api.release();
      return;
    }
    // 光照签名：位置/投影/贴图参数任何一项变了，旧层的阴影就不再有效。
    const signature = JSON.stringify([
      light!.position.clone(),
      light!.target.position.clone(),
      Array.from(light!.shadow.camera.projectionMatrix.elements),
      light!.shadow.mapSize.toArray(),
      light!.shadow.radius,
      light!.shadow.blurSamples,
      light!.shadow.bias,
      light!.shadow.normalBias,
      light!.shadow.intensity,
    ]),
      floorIds = new Set(floors.map((floor) => floor.id)),
      // 淡出中的旧层：签名一致才保留（换了天气/太阳角度就必须重建）。
      retained = retainDetachedFloors
        ? [...entries.values()].filter((entry) => !floorIds.has(entry.id) && entry.signature === signature)
        : [],
      planned = floors.map((floor) => {
        const existing = entries.get(floor.id);
        return reuse &&
          existing?.signature === signature &&
          existing.anchor === floor.anchor &&
          existing.shadowObjects.length === floor.shadowObjects.length &&
          existing.shadowObjects.every((object, index) => object === floor.shadowObjects[index])
          ? existing
          : floor;
      }),
      changed = planned.filter((floor) => entries.get(floor.id) !== floor);
    // 没有变化且层数对得上：什么都不用做（每帧调用也不会重渲染阴影）。
    if (!changed.length && arrayTarget && arrayTarget.depth === planned.length + retained.length) return;

    const mapSize = light!.shadow.mapSize,
      plan = planProjections(changed);
    changed.forEach((floor, index) => {
      floor.crop = plan.crops[index];
      floor.signature = signature;
    });
    planned.push(...retained);
    const width = Math.max(plan.width, ...planned.map((floor) => floor.crop!.width)),
      height = Math.max(plan.height, ...planned.map((floor) => floor.crop!.height)),
      target = new THREE.WebGLArrayRenderTarget(width, height, planned.length, {
        format: THREE.RGFormat,
        type: THREE.HalfFloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
        stencilBuffer: false,
      });
    target.texture.generateMipmaps = false;
    const nextEntries: FloorShadowSource[] = [],
      savedTarget = renderer.getRenderTarget(),
      savedClearColor = renderer.getClearColor(new THREE.Color()),
      savedClearAlpha = renderer.getClearAlpha();
    try {
      renderer.initRenderTarget(target);
      for (let layer = 0; layer < planned.length; layer++) {
        if (disposed || !userEnabled || !isStillValid()) return;
        const floor = planned[layer],
          crop = floor.crop!,
          // 裁剪矩形对齐到统一尺寸后，可能超出贴图边界：往里夹，靠 `cropUv` 补偿偏移。
          clampedCrop: ShadowCrop = {
            x: Math.min(crop.x, mapSize.x - width),
            y: Math.min(crop.y, mapSize.y - height),
            width,
            height,
          };
        if (entries.get(floor.id) === floor) {
          // 复用的层：直接从旧数组纹理整块拷过来。
          renderer.setRenderTarget(target, layer);
          renderer.setClearColor(0xffffff, 1);
          renderer.clear?.(true, false, false);
          copyTexture(
            arrayTarget!.texture,
            target.texture,
            new THREE.Box3(
              new THREE.Vector3(0, 0, floor.layer!),
              new THREE.Vector3(crop.width, crop.height, floor.layer! + 1),
            ),
            new THREE.Vector3(crop.x - clampedCrop.x, crop.y - clampedCrop.y, layer),
          );
          nextEntries.push({
            ...floor,
            layer,
            crop: clampedCrop,
            cropUv: new THREE.Vector4(
              clampedCrop.x / mapSize.x,
              clampedCrop.y / mapSize.y,
              width / mapSize.x,
              height / mapSize.y,
            ),
          });
        } else {
          nextEntries.push(captureFloor({ ...floor, crop: clampedCrop }, target, layer));
        }
        (renderer.setRenderTarget(savedTarget), renderer.setClearColor(savedClearColor, savedClearAlpha));
        yield;
      }
      if (disposed || !userEnabled || !isStillValid()) return;
      (arrayTarget?.dispose(), (arrayTarget = target), entries.clear());
      for (const entry of nextEntries) entries.set(entry.id, entry);
      // 方向光自己的阴影图此刻已经没用了，留着只是占显存。
      (light!.shadow.map?.dispose(),
        light!.shadow.mapPass?.dispose(),
        (light!.shadow.map = null),
        (light!.shadow.mapPass = null),
        (light!.shadow.needsUpdate = true),
        (stats.layers = planned.length),
        // RG16F = 每像素 4 字节。
        (stats.bytes = width * height * planned.length * 4),
        (stats.fullBytes = mapSize.x * mapSize.y * planned.length * 4),
        (stats.width = width),
        (stats.height = height),
        (stats.reason = "built"),
        sync(userEnabled),
        requestFrame());
    } finally {
      (renderer.setRenderTarget(savedTarget),
        renderer.setClearColor(savedClearColor, savedClearAlpha),
        arrayTarget !== target && target.dispose(),
        scheduleClearScratch());
    }
  }

  const api: FloorDirectionalShadow = {
    entries,
    stats,
    get texture() {
      return arrayTarget?.texture || null;
    },
    sync,
    async build(root, isStillValid, waitFrame) {
      for (const _step of api.buildSteps(root, isStillValid)) await waitFrame();
    },
    buildSteps,
    forgetFloor(floorId) {
      entries.delete(floorId);
    },
    /** 阴影外的区域重算（拖动家具/改层高后调用）；返回 false 表示裁剪矩形不够用了。 */
    refresh(bounds: unknown) {
      if (!userEnabled || !arrayTarget || !light) return true;
      const isAnchorVisible = (entry: FloorShadowSource) => {
        for (let node: FloorLightNode | null | undefined = entry.anchor; node; node = node.parent) {
          if (node.visible === false) return false;
          if (node === (scene as unknown as FloorLightNode)) return true;
        }
        return false;
      };
      const visibleEntries = [...entries.values()].filter(
        (entry) =>
          isAnchorVisible(entry) &&
          (bounds === null ||
            (bounds as { some?: (test: (box: ShadowBox3) => boolean) => boolean }).some?.((box) =>
              box.intersectsBox?.(
                entry.bounds
                  .clone()
                  .applyMatrix4(
                    new THREE.Matrix4().multiplyMatrices(
                      entry.anchor.matrixWorld!,
                      (entry as unknown as { anchorWorld: FloorMatrix4 }).anchorWorld.clone().invert(),
                    ),
                  ),
              ) === true,
            )),
      );
      if (!visibleEntries.length) return true;
      const plan = planProjections(visibleEntries);
      // 只要有一层的新裁剪矩形超出了现有层尺寸，就必须整张重建（不能局部放大一层）。
      if (
        visibleEntries.some((entry, index) => {
          const plannedCrop = plan.crops[index],
            currentCrop = entry.crop!;
          return (
            plannedCrop.x < currentCrop.x ||
            plannedCrop.y < currentCrop.y ||
            plannedCrop.x + plannedCrop.width > currentCrop.x + currentCrop.width ||
            plannedCrop.y + plannedCrop.height > currentCrop.y + currentCrop.height
          );
        })
      ) {
        return false;
      }
      try {
        for (const entry of visibleEntries) entries.set(entry.id, captureFloor(entry, arrayTarget, entry.layer!));
      } finally {
        scheduleClearScratch();
      }
      return true;
    },
    release() {
      (arrayTarget?.dispose(),
        (arrayTarget = null),
        clearScratch(),
        scratchTarget?.dispose(),
        (scratchTarget = null),
        entries.clear(),
        (stats.layers = stats.bytes = stats.fullBytes = stats.width = stats.height = 0),
        (stats.floors = 0));
      if (light) ((light.castShadow = lightCastShadow), (light.shadow.needsUpdate = true));
    },
    dispose() {
      ((disposed = true), api.release(), (light = null));
    },
  };
  return api;
}

/**
 * 方向光阴影的采样函数（插在 `lights_fragment_begin` 之后 / `RE_Direct` 之前）。
 *
 * 用 variance shadow map：单层 RG16F 存「深度均值 + 方差」，靠一次 `texture()` 就能软阴影，
 * 省掉 PCF 的多次采样（层数一多，PCF 的采样成本会翻倍）。
 */
export function floorDirectionalShader(): string {
  return `
#ifdef HB_FLOOR_LIGHTS
uniform highp sampler2DArray userFloorDirectionalMap;
float userFloorDirectionalShadow() {
  vec4 params=userFloorSun[4];
  if(params.z<0.5 || !receiveShadow)return 1.0;
  mat4 matrix=mat4(userFloorSun[0],userFloorSun[1],userFloorSun[2],userFloorSun[3]);
  vec4 coord=matrix*(vUserShadowWorldPosition+vec4(vUserShadowWorldNormal*params.w,0.0));
  coord.xyz/=coord.w;coord.z+=params.x;
  if(coord.x<0.0 || coord.y<0.0 || coord.x>1.0 || coord.y>1.0 || coord.z>1.0)return 1.0;
  vec2 croppedUv=(coord.xy-userFloorSun[5].xy)/userFloorSun[5].zw;
  if(croppedUv.x<0.0 || croppedUv.y<0.0 || croppedUv.x>1.0 || croppedUv.y>1.0)return 1.0;
  vec2 distribution=texture(userFloorDirectionalMap,vec3(croppedUv,userFloorHeader.z)).rg;
  float mean=distribution.x,variance=distribution.y*distribution.y;
  #ifdef USE_REVERSED_DEPTH_BUFFER
    float hardShadow=step(mean,coord.z);
  #else
    float hardShadow=step(coord.z,mean);
  #endif
  float shadow=1.0;
  if(hardShadow!=1.0){
    variance=max(variance,0.0000001);float d=coord.z-mean;
    float p=clamp((variance/(variance+d*d)-0.3)/0.65,0.0,1.0);shadow=max(hardShadow,p);
  }
  return mix(1.0,shadow,params.y);
}
#endif
`;
}
