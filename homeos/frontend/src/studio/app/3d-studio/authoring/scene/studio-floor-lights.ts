/**
 * 分层灯光缓冲（上游 `studio-floor-lights.js`，0.8.1 新增）。
 *
 * ## 为什么需要它
 *
 * 户型里每层都有自己的吸顶灯/射灯，但 three 的灯光是全局的：切到 2 层时，1 层的灯仍然
 * 在照亮 2 层的家具，表现为「隔层漏光」。0.8.0 的做法是切层时改 `light.layers` 逐个开关，
 * 楼层一多就要遍历上百次，而且**同一层内的多盏灯仍然各自是一次 draw 的 uniform 上传**。
 *
 * 0.8.1 改成「按楼层打包成一个 UBO」：
 *
 * - 每层一个缓冲，头部 4 个 float 是计数（射灯数 / 面光数 / 当前层号 / 太阳光下标），
 *   之后每盏灯 40 个 float（10 个 `vec4`），尾部 36 个 float 是方向光（9 个 `vec4`）；
 * - 材质里用 `layout(std140) uniform UserFloorLights` 一次绑定，所有材质共享同一份数据，
 *   不再为每盏灯传 uniform，也不再占 varying；
 * - 灯对象自身的 `layers.mask` 被清 0（让它不参与 three 的常规光照路径），改由本模块按
 *   楼层手动绑定 —— 这正是「隔层不漏光」的来源。
 *
 * ## 差异上传
 *
 * 每层缓冲额外维护一份 `uploaded` 影子数组，只把**变化过的那一段** `bufferSubData` 上去。
 * 房子里的灯绝大多数帧都不动，所以每帧实际上只传头部的 4 个 float。
 *
 * 容量为 0（WebGL1 / 驱动不给大块）时 `enabled` 恒为 false，调用方退回 0.8.0 的逐灯路径。
 *
 * 本项目的 three 是浏览器直载的外部模块，编译期只有宽泛的影子声明，所以这里用最小结构化
 * 接口描述用到的部分。
 */

/** `THREE.Matrix4` 的最小契约。 */
export interface FloorMatrix4 {
  elements: ArrayLike<number> & { [index: number]: number };
  copy(matrix: FloorMatrix4): FloorMatrix4;
  clone(): FloorMatrix4;
  multiply(matrix: FloorMatrix4): FloorMatrix4;
  multiplyMatrices(first: FloorMatrix4, second: FloorMatrix4): FloorMatrix4;
  invert(): FloorMatrix4;
  identity(): FloorMatrix4;
  extractRotation(matrix: FloorMatrix4): FloorMatrix4;
  premultiply(matrix: FloorMatrix4): FloorMatrix4;
  toArray(array: Float32Array, offset?: number): number[];
  equals(matrix: FloorMatrix4): boolean;
}

export interface FloorVector4 {
  toArray(array: Float32Array, offset?: number): number[];
}

/** 场景里会被本模块读写的节点（灯光 / 网格 / 楼层锚点）。 */
export interface FloorLightNode {
  userData?: Record<string, unknown>;
  parent?: FloorLightNode | null;
  children?: FloorLightNode[];
  visible?: boolean;
  layers?: { mask: number; test(mask: number): boolean };
  isMesh?: boolean;
  isSpotLight?: boolean;
  isRectAreaLight?: boolean;
  isDirectionalLight?: boolean;
  castShadow?: boolean;
  intensity?: number;
  distance?: number;
  angle?: number;
  penumbra?: number;
  decay?: number;
  color?: { r: number; g: number; b: number };
  width?: number;
  height?: number;
  matrixWorld?: FloorMatrix4;
  target?: { matrixWorld?: FloorMatrix4 };
  traverse(callback: (node: FloorLightNode) => void): void;
  updateWorldMatrix?(updateParents: boolean, updateChildren: boolean): void;
  addEventListener?(type: string, listener: (event: FloorChildEvent) => void): void;
  removeEventListener?(type: string, listener: (event: FloorChildEvent) => void): void;
}

export interface FloorChildEvent {
  type: string;
  child: FloorLightNode;
}

/** `THREE.PerspectiveCamera` 的最小契约。 */
export interface FloorCamera {
  matrixWorldInverse: FloorMatrix4;
  matrixWorld: FloorMatrix4;
  layers: { mask: number };
}

/** 射灯阴影条目（由 `studio-floor-directional-shadow` / `studio-shadow-atlas` 产出）。 */
export interface FloorShadowEntry {
  matrix: FloorMatrix4;
  rect: FloorVector4;
  lightWorld?: FloorMatrix4 | null;
  bias: number;
  intensity: number;
  normalBias: number;
}

/** 方向光条目（同上）。 */
export interface FloorSunEntry {
  light: FloorLightNode;
  layer: number;
  anchor: FloorLightNode;
  anchorWorld: FloorMatrix4;
  frameFromAnchor?: FloorMatrix4 | null;
  matrix: FloorMatrix4;
  cropUv?: FloorVector4 | null;
  bias: number;
  intensity: number;
  normalBias: number;
}

export interface FloorLightsThree {
  Matrix4: new () => FloorMatrix4;
  Vector4: new (x: number, y: number, z: number, w: number) => FloorVector4;
}

export interface FloorLightGL {
  UNIFORM_BUFFER: number;
  DYNAMIC_DRAW: number;
  MAX_UNIFORM_BLOCK_SIZE: number;
  bindBufferBase?: (target: number, index: number, buffer: WebGLBuffer | null) => void;
  getParameter(parameter: number): number;
  isContextLost?(): boolean;
  createBuffer(): WebGLBuffer | null;
  deleteBuffer(buffer: WebGLBuffer): void;
  bindBuffer(target: number, buffer: WebGLBuffer | null): void;
  bufferData(target: number, size: number, usage: number): void;
  bufferSubData(
    target: number,
    offset: number,
    data: Float32Array,
    sourceOffset: number,
    length: number,
  ): void;
}

interface FloorBuffer {
  buffer: WebGLBuffer | null;
  data: Float32Array;
  uploaded: Float32Array;
  count: number;
  lights: FloorLightNode[];
}

export interface FloorLightBuffer {
  readonly capacity: number;
  /** 硬件支持且每层灯数都没超容量。 */
  readonly available: boolean;
  readonly enabled: boolean;
  prepare(sceneRoot: FloorLightNode | null): void;
  setEnabled(enabled: boolean): void;
  /** 重算并上传；返回参与光照的灯数。 */
  update(
    sceneRoot: FloorLightNode | null,
    camera: FloorCamera,
    shadowEntries: ReadonlyMap<string, FloorShadowEntry>,
    sunEntries?: ReadonlyMap<string, FloorSunEntry>,
  ): number | undefined;
  bind(
    object: FloorLightNode | null,
    sceneRoot: FloorLightNode | null,
    camera: FloorCamera,
    shadowEntries: ReadonlyMap<string, FloorShadowEntry>,
    sunEntries: ReadonlyMap<string, FloorSunEntry>,
  ): void;
  invalidateFrame(): void;
  /** 临时隐藏其它楼层（截图 / 单层导出用），`fn` 返回后恢复。 */
  withFloor<T>(object: FloorLightNode | null, sceneRoot: FloorLightNode | null, fn: () => T): T;
  release(): void;
  dispose(): void;
}

/** 每盏灯占用的 float 数（10 个 `vec4`）。 */
const FLOATS_PER_LIGHT = 40;
/** 头部 + 方向光块合起来占的 float 数（1 个 `vec4` + 9 个 `vec4`）。 */
const RESERVED_FLOATS = 40;
/**
 * 找到节点所属楼层。
 *
 * 四种字段都认：`lightFloorId`（灯自带）、`floorId`（楼层容器）、`environmentFloorId`
 * （室外环境）、`regionFloorId`（区域划分）。灯常常挂在「楼层 → 区域 → 灯具」三层里，
 * 所以必须一路往上找，而不是只看自己。
 */
export function objectFloorId(
  object: FloorLightNode | null | undefined,
): string {
  for (let node = object; node; node = node.parent) {
    const userData = node.userData || {},
      floorId =
        userData.lightFloorId || userData.floorId || userData.environmentFloorId || userData.regionFloorId;
    if (floorId) return String(floorId);
  }
  return "";
}

export function createFloorLightBuffer({
  THREE,
  gl,
}: {
  THREE: FloorLightsThree;
  gl: FloorLightGL | null | undefined;
}): FloorLightBuffer {
  // 头部 + 方向光块共 160 字节，每盏灯 160 字节；封顶 96 盏（再多就该靠阴影贴图而不是逐灯算了）。
  const capacity =
      gl && gl.bindBufferBase
        ? Math.min(
            96,
            Math.floor(((gl.getParameter(gl.MAX_UNIFORM_BLOCK_SIZE) || 0) - 160) / 160),
          )
        : 0,
    buffers = new Map<string, FloorBuffer>(),
    // 灯 → 被本模块接管前的 `layers.mask`。接管后清零，退出时逐个还原。
    savedLayerMasks = new Map<FloorLightNode, number>();
  let lastUpdatedScene: FloorLightNode | null = null,
    lastUpdatedCamera: FloorCamera | null = null,
    lastBoundBuffer: WebGLBuffer | null = null,
    userEnabled = true,
    enabled = capacity > 0,
    preparedScene: FloorLightNode | null = null,
    allFloorsFit = true,
    structureDirty = true,
    listenTargets: FloorLightNode[] = [],
    floorLights: FloorLightNode[] = [],
    floorMeshes: Array<{ object: FloorLightNode; floor: string }> = [],
    sunLightCandidates: FloorLightNode[] = [],
    interactionProxies = new Set<FloorLightNode>();
  const cameraInverse = new THREE.Matrix4(),
    scratchMatrix = new THREE.Matrix4(),
    rotationMatrix = new THREE.Matrix4();

  const isInteractionProxy = (node: FloorLightNode | null | undefined) =>
    !!node?.isMesh && node.userData?.interactionRenderProxy === true && !node.children?.length;

  const onChildChange = (event: FloorChildEvent) => {
    if (isInteractionProxy(event.child)) {
      if (event.type === "childadded") interactionProxies.add(event.child);
      else interactionProxies.delete(event.child);
    } else {
      // 非代理节点增删会改变楼层归属/灯数，只能整棵重扫。
      structureDirty = true;
    }
  };

  function detachListeners() {
    for (const target of listenTargets) {
      target.removeEventListener?.("childadded", onChildChange);
      target.removeEventListener?.("childremoved", onChildChange);
    }
    listenTargets = [];
  }

  /** 任一祖先不可见 → 这盏灯不该被算进去（点掉某个区域的显隐开关时用）。 */
  function isNodeVisible(node: FloorLightNode): boolean {
    for (let current: FloorLightNode | null | undefined = node; current; current = current.parent) {
      if (current.visible === false) return false;
    }
    return true;
  }

  function ensureBuffer(floorId: string): FloorBuffer {
    let floorBuffer = buffers.get(floorId);
    if (!floorBuffer) {
      floorBuffer = {
        buffer: null,
        data: new Float32Array(RESERVED_FLOATS + capacity * FLOATS_PER_LIGHT),
        uploaded: new Float32Array(RESERVED_FLOATS + capacity * FLOATS_PER_LIGHT),
        count: 0,
        lights: [],
      };
      buffers.set(floorId, floorBuffer);
    }
    return floorBuffer;
  }

  function upload(floorBuffer: FloorBuffer) {
    const freshBuffer = !floorBuffer.buffer;
    if (!floorBuffer.buffer) {
      floorBuffer.buffer = gl!.createBuffer();
      if (!floorBuffer.buffer) throw new Error("无法创建分层灯光缓冲");
      gl!.bindBuffer(gl!.UNIFORM_BUFFER, floorBuffer.buffer);
      gl!.bufferData(gl!.UNIFORM_BUFFER, floorBuffer.data.byteLength, gl!.DYNAMIC_DRAW);
    }
    let bound = freshBuffer;

    function uploadRange(offset: number, length: number) {
      const end = offset + length;
      if (!freshBuffer) {
        let unchanged = true;
        for (let index = offset; index < end; index++) {
          if (floorBuffer.uploaded[index] !== floorBuffer.data[index]) {
            unchanged = false;
            break;
          }
        }
        if (unchanged) return;
      }
      if (!bound) {
        gl!.bindBuffer(gl!.UNIFORM_BUFFER, floorBuffer.buffer);
        bound = true;
      }
      gl!.bufferSubData(gl!.UNIFORM_BUFFER, offset * 4, floorBuffer.data, offset, length);
      for (let index = offset; index < end; index++) floorBuffer.uploaded[index] = floorBuffer.data[index];
    }

    // 只传「头部 + 已用灯位」，尾部未用的灯位一直是 0，不必每帧重传。
    uploadRange(0, 4 + floorBuffer.count * FLOATS_PER_LIGHT);
    uploadRange(4 + capacity * FLOATS_PER_LIGHT, 36);
    if (bound) gl!.bindBuffer(gl!.UNIFORM_BUFFER, null);
  }

  /**
   * 重扫场景，收集灯 / 网格 / 方向光候选，并校正每盏灯的 `layers.mask`。
   *
   * 结构没变（同一棵树、没有 childadded/childremoved）时直接返回，避免每帧 traverse。
   */
  function prepare(sceneRoot: FloorLightNode | null) {
    if (preparedScene === sceneRoot && !structureDirty) return;
    detachListeners();
    preparedScene = sceneRoot;
    structureDirty = false;
    floorLights = [];
    floorMeshes = [];
    sunLightCandidates = [];
    interactionProxies.clear();
    const managedLights = new Set<FloorLightNode>(),
      lightCountByFloor = new Map<string, number>();
    sceneRoot?.traverse((node) => {
      // 交互代理（只用于点击判定的合并几何）不参与光照收集，但它的增删要单独跟踪。
      if (isInteractionProxy(node)) {
        interactionProxies.add(node);
        return;
      }
      listenTargets.push(node);
      node.addEventListener?.("childadded", onChildChange);
      node.addEventListener?.("childremoved", onChildChange);
      if (node.isMesh) floorMeshes.push({ object: node, floor: objectFloorId(node) });
      if (node.isDirectionalLight) sunLightCandidates.push(node);
      if ((!node.isSpotLight && !node.isRectAreaLight) || !node.userData?.lightItemId) return;
      floorLights.push(node);
      managedLights.add(node);
      const floorId = objectFloorId(node);
      lightCountByFloor.set(floorId, (lightCountByFloor.get(floorId) || 0) + 1);
      if (!savedLayerMasks.has(node)) savedLayerMasks.set(node, node.layers?.mask ?? 0);
    });

    // 已经消失的楼层（拆掉/换层）连同它的 GPU 缓冲一起回收，否则每改一次户型漏一份缓冲。
    const liveFloorIds = new Set<string>([
      "",
      ...lightCountByFloor.keys(),
      ...floorMeshes.map((mesh) => mesh.floor),
    ]);
    for (const [floorId, floorBuffer] of buffers) {
      if (liveFloorIds.has(floorId)) continue;
      if (floorBuffer.buffer) gl!.deleteBuffer(floorBuffer.buffer);
      buffers.delete(floorId);
      lastBoundBuffer = null;
    }

    allFloorsFit = [...lightCountByFloor.values()].every((count) => count <= capacity);
    enabled = userEnabled && capacity > 0 && allFloorsFit;

    // 被本模块接管的灯在启用期间 `layers.mask = 0`（不参与 three 常规光照）；
    // 一旦不再被管理（灯被删掉/换成普通灯），必须把原始 mask 还回去，否则这盏灯永远不亮。
    for (const [light, originalMask] of savedLayerMasks) {
      if (managedLights.has(light)) {
        if (light.layers) light.layers.mask = enabled ? 0 : originalMask;
      } else {
        if (light.layers) light.layers.mask = originalMask;
        savedLayerMasks.delete(light);
      }
    }
  }

  function update(
    sceneRoot: FloorLightNode | null,
    camera: FloorCamera,
    shadowEntries: ReadonlyMap<string, FloorShadowEntry>,
    sunEntries: ReadonlyMap<string, FloorSunEntry> = new Map(),
  ) {
    if (!enabled || gl!.isContextLost?.()) return;
    for (const floorBuffer of buffers.values()) {
      ((floorBuffer.count = 0), (floorBuffer.data[0] = floorBuffer.data[1] = 0), (floorBuffer.lights.length = 0));
    }
    prepare(sceneRoot);
    const cameraInverseElements = camera.matrixWorldInverse.elements;
    ((lastUpdatedScene = sceneRoot), (lastUpdatedCamera = camera), cameraInverse.copy(camera.matrixWorldInverse));

    let lightCount = 0;
    for (const light of floorLights) {
      if (
        !isNodeVisible(light) ||
        ((savedLayerMasks.get(light) ?? 0) & camera.layers.mask) === 0 ||
        !((light.intensity || 0) > 0)
      ) {
        continue;
      }
      ensureBuffer(objectFloorId(light)).lights.push(light);
    }

    for (const floorBuffer of buffers.values()) {
      // 射灯在前、面光在后：着色器按 `header.x`（射灯数）切分循环区间，顺序错了就会
      // 用 `SpotLight` 的结构去读面光的槽位。
      floorBuffer.lights.sort(
        (first, second) => Number(second.isSpotLight === true) - Number(first.isSpotLight === true),
      );
      for (const light of floorBuffer.lights) {
        const lightIndex = floorBuffer.count++;
        if (lightIndex >= capacity) throw new Error(`单层灯光超过缓冲容量 ${capacity}`);
        const data = floorBuffer.data,
          base = 4 + lightIndex * FLOATS_PER_LIGHT,
          shadowEntry = shadowEntries.get(
            `${String(light.userData?.lightFloorId || "")}:${String(light.userData?.lightItemId)}`,
          );
        if (shadowEntry) {
          scratchMatrix.copy(shadowEntry.matrix);
          if (shadowEntry.lightWorld) {
            scratchMatrix
              .multiply(shadowEntry.lightWorld)
              .multiply(rotationMatrix.copy(light.matrixWorld!).invert());
          }
          scratchMatrix.toArray(data, base);
          shadowEntry.rect.toArray(data, base + 16);
          data[base + 20] = shadowEntry.bias;
          data[base + 21] = shadowEntry.intensity;
          data[base + 22] = 1;
          data[base + 23] = shadowEntry.normalBias;
        } else {
          data.fill(0, base, base + 24);
        }

        const worldElements = light.matrixWorld!.elements,
          targetElements = light.target?.matrixWorld?.elements || worldElements,
          worldX = worldElements[12],
          worldY = worldElements[13],
          worldZ = worldElements[14],
          directionX = worldX - targetElements[12],
          directionY = worldY - targetElements[13],
          directionZ = worldZ - targetElements[14],
          viewDirectionX =
            cameraInverseElements[0] * directionX +
            cameraInverseElements[4] * directionY +
            cameraInverseElements[8] * directionZ,
          viewDirectionY =
            cameraInverseElements[1] * directionX +
            cameraInverseElements[5] * directionY +
            cameraInverseElements[9] * directionZ,
          viewDirectionZ =
            cameraInverseElements[2] * directionX +
            cameraInverseElements[6] * directionY +
            cameraInverseElements[10] * directionZ,
          directionLength = Math.hypot(viewDirectionX, viewDirectionY, viewDirectionZ) || 1;
        data[base + 24] =
          cameraInverseElements[0] * worldX +
          cameraInverseElements[4] * worldY +
          cameraInverseElements[8] * worldZ +
          cameraInverseElements[12];
        data[base + 25] =
          cameraInverseElements[1] * worldX +
          cameraInverseElements[5] * worldY +
          cameraInverseElements[9] * worldZ +
          cameraInverseElements[13];
        data[base + 26] =
          cameraInverseElements[2] * worldX +
          cameraInverseElements[6] * worldY +
          cameraInverseElements[10] * worldZ +
          cameraInverseElements[14];
        data[base + 27] = light.distance || 0;
        data[base + 28] = viewDirectionX / directionLength;
        data[base + 29] = viewDirectionY / directionLength;
        data[base + 30] = viewDirectionZ / directionLength;
        data[base + 31] = Math.cos(light.angle || 0);
        data[base + 32] = (light.color?.r || 0) * (light.intensity || 0);
        data[base + 33] = (light.color?.g || 0) * (light.intensity || 0);
        data[base + 34] = (light.color?.b || 0) * (light.intensity || 0);
        data[base + 35] = Math.cos((light.angle || 0) * (1 - (light.penumbra || 0)));
        data[base + 36] = light.decay || 0;
        if (light.isRectAreaLight) {
          // 面光没有「方向 + 圆锥」，它的槽位换成两个半轴向量（宽/高各一半）。
          const rectRotation = rotationMatrix.multiplyMatrices(camera.matrixWorldInverse, light.matrixWorld!);
          scratchMatrix.extractRotation(rectRotation);
          const rotationElements = scratchMatrix.elements,
            halfWidth = (light.width || 0) * 0.5,
            halfHeight = (light.height || 0) * 0.5;
          ((data[base + 28] = rotationElements[0] * halfWidth),
            (data[base + 29] = rotationElements[1] * halfWidth),
            (data[base + 30] = rotationElements[2] * halfWidth),
            (data[base + 36] = rotationElements[4] * halfHeight),
            (data[base + 37] = rotationElements[5] * halfHeight),
            (data[base + 38] = rotationElements[6] * halfHeight),
            (data[base + 27] = data[base + 31] = data[base + 35] = data[base + 39] = 0),
            floorBuffer.data[1]++);
        } else {
          floorBuffer.data[0]++;
        }
        lightCount += 1;
      }
    }

    // 没有灯的楼层也要有缓冲（着色器统一按 `objectFloorId` 取桶，取不到会退回 ""）。
    for (const { floor } of floorMeshes) ensureBuffer(floor);
    ensureBuffer("");

    const sunCandidates = sunLightCandidates
      .filter((light) => isNodeVisible(light) && (light.layers?.test(camera.layers.mask) ?? true))
      .sort((first, second) => Number(second.castShadow) - Number(first.castShadow));

    for (const [floorId, floorBuffer] of buffers) {
      const sunEntry = sunEntries.get(floorId),
        sunBase = 4 + capacity * FLOATS_PER_LIGHT;
      floorBuffer.data.fill(0, sunBase);
      floorBuffer.data[2] = sunEntry?.layer || 0;
      floorBuffer.data[3] = sunEntry ? sunCandidates.indexOf(sunEntry.light) : -1;
      rotationMatrix.identity();
      if (sunEntry?.frameFromAnchor) {
        // 方向光跟着楼层锚点转（旋转户型时阴影方向要一起转），但太阳的**朝向**是世界的：
        // 先取锚点旋转，再折算回世界再进相机空间。
        sunEntry.anchor.updateWorldMatrix?.(true, false);
        scratchMatrix.multiplyMatrices(sunEntry.anchor.matrixWorld!, sunEntry.frameFromAnchor);
        rotationMatrix.extractRotation(scratchMatrix);
        rotationMatrix
          .premultiply(camera.matrixWorldInverse)
          .multiply(camera.matrixWorld);
      }
      const sunRotationElements = rotationMatrix.elements;
      for (let row = 0; row < 3; row++) {
        for (let column = 0; column < 3; column++) {
          floorBuffer.data[sunBase + 24 + row * 4 + column] =
            sunRotationElements[row * 4 + column];
        }
      }
      if (sunEntry) {
        sunEntry.anchor.updateWorldMatrix?.(true, false);
        // 阴影矩阵在「锚点空间」里算，这里换算到当前相机空间。
        scratchMatrix
          .copy(sunEntry.matrix)
          .multiply(sunEntry.anchorWorld)
          .multiply(rotationMatrix.copy(sunEntry.anchor.matrixWorld!).invert());
        scratchMatrix.toArray(floorBuffer.data, sunBase);
        floorBuffer.data[sunBase + 16] = sunEntry.bias;
        floorBuffer.data[sunBase + 17] = sunEntry.intensity;
        floorBuffer.data[sunBase + 18] = 1;
        floorBuffer.data[sunBase + 19] = sunEntry.normalBias;
        (sunEntry.cropUv || new THREE.Vector4(0, 0, 1, 1)).toArray(floorBuffer.data, sunBase + 20);
      }
      upload(floorBuffer);
    }
    lastBoundBuffer = null;
    return lightCount;
  }

  function setEnabled(nextEnabled: boolean) {
    userEnabled = !!nextEnabled;
    enabled = userEnabled && capacity > 0 && allFloorsFit;
    for (const [light, originalMask] of savedLayerMasks) {
      if (light.layers) light.layers.mask = enabled ? 0 : originalMask;
    }
  }

  function release() {
    for (const floorBuffer of buffers.values()) {
      if (floorBuffer.buffer) gl!.deleteBuffer(floorBuffer.buffer);
    }
    (buffers.clear(), (lastBoundBuffer = null), (lastUpdatedScene = null), (lastUpdatedCamera = null));
  }

  function bind(
    object: FloorLightNode | null,
    sceneRoot: FloorLightNode | null,
    camera: FloorCamera,
    shadowEntries: ReadonlyMap<string, FloorShadowEntry>,
    sunEntries: ReadonlyMap<string, FloorSunEntry>,
  ) {
    if (!enabled) return;
    // 相机没动、场景没换就不用重算：切层那一下所有材质都要 `bind`，不缓存会算 N 次。
    if (
      lastUpdatedScene !== sceneRoot ||
      lastUpdatedCamera !== camera ||
      !cameraInverse.equals(camera.matrixWorldInverse)
    ) {
      update(sceneRoot, camera, shadowEntries, sunEntries);
    }
    const floorBuffer = buffers.get(objectFloorId(object)) || buffers.get("");
    if (floorBuffer?.buffer && lastBoundBuffer !== floorBuffer.buffer) {
      gl!.bindBufferBase!(gl!.UNIFORM_BUFFER, 0, floorBuffer.buffer);
      lastBoundBuffer = floorBuffer.buffer;
    }
  }

  return {
    get capacity() {
      return capacity;
    },
    get available() {
      return capacity > 0 && allFloorsFit;
    },
    get enabled() {
      return enabled;
    },
    prepare,
    setEnabled,
    update,
    bind,
    invalidateFrame() {
      ((lastUpdatedScene = null), (lastBoundBuffer = null));
    },
    withFloor<T>(object: FloorLightNode | null, sceneRoot: FloorLightNode | null, fn: () => T): T {
      prepare(sceneRoot);
      const targetFloor = objectFloorId(object),
        hiddenNodes: FloorLightNode[] = [];
      // 交互代理是合并几何，它的 `floorId` 不一定跟所在层一致，所以按 `objectFloorId` 判。
      for (const { object: mesh, floor } of floorMeshes) {
        if (mesh.visible && floor !== targetFloor) {
          hiddenNodes.push(mesh);
          mesh.visible = false;
        }
      }
      for (const proxy of interactionProxies) {
        if (proxy.visible && objectFloorId(proxy) !== targetFloor) {
          hiddenNodes.push(proxy);
          proxy.visible = false;
        }
      }
      try {
        return fn();
      } finally {
        for (const node of hiddenNodes) node.visible = true;
      }
    },
    release,
    dispose() {
      (setEnabled(false), release());
      (savedLayerMasks.clear(), detachListeners(), (preparedScene = null));
      ((floorLights = []), (floorMeshes = []), (sunLightCandidates = []), interactionProxies.clear());
    },
  };
}

/**
 * 材质 `onBeforeCompile` 里注入的 uniform 块声明。
 *
 * `capacity` 必须与 `createFloorLightBuffer` 里的容量一致：`std140` 的数组长度是编译期常量，
 * 数组开小了，灯多的楼层会在着色器里读到相邻块的数据（表现为颜色乱跳）。
 */
export function floorLightShaderPars(capacity: number): string {
  return `
#ifdef HB_FLOOR_LIGHTS
layout(std140) uniform UserFloorLights { vec4 userFloorHeader; vec4 userFloorData[${capacity * 10}]; vec4 userFloorSun[9]; };
vec4 userFloorValue(int index,int column) {return userFloorData[index*10+column];}
SpotLight getUserFloorLight(int index) {
  SpotLight light; vec4 p=userFloorValue(index,6),d=userFloorValue(index,7),c=userFloorValue(index,8);
  light.position=p.xyz;light.distance=p.w;light.direction=d.xyz;light.coneCos=d.w;
  light.color=c.rgb;light.penumbraCos=c.w;light.decay=userFloorValue(index,9).x;return light;
}
#ifdef HB_FLOOR_AREA_LIGHTS
RectAreaLight getUserFloorArea(int index) {
  RectAreaLight light;light.position=userFloorValue(index,6).xyz;light.halfWidth=userFloorValue(index,7).xyz;
  light.color=userFloorValue(index,8).xyz;light.halfHeight=userFloorValue(index,9).xyz;return light;
}
#endif
#endif
`;
}

/**
 * 直接光照循环（插在 `lights_fragment_begin` 之后）。
 *
 * 射灯用 `header.x` 做上界、面光区间从 `header.x` 到 `header.x + header.y`
 * ——这就是上面「射灯必须排在前面」的着色器侧契约。
 */
export function floorLightShaderLoop(): string {
  return `
#if defined(HB_FLOOR_LIGHTS) && defined(RE_Direct)
  for(int floorLightIndex=0;floorLightIndex<int(userFloorHeader.x);floorLightIndex++) {
    SpotLight floorLight=getUserFloorLight(floorLightIndex);
    getSpotLightInfo(floorLight,geometryPosition,directLight);
    vec4 shadowParams=userFloorValue(floorLightIndex,5);
    mat4 shadowMatrix=mat4(userFloorValue(floorLightIndex,0),userFloorValue(floorLightIndex,1),userFloorValue(floorLightIndex,2),userFloorValue(floorLightIndex,3));
    vec4 shadowCoord=shadowMatrix*(vUserShadowWorldPosition+vec4(vUserShadowWorldNormal*shadowParams.w,0.0));
    directLight.color *= (directLight.visible && receiveShadow) ? getUserSpotAtlasShadow(userFloorValue(floorLightIndex,4),shadowParams,shadowCoord) : 1.0;
    #ifdef HB_SKIP_ZERO_SPOT_LIGHT
    if(dot(directLight.color,directLight.color)>0.0) {
    #endif
    RE_Direct(directLight,geometryPosition,geometryNormal,geometryViewDir,geometryClearcoatNormal,material,reflectedLight);
    #ifdef HB_SKIP_ZERO_SPOT_LIGHT
    }
    #endif
  }
#endif
#if defined(HB_FLOOR_AREA_LIGHTS) && defined(RE_Direct_RectArea)
  for(int floorAreaIndex=int(userFloorHeader.x);floorAreaIndex<int(userFloorHeader.x+userFloorHeader.y);floorAreaIndex++) {
    RectAreaLight floorArea=getUserFloorArea(floorAreaIndex);
    RE_Direct_RectArea(floorArea,geometryPosition,geometryNormal,geometryViewDir,geometryClearcoatNormal,material,reflectedLight);
  }
#endif
`;
}
