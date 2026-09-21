/**
 * 模型的屏幕描边与设备光晕（两种 2D 叠加层反馈）：createScreenOutlines 把选中模型轮廓投影到屏幕、
 * 用 SVG 描边 + 呼吸脉冲标出；createEnvironmentHalos 在模型前方贴一片加性发光面片，用颜色表示设备状态。
 *
 * 约定：描边只依赖「模型的 27 个方向极值点」，极值点缓存以几何体 uuid 为键，几何体复用或扫地机
 * 移动组变化时自动失效重算。
 */

// 模型定位键（楼层 + 模型）的唯一实现在 core/scene-model-key.js。
import { sceneModelKey } from "../core/scene-model-key.js?v=20260921152526";
// 「减少动态效果」偏好的唯一判定。
import { prefersReducedMotionNow } from "../core/motion-preference.js?v=20260921152526";

/**
 * 求二维点集的凸包（Andrew 单调链算法）。
 */
function outlineHull(hullInput) {
  // 先按 x 再按 y 排序，单调链的前提。
  const sortedPoints = hullInput
    .slice()
    .sort((leftPoint, rightPoint) => leftPoint[0] - rightPoint[0] || leftPoint[1] - rightPoint[1]);
  /** 叉积：> 0 表示三点左转（逆时针）。 */
  const crossProduct = (originPoint, secondPoint, thirdPoint) =>
    (secondPoint[0] - originPoint[0]) * (thirdPoint[1] - originPoint[1]) -
    (secondPoint[1] - originPoint[1]) * (thirdPoint[0] - originPoint[0]);
  /**
   * 走一条链（下半边或上半边）。
   * cross <= 0 就弹出：等于 0 也要弹，这样共线的中间点被丢掉，最终轮廓
   * 只保留真正的拐角（描边更短、也不会有毛刺）。
   */
  const buildHullSide = sortedInput => {
    const stack = [];
    for (const stackPoint of sortedInput) {
      while (stack.length > 1 && crossProduct(stack.at(-2), stack.at(-1), stackPoint) <= 0) {
        stack.pop();
      }
      stack.push(stackPoint);
    }
    return stack;
  };
  // 两条链各去掉最后一个点（它与另一条链的第一个点重合）。
  return [
    ...buildHullSide(sortedPoints).slice(0, -1),
    ...buildHullSide(sortedPoints.reverse()).slice(0, -1)
  ];
}
/**
 * 创建模型轮廓描边（SVG 覆盖层）。
 */
export function createScreenOutlines({
  THREE: three,
  container: container,
  camera: camera,
  getCamera: getCamera,
  getObjectCamera: getObjectCamera
}) {
  const svgElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const coreOutlineElement = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const outerGlowElement = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const innerGlowElement = document.createElementNS("http://www.w3.org/2000/svg", "path");
  svgElement.setAttribute("class", "i3d-model-outlines");
  // 描边是纯装饰，对读屏器隐藏。
  svgElement.setAttribute("aria-hidden", "true");
  // 三层描边叠加出「外发光 + 内发光 + 实线」的观感；
  // 宽度与不透明度成反比（越粗越淡），因此看起来是柔和的辉光而不是三条线。
  for (const [outlinePathElement, outlineWidth, outlineOpacity] of [
    [outerGlowElement, 10, 0.14],
    [innerGlowElement, 6, 0.22],
    [coreOutlineElement, 2.6, 0.48]
  ]) {
    outlinePathElement.setAttribute("fill", "none");
    outlinePathElement.setAttribute("stroke", "#d5dedb");
    outlinePathElement.setAttribute("stroke-width", String(outlineWidth));
    outlinePathElement.setAttribute("stroke-opacity", String(outlineOpacity));
    outlinePathElement.setAttribute("stroke-linejoin", "round");
    outlinePathElement.setAttribute("stroke-linecap", "round");
  }
  // 用 CSS 模糊代替额外的描边层，成本更低。
  outerGlowElement.style.filter = "blur(2px)";
  innerGlowElement.style.filter = "blur(.8px)";
  // 追加顺序决定绘制顺序：先发光、后实线，实线压在最上层。
  svgElement.append(outerGlowElement);
  svgElement.append(innerGlowElement);
  svgElement.append(coreOutlineElement);
  container.append(svgElement);
  let cachedModelRoot;
  let cachedSceneRevision;
  let cachedModelKey = "";
  let outlineModels = [];
  let isOutlineActive = false;
  let cachedRenderKey = "";
  let resumeAtTimestamp = 0;
  let cachedCameraKey = "";
  let pointsByModel = new WeakMap();
  // 呼吸脉冲：三个描边层同步做 1 → 0.3 → 1 的透明度过山车。
  // 用户要求减少动态效果时不做动画（数组为空，后续全部逻辑自然退化为静态描边）。
  const pulseAnimations =
    prefersReducedMotionNow()
      ? []
      : [outerGlowElement, innerGlowElement, coreOutlineElement]
          .map(animatedElement =>
            animatedElement.animate?.(
              [
                {
                  opacity: 1
                },
                {
                  opacity: 0.3
                },
                {
                  opacity: 1
                }
              ],
              {
                // 2.2 秒一轮、ease-in-out：足够慢，不会分散注意力。
                duration: 2200,
                iterations: Infinity,
                easing: "ease-in-out"
              }
            )
          )
          .filter(Boolean);
  let isPulsing = false;
  // 动画先暂停：只有真正显示描边时才播放。
  pulseAnimations.forEach(pulseAnimation => pulseAnimation.pause());
  /** 切换呼吸脉冲；重新播放时把时间归零，保证每次都是从最亮开始。 */
  function setPulseActive(shouldPulse) {
    if (isPulsing !== shouldPulse) {
      isPulsing = shouldPulse;
      for (const animationInstance of pulseAnimations) {
        if (shouldPulse) {
          animationInstance.currentTime = 0;
          animationInstance.play();
        } else {
          animationInstance.pause();
        }
      }
    }
  }
  // 27 个方向（-1/0/1 的三元组合，去掉零向量）。
  // 沿这些方向各取一个最远点，就能用极小的代价近似出模型的「轮廓点云」。
  const directionVectors = [];
  for (const xIndex of [-1, 0, 1]) {
    for (const yIndex of [-1, 0, 1]) {
      for (const zIndex of [-1, 0, 1]) {
        if (xIndex || yIndex || zIndex) {
          directionVectors.push(new three.Vector3(xIndex, yIndex, zIndex));
        }
      }
    }
  }
  /**
   * 求模型在世界坐标下的轮廓极值点。
   */
  function computeSilhouettePoints(modelRoot) {
    const extremePoints = directionVectors.map(() => ({
      score: -Infinity,
      point: null
    }));
    const scratchVector = new three.Vector3();
    // 递归遍历网格顶点，按每个方向向量取投影极值，得到世界坐标下的轮廓散点。
    // 矩阵沿父级相乘传入（不读 matrixWorld），以免依赖本帧是否已渲染。
    function walkMeshes(object3d, parentMatrix) {
      // 跳过环境效果、扫地机的移动组、隐藏子树，以及嵌套的独立模型
      // （嵌套模型有自己的坐标系，不该算进当前模型的轮廓）。
      if (
        object3d.userData?.environmentEffect ||
        object3d === modelRoot.userData?.vacuumMobileRoot ||
        (object3d !== modelRoot && object3d.visible === false) ||
        (object3d !== modelRoot && object3d.userData?.environmentModelId != null)
      ) {
        return;
      }
      const positionAttribute = object3d.isMesh && object3d.geometry?.attributes?.position;
      if (positionAttribute) {
        // 逐顶点扫描：顶点数在环境模型上都是几千级别，可接受。
        for (let vertexIndex = 0; vertexIndex < positionAttribute.count; vertexIndex++) {
          scratchVector
            .fromBufferAttribute(positionAttribute, vertexIndex)
            .applyMatrix4(parentMatrix);
          directionVectors.forEach((direction, directionIndex) => {
            const projectionDot = scratchVector.dot(direction);
            if (projectionDot > extremePoints[directionIndex].score) {
              extremePoints[directionIndex] = {
                score: projectionDot,
                point: scratchVector.clone()
              };
            }
          });
        }
      }
      for (const childObject of object3d.children || []) {
        if (childObject.matrixAutoUpdate) {
          childObject.updateMatrix();
        }
        walkMeshes(
          childObject,
          new three.Matrix4().multiplyMatrices(parentMatrix, childObject.matrix)
        );
      }
    }
    walkMeshes(modelRoot, new three.Matrix4());
    // 没有任何顶点命中的方向直接丢掉（空模型）。
    return extremePoints
      .filter(candidatePoint => candidatePoint.point)
      .map(extremePoint => extremePoint.point);
  }
  /**
   * 同步需要描边的模型列表。
   */
  function syncOutlines(syncModelRoot, sceneRevision, modelList, shouldShowOutlines) {
    isOutlineActive = shouldShowOutlines;
    // resumeAtTimestamp 是相机交互后的冷却期，冷却中即使要求显示也先不显示。
    const shouldShow = shouldShowOutlines && performance.now() >= resumeAtTimestamp;
    svgElement.style.opacity = shouldShow ? "1" : "0";
    setPulseActive(shouldShow);
    const modelKeyList = JSON.stringify(
      modelList.map(modelRef => sceneModelKey(modelRef.floorId, modelRef.modelId))
    );
    // 根节点、修订号、模型列表都没变：不需要重新索引场景。
    if (
      cachedModelRoot === syncModelRoot &&
      cachedSceneRevision === sceneRevision &&
      cachedModelKey === modelKeyList
    ) {
      return;
    }
    if (cachedModelRoot !== syncModelRoot || cachedSceneRevision !== sceneRevision) {
      // 场景换了，缓存的极值点全部作废（几何体可能已被替换）。
      pointsByModel = new WeakMap();
    }
    cachedModelRoot = syncModelRoot;
    cachedSceneRevision = sceneRevision;
    cachedModelKey = modelKeyList;
    // 模型列表变了，投影结果必然失效。
    cachedRenderKey = "";
    const modelsByKey = new Map();
    cachedModelRoot?.traverse(traversedObject => {
      // 只有这些类型的环境模型支持描边（灯具等其它模型没有意义，也会拖慢遍历）。
      if (
        ![
          "wallac",
          "floorac",
          "airoutlet",
          "curtain",
          "nas",
          "tv",
          "robotvacuum",
          "camera",
          "presence"
        ].includes(traversedObject.userData?.environmentModelType)
      ) {
        return;
      }
      // 楼层 ID 允许向上继承。
      let floorId = traversedObject.userData.environmentFloorId;
      for (
        let ancestor = traversedObject.parent;
        floorId == null && ancestor;
        ancestor = ancestor.parent
      ) {
        floorId = ancestor.userData.environmentFloorId;
      }
      modelsByKey.set(
        sceneModelKey(floorId, traversedObject.userData.environmentModelId),
        traversedObject
      );
    });
    outlineModels = modelList.flatMap(outlineModelRef => {
      const outlineModelObject = modelsByKey.get(
        sceneModelKey(outlineModelRef.floorId, outlineModelRef.modelId)
      );
      if (outlineModelObject) {
        return [outlineModelObject];
      } else {
        return [];
      }
    });
  }
  /**
   * 取一个模型真正需要描边的根节点。
   * 窗帘要按「帘布」逐个描边（帘布会移动、收拢），扫地机要同时描
   * 机身与移动组（机身随位姿移动）。
   */
  function collectOutlineRoots(sceneModelRoot) {
    if (sceneModelRoot.userData.environmentModelType === "curtain") {
      const curtainPanels = [];
      sceneModelRoot.traverse(panel => {
        if (panel.userData?.curtainMotionPanel) {
          curtainPanels.push(panel);
        }
      });
      if (curtainPanels.length) {
        return curtainPanels;
      }
    }
    if (sceneModelRoot.userData.vacuumMobileRoot) {
      return [sceneModelRoot, sceneModelRoot.userData.vacuumMobileRoot];
    } else {
      return [sceneModelRoot];
    }
  }
  /**
   * 取（或重算）某个模型的轮廓极值点。
   *
   * 缓存键包含几何体与扫地机移动组：两者任一变化都意味着顶点位置变了。
   */
  function resolveSilhouettePoints(targetModel) {
    const geometry = targetModel.geometry;
    const vacuumMobileRoot = targetModel.userData?.vacuumMobileRoot;
    const cachedEntry = pointsByModel.get(targetModel);
    if (
      cachedEntry &&
      cachedEntry.geometry === geometry &&
      cachedEntry.mobile === vacuumMobileRoot
    ) {
      return cachedEntry.points;
    }
    const silhouettePoints = computeSilhouettePoints(targetModel);
    pointsByModel.set(targetModel, {
      geometry: geometry,
      mobile: vacuumMobileRoot,
      points: silhouettePoints
    });
    return silhouettePoints;
  }
  /** 把所有描边模型投影到屏幕，重算一次 SVG 路径。 */
  function renderOutlines() {
    if (!isOutlineActive || performance.now() < resumeAtTimestamp) {
      return;
    }
    // 显示时带上 0.18s 的淡入；pause 时会临时关掉过渡以获得即时隐藏。
    svgElement.style.transition = "opacity .18s linear";
    svgElement.style.opacity = "1";
    setPulseActive(true);
    const activeCamera = getCamera?.() || camera;
    activeCamera.updateMatrixWorld();
    const widthPx = container.clientWidth;
    const heightPx = container.clientHeight;
    const outlineEntries = outlineModels
      .flatMap(collectOutlineRoots)
      .filter(outlineRoot => {
        // 祖先链上有隐藏节点就跳过（隐藏楼层不该出现描边）。
        for (
          let visibleAncestor = outlineRoot;
          visibleAncestor;
          visibleAncestor = visibleAncestor.parent
        ) {
          if (visibleAncestor.visible === false) {
            return false;
          }
        }
        return true;
      })
      .map(outlineModel => ({
        model: outlineModel,
        points: resolveSilhouettePoints(outlineModel)
      }));
    for (const outlineEntry of outlineEntries) {
      outlineEntry.model.updateWorldMatrix(true, false);
      // 某些模型（如电视）有专用相机，描边必须与它实际渲染的视角一致。
      outlineEntry.camera = getObjectCamera?.(outlineEntry.model) || activeCamera;
    }
    // 渲染键覆盖相机、画布尺寸与每个模型的矩阵：都没变就完全跳过投影计算。
    const renderKey =
      widthPx +
      ":" +
      heightPx +
      ":" +
      activeCamera.matrixWorld.elements +
      ":" +
      activeCamera.projectionMatrix.elements +
      ":" +
      outlineEntries
        .map(
          entryForKey =>
            entryForKey.model.uuid +
            ":" +
            (entryForKey.model.geometry?.uuid || "") +
            ":" +
            entryForKey.model.matrixWorld.elements +
            ":" +
            entryForKey.camera.projectionMatrix.elements
        )
        .join("|");
    if (renderKey === cachedRenderKey) {
      return;
    }
    cachedRenderKey = renderKey;
    svgElement.setAttribute("viewBox", "0 0 " + widthPx + " " + heightPx);
    const projectedVector = new three.Vector3();
    const outlinePathData = outlineEntries
      .map(outlineData => {
        // 世界坐标 → 裁剪空间 → 像素：注意 NDC 的 y 轴向上而屏幕坐标向下。
        const projectedPoints = outlineData.points.map(screenPoint => {
          projectedVector
            .copy(screenPoint)
            .applyMatrix4(outlineData.model.matrixWorld)
            .project(outlineData.camera);
          return [
            ((projectedVector.x + 1) * widthPx) / 2,
            ((1 - projectedVector.y) * heightPx) / 2,
            projectedVector.z
          ];
        });
        // 有任何一个点跑出裁剪范围（在相机背后或被裁掉）就整体放弃这个模型：
        // 否则凸包会把远处的点连回来，画出穿过整个屏幕的错误轮廓。
        if (
          projectedPoints.some(projectedPoint => projectedPoint[2] < -1 || projectedPoint[2] > 1)
        ) {
          return "";
        }
        const hullPoints = outlineHull(projectedPoints);
        if (hullPoints.length > 2) {
          // 保留一位小数：足够精确又能显著缩短 path 字符串。
          return (
            "M" +
            hullPoints
              .map(hullPoint => hullPoint[0].toFixed(1) + "," + hullPoint[1].toFixed(1))
              .join("L") +
            "Z"
          );
        } else {
          return "";
        }
      })
      .join("");
    // 三层共用同一份路径数据，只靠 stroke 参数区分。
    for (const pathElement of [outerGlowElement, innerGlowElement, coreOutlineElement]) {
      pathElement.setAttribute("d", outlinePathData);
    }
  }
  /** 暂停描边：立即隐藏并设置一段冷却时间，避免相机移动时反复闪烁。 */
  function pauseOutlines() {
    setPulseActive(false);
    // 120ms 冷却：相机连续移动期间不必每帧重算投影。
    resumeAtTimestamp = performance.now() + 120;
    // 暂停要求即时隐藏，因此临时禁用过渡。
    svgElement.style.transition = "none";
    svgElement.style.opacity = "0";
  }
  return {
    sync: syncOutlines,
    update: renderOutlines,
    pause: pauseOutlines,
    /** 相机是否移动过；移动过则先暂停描边。 */
    cameraChanged() {
      if (!isOutlineActive) {
        return false;
      }
      const cameraRef = getCamera?.() || camera;
      // 相机键同时包含视图矩阵与投影矩阵：缩放 / 变焦也会被感知到。
      const cameraKey = cameraRef.matrixWorld.elements + ":" + cameraRef.projectionMatrix.elements;
      if (cameraKey === cachedCameraKey) {
        return false;
      } else {
        cachedCameraKey = cameraKey;
        pauseOutlines();
        return true;
      }
    },
    /** 冷却期内返回剩余等待时间，否则返回 Infinity（无需定时器）。 */
    nextDelay() {
      if (isOutlineActive && performance.now() < resumeAtTimestamp) {
        return Math.max(1, resumeAtTimestamp - performance.now());
      } else {
        return Infinity;
      }
    },
    dispose() {
      pulseAnimations.forEach(animation => animation.cancel());
      svgElement.remove();
      outlineModels = [];
    }
  };
}
/**
 * 创建设备光晕（贴片发光）。
 *
 * @param {number} options.modeAmount 光晕总强度（0 时完全不可见）。
 */
export function createEnvironmentHalos({ THREE: threeNamespace, modeAmount: modeAmount }) {
  const halosById = new Map();
  let cachedHaloRoot;
  let cachedHaloRevision;
  let cachedHalosKey;
  let isHaloActive = false;
  // 光晕定位键直接用共享实现：本文件原先还留着一份逐字节相同的本地定义，
  // 与 core/scene-model-key.js 的关系见那里的模块头（同一模型不能拿到两个身份）。
  // 1×1 的共享平面：所有光晕都靠缩放变形，无需各自建几何体。
  const planeGeometry = new threeNamespace.PlaneGeometry(1, 1);
  /**
   * 量出模型的世界包围盒（跳过环境效果与自制窗帘骨架）。
   */
  function computeModelBounds(boundsModelRoot) {
    const accumulatedBounds = new threeNamespace.Box3();
    // 递归累加世界包围盒：跳过环境效果与自制窗帘骨架（不是模型本体），
    // 以及嵌套的独立模型；矩阵沿父级相乘传入，不读未必已更新的 matrixWorld。
    function accumulateBounds(boundObject, boundsMatrix) {
      if (
        !boundObject.userData?.environmentEffect &&
        !boundObject.userData?.curtainMotionRig &&
        (boundObject === boundsModelRoot || boundObject.userData?.environmentModelId == null)
      ) {
        if (boundObject.isMesh && boundObject.geometry?.attributes?.position) {
          if (!boundObject.geometry.boundingBox) {
            boundObject.geometry.computeBoundingBox();
          }
          accumulatedBounds.union(
            boundObject.geometry.boundingBox.clone().applyMatrix4(boundsMatrix)
          );
        }
        for (const childMesh of boundObject.children || []) {
          if (childMesh.matrixAutoUpdate) {
            childMesh.updateMatrix();
          }
          accumulateBounds(
            childMesh,
            new threeNamespace.Matrix4().multiplyMatrices(boundsMatrix, childMesh.matrix)
          );
        }
      }
    }
    accumulateBounds(boundsModelRoot, new threeNamespace.Matrix4());
    if (accumulatedBounds.isEmpty()) {
      return null;
    } else {
      return accumulatedBounds;
    }
  }
  /** 释放一片光晕（几何体是共享的，只销毁材质）。 */
  function disposeHalo(haloRecord) {
    haloRecord.mesh.removeFromParent();
    haloRecord.mesh.material.dispose();
  }
  /**
   * 同步光晕列表。
   */
  function syncHalos(haloModelRoot, haloItems, haloSceneRevision, modelMap) {
    const haloKey = JSON.stringify(
      haloItems.map(haloItem => [
        haloItem.id,
        haloItem.floorId,
        haloItem.modelId,
        haloItem.visible,
        haloItem.deviceKind
      ])
    );
    // 键没变就完全跳过：避免每帧重新量包围盒。
    if (
      cachedHaloRoot === haloModelRoot &&
      cachedHaloRevision === haloSceneRevision &&
      cachedHalosKey === haloKey
    ) {
      return;
    }
    cachedHaloRoot = haloModelRoot;
    cachedHaloRevision = haloSceneRevision;
    cachedHalosKey = haloKey;
    const resolvedModelByKey = modelMap || new Map();
    if (!modelMap && haloItems.length) {
      cachedHaloRoot?.traverse(object3dEntry => {
        if (object3dEntry.userData?.environmentModelId == null) {
          return;
        }
        let haloFloorId = object3dEntry.userData.environmentFloorId;
        for (
          let haloAncestor = object3dEntry.parent;
          haloFloorId == null && haloAncestor;
          haloAncestor = haloAncestor.parent
        ) {
          haloFloorId = haloAncestor.userData.environmentFloorId;
        }
        resolvedModelByKey.set(
          sceneModelKey(haloFloorId, object3dEntry.userData.environmentModelId),
          object3dEntry
        );
      });
    }
    const visibleHaloIds = new Set();
    for (const syncHaloItem of haloItems) {
      if (syncHaloItem.visible === false) {
        continue;
      }
      const haloModel = resolvedModelByKey.get(
        sceneModelKey(syncHaloItem.floorId, syncHaloItem.modelId)
      );
      if (!haloModel) {
        continue;
      }
      const modelBounds = computeModelBounds(haloModel);
      if (!modelBounds) {
        continue;
      }
      const modelSize = modelBounds.getSize(new threeNamespace.Vector3());
      const modelCenter = modelBounds.getCenter(new threeNamespace.Vector3());
      // 风口是竖向安装的（沿 Z 更长），光晕要跟着转 90°。
      const isVerticalHalo =
        haloModel.userData.environmentModelType === "airoutlet" && modelSize.z > modelSize.x;
      const haloWidth = isVerticalHalo ? modelSize.z : modelSize.x;
      const haloHeight = modelSize.y;
      if (!(haloWidth > 0) || !(haloHeight > 0)) {
        continue;
      }
      visibleHaloIds.add(syncHaloItem.id);
      let halo = halosById.get(syncHaloItem.id);
      if (halo && halo.model !== haloModel) {
        // 模型被重建：旧网格挂在废弃节点上，重建光晕。
        disposeHalo(halo);
        halosById.delete(syncHaloItem.id);
        halo = null;
      }
      if (!halo) {
        const haloMaterial = new threeNamespace.ShaderMaterial({
          uniforms: {
            // 总强度由外部配置（modeAmount），为 0 时整体不可见。
            haloMode: modeAmount,
            haloColor: {
              value: new threeNamespace.Color(0, 0, 0)
            },
            haloSize: {
              value: new threeNamespace.Vector2()
            },
            haloFeather: {
              value: 0
            },
            // 最多 3 个圆角矩形（窗帘按帘布分别给光，其余设备只用第 0 个）。
            haloRects: {
              value: Array.from(
                {
                  length: 3
                },
                () => new threeNamespace.Vector4()
              )
            },
            haloRectCount: {
              value: 1
            }
          },
          vertexShader:
            "varying vec2 vHaloUv; void main(){ vHaloUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
          // 片元着色器：对最多 3 个圆角矩形求 SDF 并取最小值，
          // 只保留外部衰减（outer），因此看起来是贴在物体周围的辉光而不是实心块。
          // 注意：字符串里的 // 是 GLSL 注释，属于着色器源码，必须原样保留。
          fragmentShader:
            "varying vec2 vHaloUv;\n            uniform float haloMode, haloFeather;\n            uniform vec2 haloSize;\n            uniform vec3 haloColor;\n            uniform vec4 haloRects[3];\n            uniform int haloRectCount;\n            void main() {\n              vec2 p = (vHaloUv - 0.5) * (haloSize + vec2(haloFeather * 2.0));\n              float d = 10000.0;\n              for (int i = 0; i < 3; i++) {\n                if (i >= haloRectCount) break;\n                vec4 rect = haloRects[i];\n                float radius = min(rect.z, rect.w) * 0.18;\n                vec2 q = abs(p - rect.xy) - rect.zw + vec2(radius);\n                d = min(d, length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius);\n              }\n              float outer = 1.0 - smoothstep(0.0, haloFeather, max(d, 0.0));\n              float alpha = outer * outer * haloMode * 0.025;\n              if (alpha < 0.001) discard;\n              gl_FragColor = vec4(haloColor, alpha);\n              #include <colorspace_fragment>\n            }",
          transparent: true,
          // 加性混合：光晕只会让画面变亮，不会遮挡模型本身。
          blending: threeNamespace.AdditiveBlending,
          depthTest: true,
          depthWrite: false,
          side: threeNamespace.DoubleSide,
          forceSinglePass: true,
          toneMapped: false
        });
        const haloMesh = new threeNamespace.Mesh(planeGeometry, haloMaterial);
        haloMesh.name = "environment-halo-" + syncHaloItem.id;
        Object.assign(haloMesh.userData, {
          environmentEffect: true,
          environmentHalo: true,
          // 几何体与材质都是共享 / 自建的轻量资源，清理时只摘节点即可。
          externalModelSharedGeometry: true,
          externalModelSharedMaterial: true
        });
        haloMesh.raycast = () => {};
        // 初始隐藏：等 setColor 给了非黑色之后才显示。
        haloMesh.visible = false;
        haloModel.add(haloMesh);
        halo = {
          model: haloModel,
          mesh: haloMesh
        };
        halosById.set(syncHaloItem.id, halo);
      }
      // 羽化宽度取短边的 15%，并夹在 2.5–7cm：太小会看到硬边，太大会糊成一片。
      const haloFeather = Math.max(0.025, Math.min(0.07, Math.min(haloWidth, haloHeight) * 0.15));
      halo.mesh.material.uniforms.haloSize.value.set(haloWidth, haloHeight);
      halo.mesh.material.uniforms.haloFeather.value = haloFeather;
      halo.mesh.scale.set(haloWidth + haloFeather * 2, haloHeight + haloFeather * 2, 1);
      halo.mesh.position.copy(modelCenter);
      halo.mesh.rotation.y = isVerticalHalo ? Math.PI / 2 : 0;
      if (isVerticalHalo) {
        // 竖向风口贴到 +X 面（离墙面 6mm），否则贴到 +Z 面。
        halo.mesh.position.x = modelBounds.max.x + 0.006;
      } else {
        halo.mesh.position.z = modelBounds.max.z + 0.006;
      }
      halo.mesh.updateMatrix();
      halo.center = modelCenter;
      halo.bounds = modelBounds;
      halo.width = haloWidth;
      halo.height = haloHeight;
      halo.panels = [];
      if (haloModel.userData.environmentModelType === "curtain") {
        haloModel.traverse(curtainPanel => {
          if (curtainPanel.userData.curtainMotionPanel) {
            halo.panels.push(curtainPanel);
          }
        });
      }
      halo.pose = null;
      updateHaloPanels(halo);
    }
    for (const [staleHaloId, staleHalo] of halosById) {
      if (!visibleHaloIds.has(staleHaloId)) {
        disposeHalo(staleHalo);
        halosById.delete(staleHaloId);
      }
    }
  }
  /**
   * 更新窗帘光晕的矩形列表，让光只落在实际可见的帘布上。
   */
  function updateHaloPanels(targetHalo) {
    // 姿态键：帘布的可见性与横向缩放（开合程度）；不变则无需重算。
    const panelPoseKey = targetHalo.panels
      .map(panelRef => panelRef.visible + ":" + panelRef.scale.x)
      .join("|");
    if (panelPoseKey === targetHalo.pose) {
      return;
    }
    targetHalo.pose = panelPoseKey;
    const uniforms = targetHalo.mesh.material.uniforms;
    const haloRects = uniforms.haloRects.value;
    const visiblePanels = targetHalo.panels.filter(visiblePanel => visiblePanel.visible);
    if (!visiblePanels.length) {
      // 没有可见帘布（全收拢）：回退成以光晕中心为原点的一个默认矩形。
      uniforms.haloRectCount.value = 1;
      haloRects[0].set(0, 0, targetHalo.width / 2, targetHalo.height / 2);
      return;
    }
    let rectIndex = 0;
    for (const panelNode of visiblePanels.slice(0, 2)) {
      // 从帘布到模型根节点的矩阵链：自顶向下乘，得到帘布相对模型的变换。
      const panelAncestry = [];
      for (
        let panelAncestor = panelNode;
        panelAncestor && panelAncestor !== targetHalo.model;
        panelAncestor = panelAncestor.parent
      ) {
        panelAncestry.unshift(panelAncestor);
      }
      const panelMatrix = new threeNamespace.Matrix4();
      for (const ancestryNode of panelAncestry) {
        if (ancestryNode.matrixAutoUpdate) {
          ancestryNode.updateMatrix();
        }
        panelMatrix.multiply(ancestryNode.matrix);
      }
      if (!panelNode.geometry.boundingBox) {
        panelNode.geometry.computeBoundingBox();
      }
      const panelBounds = panelNode.geometry.boundingBox.clone().applyMatrix4(panelMatrix);
      const panelCenter = panelBounds.getCenter(new threeNamespace.Vector3());
      const panelSize = panelBounds.getSize(new threeNamespace.Vector3());
      // 矩形参数是「相对光晕中心的偏移 + 半宽半高」（着色器里以中心为原点）。
      haloRects[rectIndex++].set(
        panelCenter.x - targetHalo.center.x,
        panelCenter.y - targetHalo.center.y,
        panelSize.x / 2,
        panelSize.y / 2
      );
    }
    uniforms.haloRectCount.value = rectIndex;
  }
  /** 每帧更新（目前只有窗帘需要跟随时变形的帘布）。 */
  function updateHalos() {
    if (isHaloActive) {
      for (const updatedHalo of halosById.values()) {
        if (updatedHalo.panels.length) {
          updateHaloPanels(updatedHalo);
        }
      }
    }
  }
  /**
   * 设置某片光晕的颜色。
   */
  function setHaloColor(itemId, color) {
    const colorHalo = halosById.get(itemId);
    if (colorHalo) {
      colorHalo.mesh.material.uniforms.haloColor.value.copy(color);
      // 全黑表示「无状态」（设备关闭）：此时连节点都不必渲染。
      colorHalo.mesh.visible = isHaloActive && color.r + color.g + color.b > 0;
    }
  }
  /** 批量开关光晕；关闭时同步隐藏所有节点。 */
  function setHalosVisible(shouldShowHalos) {
    isHaloActive = shouldShowHalos;
    for (const visibilityHalo of halosById.values()) {
      const haloColor = visibilityHalo.mesh.material.uniforms.haloColor.value;
      visibilityHalo.mesh.visible = isHaloActive && haloColor.r + haloColor.g + haloColor.b > 0;
    }
  }
  /** 清空全部光晕并复位缓存键。 */
  function clearHalos() {
    for (const clearedHalo of halosById.values()) {
      disposeHalo(clearedHalo);
    }
    halosById.clear();
    cachedHaloRoot = null;
    cachedHaloRevision = undefined;
    cachedHalosKey = undefined;
  }
  return {
    sync: syncHalos,
    setColor: setHaloColor,
    setVisible: setHalosVisible,
    clear: clearHalos,
    update: updateHalos,
    dispose() {
      clearHalos();
      // 共享平面几何体在这里统一销毁。
      planeGeometry.dispose();
    }
  };
}
