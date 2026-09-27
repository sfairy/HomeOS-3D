
import { normalizeGroundReflection } from "../../bridge/reflection-settings.js?v=2609271411";
import { createReflectionCulling } from "./studio-reflection-culling.js?v=2609271411";
import { resolveFloorId, isFloorTransitionLeaving, isVisibleWithin } from "./reflection-scene-queries.js?v=2609271411";
import { createRefractionMaterialResolver } from "./refraction-materials.js?v=2609271411";
/**
 * 创建地面反射控制器（一个渲染器一份）。
 * @param {function(object): void} options.syncLighting 用给定相机同步区域灯 —— 反射通道需要按镜像相机重新算一次光照，否则反射里的房间亮度会和主画面不一致。 @param {function(): string} [options.getStateKey] 外部状态签名（文档版本、环境开关等），变化即视为需要重拍。
 * @param {boolean} [options.floorLighting] 是否按楼层分别烘焙光照（true 时楼层之间的光照签名分开计算，false 时视为全局一致）。
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
  cull: cull = true,
  blur: blur = true,
  requestFrame: requestFrame = () => {}
}) {
  // 反射参数来自全局归一化函数（模式 / 分辨率 / 强度），fps 是本模块额外加的节流上限。
  const settings = {
    ...normalizeGroundReflection(),
    // 30fps：反射每帧要额外渲染一遍全场景，按 30fps 上限可以省掉一半开销，
    fps: 30
  };
  // 可见性剔除器（studio-reflection-culling.js）：把不可能出现在镜像画面里的网格
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
  const { getRefractionFreeMaterials, disposeMaterialClones } = createRefractionMaterialResolver();
  // 源相机 → 镜像相机：相机对象在每帧被复用，clone 一次即可。
  const reflectionCameraBySource = new WeakMap();
  const scratchWorldPosition = new THREE.Vector3();
  const scratchWorldNormal = new THREE.Vector3();
  const scratchLookTarget = new THREE.Vector3();
  const scratchPlane = new THREE.Plane();
  const scratchPlaneVector = new THREE.Vector4();
  const scratchSignVector = new THREE.Vector4();
  const scratchProjectionMatrix = new THREE.Matrix4();
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
  const objectIdByObject = new WeakMap();
  let objectIdSequence = 0;
  /**
   * 取对象的稳定自增 ID。
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
   * 判断「室外背景」面是否属于当前选定的室外楼层。
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
      overlayMesh.position.copy(sourceMesh.position);
      overlayMesh.quaternion.copy(sourceMesh.quaternion);
      overlayMesh.scale.copy(sourceMesh.scale);
      // renderOrder = 1：必须在地面之后绘制，才能正确做透明混合。
      overlayMesh.renderOrder = 1;
      overlayMesh.userData.environmentEffect = true;
      overlayMesh.userData.reflectionOverlay = true;
      // 这三个标记告诉资源管理系统「几何 / 材质 / 贴图是共享的，不要跟着 overlay
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
        record.dead = true;
        overlayMesh.visible = false;
      };
      sourceMesh.geometry.addEventListener("dispose", record.onSourceDispose);
      recordsBySource.set(sourceMesh, record);
      stats.allocations++;
      sourceMesh.parent.add(overlayMesh);
      recordList.push(record);
    }
    trimRecordCache();
    // 结构变了，下一次 render 必须重新捕获（哪怕相机与光照都没变）。
    needsUpdate = true;
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
   * 应用新的反射设置（来自设置面板）。三档处理：
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
   */
  function updateReflectionCamera(sourceCamera, mirrorPlane, textureMatrix) {
    let reflectionCamera = reflectionCameraBySource.get(sourceCamera);
    if (!reflectionCamera) {
      reflectionCamera = sourceCamera.clone(false);
      reflectionCameraBySource.set(sourceCamera, reflectionCamera);
    }
    reflectionCamera.layers.mask = sourceCamera.layers.mask;
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
    reflectionCamera.projectionMatrix.elements[8] *= -1;
    reflectionCamera.projectionMatrix.elements[12] *= -1;
    textureMatrix
      // 这个 4x4 矩阵把 NDC（[-1,1]）映射到 UV（[0,1]）：x/y 缩放 0.5、平移 0.5，
      .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(reflectionCamera.projectionMatrix)
      .multiply(reflectionCamera.matrixWorldInverse);
    // 下面是「斜切近平面裁剪」（Oblique Near-Plane Clipping）的标准推导：
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
    const allInside = dirtyRecords.every(checkedRecord => checkedRecord.kind === "inside");
    culling.reset();
    const captureStartMs = performance.now();
    stats.inCapture = true;
    stats.lastDrawCalls = stats.lastTriangles = 0;
    try {
      // 反射通道的单节点预处理：按楼层 / 离场状态决定是否把该节点（及其子树）
      const prepareNode = candidateNode => {
        if (!candidateNode.visible) {
          return;
        }
        // 反射通道的「剔除清单」：非当前楼层的内容、正在离场的旧楼层、
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
          culling.add(candidateNode, !floorLighting);
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
          culling.restore();
          for (const restoredObject of temporarilyHidden) {
            restoredObject.visible = true;
          }
        }
        if (captureRecord.scratch) {
          // 两趟分离式模糊：第一趟按水平方向（step.y = 0），第二趟按垂直方向
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
  return {
    settings: settings,
    stats: stats,
    render: render,
    configure: configure,
    /**
     * 设置只显示哪一层的地面反射（null 表示全部）。
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
     * @param {{fade?: boolean}} [options] fade = true 时走 240ms 淡出，否则立即隐藏。
     */
    setSuspended(suspended, { fade: fade = false } = {}) {
      const nextSuspended = suspended === true;
      if (isSuspended === nextSuspended) {
        // 幂等调用：但重复挂起时仍要把 overlay 摘干净（可能有新记录刚被创建出来），
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
     */
    dispose() {
      isDisposed = true;
      clearTimeout(throttleTimer);
      disposeAllRecords();
      blurMesh.geometry.dispose();
      blurMaterial.dispose();
      disposeMaterialClones();
      floorChangeCounts.clear();
      heightByFloorId.clear();
      lightsByFloorId.clear();
    }
  };
}
