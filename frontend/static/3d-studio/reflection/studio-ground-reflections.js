/**
 * 地面反射（Ground Reflection）模块。
 *
 * 位置：3D 工作室内嵌了「预览层场景」（previewOverlayScene），地面网格本身是一个平面，
 *   本模块为每一块地面接收面单独拍一张镜像贴图，再用一个只覆盖那块地面的透明 overlay
 *   网格把它贴回去 —— 不使用 three.js 的 reflector 类，因为需要「逐楼层、逐房间」
 *   独立控制（不同楼层的地面高度不同，用同一张镜像贴图会互相串）。
 * 对外：createGroundReflections，返回 { settings, stats, render, configure,
 *   setVisibleFloor, setOutsideFloor, setSuspended, changed, invalidate, records, dispose }。
 *
 * 渲染流程（每次 render 一次）：
 *   1. rebuildRecords：扫描场景找出地面接收面与用于「室外背景」的面，逐面建记录；
 *   2. 逐记录：把相机对镜面做镜像（updateReflectionCamera），做斜切近平面裁剪，
 *      然后离屏渲染整场景 → 反射贴图；
 *   3. 主渲染时 overlay 网格按「世界坐标 → 反射贴图 UV」的矩阵采样贴图，叠在地面之上。
 *
 * 关键约定：
 *   - 反射渲染会临时改写 renderer / scene 状态（renderTarget、viewport、scissor、
 *     clearColor、background、shadowMap.autoUpdate、matrixWorldAutoUpdate、xr）以及
 *     大量对象的 visible / material / geometry，finally 里必须逐项还原；
 *   - 反射通道与主渲染共用同一个 renderer，因此本模块必须「先于主渲染」执行
 *     （studio-app 里在 renderer.getRenderTarget() 为空时才调 render，正是这个顺序约束）；
 *   - 硬性节流：默认 30fps（settings.fps），相机没动、光照没变时直接跳过整次捕获。
 */

import { normalizeGroundReflection } from "../../bridge/reflection-settings.js";
import { createReflectionCulling } from "./studio-reflection-culling.js?v=20260920101628";
/**
 * 创建地面反射控制器（一个渲染器一份）。
 *
 * @param {function(object): void} options.syncLighting 用给定相机同步区域灯（反射通道
 *   需要按镜像相机重新算一次光照，否则反射里的房间亮度会和主画面不一致）。
 * @param {function(): string} [options.getStateKey] 外部状态签名（文档版本、环境开关等），
 *   变化即视为需要重拍。
 * @param {boolean} [options.floorLighting] 是否按楼层分别烘焙光照（true 时楼层之间的
 *   光照签名分开计算，false 时视为全局一致）。
 */
export function createGroundReflections({
  THREE: THREE,
  renderer: renderer,
  scene: scene,
  getRoot: getRoot,
  syncLighting: syncLighting,
  getFloorCamera: getFloorCamera = fallbackCamera => fallbackCamera,
  getStateKey: getStateKey = () => "",
  getSceneRevision: getSceneRevision = () => "",
  floorLighting: floorLighting = false,
  detail: detail = null,
  cull: cull = true,
  blur: blur = true,
  requestFrame: requestFrame = () => {}
}) {
  // 反射参数来自全局归一化函数（模式 / 分辨率 / 强度），fps 是本模块额外加的节流上限。
  const settings = {
    ...normalizeGroundReflection(),
    // 30fps：反射每帧要额外渲染一遍全场景，按 30fps 上限可以省掉一半开销，
    // 而地面的镜像画面变化慢，人眼几乎察觉不到降频。
    fps: 30
  };
  // 可见性剔除器（studio-reflection-culling.js）：把不可能出现在镜像画面里的网格
  // 临时隐藏，可显著减少反射通道的绘制量。
  const culling = createReflectionCulling(THREE);
  const stats = {
    captures: 0,
    renders: 0,
    lastMs: 0,
    totalMs: 0,
    allocations: 0,
    reuses: 0,
    cachedRecords: 0,
    cachedBytes: 0,
    inCapture: false
  };
  // 反射渲染会临时把半透明 / 折射材质换成「不折射」的克隆：折射材质在镜像相机下
  // 会做第二次屏幕空间折射，既慢又会产生错误的双层折射。
  const refractionFreeMaterialBySource = new WeakMap();
  // 克隆材质 → 它的 dispose 处理器，dispose 时统一注销，避免监听器泄漏。
  const disposeHandlerByClone = new Map();
  // 数组材质 → 复用数组：每次渲染都新建数组会让 three.js 误判材质变化，
  // 这里复用同一个数组对象、只改内容。
  const materialArrayEntryByInput = new WeakMap();
  // 源相机 → 镜像相机：相机对象在每帧被复用，clone 一次即可。
  const reflectionCameraBySource = new WeakMap();
  // 下面这些临时对象在闭包里建一次，避免在每帧热路径上反复 new。
  const scratchWorldPosition = new THREE.Vector3();
  const scratchWorldNormal = new THREE.Vector3();
  const scratchLookTarget = new THREE.Vector3();
  const scratchPlane = new THREE.Plane();
  const scratchPlaneVector = new THREE.Vector4();
  const scratchSignVector = new THREE.Vector4();
  const scratchProjectionMatrix = new THREE.Matrix4();
  /**
   * 克隆材质，但让所有「渲染目标纹理」 uniform 继续指向原贴图。
   *
   * 为什么不能直接 clone：three.js 的 Material.clone 会把 renderTargetTexture 也复制一份
   * 引用（有些版本甚至复制内容），而反射通道要求克隆材质继续用主通道的那张输出贴图；
   * 因此先临时把 uniform 置 null 再 clone，clone 完两边都还原。
   * 这样做也避免了 clone 期间 texture 被标记为「需要上传」而触发额外的 GPU 上传。
   */
  function cloneMaterialSharingRenderTargets(material) {
    const renderTargetUniforms = [];
    const uniforms = material.uniforms;
    if (uniforms) {
      for (const uniformName of Object.keys(uniforms)) {
        const uniform = uniforms[uniformName];
        const texture = uniform?.value;
        if (texture?.isTexture && texture.isRenderTargetTexture) {
          renderTargetUniforms.push([uniformName, texture]);
          uniform.value = null;
        }
      }
    }
    let clonedMaterial;
    try {
      clonedMaterial = material.clone();
    } finally {
      for (const [uniformName, texture] of renderTargetUniforms) {
        uniforms[uniformName].value = texture;
        if (clonedMaterial?.uniforms?.[uniformName]) {
          clonedMaterial.uniforms[uniformName].value = texture;
        }
      }
    }
    return clonedMaterial;
  }
  /**
   * 取（必要时创建）某材质的「无折射」版本。
   *
   * 触发条件：有 transmission 的玻璃，或带 alphaWallBand 的渐变墙。
   * 改动：transmission 置 0、forceSinglePass 打开（折射材质默认双面渲染两次，
   * 在只有一张贴图的反射通道里会互相覆盖），并沿用原材质的 onBeforeCompile 与
   * programCacheKey（否则区域灯注入的代码会丢失 / 程序缓存会串）。
   * 通过源材质的 dispose 事件自动回收这份克隆：源材质没了，克隆也没有存在的意义。
   */
  function getRefractionFreeMaterial(material) {
    if (!material || (!(material.transmission > 0) && !material.userData.alphaWallBand)) {
      return material;
    }
    if (!refractionFreeMaterialBySource.has(material)) {
      const refractionFreeMaterial = cloneMaterialSharingRenderTargets(material);
      refractionFreeMaterial.transmission = 0;
      refractionFreeMaterial.forceSinglePass = true;
      refractionFreeMaterial.onBeforeCompile = material.onBeforeCompile;
      refractionFreeMaterial.customProgramCacheKey = () =>
        material.customProgramCacheKey() + "|reflection-no-refraction";
      // 源材质被释放时，连带把克隆体也释放掉：克隆体引用着源材质的贴图与
      // onBeforeCompile，留着它既不安全也会一直占着显存。
      const handleMaterialDispose = () => {
        material.removeEventListener("dispose", handleMaterialDispose);
        refractionFreeMaterialBySource.delete(material);
        disposeHandlerByClone.delete(refractionFreeMaterial);
        refractionFreeMaterial.dispose();
      };
      material.addEventListener("dispose", handleMaterialDispose);
      refractionFreeMaterialBySource.set(material, refractionFreeMaterial);
      disposeHandlerByClone.set(refractionFreeMaterial, handleMaterialDispose);
    }
    return refractionFreeMaterialBySource.get(material);
  }
  /**
   * 处理数组材质：逐项取无折射版本。
   *
   * 复用同一个「结果数组」对象（cachedArrayEntry.next）并在内容没变时直接返回入参，
   * 这样调用方可以安全地用 `!==` 判断「材质有没有被换过」，也避免每帧在
   * three.js 内部触发材质数组的变化检测。
   */
  function getRefractionFreeMaterials(materialInput) {
    if (!Array.isArray(materialInput)) {
      return getRefractionFreeMaterial(materialInput);
    }
    let cachedArrayEntry = materialArrayEntryByInput.get(materialInput);
    if (!cachedArrayEntry) {
      cachedArrayEntry = {
        next: []
      };
      materialArrayEntryByInput.set(materialInput, cachedArrayEntry);
    }
    cachedArrayEntry.next.length = materialInput.length;
    let materialArrayChanged = false;
    for (let materialIndex = 0; materialIndex < materialInput.length; materialIndex++) {
      cachedArrayEntry.next[materialIndex] = getRefractionFreeMaterial(
        materialInput[materialIndex]
      );
      materialArrayChanged ||=
        cachedArrayEntry.next[materialIndex] !== materialInput[materialIndex];
    }
    if (materialArrayChanged) {
      return cachedArrayEntry.next;
    } else {
      return materialInput;
    }
  }
  // recordList：本帧生效的记录（一块地面一条）；recordsBySource 保留已失效但仍可复用的记录。
  let recordList = [];
  let currentRoot = null;
  // 记录根节点的第一个子节点：场景增删顶层节点时用它快速判断「结构可能变了」。
  let rootFirstChild = null;
  let needsUpdate = true;
  let lastRenderTimeMs = -Infinity;
  let lastCameraSignature = "";
  let lastLightingSignature = "";
  let isDisposed = false;
  let changeRevisionCount = 0;
  let lastSceneRevision;
  let isSuspended = false;
  // pendingResume：从挂起恢复时先跑一整轮淡入，避免反射「啪」地出现。
  let pendingResume = false;
  let resumeStartedAtMs = null;
  let suspendStartedAtMs = null;
  // 240ms 的淡入淡出时长：与区域灯 / 接触阴影的过渡时长保持一致。
  const FADE_DURATION_MS = 240;
  let throttleTimer = null;
  let outsideFloorId = null;
  let visibleFloorId = null;
  let usageCounter = 0;
  // 源网格 → 记录。用 Map 而非 WeakMap：需要在 trimRecordCache 里遍历回收。
  const recordsBySource = new Map();
  const floorChangeCounts = new Map();
  // 32MB 缓存预算，与接触阴影模块的口径一致，保证低端设备也不会被反射吃光显存。
  const CACHE_BYTE_BUDGET = 33554432;
  let heightByFloorId = new Map();
  let lightsByFloorId = new Map();
  /**
   * 沿父链向上找楼层 ID（兼容四种字段名）。
   *
   * 四个字段分别来自：文档楼层、区域、环境层、灯光层。任一命中即返回，
   * 保证反射能把「这块地面属于哪一层」判对，进而只拍本层的地面。
   */
  function resolveFloorId(startObject) {
    for (let currentObject = startObject; currentObject; currentObject = currentObject.parent) {
      const userDataFloorId =
        currentObject.userData?.floorId ||
        currentObject.userData?.regionFloorId ||
        currentObject.userData?.environmentFloorId ||
        currentObject.userData?.lightFloorId;
      if (userDataFloorId) {
        return String(userDataFloorId);
      }
    }
    return "";
  }
  const objectIdByObject = new WeakMap();
  let objectIdSequence = 0;
  /**
   * 取对象的稳定自增 ID。
   *
   * three.js 的 uuid 字符串很长，放进几何签名里会让字符串比较变慢；
   * 这里用 WeakMap 给每个对象分配一个短整型 ID，签名更短且同样稳定。
   */
  function getObjectId(targetObject) {
    if (targetObject) {
      if (!objectIdByObject.has(targetObject)) {
        objectIdByObject.set(targetObject, ++objectIdSequence);
      }
      return objectIdByObject.get(targetObject);
    } else {
      return 0;
    }
  }
  /**
   * 生成网格几何的内容签名，用于判断记录是否需要重建。
   *
   * 覆盖：几何 uuid、index 与各 attribute 的对象 ID / 版本号 / 数据版本 / 元素个数、
   * drawRange。之所以带上 attribute 的对象 ID 与 data.version：只改 version 可能漏掉
   * 「整个 buffer 被替换成新对象」的情况，只比对象又漏掉「原地改数据」。
   *
   * @returns {string} 以 `|` 连接的签名串。
   */
  function geometrySignature(mesh) {
    const geometry = mesh.geometry;
    return [
      geometry.uuid,
      getObjectId(geometry.index),
      geometry.index?.version,
      ...Object.entries(geometry.attributes).flatMap(([attributeName, attribute]) => [
        attributeName,
        getObjectId(attribute),
        attribute.version,
        attribute.data?.version,
        attribute.count
      ]),
      geometry.drawRange.start,
      geometry.drawRange.count
    ].join("|");
  }
  /**
   * 释放一条记录持有的全部 GPU / 事件资源。
   *
   * 必须先摘 dispose 监听再删记录：否则源几何被销毁时会回调到一条已经释放的记录上。
   */
  function disposeRecord(recordToDispose) {
    recordToDispose.geometry.removeEventListener("dispose", recordToDispose.onSourceDispose);
    recordToDispose.overlay.removeFromParent();
    recordToDispose.overlay.geometry.dispose();
    recordToDispose.overlay.material.dispose();
    recordToDispose.map.dispose();
    recordToDispose.scratch?.dispose();
    recordsBySource.delete(recordToDispose.source);
  }
  /**
   * 裁掉不再使用的记录缓存（LRU + 字节预算）。
   *
   * 只处理「不在本帧 recordList 里」的记录：它们对应的地面这一帧不需要反射，
   * 但可能下一帧又被需要（比如楼层来回切换），所以留一小撮（上限 4 条）。
   * 字节估算公式把 HalfFloat（每像素 2 字节 × 4 通道）与多重采样的额外开销
   * 折算成 12 字节/像素，scratch 另算 8 字节/像素。
   */
  function trimRecordCache() {
    const activeRecords = new Set(recordList);
    const reclaimCandidates = [...recordsBySource.values()]
      .filter(candidateRecord => !activeRecords.has(candidateRecord))
      .sort((recordA, recordB) => recordB.used - recordA.used);
    let totalBytes = 0;
    let keptCount = 0;
    for (const candidate of reclaimCandidates) {
      const candidateBytes =
        candidate.map.width *
        candidate.map.height *
        ((1 + candidate.map.samples) * 12 + (candidate.scratch ? 8 : 0));
      if (candidate.dead || keptCount >= 4 || totalBytes + candidateBytes > CACHE_BYTE_BUDGET) {
        disposeRecord(candidate);
        continue;
      }
      totalBytes += candidateBytes;
      keptCount++;
    }
    stats.cachedRecords = keptCount;
    stats.cachedBytes = totalBytes;
  }
  /**
   * 生成一组灯的光照签名，用于判断反射是否需要重拍。
   *
   * 覆盖影响光照结果的字段：可见性、强度、颜色、距离、衰减、角度、半影、
   * 世界矩阵与目标点矩阵。任何一项变化都会让反射里的明暗与主画面不一致，
   * 因此必须重拍 —— 这是「改灯之后反射也会跟着变」的实现。
   *
   * @returns {string} 签名串。
   */
  function buildLightingSignature(lights) {
    return lights
      .map(light =>
        [
          light.uuid,
          isVisibleWithin(light),
          light.intensity,
          light.color?.r,
          light.color?.g,
          light.color?.b,
          light.distance,
          light.decay,
          light.angle,
          light.penumbra,
          ...light.matrixWorld.elements,
          ...(light.target?.matrixWorld.elements || [])
        ].join(",")
      )
      .join(";");
  }
  /**
   * 计算单条记录的状态键：它关心的所有「会影响反射内容」的外部因素。
   *
   * 由两部分拼成：各楼层的光照签名（按可见楼层与高度过滤），
   * 以及 floorLighting 模式下只算不高于该记录的楼层（低楼层的地面看不到上层的光）。
   *
   * @param {Map<string, string>} floorLightingSignatures 按楼层索引的光照签名。
   */
  function recordStateKey(targetRecord, floorLightingSignatures) {
    const effectiveFloorId =
      visibleFloorId ?? (targetRecord.kind === "outside" ? outsideFloorId : null);
    return [...heightByFloorId]
      .filter(
        ([floorKey, floorHeight]) =>
          (effectiveFloorId === null || !floorKey || floorKey === effectiveFloorId) &&
          (!floorLighting || !floorKey || floorHeight >= targetRecord.height - 0.1)
      )
      .map(([mapFloorKey]) => floorLightingSignatures.get(mapFloorKey))
      .join("|");
  }
  // 可见楼层过滤：visibleFloorId 为 null 表示「全部可见」。
  const isOnVisibleFloor = object =>
    visibleFloorId === null || resolveFloorId(object) === visibleFloorId;
  /**
   * 判断节点是否处于「正在离场的旧楼层」下（楼层过渡动画）。
   */
  function isFloorTransitionLeaving(transitionSource) {
    for (
      let transitionNode = transitionSource;
      transitionNode;
      transitionNode = transitionNode.parent
    ) {
      if (transitionNode.userData?.floorTransitionLeaving) {
        return true;
      }
    }
    return false;
  }
  /**
   * 判断「室外背景」面是否属于当前选定的室外楼层。
   *
   * outsideFloorId 为 null 表示不限制；向上找到第一个带楼层字段的祖先再比对，
   * 因此背景面即使自己没标楼层也能正确归属。
   */
  function isOnOutsideFloor(outsideSource) {
    if (outsideFloorId === null) {
      return true;
    }
    for (let outsideNode = outsideSource; outsideNode; outsideNode = outsideNode.parent) {
      const ancestorFloorId = outsideNode.userData?.floorId || outsideNode.userData?.regionFloorId;
      if (ancestorFloorId) {
        return ancestorFloorId === outsideFloorId;
      }
    }
    return false;
  }
  // 反射贴图要做一遍柔性模糊（可选）：镜像画面里的高频细节在低分辨率下容易闪烁，
  // 模糊一次能显著降低噪点感。复用与接触阴影相同的 9 抽头线性采样高斯核。
  const blurScene = new THREE.Scene();
  const blurCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const blurMaterial = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      source: {
        value: null
      },
      step: {
        value: new THREE.Vector2()
      }
    },
    vertexShader: "varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
    fragmentShader:
      "uniform sampler2D source; uniform vec2 step; varying vec2 vUv;\n      void main(){ gl_FragColor=texture2D(source,vUv)*.227027;\n      gl_FragColor+=(texture2D(source,vUv+step*1.384615)+texture2D(source,vUv-step*1.384615))*.316216;\n      gl_FragColor+=(texture2D(source,vUv+step*3.230769)+texture2D(source,vUv-step*3.230769))*.070270; }"
  });
  const blurMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurMaterial);
  blurScene.add(blurMesh);
  /**
   * 创建反射用的渲染目标。
   *
   * 三处取舍：
   *   - HalfFloatType：反射里可能有高光与环境贴图的亮度超过 1，用 8 位会在
   *     后续的 tonemapping 之前就被截断，出现明显断层；
   *   - depthBuffer：只有真正做场景捕获的那张贴图需要深度；模糊用的中间贴图不需要，
   *     省一份深度附件；
   *   - samples：借用渲染器的 maxSamples 但上限 2 —— MSAA 对边缘有帮助，
   *     但 4x 以上的开销在逐地面捕获的场景里不划算。
   */
  const createReflectionTarget = (resolutionPx, forBlurPass = false) =>
    new THREE.WebGLRenderTarget(resolutionPx, resolutionPx, {
      type: THREE.HalfFloatType,
      depthBuffer: !forBlurPass,
      samples: forBlurPass ? 0 : Math.min(2, renderer.capabilities.maxSamples)
    });
  /**
   * 释放全部记录（含仍可复用的缓存记录）。
   */
  function disposeAllRecords() {
    for (const existingRecord of [...recordsBySource.values()]) {
      disposeRecord(existingRecord);
    }
    recordList = [];
    stats.cachedRecords = stats.cachedBytes = 0;
  }
  /**
   * 重建记录列表：扫描场景，为每块地面（以及室外背景）准备 overlay 与渲染目标。
   *
   * 快速返回条件（四者全满足才跳过）：
   *   - 场景版本号没变；
   *   - 根节点没换、第一个子节点没换（顶层结构的廉价探针）；
   *   - 已有记录的源网格都还挂在场景里且没被销毁。
   * 复用已有记录时只更新高度、位置与使用计数，不重新分配贴图 —— 这是楼层来回切换
   * 时几乎零开销的关键。
   */
  function rebuildRecords(sceneRevision) {
    const resolvedRoot = getRoot();
    if (!resolvedRoot) {
      disposeAllRecords();
      currentRoot = rootFirstChild = null;
      return;
    }
    if (
      lastSceneRevision === sceneRevision &&
      currentRoot === resolvedRoot &&
      rootFirstChild === resolvedRoot.children[0] &&
      recordList.every(knownRecord => knownRecord.source.parent && !knownRecord.dead)
    ) {
      return;
    }
    for (const staleRecord of recordList) {
      // 先把旧 overlay 摘下来再重建：留在场景里会被当作反射内容拍到，
      // 形成「反射里有反射」的递归光斑。
      staleRecord.overlay.visible = false;
      staleRecord.overlay.removeFromParent();
    }
    recordList = [];
    lastSceneRevision = sceneRevision;
    currentRoot = resolvedRoot;
    rootFirstChild = resolvedRoot.children[0];
    currentRoot.updateWorldMatrix(true, true);
    heightByFloorId = new Map();
    lightsByFloorId = new Map();
    const heightBox = new THREE.Box3();
    currentRoot.traverse(traversedNode => {
      // 自身的 overlay / 环境特效网格不参与：它们是渲染产物，不是房屋内容。
      if (traversedNode.userData?.reflectionOverlay || traversedNode.userData?.environmentEffect) {
        return;
      }
      const nodeFloorId = resolveFloorId(traversedNode);
      if (traversedNode.isLight) {
        if (!lightsByFloorId.has(nodeFloorId)) {
          lightsByFloorId.set(nodeFloorId, []);
        }
        lightsByFloorId.get(nodeFloorId).push(traversedNode);
      }
      if (!traversedNode.isMesh || !traversedNode.geometry) {
        return;
      }
      if (!traversedNode.geometry.boundingBox) {
        traversedNode.geometry.computeBoundingBox();
      }
      if (traversedNode.isInstancedMesh) {
        traversedNode.computeBoundingBox();
      }
      const localBounds = traversedNode.isInstancedMesh
        ? traversedNode.boundingBox
        : traversedNode.geometry.boundingBox;
      // 蒙皮 / 形变网格的包围盒算不准（顶点在 GPU 上变），直接给 Infinity：
      // 宁可把它们所在楼层的高度判高一点，也不要因为低估而漏掉反射。
      const topWorldY =
        traversedNode.isSkinnedMesh || traversedNode.morphTargetInfluences?.length
          ? Infinity
          : localBounds
            ? heightBox.copy(localBounds).applyMatrix4(traversedNode.matrixWorld).max.y
            : Infinity;
      heightByFloorId.set(
        nodeFloorId,
        Math.max(heightByFloorId.get(nodeFloorId) ?? -Infinity, topWorldY)
      );
    });
    const receiverMeshes = [];
    currentRoot.traverse(receiverNode => {
      if (
        receiverNode.isMesh &&
        (receiverNode.userData.regionReceiverKind === "floor" ||
          receiverNode.userData.exportRole === "background")
      ) {
        receiverMeshes.push(receiverNode);
      }
    });
    for (const sourceMesh of receiverMeshes) {
      const receiverKind = sourceMesh.userData.exportRole === "background" ? "outside" : "inside";
      // 三重过滤：楼层过渡中的旧楼层不拍、非当前楼层不拍、
      // 模式（off / inside / outside / all）不匹配的不拍，
      // 室外背景还要额外确认属于当前选定的室外楼层。
      if (
        isFloorTransitionLeaving(sourceMesh) ||
        !isOnVisibleFloor(sourceMesh) ||
        (settings.mode !== "all" && receiverKind !== settings.mode) ||
        (receiverKind === "outside" && !isOnOutsideFloor(sourceMesh))
      ) {
        continue;
      }
      const sourceBounds = new THREE.Box3().setFromObject(sourceMesh);
      const sourceHeight = sourceBounds.max.y;
      const sourceKey = geometrySignature(sourceMesh);
      let record = recordsBySource.get(sourceMesh);
      if (record && (record.dead || record.key !== sourceKey)) {
        disposeRecord(record);
        record = null;
      }
      if (record) {
        record.height = sourceHeight;
        record.used = ++usageCounter;
        record.hasCapture = false;
        record.overlay.position.copy(sourceMesh.position);
        record.overlay.quaternion.copy(sourceMesh.quaternion);
        record.overlay.scale.copy(sourceMesh.scale);
        sourceMesh.parent.add(record.overlay);
        recordList.push(record);
        stats.reuses++;
        continue;
      }
      const reflectionTarget = createReflectionTarget(settings.resolution);
      const blurTarget = blur ? createReflectionTarget(settings.resolution, true) : null;
      const reflectionMatrix = new THREE.Matrix4();
      // overlay 材质：透明叠加，关闭深度写入（它只是一个贴在原地面上的薄片，
      // 写深度会和原地面的 z 值打架），用 polygonOffset 把它稍微拉向相机，
      // 避免与原地面共面产生 z-fighting 条纹。
      const reflectionMaterial = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -2,
        uniforms: {
          reflection: {
            value: reflectionTarget.texture
          },
          reflectionMatrix: {
            value: reflectionMatrix
          },
          strength: {
            value: settings.strength
          }
        },
        vertexShader:
          "uniform mat4 reflectionMatrix; varying vec4 reflected; varying float up;\n          void main(){vec4 world=modelMatrix*vec4(position,1.);reflected=reflectionMatrix*world;\n          up=normalize(mat3(modelMatrix)*normal).y;gl_Position=projectionMatrix*viewMatrix*world;}",
        fragmentShader:
          "uniform sampler2D reflection; uniform float strength; varying vec4 reflected; varying float up;\n          void main(){if(up<.9||reflected.w<=0.)discard;vec2 uv=reflected.xy/reflected.w;\n          if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))discard;\n          vec4 value=texture2D(reflection,uv);gl_FragColor=vec4(value.rgb/max(value.a,.001),clamp(value.a*strength,0.,.7));\n          #include <tonemapping_fragment>\n          #include <colorspace_fragment>\n          }"
      });
      const overlayMesh = new THREE.Mesh(sourceMesh.geometry.clone(), reflectionMaterial);
      // 变换完全跟随源地面；overlay 挂在同一个父节点下，所以这些局部变换直接照抄。
      overlayMesh.position.copy(sourceMesh.position);
      overlayMesh.quaternion.copy(sourceMesh.quaternion);
      overlayMesh.scale.copy(sourceMesh.scale);
      // renderOrder = 1：必须在地面之后绘制，才能正确做透明混合。
      overlayMesh.renderOrder = 1;
      overlayMesh.userData.environmentEffect = true;
      overlayMesh.userData.reflectionOverlay = true;
      // 这三个标记告诉资源管理系统「几何 / 材质 / 贴图是共享的，不要跟着 overlay
      // 一起销毁」—— overlay 的几何是 clone 出来的，但材质与贴图是引用别人的。
      overlayMesh.userData.externalModelSharedGeometry =
        overlayMesh.userData.externalModelSharedMaterial =
        overlayMesh.userData.externalModelSharedTextures =
          true;
      record = {
        source: sourceMesh,
        geometry: sourceMesh.geometry,
        kind: receiverKind,
        height: sourceHeight,
        overlay: overlayMesh,
        map: reflectionTarget,
        scratch: blurTarget,
        matrix: reflectionMatrix,
        key: sourceKey,
        used: ++usageCounter,
        state: "",
        dead: false,
        hasCapture: false
      };
      record.onSourceDispose = () => {
        // 源几何被销毁 → 这条记录再也无法渲染，标记为 dead 交给 trimRecordCache 回收，
        // 同时立刻隐藏 overlay（它还在用那份已销毁的几何）。
        record.dead = true;
        overlayMesh.visible = false;
      };
      sourceMesh.geometry.addEventListener("dispose", record.onSourceDispose);
      recordsBySource.set(sourceMesh, record);
      stats.allocations++;
      sourceMesh.parent.add(overlayMesh);
      recordList.push(record);
    }
    detail?.prepare(currentRoot);
    trimRecordCache();
    // 结构变了，下一次 render 必须重新捕获（哪怕相机与光照都没变）。
    needsUpdate = true;
  }
  /**
   * 判断节点自身及全部祖先是否可见。
   */
  function isVisibleWithin(startNode) {
    for (let visibilityNode = startNode; visibilityNode; visibilityNode = visibilityNode.parent) {
      if (!visibilityNode.visible) {
        return false;
      }
    }
    return true;
  }
  /**
   * 判断某条记录的反射这一帧是否应该显示。
   */
  function shouldShowRecord(recordToCheck) {
    return (
      isOnVisibleFloor(recordToCheck.source) &&
      (settings.mode === "all" || settings.mode === recordToCheck.kind) &&
      (recordToCheck.kind !== "outside" || isOnOutsideFloor(recordToCheck.source))
    );
  }
  /**
   * 应用新的反射设置（来自设置面板）。
   *
   * 三档处理：
   *   - 三项都相同 → 什么都不做，返回 false（调用方据此避免无谓的重渲染）；
   *   - 分辨率变化 / 关闭 / 强度归零 → 释放全部记录（贴图尺寸变了必须重新分配，
   *     关掉则没必要留着显存）；
   *   - 模式变化 → 只清 rootFirstChild 触发一次结构重扫，已有贴图还能复用。
   */
  function configure(nextSettings) {
    const normalizedSettings = normalizeGroundReflection(nextSettings);
    if (
      normalizedSettings.mode === settings.mode &&
      normalizedSettings.resolution === settings.resolution &&
      normalizedSettings.strength === settings.strength
    ) {
      return false;
    }
    const resolutionChanged = settings.resolution !== normalizedSettings.resolution;
    const modeChanged = settings.mode !== normalizedSettings.mode;
    Object.assign(settings, normalizedSettings);
    if (
      resolutionChanged ||
      normalizedSettings.mode === "off" ||
      normalizedSettings.strength === 0
    ) {
      disposeAllRecords();
      rootFirstChild = null;
    }
    if (modeChanged) {
      rootFirstChild = null;
    }
    needsUpdate ||= resolutionChanged || modeChanged;
    requestFrame();
    return true;
  }
  /**
   * 计算镜像相机与「世界坐标 → 反射贴图 UV」的纹理矩阵。
   *
   * 步骤与理由：
   *   1. 把相机位置沿镜面法线镜像（距离乘 -2 即对称点），朝向向量对法线做反射；
   *   2. up 向量同样反射，保证镜像画面不发生翻滚；
   *   3. 直接复制源相机的投影矩阵，再把 x 轴翻转（elements[8] / [12] 取负）——
   *      镜像会翻转手性，不翻转 x 会得到左右颠倒的画面；
   *   4. textureMatrix 用「NDC → UV」的偏移缩放矩阵（0.5 缩放 + 0.5 平移）乘上
   *      投影与世界逆矩阵，供 overlay 着色器把世界坐标直接映射成 UV；
   *   5. 斜切近平面裁剪（Oblique Near-Plane Clipping）：把镜面本身作为相机近平面，
   *      这样镜子下方的物体（地板背面、楼下的房间）不会出现在反射里。
   */
  function updateReflectionCamera(sourceCamera, mirrorPlane, textureMatrix) {
    let reflectionCamera = reflectionCameraBySource.get(sourceCamera);
    if (!reflectionCamera) {
      reflectionCamera = sourceCamera.clone(false);
      reflectionCameraBySource.set(sourceCamera, reflectionCamera);
    }
    reflectionCamera.layers.mask = sourceCamera.layers.mask;
    // 逐项同步相机的投影参数：clone(false) 只保证初始一致，之后主相机的
    // near / far / fov / zoom 可能被别处改过（比如缩放动画），必须每帧对齐。
    // 用「属性名列表 + in 判断」而不是直接赋值，是为了兼容透视 / 正交两种相机
    // 各自才有的字段（left/right/top/bottom、fov 等）。
    for (const propertyName of [
      "near",
      "far",
      "zoom",
      "fov",
      "aspect",
      "focus",
      "filmGauge",
      "filmOffset",
      "left",
      "right",
      "top",
      "bottom",
      "coordinateSystem"
    ]) {
      if (propertyName in sourceCamera) {
        reflectionCamera[propertyName] = sourceCamera[propertyName];
      }
    }
    const cameraWorldPosition = scratchWorldPosition.setFromMatrixPosition(
      sourceCamera.matrixWorld
    );
    const cameraForward = scratchWorldNormal
      .setFromMatrixColumn(sourceCamera.matrixWorld, 2)
      .negate()
      .normalize();
    // 距离乘 -2：沿法线走两倍距离即到达镜面对称点。
    cameraWorldPosition.addScaledVector(
      mirrorPlane.normal,
      mirrorPlane.distanceToPoint(cameraWorldPosition) * -2
    );
    cameraForward.reflect(mirrorPlane.normal);
    reflectionCamera.position.copy(cameraWorldPosition);
    reflectionCamera.up
      .setFromMatrixColumn(sourceCamera.matrixWorld, 1)
      .normalize()
      .reflect(mirrorPlane.normal);
    reflectionCamera.lookAt(scratchLookTarget.copy(cameraWorldPosition).add(cameraForward));
    reflectionCamera.updateMatrixWorld(true);
    reflectionCamera.projectionMatrix.copy(sourceCamera.projectionMatrix);
    // 镜像会翻转手性：把投影矩阵的 x 轴平移项与 x 轴缩放项取负，
    // 等价于水平翻转画面，抵消镜像带来的左右颠倒。
    reflectionCamera.projectionMatrix.elements[8] *= -1;
    reflectionCamera.projectionMatrix.elements[12] *= -1;
    textureMatrix
      // 这个 4x4 矩阵把 NDC（[-1,1]）映射到 UV（[0,1]）：x/y 缩放 0.5、平移 0.5，
      // z 方向缩放 0.5 + 平移 0.5 保持深度可比。
      .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(reflectionCamera.projectionMatrix)
      .multiply(reflectionCamera.matrixWorldInverse);
    // 下面是「斜切近平面裁剪」（Oblique Near-Plane Clipping）的标准推导：
    // 把镜面在相机空间下的平面方程乘进投影矩阵，使镜面本身成为近平面 ——
    // 于是镜面以下的物体（地板背面、楼下房间）自动被裁掉，不会在反射里露馅。
    const planeInCameraSpace = scratchPlane
      .copy(mirrorPlane)
      .applyMatrix4(reflectionCamera.matrixWorldInverse);
    const clipPlaneVector = scratchPlaneVector.set(
      planeInCameraSpace.normal.x,
      planeInCameraSpace.normal.y,
      planeInCameraSpace.normal.z,
      planeInCameraSpace.constant
    );
    const projectionElements = reflectionCamera.projectionMatrix.elements;
    const signVector = scratchSignVector
      .set(Math.sign(clipPlaneVector.x), Math.sign(clipPlaneVector.y), 1, 1)
      .applyMatrix4(scratchProjectionMatrix.copy(reflectionCamera.projectionMatrix).invert());
    // 用「极点方向」的投影结果把平面方程归一化，保证裁剪发生在正确的深度处；
    // 系数 2 来自 NDC 深度区间的长度。
    clipPlaneVector.multiplyScalar(2 / clipPlaneVector.dot(signVector));
    projectionElements[2] = clipPlaneVector.x - projectionElements[3];
    projectionElements[6] = clipPlaneVector.y - projectionElements[7];
    projectionElements[10] = clipPlaneVector.z - projectionElements[11];
    projectionElements[14] = clipPlaneVector.w - projectionElements[15];
    reflectionCamera.projectionMatrixInverse.copy(reflectionCamera.projectionMatrix).invert();
    return reflectionCamera;
  }
  /**
   * 主入口：按需重拍所有脏记录的地面反射。
   *
   * 必须由调用方在主渲染之前调用（studio-app 里的判断是 renderer 还没有渲染目标时），
   * 因为反射通道会切换 renderTarget 并清屏，跑在主渲染之后会覆盖主画面。
   *
   * 内部顺序：
   *   suspend / fadeOut 分支 → 更新矩阵与记录 → 脏记录筛选 → 帧率节流 →
   *   保存渲染器状态 → prepareNode（隐藏 / 替换）→ 逐记录捕获 + 模糊 → 还原状态。
   */
  function render(camera, { worldMatricesCurrent: worldMatricesCurrent = false } = {}) {
    if (isDisposed || stats.inCapture || !camera) {
      return;
    }
    if (isSuspended) {
      // 挂起期间不重拍，但可以继续把已有反射淡出：直接抹掉会让地面反射「啪」地消失。
      if (suspendStartedAtMs === null) {
        return;
      }
      const fadeOutProgress = Math.min(
        1,
        Math.max(0, (performance.now() - suspendStartedAtMs) / FADE_DURATION_MS)
      );
      for (const fadingRecord of recordList) {
        let isUnderRoot = false;
        for (
          let ancestorNode = fadingRecord.source;
          ancestorNode;
          ancestorNode = ancestorNode.parent
        ) {
          if (ancestorNode === getRoot()) {
            isUnderRoot = true;
            break;
          }
        }
        if (
          fadeOutProgress === 1 ||
          !isUnderRoot ||
          fadingRecord.dead ||
          !fadingRecord.hasCapture ||
          !fadingRecord.fadeOutStrength
        ) {
          fadingRecord.overlay.visible = false;
          fadingRecord.overlay.removeFromParent();
          continue;
        }
        fadingRecord.source.updateWorldMatrix(true, false);
        // 淡出期间地面可能还在动（楼层过渡），用「淡出时的矩阵 × 淡出时的帧矩阵 ×
        // 当前世界矩阵的逆」把贴图重新锚定到现在的位置，避免反射错位。
        fadingRecord.matrix
          .copy(fadingRecord.fadeOutMatrix)
          .multiply(fadingRecord.fadeOutFrame)
          .multiply(new THREE.Matrix4().copy(fadingRecord.source.matrixWorld).invert());
        fadingRecord.overlay.position.copy(fadingRecord.source.position);
        fadingRecord.overlay.quaternion.copy(fadingRecord.source.quaternion);
        fadingRecord.overlay.scale.copy(fadingRecord.source.scale);
        if (fadingRecord.overlay.parent !== fadingRecord.source.parent) {
          fadingRecord.source.parent.add(fadingRecord.overlay);
        }
        fadingRecord.overlay.updateWorldMatrix(true, false);
        fadingRecord.overlay.material.uniforms.strength.value =
          fadingRecord.fadeOutStrength * (1 - fadeOutProgress);
        fadingRecord.overlay.visible = isVisibleWithin(
          fadingRecord.kind === "outside" ? fadingRecord.source.parent : fadingRecord.source
        );
      }
      if (fadeOutProgress < 1) {
        requestFrame();
      } else {
        suspendStartedAtMs = null;
      }
      return;
    }
    // 逗号表达式：先按需更新世界矩阵（store 的 worldMatricesCurrent 为 true 时跳过），
    // 再重建记录并检查根节点。写成表达式是为了把这两步塞进 if 条件里，
    // 且只在前面几项都没短路时才执行。
    if (
      settings.mode === "off" ||
      settings.strength === 0 ||
      (worldMatricesCurrent ||
        (scene.matrixWorldAutoUpdate && scene.updateMatrixWorld(),
        camera.updateWorldMatrix(true, false)),
      rebuildRecords(getSceneRevision()),
      !currentRoot)
    ) {
      return;
    }
    const resumeProgress = pendingResume
      ? 0
      : resumeStartedAtMs === null
        ? 1
        : Math.min(1, (performance.now() - resumeStartedAtMs) / FADE_DURATION_MS);
    if (resumeProgress < 1) {
      requestFrame();
    } else {
      resumeStartedAtMs = null;
    }
    for (const activeRecord of recordList) {
      // 地面网格的世界矩阵变了才重算镜面：镜面法线取几何「最薄轴」作为平面法线，
      // 并把平面推到该轴的最大（或最小）面上，得到真正的地表平面。
      if (!activeRecord.sourceFrame?.equals(activeRecord.source.matrixWorld)) {
        activeRecord.sourceFrame = (activeRecord.sourceFrame || new THREE.Matrix4()).copy(
          activeRecord.source.matrixWorld
        );
        if (!activeRecord.source.geometry.boundingBox) {
          activeRecord.source.geometry.computeBoundingBox();
        }
        const geometryBounds = activeRecord.source.geometry.boundingBox;
        const geometrySize = geometryBounds.getSize(new THREE.Vector3());
        const thinAxis =
          geometrySize.x <= geometrySize.y && geometrySize.x <= geometrySize.z
            ? "x"
            : geometrySize.y <= geometrySize.z
              ? "y"
              : "z";
        const planeNormal = new THREE.Vector3();
        planeNormal[thinAxis] = 1;
        // 用正规矩阵变换法线（而不是直接用世界矩阵）：非等比缩放下，
        // 直接乘世界矩阵得到的法线方向是错的。
        planeNormal
          .applyMatrix3(new THREE.Matrix3().getNormalMatrix(activeRecord.sourceFrame))
          .normalize();
        const planeCenter = geometryBounds.getCenter(new THREE.Vector3());
        planeCenter[thinAxis] =
          planeNormal.y < 0 ? geometryBounds.min[thinAxis] : geometryBounds.max[thinAxis];
        if (planeNormal.y < 0) {
          planeNormal.negate();
        }
        activeRecord.plane = (
          activeRecord.plane || new THREE.Plane()
        ).setFromNormalAndCoplanarPoint(
          planeNormal,
          planeCenter.applyMatrix4(activeRecord.sourceFrame)
        );
        activeRecord.height = new THREE.Box3()
          .copy(geometryBounds)
          .applyMatrix4(activeRecord.sourceFrame).max.y;
        needsUpdate = true;
      }
      // eligible 判定：楼层过渡中的旧楼层不算、可见性（室外背景看父节点）为真、
      // 记录本身允许显示，且相机必须停在镜面正面（跑到地面下方时反射没有意义，
      // 画面会全黑）。
      activeRecord.eligible =
        !isFloorTransitionLeaving(activeRecord.source) &&
        // 室外背景面挂在父节点下（父节点才是可见性开关），室内面看自身。
        isVisibleWithin(
          activeRecord.kind === "outside" ? activeRecord.source.parent : activeRecord.source
        ) &&
        shouldShowRecord(activeRecord) &&
        activeRecord.plane.distanceToPoint(getFloorCamera(camera, activeRecord.source).position) >
          0;
      activeRecord.overlay.visible = activeRecord.eligible && activeRecord.hasCapture;
      activeRecord.overlay.material.uniforms.strength.value = settings.strength * resumeProgress;
    }
    if (settings.mode === "off" || !recordList.length) {
      return;
    }
    const frameStartMs = performance.now();
    // 相机签名 = 世界矩阵 + 投影矩阵的全部元素：两者任一变化（位移、旋转、缩放、
    // 切楼层改 fov）都说明镜像画面会变，需要重拍。
    const cameraSignature =
      camera.matrixWorld.elements.join(",") + camera.projectionMatrix.elements.join(",");
    const cameraChanged = cameraSignature !== lastCameraSignature;
    const currentResolution = settings.resolution;
    for (const resizedRecord of recordList) {
      // 设置面板改了分辨率时原地缩放已有贴图，比释放重建便宜（GL 会复用纹理对象）。
      if (resizedRecord.map.width !== currentResolution) {
        resizedRecord.map.setSize(currentResolution, currentResolution);
        resizedRecord.scratch?.setSize(currentResolution, currentResolution);
        needsUpdate = true;
      }
    }
    // getStateKey：文档版本 / 环境开关 / 光照缓存等外部因素；
    // changeRevisionCount：本模块的 changed() 计数；
    // 不按楼层分光时，还要把「不属于任何楼层的灯」与全部灯一起算进全局光照签名。
    const lightingSignature =
      getStateKey() +
      "|" +
      changeRevisionCount +
      "|" +
      buildLightingSignature(lightsByFloorId.get("") || []) +
      "|" +
      (floorLighting ? "" : buildLightingSignature([...lightsByFloorId.values()].flat()));
    const stateChanged =
      needsUpdate || cameraChanged || lightingSignature !== lastLightingSignature;
    const lightingSignatureByFloor = new Map(
      [...heightByFloorId.keys()].map(signatureFloorKey => [
        signatureFloorKey,
        signatureFloorKey +
          ":" +
          (floorChangeCounts.get(signatureFloorKey) || 0) +
          ":" +
          (floorLighting
            ? buildLightingSignature(lightsByFloorId.get(signatureFloorKey) || [])
            : "")
      ])
    );
    const stateKeyByRecord = new Map();
    const dirtyRecords = recordList.filter(eligibleRecord => {
      if (!eligibleRecord.eligible) {
        return false;
      }
      // 脏 = 全局状态变了（needsUpdate / 相机 / 光照），或这条记录自己的状态键变了。
      const stateKey = recordStateKey(eligibleRecord, lightingSignatureByFloor);
      stateKeyByRecord.set(eligibleRecord, stateKey);
      return stateChanged || eligibleRecord.state !== stateKey;
    });
    if (!dirtyRecords.length) {
      return;
    }
    if (!needsUpdate && !cameraChanged && frameStartMs - lastRenderTimeMs < 1000 / settings.fps) {
      // 帧率节流：不是简单地 return，而是排一个定时器在「额度用完」时再请求一帧 ——
      // 否则在没有其他渲染源的情况下，反射会一直停在旧画面上不再更新。
      if (throttleTimer === null) {
        throttleTimer = setTimeout(
          () => {
            throttleTimer = null;
            requestFrame();
          },
          1000 / settings.fps - (frameStartMs - lastRenderTimeMs)
        );
      }
      return;
    }
    const rendererState = {
      // 快照渲染器 / 场景状态：反射通道要改渲染目标、清屏色、背景、阴影自动更新、
      // 世界矩阵自动更新等，finally 里必须逐项还原，否则主渲染会错乱。
      target: renderer.getRenderTarget(),
      cubeFace: renderer.getActiveCubeFace(),
      mipmap: renderer.getActiveMipmapLevel(),
      xr: renderer.xr.enabled,
      shadow: renderer.shadowMap.autoUpdate,
      alpha: renderer.getClearAlpha(),
      color: renderer.getClearColor(new THREE.Color()),
      background: scene.background,
      viewport: renderer.getViewport(new THREE.Vector4()),
      scissor: renderer.getScissor(new THREE.Vector4()),
      scissorTest: renderer.getScissorTest(),
      autoClear: renderer.autoClear,
      matrixWorldAutoUpdate: scene.matrixWorldAutoUpdate
    };
    const hiddenObjects = [];
    const materialRestores = [];
    const geometryRestores = [];
    const wallMeshes = [];
    // 室内反射（allInside）时墙体不该出现在反射里：从室内看地面，墙上不该有镜像。
    // 室外反射则保留墙体（幕墙 / 外墙的影子是重要的画面元素）。
    const allInside = dirtyRecords.every(checkedRecord => checkedRecord.kind === "inside");
    culling.reset();
    const captureStartMs = performance.now();
    stats.inCapture = true;
    stats.lastDrawCalls = stats.lastTriangles = 0;
    try {
      // 反射通道的单节点预处理：按楼层 / 离场状态决定是否把该节点（及其子树）
      // 从镜像场景里摘掉，并把替换用的低模几何、无折射材质一次性挂上。
      const prepareNode = candidateNode => {
        if (!candidateNode.visible) {
          return;
        }
        // 反射通道的「剔除清单」：非当前楼层的内容、正在离场的旧楼层、
        // 幕布阴影刷新用的临时网格、以及所有渲染产物（overlay / 环境特效 /
        // 背景 / 网格线 / 轮廓线）都不参与反射。
        if (
          (candidateNode !== currentRoot &&
            visibleFloorId !== null &&
            resolveFloorId(candidateNode) &&
            resolveFloorId(candidateNode) !== visibleFloorId) ||
          candidateNode.userData.floorTransitionLeaving ||
          candidateNode.name === "interaction3d-curtain-shadow-refresh" ||
          candidateNode.userData.reflectionOverlay ||
          ["background", "grid", "outline"].includes(candidateNode.userData.exportRole) ||
          candidateNode.userData.regionReceiverKind === "floor" ||
          candidateNode.userData.environmentEffect ||
          (allInside && candidateNode.userData.reflectionRole === "wall")
        ) {
          hiddenObjects.push([candidateNode, candidateNode.visible]);
          candidateNode.visible = false;
          return;
        }
        if (candidateNode.userData.reflectionRole === "wall") {
          wallMeshes.push(candidateNode);
        }
        if (cull) {
          // 第二个参数是「是否按楼层分别剔除」：floorLighting 开启时剔除器要考虑
          // 楼层光照的差异，否则会把本层需要的高光网格剔掉。
          culling.add(candidateNode, !floorLighting);
        }
        const replacementGeometry = detail?.get(candidateNode);
        if (replacementGeometry) {
          // 细节控制器会给出低模几何用于反射通道：反射贴图分辨率低，
          // 用低模省下的绘制时间远比视觉损失值钱。
          geometryRestores.push([candidateNode, candidateNode.geometry]);
          candidateNode.geometry = replacementGeometry;
        }
        if (candidateNode.isMesh && candidateNode.material) {
          const originalMaterial = candidateNode.material;
          const materialForRender = getRefractionFreeMaterials(originalMaterial);
          if (materialForRender !== originalMaterial) {
            materialRestores.push([candidateNode, originalMaterial]);
            candidateNode.material = materialForRender;
          }
        }
        for (const childNode of candidateNode.children) {
          prepareNode(childNode);
        }
      };
      prepareNode(scene);
      // 关掉场景的世界矩阵自动更新：下面会临时隐藏 / 换几何 / 换材质，
      // 让 three.js 每帧重算整棵树的矩阵是纯浪费（矩阵这一帧不会变）。
      scene.matrixWorldAutoUpdate = false;
      renderer.xr.enabled = false;
      // 阴影图不重算：反射用的阴影与主画面完全相同，重算一遍纯属浪费。
      renderer.shadowMap.autoUpdate = false;
      renderer.autoClear = true;
      scene.background = null;
      renderer.setClearColor(0, 0);
      renderer.setScissorTest(false);
      for (const captureRecord of dirtyRecords) {
        captureRecord.hasCapture = false;
        const capturedCamera = updateReflectionCamera(
          getFloorCamera(camera, captureRecord.source),
          captureRecord.plane,
          captureRecord.matrix
        );
        syncLighting(capturedCamera);
        const temporarilyHidden = [];
        try {
          // 剔除器决定这次反射能否整帧跳过（比如整块镜子都在视锥外）。
          if (cull && !culling.begin(captureRecord, capturedCamera)) {
            captureRecord.state = stateKeyByRecord.get(captureRecord);
            continue;
          }
          // 室外反射只保留当前室外楼层：否则楼下 / 隔壁楼层的轮廓会出现在天空背景里。
          if (captureRecord.kind === "outside" && outsideFloorId !== null) {
            scene.traverse(sceneNode => {
              const traversedFloorId = resolveFloorId(sceneNode);
              if (
                sceneNode !== currentRoot &&
                sceneNode.visible &&
                traversedFloorId &&
                traversedFloorId !== outsideFloorId
              ) {
                temporarilyHidden.push(sceneNode);
                sceneNode.visible = false;
              }
            });
          }
          if (captureRecord.kind === "inside") {
            // 室内反射隐藏全部墙体：斜切近平面已经裁掉了镜面以下的部分，
            // 但墙体本身仍会在镜像里形成大片遮挡，把房间内部挡得看不见。
            for (const wallMesh of wallMeshes) {
              if (wallMesh.visible) {
                temporarilyHidden.push(wallMesh);
                wallMesh.visible = false;
              }
            }
          }
          renderer.setRenderTarget(captureRecord.map);
          renderer.clear();
          renderer.render(scene, capturedCamera);
          stats.renders++;
          stats.lastDrawCalls += renderer.info?.render.calls || 0;
          stats.lastTriangles += renderer.info?.render.triangles || 0;
        } finally {
          // 无论这次捕获成功与否（剔除器可能在渲染途中抛错），都要还原剔除与可见性，
          // 否则场景会残留一批被隐藏的网格。
          culling.restore();
          for (const restoredObject of temporarilyHidden) {
            restoredObject.visible = true;
          }
        }
        if (captureRecord.scratch) {
          // 两趟分离式模糊：第一趟按水平方向（step.y = 0），第二趟按垂直方向
          // （step.x = 0），并在两趟之间交换源 / 目标以回到原贴图。
          // 步长用 (方向权重 * 2) / 512 换算：512 是反射贴图的标称基准分辨率。
          for (const [blurSource, blurDestination, sourceScale, destinationScale] of [
            [captureRecord.map, captureRecord.scratch, 1, 0],
            [captureRecord.scratch, captureRecord.map, 0, 1]
          ]) {
            blurMaterial.uniforms.source.value = blurSource.texture;
            blurMaterial.uniforms.step.value.set(
              (sourceScale * 2) / 512,
              (destinationScale * 2) / 512
            );
            renderer.setRenderTarget(blurDestination);
            renderer.clear();
            renderer.render(blurScene, blurCamera);
          }
        }
        stats.captures++;
        captureRecord.hasCapture = true;
        captureRecord.state = stateKeyByRecord.get(captureRecord);
      }
      if (pendingResume) {
        // 挂起期间攒下的「恢复」请求：到这里才开始淡入（前面一直按 0 强度渲染）。
        pendingResume = false;
        resumeStartedAtMs = performance.now();
        requestFrame();
      }
      needsUpdate = false;
      lastRenderTimeMs = frameStartMs;
      lastCameraSignature = cameraSignature;
      lastLightingSignature = lightingSignature;
    } finally {
      // 还原顺序与设置顺序大致相反：先恢复场景本身，再恢复渲染器状态，
      // 最后再同步一次区域灯（用主相机），把反射通道期间算出的镜像光照改回来。
      scene.matrixWorldAutoUpdate = rendererState.matrixWorldAutoUpdate;
      culling.restore();
      stats.culling = {
        ...culling.stats
      };
      for (const [restoredMesh, savedGeometry] of geometryRestores) {
        restoredMesh.geometry = savedGeometry;
      }
      for (const [visibilityObject, previousVisible] of hiddenObjects) {
        visibilityObject.visible = previousVisible;
      }
      for (const [materialMesh, savedMaterial] of materialRestores) {
        materialMesh.material = savedMaterial;
      }
      for (const restoredRecord of recordList) {
        restoredRecord.overlay.visible = restoredRecord.eligible && restoredRecord.hasCapture;
      }
      scene.background = rendererState.background;
      renderer.setClearColor(rendererState.color, rendererState.alpha);
      renderer.setRenderTarget(rendererState.target, rendererState.cubeFace, rendererState.mipmap);
      renderer.setViewport(rendererState.viewport);
      renderer.setScissor(rendererState.scissor);
      renderer.setScissorTest(rendererState.scissorTest);
      renderer.xr.enabled = rendererState.xr;
      renderer.shadowMap.autoUpdate = rendererState.shadow;
      renderer.autoClear = rendererState.autoClear;
      syncLighting(camera);
      stats.inCapture = false;
      stats.lastMs = performance.now() - captureStartMs;
      stats.totalMs += stats.lastMs;
    }
  }
  // 对外接口。render 由 studio-app 在主渲染之前调用；其余方法都是「改状态 + 标记
  // needsUpdate」，把实际的捕获推迟到下一次 render。
  return {
    settings: settings,
    stats: stats,
    render: render,
    configure: configure,
    /**
     * 设置只显示哪一层的地面反射（null 表示全部）。
     *
     * 非当前楼层的 overlay 立刻摘下来，避免楼层切换瞬间出现「别人的反射」；
     * 同时清 rootFirstChild 触发一次结构重扫（哪些地面属于本层由扫描决定）。
     */
    setVisibleFloor(nextFloorId) {
      const normalizedFloorId = nextFloorId == null ? null : String(nextFloorId);
      if (normalizedFloorId !== visibleFloorId) {
        visibleFloorId = normalizedFloorId;
        for (const floorRecord of recordList) {
          if (!isOnVisibleFloor(floorRecord.source)) {
            floorRecord.overlay.visible = false;
            floorRecord.overlay.removeFromParent();
          }
        }
        rootFirstChild = null;
        needsUpdate = true;
        requestFrame();
      }
    },
    /**
     * 设置「室外背景」面所属的楼层（null 表示不限制）。
     *
     * 只隐藏不匹配的室外记录，室内记录完全不受影响 —— 两者互不干扰。
     */
    setOutsideFloor(nextOutsideFloorId) {
      const normalizedOutsideFloorId =
        nextOutsideFloorId == null ? null : String(nextOutsideFloorId);
      if (normalizedOutsideFloorId !== outsideFloorId) {
        outsideFloorId = normalizedOutsideFloorId;
        for (const outsideRecord of recordList) {
          if (outsideRecord.kind === "outside" && !isOnOutsideFloor(outsideRecord.source)) {
            outsideRecord.overlay.visible = false;
          }
        }
        rootFirstChild = null;
        needsUpdate = true;
        requestFrame();
      }
    },
    /**
     * 挂起 / 恢复反射（楼层特效暂停、演示模式时用）。
     *
     * @param {{fade?: boolean}} [options] fade = true 时走 240ms 淡出，否则立即隐藏。
     */
    setSuspended(suspended, { fade: fade = false } = {}) {
      const nextSuspended = suspended === true;
      if (isSuspended === nextSuspended) {
        // 幂等调用：但重复挂起时仍要把 overlay 摘干净（可能有新记录刚被创建出来），
        // 且 fade = false 的重复调用要顺手取消正在进行的淡出。
        if (nextSuspended) {
          for (const hiddenRecord of recordList) {
            hiddenRecord.overlay.visible = false;
            hiddenRecord.overlay.removeFromParent();
          }
        }
        if (nextSuspended && !fade) {
          suspendStartedAtMs = null;
        }
        return;
      }
      isSuspended = nextSuspended;
      resumeStartedAtMs = null;
      pendingResume = !isSuspended;
      suspendStartedAtMs = isSuspended && fade ? performance.now() : null;
      for (const suspendRecord of recordList) {
        if (isSuspended && fade) {
          suspendRecord.fadeOutStrength = suspendRecord.overlay.visible
            ? suspendRecord.overlay.material.uniforms.strength.value
            : 0;
          suspendRecord.fadeOutMatrix = suspendRecord.matrix.clone();
          suspendRecord.source.updateWorldMatrix(true, false);
          suspendRecord.fadeOutFrame = suspendRecord.source.matrixWorld.clone();
        }
        suspendRecord.overlay.visible = false;
        suspendRecord.overlay.removeFromParent();
      }
      needsUpdate = true;
      if (!isSuspended) {
        rootFirstChild = null;
      }
      requestFrame();
    },
    // 只读访问记录列表（调试 / 统计用）；返回的是内部数组本身，调用方不要修改。
    get records() {
      return recordList;
    },
    /**
     * 手动标记「需要重拍」（例如外部改了 toneMappingExposure 这类没进签名的状态）。
     */
    invalidate() {
      needsUpdate = true;
    },
    /**
     * 声明某些楼层的内容发生了变化，需要重拍反射。
     */
    changed(changedFloorIds) {
      if (changedFloorIds == null) {
        changeRevisionCount++;
      } else {
        for (const changedFloorId of new Set(changedFloorIds)) {
          if (!changedFloorId || !heightByFloorId.has(String(changedFloorId))) {
            changeRevisionCount++;
            continue;
          }
          floorChangeCounts.set(
            String(changedFloorId),
            (floorChangeCounts.get(String(changedFloorId)) || 0) + 1
          );
        }
      }
    },
    /**
     * 释放控制器持有的全部资源。幂等。
     *
     * 顺序：先停掉节流定时器（否则回调会在释放后再请求一帧），再释放记录，
     * 最后释放模糊用的共享几何 / 材质与所有折射克隆材质。
     */
    dispose() {
      isDisposed = true;
      detail?.dispose();
      clearTimeout(throttleTimer);
      disposeAllRecords();
      blurMesh.geometry.dispose();
      blurMaterial.dispose();
      for (const disposeListener of [...disposeHandlerByClone.values()]) {
        disposeListener();
      }
      floorChangeCounts.clear();
      heightByFloorId.clear();
      lightsByFloorId.clear();
    }
  };
}
