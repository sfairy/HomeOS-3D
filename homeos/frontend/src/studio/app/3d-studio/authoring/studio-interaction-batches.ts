/**
 * 交互渲染代理（上游 `studio-interaction-batches.js`，0.8.1 整体重写）。
 *
 * ## 与 0.8.0 版本的区别
 *
 * 0.8.0 只是把「同几何同材质」的静态网格合并成 `InstancedMesh`，减少的是 draw call 数量。
 * 0.8.1 换了一个思路：**把静态几何按楼层烘焙成一份合并几何**（`bakeIncrementally`），
 * 每个合并结果是一份独立 `BufferGeometry`，用普通 `Mesh` 渲染；原始网格在渲染前隐藏。
 *
 * 这么换有三个收益：
 *
 * 1. **draw call 数量与网格数量无关**：同一楼层几百个同材质部件烘焙成 1 份几何 = 1 次绘制，
 *    而 `InstancedMesh` 只能合并「同一个 geometry」的网格（家具里几乎不存在）。
 * 2. **烘焙可以后台分片**：`bakeIncrementally` 是生成器，一次只跑 `sliceMs`（默认 2ms），
 *    大户型加载时不再有一次几百毫秒的长任务；烘焙完成的几何按内容键缓存复用。
 * 3. **显存有预算**：几何缓存 `maxBytes`（默认 8MB）封顶，超出按 LRU 逐出，
 *    切层再来时靠缓存命中避免重烘焙。
 *
 * ## 三条必须守住的不变量
 *
 * - **拾取必须看到真实对象树**：代理只在 `render()` 期间存在，渲染前后成对地
 *   「隐藏原网格 / 挂上代理」，所以射线检测、动画、面板绑定读到的仍是原始 mesh。
 * - **局部矩阵相对楼层根**：候选的 `matrix` 是「相对楼层根节点」的，不是世界矩阵。
 *   这样楼层整体位移（总览堆叠）时只需重算 `sceneInverse × frame.world × localMatrix`，
 *   不用重烘焙几何。
 * - **内容键决定能否复用**：`cacheKey` 由「几何 token + 相对锚点的矩阵」组成，
 *   锚点取第一个成员的平移量，避免楼层整体挪动导致键变化。
 *
 * 本模块只依赖 `studio-interaction-geometry` 的生成器与字节估算，不直接持有 three 类型。
 */
import {
  bakeIncrementally,
  mergedBytes,
  type BakeSource,
  type BakeThree,
} from "./scene/studio-interaction-geometry";

/* ─────────────────────────── three.js 最小结构面 ─────────────────────────── */

type Matrix4Like = {
  elements: ArrayLike<number>;
  copy(matrix: Matrix4Like): Matrix4Like;
  clone(): Matrix4Like;
  premultiply(matrix: Matrix4Like): Matrix4Like;
  invert(): Matrix4Like;
  multiply(matrix: Matrix4Like): Matrix4Like;
  multiplyMatrices(left: Matrix4Like, right: Matrix4Like): Matrix4Like;
  equals(matrix: Matrix4Like): boolean;
  determinant(): number;
  makeTranslation(x: number, y: number, z: number): Matrix4Like;
};

type FrustumLike = {
  setFromProjectionMatrix(matrix: Matrix4Like): FrustumLike;
  intersectsObject(object: Object3DLike): boolean;
};

type CameraLike = {
  projectionMatrix: Matrix4Like;
  matrixWorldInverse: Matrix4Like;
};

type ColorLike = { r: number; g: number; b: number; toArray(): number[] };

type AttributeLike = {
  array: {
    length: number;
    constructor: { name: string };
    [index: number]: number;
  } | null;
  itemSize: number;
  count: number;
  normalized?: boolean;
  version?: number;
  isInterleavedBufferAttribute?: boolean;
  isGLBufferAttribute?: boolean;
};

type BoundsLike = { clone(): BoundsLike };

type GeometryLike = {
  uuid: string;
  attributes: Record<string, AttributeLike>;
  index: { count: number; array: ArrayLike<number>; version?: number } | null;
  drawRange: { start: number; count: number };
  groups: unknown[];
  boundingBox?: BoundsLike | null;
  dispose(): void;
};

/** 材质按属性名字符串读：`MATERIAL_PROPERTY_KEYS` 里的键都是运行期拼出来的。 */
type MaterialLike = {
  uuid: string;
  visible: boolean;
  transparent: boolean;
  opacity: number;
  transmission?: number;
  alphaTest?: number;
  clippingPlanes?: unknown[] | null;
  displacementMap?: unknown;
  isShaderMaterial?: boolean;
  isRawShaderMaterial?: boolean;
  color?: ColorLike;
  emissive?: ColorLike;
  environmentSourceMaterial?: MaterialLike;
  runtimeSourceMaterial?: unknown;
  userData: Record<string, unknown>;
  [propertyName: string]: unknown;
};

type Object3DLike = {
  name?: string;
  visible: boolean;
  parent: Object3DLike | null;
  children: Object3DLike[];
  material: MaterialLike;
  geometry: GeometryLike;
  layers: { mask: number };
  renderOrder: number;
  castShadow: boolean;
  receiveShadow: boolean;
  frustumCulled: boolean;
  matrix: Matrix4Like;
  matrixWorld: Matrix4Like;
  matrixAutoUpdate: boolean;
  userData: Record<string, unknown>;
  isMesh?: boolean;
  isInstancedMesh?: boolean;
  isSkinnedMesh?: boolean;
  isBatchedMesh?: boolean;
  customDepthMaterial?: unknown;
  customDistanceMaterial?: unknown;
  onBeforeRender?: unknown;
  onAfterRender?: unknown;
  count?: number;
  instanceMatrix?: { needsUpdate: boolean };
  traverse(callback: (node: Object3DLike) => void): void;
  removeFromParent(): void;
  dispose?(): void;
  setMatrixAt?(index: number, matrix: Matrix4Like): void;
};

type SceneLike = {
  matrixWorld: Matrix4Like;
  add(object: Object3DLike): unknown;
};

/** 代理需要注入的构造器面（`bakeIncrementally` 那 5 个之外再加 5 个）。 */
type BatchesThree = BakeThree & {
  Matrix4: new () => Matrix4Like;
  Frustum: new () => FrustumLike;
  Mesh: new (geometry: unknown, material: unknown) => Object3DLike;
  InstancedMesh: new (
    geometry: unknown,
    material: unknown,
    count: number,
  ) => Object3DLike;
  /** 只用来取原型上的 `onBeforeRender` / `onAfterRender`：被覆盖过就说明不能合并。 */
  Object3D: { prototype: { onBeforeRender?: unknown; onAfterRender?: unknown } };
};

type DeadlineLike = { didTimeout?: boolean; timeRemaining(): number };
type ScheduledHandle = { kind: "idle" | "timer"; id: number };

type FloorId = unknown;

/* ─────────────────────────────── 内部状态 ─────────────────────────────── */

/** 候选网格：一次 `prepare` 遍历的产物，跨帧复用（只在 `rev` 变化时重算键）。 */
type Candidate = {
  mesh: Object3DLike;
  floor: FloorId;
  /** 相对楼层根节点的局部矩阵，不是世界矩阵。 */
  matrix: Matrix4Like;
  transformSeen: boolean;
  transformSafe: boolean;
  /** 任何影响分组/几何/材质的变化都自增；用于「这份分组还新鲜吗」。 */
  rev: number;
  geo: GeometryDescriptor | null;
  mat: string | null;
  materialRef: MaterialLike | null;
  props: string;
  bake?: boolean;
  frame?: FrameRecord | null;
  key: string;
};

type FrameRecord = {
  node: Object3DLike;
  id: number;
  world: Matrix4Like;
  inverse: Matrix4Like;
  safe: boolean;
  epoch: number;
};

/** 几何指纹：属性表 + 索引 + drawRange 的快照，只在变化时重建。 */
type GeometryDescriptor = {
  attributes: Record<string, AttributeLike>;
  count: number;
  index: GeometryLike["index"];
  indexVersion: number | undefined;
  indexArray: ArrayLike<number> | null | undefined;
  start: number;
  range: number;
  descriptors: Array<{
    name: string;
    ref: AttributeLike;
    version: number | undefined;
    array: AttributeLike["array"];
    count: number;
    size: number;
    normalized: boolean | undefined;
  }>;
  token: number;
  canMerge: boolean;
  schema: string;
};

type MaterialSignatureRecord = {
  source: MaterialLike;
  state: unknown;
  props: Record<string, unknown>;
  signature: string;
  r: number | undefined;
  g: number | undefined;
  b: number | undefined;
  er: number | undefined;
  eg: number | undefined;
  eb: number | undefined;
};

/** 烘焙完成的几何缓存项。`refs` 为 0 表示当前没有代理在用它。 */
type GeometryRecord = {
  key: string;
  geometry: GeometryLike;
  bytes: number;
  refs: number;
  used: number;
  anchor: number[];
};

/** 一次分片烘焙任务：多个分组共享同一份 cacheKey 时只焙一次。 */
type BuildJob = {
  groups: Set<RenderGroup>;
  visibleGroups: number;
  anchor: number[];
  inputs: BakeSource[];
  cacheKey: string;
  bytes: number;
  started: boolean;
  iterator: Generator<void, GeometryLike, undefined> | null;
};

type RenderGroup = {
  key: string;
  warm: boolean;
  entries: Candidate[];
  versions: number[];
  proxy: Object3DLike | null;
  record: GeometryRecord | null;
  job: BuildJob | null;
  uncullable: boolean;
  anchor?: number[];
  localMatrix?: Matrix4Like;
};

export type InteractionBatchStats = {
  candidates: number;
  batches: number;
  savedDraws: number;
  rebuilds: number;
  reusedFrames: number;
  matrixUploads: number;
  allocations: number;
  retired: number;
  bytes: number;
  fallbacks: number;
  groupBuilds: number;
  fastFrames: number;
  validations: number;
  activeBytes: number;
  cachedBytes: number;
  pendingBytes: number;
  pending: number;
  ready: number;
  cacheHits: number;
  cacheMisses: number;
  evictions: number;
  cancelled: number;
  slices: number;
  maxSliceMs: number;
  workMs: number;
  geometryAllocations: number;
  geometryDisposals: number;
  warmScans: number;
  warmVisited: number;
  warmReady: number;
  warmSkipped: number;
  lastError?: string;
};

export type InteractionBatchesOptions = {
  THREE: BatchesThree;
  renderer: { render: (this: unknown, ...args: unknown[]) => unknown };
  scene: SceneLike;
  /** 环境材质状态签名；返回 `null` 表示该材质不可批处理。 */
  materialState?: (material: MaterialLike) => string | null;
  /** 楼层相机（多楼层总览时不同楼层各有相机）。 */
  getCamera?: (mesh: Object3DLike, camera: CameraLike | null) => CameraLike;
  /** 楼层根节点：候选矩阵相对它取，楼层整体位移时不用重烘焙。 */
  getFloorRoot?: ((floor: FloorId, mesh: Object3DLike) => Object3DLike | null) | null;
  /** 动态对象判定（电视画面、喷雾、流光、转动部件都不能合并）。 */
  isDynamicObject?: (object: Object3DLike) => boolean;
  /**
   * 静态版本号。**只有它能保证「值相同 ⇒ 场景静态不变」时才注入**：
   * 注入后同版本的帧会跳过逐网格校验，直接把上一帧的候选集拿来用。
   * 不注入就是每帧全量校验（更慢，但任何变化都立即生效）。
   */
  getStaticRevision?: (() => unknown) | null;
  /** 关闭后完全退回 `InstancedMesh` 合并（同几何才合并），用于排查烘焙问题。 */
  merge?: boolean;
  /** 几何缓存总预算。 */
  maxBytes?: number;
  /** 未在使用中的几何缓存预算（超出按 LRU 逐出）。 */
  maxCachedBytes?: number;
  /** 单次分片的时间片。 */
  sliceMs?: number;
  requestFrame?: () => void;
  available?: () => boolean;
  idleAvailable?: () => boolean;
  now?: () => number;
  schedule?: (callback: (deadline: DeadlineLike) => void) => ScheduledHandle;
  cancel?: (handle: ScheduledHandle) => void;
};

/** 缓存项上限：超过就不再新建，直接退回不合并（宁可多几次 draw call，不撑爆显存）。 */
const MAX_CACHED_GROUPS = 192;
/** 单个预热分组超过这个数量就跳过：超大分组烘焙一次太贵，留给前台按需做。 */
const MAX_WARM_GROUP_SIZE = 128;
/** 分片里「还有空余时间」的判定阈值（ms）。 */
const SLICE_IDLE_BUDGET_MS = 0.35;
/** 空间分格边长：同一个 6m 格子里的才允许合批，避免跨房间合成一个巨大代理。 */
const SPATIAL_CELL_METERS = 6;

/** 材质里会影响最终像素的标量属性。少一个就会出现「换了颜色但代理没更新」。 */
const MATERIAL_PROPERTY_KEYS = [
  "version",
  "emissiveIntensity",
  "roughness",
  "metalness",
  "side",
  "depthTest",
  "depthWrite",
  "colorWrite",
  "blending",
  "stencilWrite",
  "stencilFunc",
  "stencilRef",
  "stencilFuncMask",
  "stencilWriteMask",
  "stencilFail",
  "stencilZFail",
  "stencilZPass",
  "polygonOffset",
  "polygonOffsetFactor",
  "polygonOffsetUnits",
  "depthFunc",
  "alphaToCoverage",
  "vertexColors",
  "flatShading",
  "wireframe",
  "toneMapped",
] as const;

/** 材质里会影响最终像素的贴图属性（比 uuid）。 */
const MATERIAL_TEXTURE_KEYS = [
  "map",
  "normalMap",
  "roughnessMap",
  "metalnessMap",
  "emissiveMap",
  "aoMap",
  "alphaMap",
  "bumpMap",
  "lightMap",
  "envMap",
] as const;

/** 深比较：材质状态可能是标量、数组或嵌套数组。 */
function deepEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  return (
    left.length === right.length &&
    left.every((item, index) => deepEqual(item, right[index]))
  );
}

/** 存进缓存前把数组复制一份：否则缓存的 `state` 会和调用方手里的活数组同一引用。 */
function cloneValue(value: unknown): unknown {
  return Array.isArray(value) ? value.map(cloneValue) : value;
}

function readTextureUuid(value: unknown): string | undefined {
  return (value as { uuid?: string } | null | undefined)?.uuid;
}

function requestIdle(callback: (deadline: DeadlineLike) => void): number | null {
  const host = globalThis as unknown as {
    requestIdleCallback?: (
      cb: (deadline: DeadlineLike) => void,
      options: { timeout: number },
    ) => number;
  };
  return host.requestIdleCallback?.(callback, { timeout: 100 }) ?? null;
}

function cancelIdle(id: number) {
  const host = globalThis as unknown as {
    cancelIdleCallback?: (handle: number) => void;
  };
  host.cancelIdleCallback?.(id);
}

/**
 * 创建交互渲染代理。
 *
 * 生命周期：`prepare(root, token)` 声明当前场景根 → 每帧 `begin(camera)` 前把代理挂上去、
 * `renderer.render` 结束后自动摘掉并恢复原网格 → `dispose()` 释放全部几何缓存。
 */
export function createInteractionBatches({
  THREE: three,
  renderer,
  scene,
  materialState = () => null,
  getCamera = (_mesh, camera) => camera as CameraLike,
  getFloorRoot = null,
  isDynamicObject = () => false,
  getStaticRevision = null,
  merge = true,
  maxBytes = 8 * 1024 * 1024,
  maxCachedBytes = maxBytes,
  sliceMs = 2,
  requestFrame = () => {},
  available = () => typeof document === "undefined" || !document.hidden,
  idleAvailable = available,
  now = () => performance.now(),
  schedule = (callback) => {
    const idleId = requestIdle(callback);
    if (idleId !== null) return { kind: "idle", id: idleId };
    const timerId = setTimeout(
      () => callback({ didTimeout: true, timeRemaining: () => 0 }),
      4,
    );
    return { kind: "timer", id: timerId as unknown as number };
  },
  cancel = (handle) => {
    if (handle.kind === "idle") cancelIdle(handle.id);
    else clearTimeout(handle.id);
  },
}: InteractionBatchesOptions) {
  let disposed = false,
    preparedRoot: unknown = null,
    preparedRevisionToken: unknown = null,
    candidates: Candidate[] = [],
    /** 上一帧校验通过的候选（快速路径复用）。 */
    validCandidates: Candidate[] = [],
    /** 上一帧可见候选的 `[候选, rev]` 快照：与这一帧比对决定要不要重建分组。 */
    lastVisiblePairs: Array<[Candidate, number]> = [],
    validatedRevision: unknown = null,
    prewarmRoots: Object3DLike[] = [],
    prewarmRevision: unknown = null,
    requestedPrewarmRevision: unknown = null,
    prewarm: { iterator: Generator<void, void, undefined> } | null = null,
    scheduledHandle: ScheduledHandle | null = null,
    idCounter = 0,
    usedCounter = 0,
    epoch = 0;

  let frameByNode = new WeakMap<Object3DLike, FrameRecord>(),
    materialSignatureByMaterial = new WeakMap<MaterialLike, MaterialSignatureRecord>(),
    geometryDescriptorByGeometry = new WeakMap<GeometryLike, GeometryDescriptor>();

  const groupByKey = new Map<string, RenderGroup>(),
    recordByKey = new Map<string, GeometryRecord>(),
    pendingJobs: BuildJob[] = [],
    jobByCacheKey = new Map<string, BuildJob>(),
    warmGroups = new Set<RenderGroup>(),
    frustumByFloor = new Map<FloorId, FrustumLike>(),
    hiddenMeshes: Object3DLike[] = [],
    addedProxies: Object3DLike[] = [],
    sceneInverse = new three.Matrix4(),
    floorLocalMatrix = new three.Matrix4();

  const stats: InteractionBatchStats = {
    candidates: 0,
    batches: 0,
    savedDraws: 0,
    rebuilds: 0,
    reusedFrames: 0,
    matrixUploads: 0,
    allocations: 0,
    retired: 0,
    bytes: 0,
    fallbacks: 0,
    groupBuilds: 0,
    fastFrames: 0,
    validations: 0,
    activeBytes: 0,
    cachedBytes: 0,
    pendingBytes: 0,
    pending: 0,
    ready: 0,
    cacheHits: 0,
    cacheMisses: 0,
    evictions: 0,
    cancelled: 0,
    slices: 0,
    maxSliceMs: 0,
    workMs: 0,
    geometryAllocations: 0,
    geometryDisposals: 0,
    warmScans: 0,
    warmVisited: 0,
    warmReady: 0,
    warmSkipped: 0,
  };

  function isVisibleInTree(object: Object3DLike) {
    for (let node: Object3DLike | null = object; node; node = node.parent)
      if (!node.visible) return false;
    return true;
  }

  /** 能否参与合并：任何「渲染时会变」或「不是普通静态网格」的情况都排除。 */
  function isBatchable(mesh: Object3DLike) {
    const prototype = three.Object3D.prototype;
    return Boolean(
      mesh.isMesh &&
        !mesh.isInstancedMesh &&
        !mesh.isSkinnedMesh &&
        !mesh.isBatchedMesh &&
        !Array.isArray(mesh.material) &&
        mesh.geometry?.attributes?.position &&
        !Object.keys(
          (mesh.geometry as unknown as { morphAttributes?: object }).morphAttributes ?? {},
        ).length &&
        !mesh.children.length &&
        !mesh.customDepthMaterial &&
        !mesh.customDistanceMaterial &&
        mesh.onBeforeRender === prototype.onBeforeRender &&
        mesh.onAfterRender === prototype.onAfterRender &&
        !mesh.userData.environmentEffect &&
        !mesh.userData.computerScreen &&
        !mesh.userData.televisionScreen,
    );
  }

  /* ── 渲染期接管 ── */

  function restoreBatches() {
    for (const mesh of hiddenMeshes) mesh.visible = true;
    for (const proxy of addedProxies) proxy.removeFromParent();
    (hiddenMeshes.length = 0), (addedProxies.length = 0);
  }

  const originalRender = renderer.render,
    wrappedRender = function (this: unknown, ...renderArgs: unknown[]) {
      const previousHidden = hiddenMeshes.slice(),
        previousProxies = addedProxies.slice();
      restoreBatches();
      try {
        return originalRender.apply(this, renderArgs);
      } finally {
        if ((restoreBatches(), !disposed)) {
          for (const mesh of previousHidden) {
            mesh.visible = false;
            hiddenMeshes.push(mesh);
          }
          for (const proxy of previousProxies) {
            scene.add(proxy);
            addedProxies.push(proxy);
          }
        }
      }
    };
  renderer.render = wrappedRender;

  /* ── 统计与预算 ── */

  function recomputeStats() {
    stats.activeBytes = stats.cachedBytes = stats.ready = 0;
    for (const record of recordByKey.values())
      record.refs ? (stats.activeBytes += record.bytes) : (stats.cachedBytes += record.bytes);
    for (const group of groupByKey.values()) if (group.proxy) stats.ready++;
    stats.pending = pendingJobs.length;
  }

  function disposeRecord(record: GeometryRecord) {
    record.geometry.dispose();
    recordByKey.delete(record.key);
    stats.bytes -= record.bytes;
    stats.geometryDisposals++;
    stats.evictions++;
  }

  /** 按 LRU 逐出没人用的几何缓存，直到新需求放得下。 */
  function evict(neededBytes = 0, neededSlots = 0) {
    recomputeStats();
    const reclaimable = [...recordByKey.values()]
      .filter((record) => !record.refs)
      .sort((left, right) => left.used - right.used);
    for (const record of reclaimable) {
      if (
        stats.cachedBytes <= maxCachedBytes &&
        stats.bytes + neededBytes <= maxBytes &&
        recordByKey.size + pendingJobs.length + neededSlots <= MAX_CACHED_GROUPS
      )
        break;
      stats.cachedBytes -= record.bytes;
      disposeRecord(record);
    }
  }

  function cancelSchedule() {
    if (!scheduledHandle) return;
    cancel(scheduledHandle);
    scheduledHandle = null;
  }

  function cancelJob(job: BuildJob) {
    const jobIndex = pendingJobs.indexOf(job);
    if (jobIndex < 0) return;
    (pendingJobs.splice(jobIndex, 1),
      jobByCacheKey.delete(job.cacheKey),
      job.iterator?.return?.(undefined as never),
      (stats.bytes -= job.bytes),
      (stats.pendingBytes -= job.bytes));
    if (job.started) stats.geometryDisposals++;
    for (const group of job.groups) group.job = null;
    (job.groups.clear(), stats.cancelled++);
  }

  /** 把一个分组的代理撤下来；分片任务没人要了就一起取消。 */
  function detachGroup(group: RenderGroup) {
    group.proxy?.removeFromParent();
    if (group.job) {
      const job = group.job;
      ((group.job = null),
        job.groups.delete(group),
        group.warm || job.visibleGroups--,
        job.groups.size || cancelJob(job));
    }
    if (!group.proxy) return;
    if (group.record) {
      group.record.refs--;
      group.record.used = ++usedCounter;
    } else group.proxy.dispose?.();
    (group.proxy = null), stats.retired++;
  }

  function cancelPrewarm() {
    (prewarm?.iterator.return?.(undefined as never),
      (prewarm = null),
      (prewarmRoots = []),
      (prewarmRevision = requestedPrewarmRevision = null));
    for (const group of warmGroups) detachGroup(group);
    (warmGroups.clear(), pendingJobs.length || cancelSchedule(), recomputeStats());
  }

  function clearAll() {
    (restoreBatches(), cancelSchedule(), cancelPrewarm());
    for (const group of groupByKey.values()) detachGroup(group);
    (groupByKey.clear(),
      (frameByNode = new WeakMap()),
      (validCandidates = []),
      (lastVisiblePairs = []),
      (validatedRevision = null),
      recomputeStats());
  }

  /* ── 候选与指纹 ── */

  function makeCandidate(mesh: Object3DLike): Candidate | null {
    if (!isBatchable(mesh)) return null;
    let owner: Object3DLike | null = mesh;
    while (owner && !owner.userData.environmentModelId) owner = owner.parent;
    if (!owner) return null;
    return {
      mesh,
      floor: owner.userData.environmentFloorId as FloorId,
      matrix: new three.Matrix4(),
      transformSeen: false,
      transformSafe: false,
      rev: 0,
      geo: null,
      mat: null,
      materialRef: null,
      props: "",
      key: "",
    };
  }

  function prepare(root: Object3DLike | null, revisionToken?: unknown) {
    if (disposed || (preparedRoot === root && preparedRevisionToken === revisionToken)) return;
    (clearAll(),
      (preparedRoot = root),
      (preparedRevisionToken = revisionToken),
      (candidates = []));
    root?.traverse((node) => {
      const candidate = makeCandidate(node);
      if (candidate) candidates.push(candidate);
    });
    stats.candidates = candidates.length;
  }

  /** 矩阵是否只含旋转 + 均匀缩放：斜切/非均匀缩放会让相对矩阵分解失真。 */
  function isOrthogonalMatrix(matrix: Matrix4Like) {
    if (matrix.determinant() <= 0) return false;
    const elements = matrix.elements,
      axisLength = (offset: number) =>
        Math.hypot(elements[offset], elements[offset + 1], elements[offset + 2]);
    for (const [firstAxis, secondAxis] of [
      [0, 4],
      [0, 8],
      [4, 8],
    ]) {
      if (
        Math.abs(
          elements[firstAxis] * elements[secondAxis] +
            elements[firstAxis + 1] * elements[secondAxis + 1] +
            elements[firstAxis + 2] * elements[secondAxis + 2],
        ) >
        axisLength(firstAxis) * axisLength(secondAxis) * 1e-7
      )
        return false;
    }
    return true;
  }

  /** 楼层根的世界矩阵 / 逆矩阵按 epoch 缓存：一帧内多次取同一个楼层根只算一次。 */
  function frameFor(node: Object3DLike): FrameRecord {
    let frame = frameByNode.get(node);
    frame ||
      ((frame = {
        node,
        id: ++idCounter,
        world: new three.Matrix4(),
        inverse: new three.Matrix4(),
        safe: false,
        epoch: -1,
      }),
      frameByNode.set(node, frame));
    if (frame.epoch !== epoch) {
      frame.world.copy(node.matrixWorld);
      frame.safe = isOrthogonalMatrix(frame.world);
      frame.inverse.copy(frame.world).invert();
      frame.epoch = epoch;
    }
    return frame;
  }

  function geometryDescriptor(
    geometry: GeometryLike,
    perFrame: Map<GeometryLike, GeometryDescriptor>,
  ) {
    const cachedInFrame = perFrame.get(geometry);
    if (cachedInFrame) return cachedInFrame;
    const reused = geometryDescriptorByGeometry.get(geometry);
    const stillSame = Boolean(
      reused &&
      reused.attributes === geometry.attributes &&
      reused.count === Object.keys(geometry.attributes).length &&
      reused.index === geometry.index &&
      reused.indexVersion === geometry.index?.version &&
      reused.indexArray === geometry.index?.array &&
      reused.start === geometry.drawRange.start &&
      reused.range === geometry.drawRange.count &&
      reused.descriptors.every((entry) => {
        const attribute = geometry.attributes[entry.name];
        return (
          attribute === entry.ref &&
          attribute.version === entry.version &&
          attribute.array === entry.array &&
          attribute.count === entry.count &&
          attribute.itemSize === entry.size &&
          attribute.normalized === entry.normalized
        );
      }),
    );
    if (stillSame && reused) {
      perFrame.set(geometry, reused);
      return reused;
    }
    const sortedAttributes = Object.entries(geometry.attributes).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
      position = geometry.attributes.position,
      normal = geometry.attributes.normal,
      tangent = geometry.attributes.tangent,
      // 能否合并取决于：position/normal/tangent 的 itemSize、完整 drawRange、全部属性等长同型。
      canMerge =
        position.itemSize === 3 &&
        (!normal || normal.itemSize === 3) &&
        (!tangent || tangent.itemSize === 4) &&
        geometry.drawRange.start === 0 &&
        geometry.drawRange.count >= (geometry.index?.count ?? position.count) &&
        sortedAttributes.every(
          ([, attribute]) =>
            !attribute.isInterleavedBufferAttribute &&
            !attribute.isGLBufferAttribute &&
            attribute.array &&
            attribute.itemSize <= 4 &&
            attribute.count === position.count,
        ),
      schema = JSON.stringify([
        !!geometry.index,
        sortedAttributes.map(([name, attribute]) => [
          name,
          attribute.itemSize,
          attribute.normalized,
          attribute.array?.constructor.name,
        ]),
      ]);
    const descriptor: GeometryDescriptor = {
      attributes: geometry.attributes,
      count: sortedAttributes.length,
      index: geometry.index,
      indexVersion: geometry.index?.version,
      indexArray: geometry.index?.array,
      start: geometry.drawRange.start,
      range: geometry.drawRange.count,
      descriptors: sortedAttributes.map(([name, attribute]) => ({
        name,
        ref: attribute,
        version: attribute.version,
        array: attribute.array,
        count: attribute.count,
        size: attribute.itemSize,
        normalized: attribute.normalized,
      })),
      token: ++idCounter,
      canMerge,
      schema,
    };
    (geometryDescriptorByGeometry.set(geometry, descriptor), perFrame.set(geometry, descriptor));
    return descriptor;
  }

  function materialSignature(
    material: MaterialLike,
    perFrame: Map<MaterialLike, string | null>,
  ): string | null | undefined {
    if (perFrame.has(material)) return perFrame.get(material);
    let signature: string | null = null;
    if (
      material.visible &&
      !material.transparent &&
      material.opacity === 1 &&
      !((material.transmission ?? 0) > 0) &&
      !((material.alphaTest ?? 0) > 0) &&
      !material.clippingPlanes?.length &&
      !material.displacementMap &&
      !material.isShaderMaterial &&
      !material.isRawShaderMaterial
    ) {
      let source = material,
        environmentState: string | null = "";
      if (material.environmentSourceMaterial) {
        (environmentState = materialState(material)),
          (source = material.environmentSourceMaterial);
      }
      if (environmentState !== null && !source.runtimeSourceMaterial) {
        let cached = materialSignatureByMaterial.get(material);
        const color = material.color,
          emissive = material.emissive;
        if (
          !cached ||
          cached.source !== source ||
          !deepEqual(cached.state, environmentState) ||
          cached.r !== color?.r ||
          cached.g !== color?.g ||
          cached.b !== color?.b ||
          cached.er !== emissive?.r ||
          cached.eg !== emissive?.g ||
          cached.eb !== emissive?.b ||
          MATERIAL_PROPERTY_KEYS.some((key) => cached!.props[key] !== material[key]) ||
          MATERIAL_TEXTURE_KEYS.some((key) => cached!.props[key] !== material[key])
        ) {
          const props: Record<string, unknown> = {};
          for (const key of MATERIAL_PROPERTY_KEYS) props[key] = material[key];
          for (const key of MATERIAL_TEXTURE_KEYS) props[key] = material[key];
          cached = {
            source,
            state: cloneValue(environmentState),
            props,
            signature: JSON.stringify([
              source.uuid,
              environmentState,
              color?.toArray(),
              emissive?.toArray(),
              MATERIAL_PROPERTY_KEYS.map((key) => material[key]),
              MATERIAL_TEXTURE_KEYS.map((key) => readTextureUuid(material[key])),
            ]),
            r: color?.r,
            g: color?.g,
            b: color?.b,
            er: emissive?.r,
            eg: emissive?.g,
            eb: emissive?.b,
          };
          materialSignatureByMaterial.set(material, cached);
        }
        signature = cached.signature;
      }
    }
    perFrame.set(material, signature);
    return signature;
  }

  function frustumFor(mesh: Object3DLike, floor: FloorId, camera: CameraLike | null) {
    if (!frustumByFloor.has(floor)) {
      const floorCamera = getCamera(mesh, camera);
      frustumByFloor.set(
        floor,
        new three.Frustum().setFromProjectionMatrix(
          new three.Matrix4().multiplyMatrices(
            floorCamera.projectionMatrix,
            floorCamera.matrixWorldInverse,
          ),
        ),
      );
    }
    return frustumByFloor.get(floor)!;
  }

  /* ── 代理生成 ── */

  function buildProxy(group: RenderGroup, geometry: GeometryLike, record: GeometryRecord | null) {
    const firstMesh = group.entries[0].mesh,
      proxy = record
        ? new three.Mesh(geometry as unknown, firstMesh.material as unknown)
        : new three.InstancedMesh(
            firstMesh.geometry as unknown,
            firstMesh.material as unknown,
            group.entries.length,
          );
    if (record) {
      record.refs++;
      record.used = ++usedCounter;
      proxy.matrix.makeTranslation(
        group.anchor![0] - record.anchor[0],
        group.anchor![1] - record.anchor[1],
        group.anchor![2] - record.anchor[2],
      );
    } else {
      group.entries.forEach((entry, instanceIndex) =>
        proxy.setMatrixAt?.(instanceIndex, entry.matrix),
      );
      if (proxy.instanceMatrix) proxy.instanceMatrix.needsUpdate = true;
      stats.matrixUploads++;
    }
    ((proxy.name = record ? "prepared-static-parts" : "prepared-static-instances"),
      (proxy.userData.interactionRenderProxy = true),
      (proxy.matrixAutoUpdate = false),
      (proxy.frustumCulled = false),
      (proxy.castShadow = firstMesh.castShadow),
      (proxy.receiveShadow = firstMesh.receiveShadow),
      (proxy.layers.mask = firstMesh.layers.mask),
      (proxy.renderOrder = firstMesh.renderOrder),
      (proxy.userData.floorId = group.entries[0].floor),
      (proxy.userData.environmentFloorId = group.entries[0].floor),
      // 局部矩阵两条路径都要留：`begin()` 每帧用它把代理摆回楼层根坐标系。
      (group.localMatrix = proxy.matrix.clone()),
      (group.proxy = proxy),
      (group.record = record),
      stats.allocations++,
      stats.groupBuilds++);
  }

  /* ── 分片调度 ── */

  function scheduleIfNeeded() {
    if (disposed || scheduledHandle || (!pendingJobs.length && !prewarm)) return;
    if (!available()) return;
    if (
      !(pendingJobs.some((job) => job.visibleGroups > 0) || idleAvailable())
    )
      return;
    scheduledHandle = schedule(runSlice);
  }

  function runSlice(deadline: DeadlineLike) {
    scheduledHandle = null;
    if (disposed || !available()) return;
    const sliceStarted = now();
    let builtSomething = false,
      activeJob: BuildJob | null = null;
    stats.slices++;
    try {
      while (
        now() - sliceStarted < sliceMs &&
        (deadline.didTimeout || deadline.timeRemaining() > SLICE_IDLE_BUDGET_MS)
      ) {
        if ((prewarm || warmGroups.size) && prewarmRevision !== getStaticRevision?.())
          cancelPrewarm();
        const job = (activeJob =
          pendingJobs.find((candidateJob) => candidateJob.visibleGroups > 0) ||
          (pendingJobs.length && idleAvailable() ? pendingJobs[0] : null));
        if (!job) {
          if (!prewarm || !idleAvailable()) break;
          prewarm.iterator.next().done && (prewarm = null);
          continue;
        }
        if (!job.started) {
          // 生成器第一次 next 才真正分配缓冲，所以「开始烘焙」的计数放在这里。
          (job.started = true), stats.geometryAllocations++;
          job.iterator = bakeIncrementally(three, job.inputs) as unknown as Generator<
            void,
            GeometryLike,
            undefined
          >;
        }
        const step = job.iterator!.next();
        if (!step.done) continue;
        (pendingJobs.splice(pendingJobs.indexOf(job), 1),
          jobByCacheKey.delete(job.cacheKey),
          (stats.pendingBytes -= job.bytes));
        const record: GeometryRecord = {
          key: job.cacheKey,
          geometry: step.value,
          bytes: job.bytes,
          refs: 0,
          used: ++usedCounter,
          anchor: job.anchor,
        };
        recordByKey.set(record.key, record);
        for (const group of job.groups) {
          group.job = null;
          if (group.warm) (warmGroups.delete(group), stats.warmReady++);
          else (buildProxy(group, record.geometry, record), (builtSomething = true));
        }
        job.groups.clear();
      }
    } catch (error) {
      // 烘焙失败只影响当前这一个任务：撤回它，其余候选下一帧还会重新发起。
      activeJob ? (cancelJob(activeJob), stats.fallbacks++) : cancelPrewarm();
      stats.lastError = String(error);
      console.error("Incremental geometry build failed", error);
    } finally {
      const sliceDuration = now() - sliceStarted;
      ((stats.workMs += sliceDuration),
        (stats.maxSliceMs = Math.max(stats.maxSliceMs, sliceDuration)),
        evict(),
        recomputeStats(),
        builtSomething && requestFrame(),
        scheduleIfNeeded());
    }
  }

  /* ── 分组与烘焙 ── */

  function createGroup(key: string, entries: Candidate[], warm = false): RenderGroup | null {
    const group: RenderGroup = {
      key,
      warm,
      entries: entries.slice(),
      versions: entries.map((entry) => entry.rev),
      proxy: null,
      record: null,
      job: null,
      uncullable: entries.some((entry) => !entry.mesh.frustumCulled),
    };
    const mergeable =
      merge &&
      entries.every(
        (entry) =>
          entry.bake &&
          entry.geo?.canMerge &&
          (["position", "normal", "tangent"] as const).every((attributeName) => {
            const attribute = entry.mesh.geometry.attributes[attributeName];
            return (
              !attribute ||
              (attribute.array instanceof Float32Array && !attribute.normalized)
            );
          }),
      );
    if (!mergeable) {
      if (warm) return null;
      // 不能烘焙时退回 0.8.0 的行为：只有同一份 geometry 才用 InstancedMesh 合并。
      if (entries.every((entry) => entry.mesh.geometry === entries[0].mesh.geometry)) {
        buildProxy(group, entries[0].mesh.geometry, null);
        return group;
      }
      stats.fallbacks++;
      return null;
    }
    const inputs: BakeSource[] = entries.map((entry) => ({
      geometry: entry.mesh.geometry as unknown as BakeSource["geometry"],
      matrix: entry.matrix.clone() as unknown as BakeSource["matrix"],
      box: (entry.mesh.geometry.boundingBox ?? null) as unknown as BakeSource["box"],
    }));
    group.anchor = Array.from(inputs[0].matrix.elements as ArrayLike<number>).slice(12, 15);
    // 内容键：几何 token + 相对锚点的矩阵。锚点抵消楼层整体位移，键因此可跨楼层复用。
    const cacheKey = JSON.stringify(
        entries.map((entry, entryIndex) => {
          const elements = Array.from(inputs[entryIndex].matrix.elements as ArrayLike<number>);
          for (let axis = 0; axis < 3; axis++) elements[12 + axis] -= group.anchor![axis];
          return [entry.geo!.token, elements];
        }),
      ),
      cachedRecord = recordByKey.get(cacheKey);
    if (cachedRecord) {
      if (!warm) (stats.cacheHits++, buildProxy(group, cachedRecord.geometry, cachedRecord));
      return group;
    }
    const runningJob = jobByCacheKey.get(cacheKey);
    if (runningJob) {
      ((group.job = runningJob),
        runningJob.groups.add(group),
        warm || runningJob.visibleGroups++);
      return group;
    }
    const estimatedBytes = mergedBytes(inputs);
    if (warm) {
      recomputeStats();
      if (
        stats.bytes + estimatedBytes > maxBytes ||
        stats.cachedBytes + stats.pendingBytes + estimatedBytes > maxCachedBytes ||
        recordByKey.size + pendingJobs.length >= MAX_CACHED_GROUPS
      ) {
        stats.warmSkipped++;
        return null;
      }
    } else {
      // 前台任务优先：可回收的先回收，还放不下就取消没有可见分组的后台任务。
      for (const pendingJob of [...pendingJobs]) {
        if (
          stats.bytes + estimatedBytes <= maxBytes &&
          recordByKey.size + pendingJobs.length < MAX_CACHED_GROUPS
        )
          break;
        pendingJob.visibleGroups || cancelJob(pendingJob);
      }
      evict(estimatedBytes, 1);
    }
    if (
      stats.bytes + estimatedBytes > maxBytes ||
      recordByKey.size + pendingJobs.length >= MAX_CACHED_GROUPS
    ) {
      stats.fallbacks++;
      return null;
    }
    (stats.cacheMisses++,
      (stats.bytes += estimatedBytes),
      (stats.pendingBytes += estimatedBytes),
      (group.job = {
        groups: new Set([group]),
        visibleGroups: warm ? 0 : 1,
        anchor: group.anchor!,
        inputs,
        cacheKey,
        bytes: estimatedBytes,
        started: false,
        iterator: null,
      }),
      pendingJobs.push(group.job),
      jobByCacheKey.set(cacheKey, group.job));
    return group;
  }

  /** 用这一帧的可见候选重建分组表；内容没变的分组原样留着（代理没重建）。 */
  function rebuildGroups(visible: Candidate[]) {
    const byKey = new Map<string, Candidate[]>();
    for (const candidate of visible)
      (byKey.has(candidate.key) || byKey.set(candidate.key, []),
        byKey.get(candidate.key)!.push(candidate));
    for (const [key, group] of groupByKey) {
      const current = byKey.get(key),
        stale =
          !current ||
          current.length < 2 ||
          current.length !== group.entries.length ||
          current.some(
            (candidate, index) =>
              candidate !== group.entries[index] || candidate.rev !== group.versions[index],
          );
      stale && (detachGroup(group), groupByKey.delete(key));
    }
    const keptKeys = new Set<string>();
    for (const [key, current] of byKey) {
      if (current.length < 2) continue;
      let group = groupByKey.get(key);
      const stale =
        !group ||
        current.length !== group.entries.length ||
        current.some(
          (candidate, index) =>
            candidate !== group!.entries[index] || candidate.rev !== group!.versions[index],
        );
      if (stale) {
        if (group) (detachGroup(group), groupByKey.delete(key));
        group = createGroup(key, current) ?? undefined;
        if (group) groupByKey.set(key, group);
      }
      if (group) keptKeys.add(key);
    }
    for (const [key, group] of groupByKey)
      keptKeys.has(key) || (detachGroup(group), groupByKey.delete(key));
    (lastVisiblePairs = visible.map((candidate) => [candidate, candidate.rev]),
      stats.rebuilds++,
      evict(),
      recomputeStats(),
      scheduleIfNeeded());
  }

  /* ── 逐候选校验 ── */

  function validateCandidate(
    candidate: Candidate,
    materialSignatures: Map<MaterialLike, string | null>,
    geometryDescriptors: Map<GeometryLike, GeometryDescriptor>,
  ) {
    const mesh = candidate.mesh;
    if (
      !isBatchable(mesh) ||
      isDynamicObject(mesh) ||
      !isVisibleInTree(mesh) ||
      !mesh.layers.mask
    )
      return false;
    const floorRoot = getFloorRoot?.(candidate.floor, mesh) ?? null,
      frame = frameFor(floorRoot || (scene as unknown as Object3DLike));
    if (!frame.safe) return false;
    if (floorRoot) {
      // 相对楼层根：楼层整体位移只影响 frame.world，不用重烘焙。
      floorLocalMatrix.copy(mesh.matrix);
      let ancestor: Object3DLike | null = mesh.parent;
      for (; ancestor && ancestor !== floorRoot; ancestor = ancestor.parent)
        floorLocalMatrix.premultiply(ancestor.matrix);
      if (ancestor !== floorRoot) return false;
    } else floorLocalMatrix.multiplyMatrices(frame.inverse, mesh.matrixWorld);
    if (
      (!candidate.transformSeen || !candidate.matrix.equals(floorLocalMatrix)) &&
      ((candidate.matrix.copy(floorLocalMatrix), (candidate.transformSeen = true)),
      (candidate.transformSafe = isOrthogonalMatrix(candidate.matrix)),
      candidate.rev++),
      !candidate.transformSafe
    )
      return false;
    const signature = materialSignature(mesh.material, materialSignatures);
    if (signature === null || signature === undefined) return false;
    const descriptor = geometryDescriptor(mesh.geometry, geometryDescriptors),
      // 材质自己实现了 onBeforeCompile（且不是区域材质）时，烘焙出来的几何会缺那段注入。
      bakeable =
        !Object.prototype.hasOwnProperty.call(mesh.material, "onBeforeCompile") ||
        Boolean(
          mesh.material.userData?.plan2RegionMaterial ||
            mesh.material.environmentSourceMaterial?.userData?.plan2RegionMaterial,
        ),
      elements = candidate.matrix.elements,
      // 空间分格：只允许同一格里的合批，否则整个户型会合成一个巨大代理。
      cell = merge
        ? String(
            Math.floor(elements[12] / SPATIAL_CELL_METERS) +
              "," +
              Math.floor(elements[14] / SPATIAL_CELL_METERS),
          )
        : "",
      props = [
        frame.id,
        mesh.layers.mask,
        mesh.renderOrder,
        Number(mesh.castShadow),
        Number(mesh.receiveShadow),
        Number(mesh.frustumCulled),
        cell,
      ].join("/");
    if (
      candidate.geo === descriptor &&
      candidate.mat === signature &&
      candidate.props === props &&
      candidate.materialRef === mesh.material &&
      candidate.bake === bakeable
    )
      return true;
    ((candidate.geo = descriptor),
      (candidate.mat = signature),
      (candidate.materialRef = mesh.material),
      (candidate.props = props),
      (candidate.bake = bakeable),
      (candidate.frame = frame),
      candidate.rev++,
      (candidate.key = JSON.stringify([
        candidate.floor,
        merge && bakeable && descriptor.canMerge ? descriptor.schema : mesh.geometry.uuid,
        signature,
        props,
      ])));
    return true;
  }

  /* ── 每帧驱动 ── */

  function begin(camera: CameraLike | null = null) {
    if ((restoreBatches(), (stats.batches = stats.savedDraws = 0), disposed)) return;
    (sceneInverse.copy(scene.matrixWorld).invert(), frustumByFloor.clear(), epoch++);
    const materialSignatures = new Map<MaterialLike, string | null>(),
      geometryDescriptors = new Map<GeometryLike, GeometryDescriptor>(),
      staticRevision = getStaticRevision?.();
    (prewarm || warmGroups.size) &&
      getStaticRevision &&
      prewarmRevision !== staticRevision &&
      cancelPrewarm();
    const visible: Candidate[] = [];
    if (
      getStaticRevision &&
      validatedRevision !== null &&
      staticRevision === validatedRevision
    ) {
      // 静态版本没变：跳过逐网格校验，直接用上一帧的候选集（只重做视锥剔除）。
      stats.fastFrames++;
      for (const candidate of validCandidates)
        (merge ||
          !camera ||
          !candidate.mesh.frustumCulled ||
          frustumFor(candidate.mesh, candidate.floor, camera).intersectsObject(
            candidate.mesh,
          )) &&
          visible.push(candidate);
    } else {
      stats.validations++;
      validCandidates = [];
      for (const candidate of candidates) {
        if (!validateCandidate(candidate, materialSignatures, geometryDescriptors)) continue;
        validCandidates.push(candidate);
        (merge ||
          !camera ||
          !candidate.mesh.frustumCulled ||
          frustumFor(candidate.mesh, candidate.floor, camera).intersectsObject(
            candidate.mesh,
          )) &&
          visible.push(candidate);
      }
      validatedRevision = staticRevision;
    }
    visible.length !== lastVisiblePairs.length ||
    visible.some(
      (candidate, index) =>
        candidate !== lastVisiblePairs[index][0] ||
        candidate.rev !== lastVisiblePairs[index][1],
    )
      ? rebuildGroups(visible)
      : stats.reusedFrames++;
    for (const group of groupByKey.values()) {
      const proxy = group.proxy;
      if (!proxy) continue;
      const frame = frameFor(group.entries[0].frame!.node);
      if (!frame.safe) continue;
      (proxy.matrix.multiplyMatrices(sceneInverse, frame.world).multiply(group.localMatrix!),
        proxy.matrixWorld.multiplyMatrices(scene.matrixWorld, proxy.matrix));
      const inFrustum =
        !merge ||
        !camera ||
        group.uncullable ||
        frustumFor(proxy, group.entries[0].floor, camera).intersectsObject(proxy);
      for (const entry of group.entries) (entry.mesh.visible = false), hiddenMeshes.push(entry.mesh);
      (inFrustum && (scene.add(proxy), addedProxies.push(proxy), stats.batches++),
        (stats.savedDraws += group.entries.length - (inFrustum ? 1 : 0)));
    }
    groupByKey.size || (evict(), recomputeStats());
    scheduleIfNeeded();
  }

  /* ── 预热 ── */

  function* walkNodes(node: Object3DLike): Generator<Object3DLike, void, undefined> {
    yield node;
    for (const child of node.children) yield* walkNodes(child);
  }

  /** 预热扫描：只把「会变成合并分组」的几何烘焙进缓存，不生成任何代理。 */
  function* prewarmScan(roots: Object3DLike[]): Generator<void, void, undefined> {
    const materialSignatures = new Map<MaterialLike, string | null>(),
      geometryDescriptors = new Map<GeometryLike, GeometryDescriptor>();
    stats.warmScans++;
    for (const root of roots) {
      const byKey = new Map<string, Candidate[]>();
      for (const node of walkNodes(root)) {
        const candidate = makeCandidate(node);
        stats.warmVisited++;
        if (
          candidate &&
          validateCandidate(candidate, materialSignatures, geometryDescriptors) &&
          (byKey.has(candidate.key) || byKey.set(candidate.key, []),
          byKey.get(candidate.key)!.push(candidate))
        )
          yield;
        else yield;
      }
      for (const [key, entries] of byKey) {
        if (entries.length > MAX_WARM_GROUP_SIZE) {
          stats.warmSkipped++;
          yield;
          continue;
        }
        if (entries.length > 1) {
          const group = createGroup(key, entries, true);
          group?.job && warmGroups.add(group);
        }
        yield;
      }
    }
  }

  function prewarmFloors(roots: Object3DLike[], revision?: unknown) {
    if (disposed || !getStaticRevision) return;
    if (
      requestedPrewarmRevision === revision &&
      roots.length === prewarmRoots.length &&
      roots.every((root, index) => root === prewarmRoots[index])
    ) {
      scheduleIfNeeded();
      return;
    }
    (cancelPrewarm(),
      (prewarmRoots = roots.slice()),
      (requestedPrewarmRevision = revision));
    if (roots.length) {
      prewarmRevision = getStaticRevision();
      prewarm = { iterator: prewarmScan(prewarmRoots) };
    }
    scheduleIfNeeded();
  }

  return {
    prepare,
    begin,
    restore: restoreBatches,
    prewarm: prewarmFloors,
    cancelPrewarm,
    stats,
    dispose() {
      if (disposed) return;
      ((disposed = true), clearAll());
      for (const record of [...recordByKey.values()]) disposeRecord(record);
      (recomputeStats(),
        (candidates = []),
        (preparedRoot = null),
        (preparedRevisionToken = null),
        (materialSignatureByMaterial = new WeakMap()),
        (geometryDescriptorByGeometry = new WeakMap()),
        (frameByNode = new WeakMap()),
        renderer.render === wrappedRender && (renderer.render = originalRender));
    },
  };
}
