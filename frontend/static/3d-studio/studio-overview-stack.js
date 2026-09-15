/**
 * 楼层堆叠总览（exploded view）。
 *
 * 位置：3D 工作室的「总览」模式，把多个楼层在同一画面里按层竖向错开叠加显示，
 *   便于一眼看完整栋住宅的布置。
 * 对外：overviewFloorId（判定对象属于哪层）、stackProjection（堆叠投影矩阵）、
 *   createOverviewStack（总览控制器，返回 cameraForFloor / rayForFloor / dispose 等）。
 * 实现思路：不改动场景与几何，而是给每个楼层克隆一台相机，把「屏幕平移」直接乘进
 *   它的投影矩阵里，再接管 renderer.render / renderBufferDirect 按对象所属楼层换相机。
 * 坐标与单位：世界坐标，长度单位米；layout.gap 为层间视觉间隔（米），
 *   layout.amount 为错位倍率。
 * 副作用：控制器会替换 renderer 上的两个方法，dispose 时必须调用以还原。
 */

/**
 * 从节点向上回溯，找出它所属的楼层 id。
 *
 * 场景里不同子系统用了不同的字段记录楼层（普通物件、区域光、环境特效、灯光缓存），
 * 这里按优先级依次尝试，任一命中即返回。
 *
 * @param {object} node 场景节点。
 * @returns {string} 楼层 id；不属于任何楼层时返回空串。
 */
export function overviewFloorId(node) {
  for (let currentNode = node; currentNode; currentNode = currentNode.parent) {
    const resolvedFloorId =
      currentNode.userData?.floorId ||
      currentNode.userData?.regionFloorId ||
      currentNode.userData?.environmentFloorId ||
      currentNode.userData?.lightFloorId;
    if (resolvedFloorId) {
      return String(resolvedFloorId);
    }
  }
  return "";
}

/**
 * 构造「把世界沿 Y 轴下移 stackedHeight，再整体在屏幕上平移」的投影矩阵。
 *
 * 推导：three.js 渲染时会再乘一次 matrixWorldInverse（即视图矩阵的逆），
 * 为了让最终结果等于「原投影 × 下移」，这里的矩阵末尾必须补上一个 camera.matrixWorld。
 * 屏幕平移放在最左侧，因此它是裁剪空间下的位移 —— 与物体离相机的远近无关。
 *
 * @param {object} THREE three.js 模块命名空间。
 * @param {object} camera 基准相机（取其投影矩阵与世界矩阵）。
 * @param {number} stackedHeight 世界空间的下移量（米），即该层的堆叠高度。
 * @param {number} projectionOffsetY 裁剪空间下的额外纵向偏移。
 * @param {object} [targetMatrix] 复用的目标矩阵，避免每帧新建。
 * @returns {object} 结果矩阵。
 */
export function stackProjection(
  THREE,
  camera,
  stackedHeight,
  projectionOffsetY,
  targetMatrix = new THREE.Matrix4()
) {
  const translationMatrix = new THREE.Matrix4().makeTranslation(0, projectionOffsetY, 0);
  return targetMatrix
    .copy(translationMatrix)
    .multiply(camera.projectionMatrix)
    .multiply(camera.matrixWorldInverse)
    .multiply(new THREE.Matrix4().makeTranslation(0, -stackedHeight, 0))
    .multiply(camera.matrixWorld);
}

/**
 * 创建楼层堆叠总览控制器。
 *
 * @param {object} options 依赖注入。
 * @param {object} options.THREE three.js 模块命名空间。
 * @param {object} options.renderer 渲染器（会被替换 render / renderBufferDirect）。
 * @param {object} options.scene 主场景。
 * @param {function(): object} options.getCamera 取当前主相机。
 * @param {function(): object} options.getLayout 取堆叠布局
 *   （含 enabled、floors、gap、amount、center、bounds）。
 * @returns {{stats: object, cameraForFloor: Function, rayForFloor: Function,
 *   reflectionCamera: Function, presentationPoint: Function, dispose: Function}} 控制器实例。
 */
export function createOverviewStack({
  THREE: three,
  renderer: renderer,
  scene: scene,
  getCamera: getCamera,
  getLayout: getLayout
}) {
  // 保存原方法：所有覆写最终都要转发回它们，dispose 时也要还原。
  const originalRenderBufferDirect = renderer.renderBufferDirect;
  const originalRender = renderer.render;
  // 每个楼层一份 {camera, reflection, height}；相机是克隆出来的，投影矩阵被单独改写。
  const stackByFloorId = new Map();
  // 堆叠期间需要临时关掉视锥剔除（投影被改过，three.js 的剔除判定会出错），
  // 这里记录每个节点的原值以便精确还原。
  const savedFrustumCulled = new Map();
  let stackedLayerCamera = null;
  let lastLayoutSignature = "";
  let layout = null;
  let renderRevision = 0;
  let syncedRevision = -1;
  let lastBounds = null;
  let maxBoundHeight = 0;
  // 缓存上一次同步时用到的投影 / 视图矩阵，用来判断「相机没动，无需重算」。
  const lastProjectionMatrix = new three.Matrix4();
  const lastWorldInverse = new three.Matrix4();
  const scratchViewPosition = new three.Vector3();
  const scratchMatrix4 = new three.Matrix4();
  const stats = {
    active: false,
    floorCount: 0,
    preparations: 0
  };

  /**
   * 取当前生效的堆叠布局；不满足生效条件时返回 null。
   *
   * @returns {object|null} 布局对象。
   */
  function getActiveLayout() {
    const currentLayout = getLayout();
    // 少于两层没有「堆叠」的意义；amount 为 0 表示错位倍率被关掉。
    if (!currentLayout.enabled || currentLayout.floors.length < 2 || currentLayout.amount <= 0) {
      return null;
    }
    // 用序列化签名判断布局是否变化：楼层标高或间距一变，所有层相机都要重算。
    const layoutSignature = JSON.stringify([
      currentLayout.gap,
      currentLayout.amount,
      currentLayout.center,
      currentLayout.floors.map(floor => [floor.id, floor.elevation])
    ]);
    if (layoutSignature !== lastLayoutSignature) {
      lastLayoutSignature = layoutSignature;
      // 置为 -1 强制下一次同步重新计算（与 renderRevision 一定不相等）。
      syncedRevision = -1;
    }
    layout = currentLayout;
    return currentLayout;
  }

  /**
   * 还原堆叠期间被改动的视锥剔除开关。
   *
   * @returns {void}
   */
  function restoreFrustumCulled() {
    for (const [culledNode, frustumCulled] of savedFrustumCulled) {
      culledNode.frustumCulled = frustumCulled;
    }
    savedFrustumCulled.clear();
  }

  /**
   * 按当前布局刷新各楼层的层相机与镜像相机。
   *
   * @param {object} renderCamera 本次渲染用的主相机。
   * @returns {void}
   */
  function syncFloorCameras(renderCamera) {
    // 帧号与矩阵都没变时直接返回：这是每帧都会走的路径，提前退出很关键。
    if (
      !layout ||
      (syncedRevision === renderRevision &&
        lastProjectionMatrix.equals(renderCamera.projectionMatrix) &&
        lastWorldInverse.equals(renderCamera.matrixWorldInverse))
    ) {
      return;
    }
    lastProjectionMatrix.copy(renderCamera.projectionMatrix);
    lastWorldInverse.copy(renderCamera.matrixWorldInverse);
    syncedRevision = renderRevision;
    // 按标高升序排列：堆叠顺序即楼层高低顺序，与列表顺序无关。
    const sortedFloors = [...layout.floors].sort(
      (floorA, floorB) => floorA.elevation - floorB.elevation
    );
    // 楼层包围盒变化时才重算最高点，它决定堆叠中心的高度。
    if (lastBounds !== layout.bounds) {
      lastBounds = layout.bounds;
      maxBoundHeight = 0;
      for (const boundsList of layout.bounds?.values() || []) {
        for (const boundsBox of boundsList) {
          maxBoundHeight = Math.max(maxBoundHeight, boundsBox[1]);
        }
      }
    }
    // 堆叠中心取「平面中心 + 包围盒高度的一半」；顶面中心再上移半个堆叠总高，
    // 用来估算整叠内容在屏幕上的纵向跨度。
    const stackCenter = new three.Vector3(layout.center[0], maxBoundHeight / 2, layout.center[2]);
    const topCenter = stackCenter.clone();
    topCenter.y += (sortedFloors.at(-1).elevation - sortedFloors[0].elevation) / 2;
    scratchViewPosition.copy(topCenter).applyMatrix4(renderCamera.matrixWorldInverse);
    const projectionElements = renderCamera.projectionMatrix.elements;
    // 取投影矩阵第 4 行对视图空间点的作用，得到该点的 w 分量（即视图空间深度）。
    const projectedDepth =
      projectionElements[3] * scratchViewPosition.x +
      projectionElements[7] * scratchViewPosition.y +
      projectionElements[11] * scratchViewPosition.z +
      projectionElements[15];
    // 投影矩阵的 [5] 是纵向缩放；两者相除把「世界米」换算成「裁剪空间单位」，
    // 于是层间距在屏幕上看起来与相机远近无关，始终保持一致。
    const verticalScale = projectionElements[5] / Math.max(Math.abs(projectedDepth), 0.001);
    const activeFloorIds = new Set();
    for (const [floorIndex, floorEntry] of sortedFloors.entries()) {
      activeFloorIds.add(floorEntry.id);
      let stackRecord = stackByFloorId.get(floorEntry.id);
      // 相机类型变了（透视 ↔ 正交）必须重建克隆，否则投影矩阵结构不匹配。
      if (!stackRecord || stackRecord.camera.type !== renderCamera.type) {
        stackRecord = {
          camera: renderCamera.clone(false),
          reflection: renderCamera.clone(false)
        };
        stackByFloorId.set(floorEntry.id, stackRecord);
      }
      // 高度按「层序号 × 间距 × 倍率」累计，而不是用真实标高 —— 总览模式要的是规律排布。
      stackRecord.height = floorIndex * layout.gap * layout.amount;
      stackRecord.camera.copy(renderCamera, false);
      stackProjection(
        three,
        renderCamera,
        stackRecord.height,
        0,
        stackRecord.camera.projectionMatrix
      );
      // 改过投影矩阵后必须同步更新它的逆矩阵，否则射线拾取会算错。
      stackRecord.camera.projectionMatrixInverse.copy(stackRecord.camera.projectionMatrix).invert();
      // 镜像相机：直接把世界位置抬高该层堆叠高度，用于地面反射的取景。
      stackRecord.reflection.copy(renderCamera, false);
      stackRecord.reflection.position.y += stackRecord.height;
      stackRecord.reflection.updateMatrixWorld(true);
    }
    // 每层的屏幕纵向错位量（裁剪空间），middleIndex 让整个堆叠以中心对齐。
    const layerOffset = Math.max(0, layout.gap) * Math.abs(verticalScale);
    // 堆叠最中间那一层的序号：用它把各层对称分布在中心上下，视觉重心不偏。
    const middleIndex = (sortedFloors.length - 1) / 2;
    const baseScreenPosition = stackCenter.project(renderCamera);
    const topScreenPosition = topCenter.project(renderCamera);
    // 顶面相对底面在裁剪空间的横向位移，乘以倍率即整个堆叠的倾斜错位量。
    const screenOffsetX = (topScreenPosition.x - baseScreenPosition.x) * layout.amount;
    // 纵向分量同理：两者一起把堆叠沿视线方向斜切拉开，形成层叠效果。
    const screenOffsetY = (topScreenPosition.y - baseScreenPosition.y) * layout.amount;
    for (const [layerIndex, layerFloor] of sortedFloors.entries()) {
      const layerRecord = stackByFloorId.get(layerFloor.id);
      // 层与层之间的间距直接乘 amount：倍率同时影响「拉开多少」与「错位多少」。
      const layerOffsetY = (layerIndex - middleIndex) * layerOffset * layout.amount;
      // 在投影矩阵最前面再左乘一次屏幕平移，即完成该层的最终定位。
      layerRecord.camera.projectionMatrix.premultiply(
        scratchMatrix4.makeTranslation(screenOffsetX, screenOffsetY + layerOffsetY, 0)
      );
      layerRecord.camera.projectionMatrixInverse.copy(layerRecord.camera.projectionMatrix).invert();
    }
    // 已被删除的楼层要把克隆相机一起清掉，否则 Map 会一直增长。
    for (const staleFloorId of stackByFloorId.keys()) {
      if (!activeFloorIds.has(staleFloorId)) {
        stackByFloorId.delete(staleFloorId);
      }
    }
    stats.preparations++;
    stats.floorCount = stackByFloorId.size;
  }

  /**
   * 取某楼层对应的层相机。
   *
   * @param {string} floorId 楼层 id。
   * @param {object} [sourceCamera] 基准相机，默认取主相机。
   * @returns {object} 层相机；总览未启用或该层无记录时返回基准相机。
   */
  function cameraForFloor(floorId, sourceCamera = getCamera()) {
    if (getActiveLayout()) {
      // 层相机的世界矩阵取自基准相机，克隆后不再自动更新，此处手动刷新一次。
      sourceCamera.updateWorldMatrix(true, false);
      syncFloorCameras(sourceCamera);
      return stackByFloorId.get(floorId)?.camera || sourceCamera;
    } else {
      return sourceCamera;
    }
  }
  renderer.render = function (renderScene, layerCamera, ...renderRest) {
    // 上层显式要求跳过（例如渲染到离屏纹理）时直接透传。
    if (renderer.userData?.suppressOverviewStack) {
      return originalRender.call(this, renderScene, layerCamera, ...renderRest);
    }
    const previousLayerCamera = stackedLayerCamera;
    // 只接管「主场景 + 主相机」这一次渲染，其它调用（阴影贴图、后处理）原样转发。
    const isStackedLayer = renderScene === scene && layerCamera === getCamera();
    const originalOnBeforeRender = scene.onBeforeRender;
    let stackedOnBeforeRender;
    if (isStackedLayer) {
      stats.active = !!getActiveLayout();
      // 每次主场景渲染视为一个新帧，用于让层相机的同步缓存失效检查生效。
      renderRevision++;
      if (stats.active) {
        stackedOnBeforeRender = function (...hookArgs) {
          originalOnBeforeRender?.apply(this, hookArgs);
          // three.js 在 onBeforeRender 之后才做剔除，因此这里改 frustumCulled 才有效。
          if (hookArgs[2] === layerCamera) {
            syncFloorCameras(layerCamera);
            scene.traverse(childNode => {
              // 属于某个楼层的可见对象一律关掉剔除：它们的投影被整体平移过，
              // 用原视锥判断会把「实际仍在画面里」的层误剔除掉。
              if (
                (!!childNode.isMesh ||
                  !!childNode.isLine ||
                  !!childNode.isPoints ||
                  !!childNode.isSprite) &&
                !!overviewFloorId(childNode)
              ) {
                if (!savedFrustumCulled.has(childNode)) {
                  savedFrustumCulled.set(childNode, childNode.frustumCulled);
                }
                childNode.frustumCulled = false;
              }
            });
          }
        };
        scene.onBeforeRender = stackedOnBeforeRender;
      } else {
        // 退出总览模式时把上一帧留下的剔除开关还原。
        restoreFrustumCulled();
      }
    }
    stackedLayerCamera = isStackedLayer && stats.active ? layerCamera : null;
    try {
      return originalRender.call(this, renderScene, layerCamera, ...renderRest);
    } finally {
      // 用 finally 保证渲染抛错时也能把钩子与状态还原，避免污染后续调用。
      stackedLayerCamera = previousLayerCamera;
      if (isStackedLayer) {
        if (scene.onBeforeRender === stackedOnBeforeRender) {
          scene.onBeforeRender = originalOnBeforeRender;
        }
        restoreFrustumCulled();
      }
    }
  };
  renderer.renderBufferDirect = function (
    drawCamera,
    drawScene,
    geometry,
    material,
    object,
    group
  ) {
    // 阴影 / 深度通道可能传入已释放或缺失的材质，three.js 会去读
    // properties.get(material).state 而崩溃，这里先拦掉。
    if (!material || !geometry) {
      return;
    }
    if (
      !renderer.userData?.suppressOverviewStack &&
      stackedLayerCamera === drawCamera &&
      drawScene === scene
    ) {
      syncFloorCameras(drawCamera);
      // 逐对象换成它所属楼层的层相机 —— 这是堆叠效果真正生效的地方。
      drawCamera = stackByFloorId.get(overviewFloorId(object))?.camera || drawCamera;
    }
    return originalRenderBufferDirect.call(
      this,
      drawCamera,
      drawScene,
      geometry,
      material,
      object,
      group
    );
  };
  return {
    stats: stats,
    cameraForFloor: cameraForFloor,
    rayForFloor(rayFloorId, pointer, ray) {
      const activeCamera = getCamera();
      const targetCamera = cameraForFloor(rayFloorId, activeCamera);
      if (targetCamera === activeCamera) {
        ray.setFromCamera(pointer, activeCamera);
        return ray;
      }
      // 层相机的投影矩阵被平移过，setFromCamera 无法直接使用；
      // 这里手动在裁剪空间的 z = -1（近）与 z = 1（远）各取一点反投影，得到射线。
      const nearPoint = new three.Vector3(pointer.x, pointer.y, -1).unproject(targetCamera);
      const rayDirection = new three.Vector3(pointer.x, pointer.y, 1)
        .unproject(targetCamera)
        .sub(nearPoint)
        .normalize();
      ray.set(nearPoint, rayDirection);
      // 记下使用的相机，供上层做后续的距离 / 平面换算。
      ray.camera = targetCamera;
      return ray;
    },
    reflectionCamera(baseCamera, objectRoot) {
      // 非主相机或未启用总览时，反射沿用原相机。
      if (baseCamera !== getCamera() || !getActiveLayout()) {
        return baseCamera;
      } else {
        syncFloorCameras(baseCamera);
        // 镜像相机是「抬高该层堆叠高度」的克隆，保证反射与该层画面在屏幕上对齐。
        return stackByFloorId.get(overviewFloorId(objectRoot))?.reflection || baseCamera;
      }
    },
    presentationPoint(projectFloorId, point) {
      const referenceCamera = getCamera();
      const floorCamera = cameraForFloor(projectFloorId, referenceCamera);
      if (floorCamera === referenceCamera) {
        return point;
      } else {
        // 先在层相机下投影，再用主相机反投影：把「内容生成时的位置」换算成
        // 它在当前堆叠画面里的实际屏幕位置。
        return point.project(floorCamera).unproject(referenceCamera);
      }
    },
    dispose() {
      restoreFrustumCulled();
      stackByFloorId.clear();
      renderer.render = originalRender;
      renderer.renderBufferDirect = originalRenderBufferDirect;
    }
  };
}
