import { roundToDecimals } from "../../utils/numbers.js?v=2609271226";
import { computeSurfaceLevels, computeLayoutKey, getDepthMaterial, bakeSurfaceLevels } from "./contact-shadow-passes.js";

/**
 * 沿父链向上查找某个 userData 字段，返回第一个存在的值。
 */
function findUserDataInAncestors(startObject3d, userDataKey) {
  for (
    let ancestorObject3d = startObject3d;
    ancestorObject3d;
    ancestorObject3d = ancestorObject3d.parent
  ) {
    if (ancestorObject3d.userData?.[userDataKey] !== undefined) {
      return ancestorObject3d.userData[userDataKey];
    }
  }
}
/**
 * 判断对象自身及其全部祖先是否都可见。
 */
function isVisibleWithAncestors(rootObject3d) {
  for (let ancestorNode = rootObject3d; ancestorNode; ancestorNode = ancestorNode.parent) {
    if (!ancestorNode.visible) {
      return false;
    }
  }
  return true;
}
function isContactCasterMaterial(material) {
  return (
    !!material &&
    material.visible !== false &&
    !!(material.opacity >= 0.98) &&
    !(material.transmission > 0) &&
    (!material.transparent || !!(material.alphaTest > 0))
  );
}
/**
 * 扫描所有网格的三角面，归纳出「有哪些高度上存在朝上的表面」；纯 CPU，只在重建时跑。
 */

/**
 * 创建接触阴影控制器（一个渲染器一份，内部状态跨帧复用）。
 */
export function createContactShadowController({
  THREE: THREE,
  renderer: renderer,
  getRoot: getRoot,
  canBuild: canBuild = () => true,
  requestFrame: requestFrame = () => {}
}) {
  // 被外提到同目录的新模块（见其文件头）：惰性上下文，调用点传 contactShadowContext()。
  const contactShadowContext = () => ({
    settings,
    THREE,
    receiverBoundsCacheByGeometry,
    isContactCasterMaterial,
    computeGeometryKey,
    depthMaterialsByKey,
    placeholderTexture,
    renderer,
    stats,
    trimMaterialCache,
    blurMaterial,
    blurScene,
    blurCamera,
  });

  // 默认参数：都是「看起来还行」的经验值，可由外部通过 controller.settings 直接改写。
  const settings = {
    enabled: true,
    // 地面阴影浓度上限；0.78 是试出来的值 —— 再深会把木地板的纹理压没，再浅则家具像浮空。
    opacity: 0.78,
    // 地面深度图的边长（像素）。1024 足以覆盖一层的接触范围，且模糊两轮后看不出锯齿。
    resolution: 1024,
    // 参与接触阴影的最大高度（米）：高过 2.5m 的吊灯、吊柜对地面的接触贡献可忽略，
    maxHeight: 2.5,
    // 浓度随高度衰减的尺度（米）：density = exp(-height / heightFalloff)，
    heightFalloff: 1.2,
    // 模糊半径（米）。按世界尺寸给定、再除以地面贴图的世界宽高换算成 UV，
    blurMeters: 0.055,
    // 投影在屏幕空间的两个方向的偏移量：制造「光源略偏一侧」的方向感，
    offsetX: 0.28,
    offsetZ: -0.22,
    surfaceEnabled: true,
    surfaceOpacity: 0.55,
    surfaceResolution: 256,
    // 最多烘几级表面高度；级数越多图集越大、烘焙越慢，32 是分辨率与效果的折中。
    maxSurfaceLevels: 32
  };
  // 统计量只用于性能观测与调试面板，不参与渲染决策。
  const stats = {
    builds: 0,
    capturePasses: 0,
    floors: 0,
    casters: 0,
    instancedCasters: 0,
    receivers: 0,
    surfaceCaptures: 0,
    surfacePasses: 0,
    cacheHits: 0,
    cachedFloors: 0,
    cachedBytes: 0,
    disposed: false
  };
  // 按楼层 ID（字符串）保存每层的地面贴图、表面图集与 uniform。
  const floorStatesById = new Map();
  // 深度材质缓存：同一份材质参数（含 map/alphaMap/位移量与全局 settings）复用同一个
  const depthMaterialsByKey = new Map();
  // 几何缓存键 / 接收面包围盒：用 WeakMap，几何被回收后缓存自动失效，
  const geometryCacheEntryByGeometry = new WeakMap();
  const receiverBoundsCacheByGeometry = new WeakMap();
  // 已烘焙的布局缓存（键为「楼层 ID + 内容签名」）：同样的场景内容换楼层时可直接搬用贴图。
  const cachedLayoutsByKey = new Map();
  // 1x1 黑色占位纹理：uniform 不能为 null，未烘焙的楼层统一指向它，
  const placeholderTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  placeholderTexture.needsUpdate = true;
  let needsRebuild = true;
  let isDisposed = false;
  let isSuspended = false;
  let isMotionSuspended = false;
  let lastRootObject = null;
  // 外部注入的「楼层锚点帧」提供者：返回该楼层当前的世界矩阵。
  let frameProvider = null;
  let isIncrementalUpdate = false;
  // 是否允许「复用上一次的布局缓存」；楼层切换时置位，用完即恢复。
  let shouldReuseLayout = false;
  // 待重烘的楼层 ID 集合（增量更新的工作队列）。
  const pendingFloorIds = new Set();
  // 当前可见楼层；为 null 表示「所有楼层都可见」（整体视图）。
  let visibleFloorId = null;
  // 可见楼层过滤：整体视图下所有楼层都算可见。
  const matchesVisibleFloor = candidateFloorId =>
    visibleFloorId === null || candidateFloorId === visibleFloorId;
  // 全屏模糊用的正交相机与四分之一屏（这里是 [-1,1] 的 NDC 铺满）四边形：
  const blurScene = new THREE.Scene();
  const blurCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const blurMaterial = new THREE.ShaderMaterial({
    uniforms: {
      source: {
        value: placeholderTexture
      },
      stepSize: {
        value: new THREE.Vector2()
      },
      spread: {
        value: 0
      }
    },
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    // 顶点着色器不做任何变换：直接把 NDC 坐标写出去，四边形的 uv 透传给片元。
    vertexShader:
      "varying vec2 shadowUv; void main() { shadowUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader:
      "uniform sampler2D source; uniform vec2 stepSize; uniform float spread; varying vec2 shadowUv;\n      void main() {\n        float center = texture2D(source, shadowUv).r;\n        float nearA = texture2D(source, shadowUv + stepSize * 1.384615).r;\n        float nearB = texture2D(source, shadowUv - stepSize * 1.384615).r;\n        float farA = texture2D(source, shadowUv + stepSize * 3.230769).r;\n        float farB = texture2D(source, shadowUv - stepSize * 3.230769).r;\n        float value = mix(center * 0.227027 + (nearA + nearB) * 0.316216 + (farA + farB) * 0.070270,\n          max(center, max(max(nearA, nearB), max(farA, farB))), spread);\n        gl_FragColor = vec4(vec3(value), 1.0);\n      }"
  });
  const blurQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurMaterial);
  blurQuad.frustumCulled = false;
  blurScene.add(blurQuad);
  /**
   * 取（必要时创建）某楼层的地面阴影状态。
   */
  function getFloorState(floorId) {
    const floorIdKey = String(floorId);
    if (!floorStatesById.has(floorIdKey)) {
      floorStatesById.set(floorIdKey, {
        id: floorIdKey,
        target: null,
        ping: null,
        surface: null,
        lookup: null,
        casters: 0,
        instancedCasters: 0,
        receivers: 0,
        // uniform 名称是与地面材质着色器约定死的接口（plan2 前缀），改名必须同步改着色器。
        uniforms: {
          // 世界坐标 → 烘焙时刻坐标系的逆变换；烘焙后锚点移动时用它把贴图贴回原位。
          plan2ContactTransform: {
            value: new THREE.Matrix4()
          },
          // 地面深度图（RedFormat，R 通道即遮蔽浓度）。
          plan2ContactMap: {
            value: placeholderTexture
          },
          // 深度图覆盖的世界矩形：x = min.x，y = min.z，z = 宽，w = 深。
          plan2ContactBounds: {
            value: new THREE.Vector4(0, 0, 1, 1)
          },
          // 地面高度（世界 Y）：着色器据此判断某片地面是否属于本层。
          plan2ContactY: {
            value: 0
          },
          // 地面遮蔽总浓度，0 表示该层不可见 / 未烘焙 / 正在淡出。
          plan2ContactOpacity: {
            value: 0
          },
          // 表面高度图集（多级水平面拼成的大图）。
          plan2SurfaceMap: {
            value: placeholderTexture
          },
          // 表面图集覆盖的世界矩形：x = min.x，y = min.z，z = 宽，w = 深。
          plan2SurfaceBounds: {
            value: new THREE.Vector4()
          },
          // 查找表：一维纹理，按归一化高度索引，返回该高度在图集里的格子坐标。
          plan2SurfaceLookup: {
            value: placeholderTexture
          },
          // 图集布局：x = 列数，y = 查找表覆盖的最大高度（米）。
          plan2SurfaceLayout: {
            value: new THREE.Vector2(1, 1)
          },
          // 表面遮蔽总浓度，语义同 plan2ContactOpacity。
          plan2SurfaceOpacity: {
            value: 0
          }
        }
      });
    }
    return floorStatesById.get(floorIdKey);
  }
  /**
   * 声明某些楼层需要重建。
   */
  function invalidate(floorIds, keepLayoutCache = false) {
    if (!isDisposed) {
      if (!keepLayoutCache) {
        shouldReuseLayout = false;
        const targetFloorIdSet =
          floorIds == null ? null : new Set(typeof floorIds == "string" ? [floorIds] : floorIds);
        for (const [iteratedLayoutKey, detachedState] of cachedLayoutsByKey) {
          // 只清掉与目标楼层相关的缓存；保留其他楼层的缓存能让「来回切楼层」几乎零成本。
          if (!targetFloorIdSet || targetFloorIdSet.has(detachedState.id)) {
            disposeFloorState(detachedState);
            cachedLayoutsByKey.delete(iteratedLayoutKey);
          }
        }
      }
      if (floorIds == null) {
        needsRebuild = true;
        // 整场景重建时清空待办队列：needsRebuild 已经涵盖所有楼层。
        pendingFloorIds.clear();
      } else if (!needsRebuild) {
        const floorIdList = typeof floorIds == "string" ? [floorIds] : floorIds;
        for (const floorIdValue of floorIdList) {
          if (floorIdValue != null) {
            pendingFloorIds.add(String(floorIdValue));
          }
        }
      }
      if (needsRebuild || pendingFloorIds.size) {
        requestFrame();
      }
    }
  }
  /**
   * 总开关：只切换 uniform 浓度，不销毁贴图。
   */
  function setEnabled(enabled) {
    settings.enabled = !!enabled;
    for (const enabledFloor of floorStatesById.values()) {
      enabledFloor.fade = null;
      enabledFloor.uniforms.plan2ContactOpacity.value =
        settings.enabled &&
        !isSuspended &&
        !isMotionSuspended &&
        matchesVisibleFloor(enabledFloor.id) &&
        enabledFloor.target
          ? settings.opacity
          : 0;
      enabledFloor.uniforms.plan2SurfaceOpacity.value =
        settings.enabled &&
        !isSuspended &&
        !isMotionSuspended &&
        matchesVisibleFloor(enabledFloor.id) &&
        settings.surfaceEnabled &&
        enabledFloor.surface
          ? settings.surfaceOpacity
          : 0;
    }
    requestFrame();
  }
  /**
   * 挂起 / 恢复整个接触阴影（用于截图、导出、离屏渲染等需要干净画面的场景）。
   */
  function setSuspended(suspended) {
    const nextSuspended = suspended === true;
    if (nextSuspended !== isSuspended) {
      isSuspended = nextSuspended;
      for (const suspendedFloor of floorStatesById.values()) {
        suspendedFloor.uniforms.plan2ContactOpacity.value = 0;
        suspendedFloor.uniforms.plan2SurfaceOpacity.value = 0;
      }
      invalidate();
    }
  }
  /**
   * 进入 / 退出「运动模式」（楼层过渡、家具拖拽动画）。
   */
  function setMotion(motionEnabled) {
    if (isMotionSuspended !== (motionEnabled === true)) {
      isMotionSuspended = motionEnabled === true;
      if (isMotionSuspended) {
        for (const resumedFloor of floorStatesById.values()) {
          resumedFloor.fade = {
            started: performance.now(),
            from: resumedFloor.uniforms.plan2ContactOpacity.value,
            fromSurface: resumedFloor.uniforms.plan2SurfaceOpacity.value,
            to: 0,
            toSurface: 0
          };
        }
      }
      if (!isMotionSuspended) {
        for (const clearedFloor of floorStatesById.values()) {
          clearedFloor.fade = null;
        }
        isIncrementalUpdate = true;
        shouldReuseLayout = true;
      }
      invalidate(null, true);
    }
  }
  /**
   * 按当前锚点把烘焙时刻的贴图变换重新贴回世界坐标。
   */
  function updateBakedTransforms() {
    for (const bakedFloorState of floorStatesById.values()) {
      if (!bakedFloorState.bakedFrame) {
        continue;
      }
      bakedFloorState.anchor?.updateWorldMatrix(true, false);
      // updateWorldMatrix(true, false)：向上刷新祖先矩阵（true）但不递归子节点（false），
      const anchorMatrix =
        frameProvider?.(bakedFloorState.id) || bakedFloorState.anchor?.matrixWorld;
      if (anchorMatrix) {
        bakedFloorState.uniforms.plan2ContactTransform.value
          .copy(anchorMatrix)
          .invert()
          .premultiply(bakedFloorState.bakedFrame);
      }
    }
  }
  /**
   * @param {boolean} [isSurfaceBake=false] 表面烘焙：表面级高度差很小，会换一组近平面 / 衰减 / 截断参数（1.5 / 0.5 / 0.8~1.5）。@throws {Error} 注入点 project_vertex 缺失（three.js 版本不兼容）时抛出。
   */
  
  /**
   * 把深度材质缓存裁到上限。
   */
  function trimMaterialCache() {
    while (depthMaterialsByKey.size > 64) {
      const oldestMaterialKey = depthMaterialsByKey.keys().next().value;
      depthMaterialsByKey.get(oldestMaterialKey).dispose();
      depthMaterialsByKey.delete(oldestMaterialKey);
    }
  }
  /**
   * 释放某楼层的全部 GPU 资源并复位 uniform。
   */
  function disposeFloorState(targetState) {
    targetState.fade = null;
    targetState.anchor = null;
    targetState.bakedFrame = null;
    targetState.target?.dispose();
    targetState.ping?.dispose();
    targetState.surface?.dispose();
    targetState.lookup?.dispose();
    targetState.target = null;
    targetState.ping = null;
    targetState.surface = null;
    targetState.lookup = null;
    targetState.uniforms.plan2ContactMap.value = placeholderTexture;
    targetState.uniforms.plan2ContactOpacity.value = 0;
    targetState.uniforms.plan2SurfaceMap.value = placeholderTexture;
    targetState.uniforms.plan2SurfaceLookup.value = placeholderTexture;
    targetState.uniforms.plan2SurfaceOpacity.value = 0;
  }
  /**
   * 确保该楼层的主深度图与 ping-pong 缓冲尺寸正确。
   */
  function ensureRenderTargets(floorEntry, sizePx) {
    if (floorEntry.target?.width !== sizePx || floorEntry.target?.height !== sizePx) {
      disposeFloorState(floorEntry);
      floorEntry.target = new THREE.WebGLRenderTarget(sizePx, sizePx, {
        format: THREE.RedFormat,
        generateMipmaps: false
      });
    }
    floorEntry.ping ||= new THREE.WebGLRenderTarget(sizePx, sizePx, {
      format: THREE.RedFormat,
      depthBuffer: false,
      generateMipmaps: false
    });
    return {
      target: floorEntry.target,
      ping: floorEntry.ping
    };
  }
  /**
   * 烘焙「表面之间的接触遮蔽」：把每一级水平面各拍一张深度图，拼成一张图集。
   */
  
  /**
   * 烘焙一层楼的接触阴影贴图。相机摆位是整套方案的核心：正交相机放在地板面下方 6cm、朝正上方拍。
   */
  function buildContactMap(contactEntry, receivers, casters) {
    const boundsBox = new THREE.Box3();
    for (const receiverMesh of receivers) {
      boundsBox.union(new THREE.Box3().setFromObject(receiverMesh));
    }
    if (boundsBox.isEmpty() || !casters.length) {
      disposeFloorState(contactEntry);
      return;
    }
    const floorTopY = boundsBox.max.y;
    boundsBox.min.x -= 0.25;
    boundsBox.min.z -= 0.25;
    boundsBox.max.x += 0.25;
    boundsBox.max.z += 0.25;
    const boundsWidth = Math.max(boundsBox.max.x - boundsBox.min.x, 0.1);
    const boundsDepth = Math.max(boundsBox.max.z - boundsBox.min.z, 0.1);
    const captureSizePx = Math.min(settings.resolution, renderer.capabilities.maxTextureSize);
    const { target: contactTarget, ping: contactPingTarget } = ensureRenderTargets(
      contactEntry,
      captureSizePx
    );
    const captureCamera = new THREE.OrthographicCamera(
      -boundsWidth / 2,
      boundsWidth / 2,
      boundsDepth / 2,
      -boundsDepth / 2,
      0.001,
      settings.maxHeight + 0.06
    );
    // 相机摆在接收面中心的正下方 6cm 处（见上文的摆位说明）。
    const centerX = (boundsBox.min.x + boundsBox.max.x) / 2;
    // Z 向同理；centerX / centerZ 一起给出相机的水平落点。
    const centerZ = (boundsBox.min.z + boundsBox.max.z) / 2;
    captureCamera.position.set(centerX, floorTopY - 0.06, centerZ);
    captureCamera.up.set(0, 0, 1);
    captureCamera.lookAt(centerX, floorTopY + 1, centerZ);
    captureCamera.updateMatrixWorld(true);
    const captureScene = new THREE.Scene();
    const depthMaterialsByCaster = new Map();
    const clonedCasters = [];
    const fallbackDepthMaterial = new THREE.MeshDepthMaterial();
    // 兜底材质设成不可见：克隆体仍留在场景里（保持层级与矩阵一致），但一个像素都不写。
    fallbackDepthMaterial.visible = false;
    // 源材质 → 深度材质的映射：不参与接触阴影的材质统一换成 visible = false 的兜底材质。
    const toDepthMaterial = casterMaterialForClone =>
      isContactCasterMaterial(casterMaterialForClone)
        ? (depthMaterialsByCaster.has(casterMaterialForClone) ||
            depthMaterialsByCaster.set(
              casterMaterialForClone,
              getDepthMaterial(casterMaterialForClone, contactShadowContext())
            ),
          depthMaterialsByCaster.get(casterMaterialForClone))
        : fallbackDepthMaterial;
    for (const casterSource of casters) {
      // clone(false)：不递归子节点，只复制网格自身的几何 / 材质引用。
      const casterClone = casterSource.clone(false);
      casterClone.material = Array.isArray(casterSource.material)
        ? casterSource.material.map(toDepthMaterial)
        : toDepthMaterial(casterSource.material);
      // 直接拷贝源对象的世界矩阵并关掉自动更新：克隆体不在原层级里，
      casterClone.matrix.copy(casterSource.matrixWorld);
      casterClone.matrixWorld.copy(casterSource.matrixWorld);
      casterClone.matrixAutoUpdate = false;
      casterClone.matrixWorldAutoUpdate = true;
      casterClone.castShadow = false;
      casterClone.receiveShadow = false;
      // 强制回第 0 层：光影层、辅助层等自定义图层不能被深度通道误渲染。
      casterClone.layers.set(0);
      // 关闭视锥剔除：包围盒是按原始层级算的，克隆后位置变了会算错。
      casterClone.frustumCulled = false;
      captureScene.add(casterClone);
      clonedCasters.push(casterClone);
    }
    // 快照渲染器状态：烘焙是「借用」渲染器，结束后必须逐项还原，
    const renderState = {
      target: renderer.getRenderTarget(),
      face: renderer.getActiveCubeFace(),
      mip: renderer.getActiveMipmapLevel(),
      clear: renderer.getClearColor(new THREE.Color()),
      alpha: renderer.getClearAlpha(),
      autoClear: renderer.autoClear,
      shadows: renderer.shadowMap.enabled,
      xr: renderer.xr.enabled,
      viewport: renderer.getViewport(new THREE.Vector4()),
      scissor: renderer.getScissor(new THREE.Vector4()),
      scissorTest: renderer.getScissorTest()
    };
    try {
      renderer.xr.enabled = false;
      // 深度通道只关心几何位置：关掉阴影图省掉每帧的阴影渲染，
      renderer.shadowMap.enabled = false;
      renderer.autoClear = true;
      renderer.setScissorTest(false);
      renderer.setClearColor(0, 1);
      renderer.setRenderTarget(contactTarget);
      renderer.render(captureScene, captureCamera);
      stats.capturePasses += 1;
      // 一轮「横向 + 纵向」分离式模糊；blurScale 缩放扩散半径（下方以 1 与 0.4 各跑一轮）。
      const blurOnce = blurScale => {
        // 分离式模糊：先按 X 方向做一遍，步长换算成 UV（世界距离 / 覆盖宽度），
        blurMaterial.uniforms.source.value = contactTarget.texture;
        blurMaterial.uniforms.stepSize.value.set(
          (settings.blurMeters * blurScale) / boundsWidth,
          0
        );
        renderer.setRenderTarget(contactPingTarget);
        renderer.render(blurScene, blurCamera);
        blurMaterial.uniforms.source.value = contactPingTarget.texture;
        blurMaterial.uniforms.stepSize.value.set(
          0,
          (settings.blurMeters * blurScale) / boundsDepth
        );
        renderer.setRenderTarget(contactTarget);
        renderer.render(blurScene, blurCamera);
      };
      // 两轮模糊：先按标称半径铺开，再按 0.4 倍收一下边 —— 单轮大半径会留下明显的
      blurOnce(1);
      blurOnce(0.4);
      if (settings.surfaceEnabled) {
        bakeSurfaceLevels(
          contactEntry,
          casters,
          clonedCasters,
          captureScene,
          boundsBox,
          floorTopY,
          fallbackDepthMaterial
        , contactShadowContext());
      } else {
        contactEntry.uniforms.plan2SurfaceOpacity.value = 0;
      }
      contactEntry.uniforms.plan2ContactMap.value = contactTarget.texture;
      contactEntry.uniforms.plan2ContactBounds.value.set(
        boundsBox.min.x,
        boundsBox.min.z,
        boundsWidth,
        boundsDepth
      );
      contactEntry.uniforms.plan2ContactY.value = floorTopY;
      contactEntry.uniforms.plan2ContactOpacity.value = settings.enabled ? settings.opacity : 0;
    } catch (caughtError) {
      // 烘焙中途失败就把该层资源清干净：留下半张贴图会让地面出现错误的暗块，
      disposeFloorState(contactEntry);
      throw caughtError;
    } finally {
      renderer.setViewport(renderState.viewport);
      renderer.setScissor(renderState.scissor);
      renderer.setScissorTest(renderState.scissorTest);
      renderer.setRenderTarget(renderState.target, renderState.face, renderState.mip);
      renderer.setClearColor(renderState.clear, renderState.alpha);
      renderer.autoClear = renderState.autoClear;
      renderer.shadowMap.enabled = renderState.shadows;
      renderer.xr.enabled = renderState.xr;
      fallbackDepthMaterial.dispose();
      trimMaterialCache();
      // 克隆体自身持有的 InstancedMesh / BatchedMesh 数据是 clone 时新分配的，
      for (const disposableCaster of clonedCasters) {
        if (disposableCaster.isInstancedMesh) {
          disposableCaster.dispose();
        }
        if (disposableCaster.isBatchedMesh) {
          disposableCaster.dispose();
        }
      }
      captureScene.clear();
      blurMaterial.uniforms.source.value = placeholderTexture;
    }
  }
  /**
   * 给几何算一个内容签名，供布局缓存做比对。
   * @returns {string} 内容签名（JSON 字符串）。
   */
  function computeGeometryKey(bufferGeometry) {
    const attributeVersions =
      bufferGeometry.attributes.position?.version + ":" + bufferGeometry.index?.version;
    const cachedGeometryKey = geometryCacheEntryByGeometry.get(bufferGeometry);
    if (
      cachedGeometryKey?.version === attributeVersions &&
      cachedGeometryKey.position === bufferGeometry.attributes.position &&
      cachedGeometryKey.index === bufferGeometry.index
    ) {
      return cachedGeometryKey.key;
    }
    let geometryKey;
    if (
      bufferGeometry.parameters &&
      bufferGeometry.attributes.position?.version === 0 &&
      !(bufferGeometry.index?.version > 0)
    ) {
      try {
        // 参数里出现循环引用 / 不可序列化值时取不到这条键，下面会退到双通道哈希分支，
        geometryKey = JSON.stringify(
          [bufferGeometry.type, bufferGeometry.parameters],
          (jsonKey, jsonValue) => (jsonKey === "uuid" ? undefined : jsonValue)
        );
      } catch {}
    }
    if (!geometryKey) {
      // 双通道哈希（两个不同的 FNV 乘数）拼出 64 位签名：单通道在几千个几何的规模下
      const hashAttribute = attribute => {
        if (!attribute) {
          return null;
        }
        const attributeArray = attribute.array || attribute.data?.array;
        if (!attributeArray) {
          return [attribute.count, attribute.version];
        }
        const attributeBytes = new Uint8Array(
          attributeArray.buffer,
          attributeArray.byteOffset,
          attributeArray.byteLength
        );
        let hashA = 2166136261;
        let hashB = 3339675911;
        for (const byte of attributeBytes) {
          // FNV-1a 的两个经典乘数（32 位）；用 imul 保证按 32 位整数溢出回绕。
          hashA = Math.imul(hashA ^ byte, 16777619);
          hashB = Math.imul(hashB ^ byte, 2246822519);
        }
        return [
          attribute.itemSize,
          attribute.count,
          attribute.offset,
          attribute.data?.stride,
          hashA >>> 0,
          hashB >>> 0
        ];
      };
      geometryKey = JSON.stringify([
        hashAttribute(bufferGeometry.attributes.position),
        hashAttribute(bufferGeometry.index),
        (bufferGeometry.morphAttributes.position || []).map(hashAttribute),
        bufferGeometry.groups,
        bufferGeometry.drawRange
      ]);
    }
    geometryCacheEntryByGeometry.set(bufferGeometry, {
      version: attributeVersions,
      key: geometryKey,
      position: bufferGeometry.attributes.position,
      index: bufferGeometry.index
    });
    return geometryKey;
  }
  /**
   * 计算「一组接收面 + 投影源」的内容签名，用来判断能否复用已烘焙的贴图。
   * 所有矩阵元素都乘 10000 后取整再比较：浮点末位抖动不该被当成内容变化，这是「拖拽家具时不疯狂重烘」的关键。@returns {string} 内容签名（JSON 字符串）。
   */
  
  /**
   * 估算一份缓存状态占用的显存字节数，用于总预算控制。
   */
  const estimateStateBytes = cachedFloorState =>
    (cachedFloorState.target
      ? cachedFloorState.target.width *
        cachedFloorState.target.height *
        (cachedFloorState.target.texture.format === THREE.RedFormat ? 5 : 8)
      : 0) +
    (cachedFloorState.ping
      ? cachedFloorState.ping.width *
        cachedFloorState.ping.height *
        (cachedFloorState.ping.texture.format === THREE.RedFormat ? 1 : 4)
      : 0) +
    (cachedFloorState.surface
      ? cachedFloorState.surface.width *
        cachedFloorState.surface.height *
        (cachedFloorState.surface.texture.format === THREE.RedFormat ? 1 : 4)
      : 0) +
    (cachedFloorState.lookup?.image?.data?.byteLength || 0);
  /**
   * 把一份烘焙结果存进布局缓存，供同一内容在不同楼层间复用。
   */
  function storeCachedLayout(builtEntry) {
    if (!builtEntry.target || !builtEntry.contentKey) {
      return;
    }
    const layoutKey = JSON.stringify([builtEntry.id, builtEntry.contentKey]);
    const displacedEntry = cachedLayoutsByKey.get(layoutKey);
    // 同一把键已存在说明内容一模一样但状态对象换了（比如根节点被替换）：
    if (displacedEntry) {
      disposeFloorState(displacedEntry);
    }
    builtEntry.ping?.dispose();
    // ping 不缓存：重建时 ensureRenderTargets 会按需再建，缓存它只会平白占预算。
    builtEntry.ping = null;
    const storedEntry = {
      id: builtEntry.id,
      contentKey: builtEntry.contentKey,
      bakedFrame: builtEntry.bakedFrame,
      target: builtEntry.target,
      ping: builtEntry.ping,
      surface: builtEntry.surface,
      lookup: builtEntry.lookup,
      uniforms: Object.fromEntries(
        Object.entries(builtEntry.uniforms).map(([uniformName, uniform]) => [
          uniformName,
          {
            value:
              uniform.value?.clone && !uniform.value.isTexture
                ? uniform.value.clone()
                : uniform.value
          }
        ])
      )
    };
    cachedLayoutsByKey.delete(layoutKey);
    cachedLayoutsByKey.set(layoutKey, storedEntry);
    builtEntry.target = builtEntry.ping = builtEntry.surface = builtEntry.lookup = null;
    builtEntry.uniforms.plan2ContactOpacity.value =
      builtEntry.uniforms.plan2SurfaceOpacity.value = 0;
    builtEntry.fade = null;
  }
  /**
   * 尝试从布局缓存里恢复某楼层。
   * @param {string} contentKey 目标内容签名。
   */
  function restoreCachedLayout(restoredEntry, contentKey) {
    const restoreKey = JSON.stringify([restoredEntry.id, contentKey]);
    const restoredLayout = cachedLayoutsByKey.get(restoreKey);
    if (!restoredLayout) {
      return false;
    }
    cachedLayoutsByKey.delete(restoreKey);
    storeCachedLayout(restoredEntry);
    for (const propertyName of [
      "target",
      "ping",
      "surface",
      "lookup",
      "contentKey",
      "bakedFrame"
    ]) {
      restoredEntry[propertyName] = restoredLayout[propertyName];
    }
    for (const [cachedUniformName, cachedUniform] of Object.entries(restoredLayout.uniforms)) {
      restoredEntry.uniforms[cachedUniformName].value = cachedUniform.value;
    }
    restoredEntry.uniforms.plan2ContactOpacity.value =
      restoredEntry.uniforms.plan2SurfaceOpacity.value = 0;
    return true;
  }
  /**
   * 按显存预算与数量上限淘汰缓存。
   * @param {Set<string>|Map<string, *>} protectedIds 必须保留的楼层 ID 集合（本次重建涉及的楼层）。
   */
  function evictCaches(protectedIds) {
    const evictionCandidates = [...floorStatesById.values()]
      .filter(candidateState => candidateState.target && !protectedIds.has(candidateState.id))
      .sort((stateA, stateB) => (stateB.lastUsed || 0) - (stateA.lastUsed || 0));
    let retainedBytes = 0;
    let retainedFloorCount = 0;
    for (const evictedFloor of evictionCandidates) {
      evictedFloor.ping?.dispose();
      evictedFloor.ping = null;
      const stateBytes = estimateStateBytes(evictedFloor);
      // 33554432 = 32MB：所有楼层的接触阴影贴图合计的显存预算上限。
      if (retainedBytes + stateBytes > 33554432) {
        disposeFloorState(evictedFloor);
      } else {
        retainedBytes += stateBytes;
        retainedFloorCount++;
      }
    }
    let layoutCacheBytes = [...cachedLayoutsByKey.values()].reduce(
      (totalBytes, cachedState) => totalBytes + estimateStateBytes(cachedState),
      0
    );
    while (cachedLayoutsByKey.size > 8 || retainedBytes + layoutCacheBytes > 33554432) {
      // Map 的迭代顺序即插入顺序，取第一个即「最久未使用」的布局缓存。
      const evictedLayoutKey = cachedLayoutsByKey.keys().next().value;
      const evictedLayout = cachedLayoutsByKey.get(evictedLayoutKey);
      if (!evictedLayout) {
        break;
      }
      layoutCacheBytes -= estimateStateBytes(evictedLayout);
      disposeFloorState(evictedLayout);
      cachedLayoutsByKey.delete(evictedLayoutKey);
    }
    stats.cachedFloors = retainedFloorCount;
    stats.cachedLayouts = cachedLayoutsByKey.size;
    stats.cachedBytes = retainedBytes + layoutCacheBytes;
  }
  /**
   * 每帧入口：推进淡入淡出、更新变换，并按需（增量）重建阴影。
   */
  function syncFloors() {
    if (isDisposed || isSuspended) {
      return;
    }
    for (const fadingFloor of floorStatesById.values()) {
      if (fadingFloor.fade) {
        // 240ms 的线性淡入淡出：够短不容易被察觉，也足够盖住「贴图刚换好」那一帧的跳变。
        const fadeProgress = Math.min(
          1,
          Math.max(0, (performance.now() - fadingFloor.fade.started) / 240)
        );
        fadingFloor.uniforms.plan2ContactOpacity.value =
          fadingFloor.fade.from + (fadingFloor.fade.to - fadingFloor.fade.from) * fadeProgress;
        fadingFloor.uniforms.plan2SurfaceOpacity.value =
          fadingFloor.fade.fromSurface +
          (fadingFloor.fade.toSurface - fadingFloor.fade.fromSurface) * fadeProgress;
        if (fadeProgress === 1) {
          fadingFloor.fade = null;
        } else {
          requestFrame();
        }
      }
    }
    updateBakedTransforms();
    const rootObject = getRoot();
    // 换根节点（打开别的文档）意味着所有几何引用都失效：缓存整体作废，
    if (rootObject !== lastRootObject) {
      for (const staleLayout of cachedLayoutsByKey.values()) {
        disposeFloorState(staleLayout);
      }
      cachedLayoutsByKey.clear();
      lastRootObject = rootObject;
      shouldReuseLayout = false;
      needsRebuild = true;
      pendingFloorIds.clear();
    }
    if (
      (!needsRebuild && !pendingFloorIds.size) ||
      isMotionSuspended ||
      !canBuild() ||
      !rootObject
    ) {
      return;
    }
    const rebuildAllFloors = needsRebuild;
    // 先快照待办集合：遍历过程中会往 pendingFloorIds 里塞新的待办（见 deferredFloorIds），
    const pendingFloorIdSnapshot = new Set(pendingFloorIds);
    rootObject.updateWorldMatrix(true, true);
    const sceneGroupsById = new Map();
    rootObject.traverse(sceneNode => {
      // 楼层过渡中正在离场的旧楼层不参与烘焙：它在做位移 / 淡出，
      if (
        !sceneNode.isMesh ||
        !isVisibleWithAncestors(sceneNode) ||
        findUserDataInAncestors(sceneNode, "floorTransitionLeaving")
      ) {
        return;
      }
      // 楼层归属优先取 regionFloorId（区域级），退回 floorId，都没有就归到 default。
      const groupFloorId = String(
        findUserDataInAncestors(sceneNode, "regionFloorId") ??
          findUserDataInAncestors(sceneNode, "floorId") ??
          "default"
      );
      if (
        !matchesVisibleFloor(groupFloorId) ||
        (!rebuildAllFloors && !pendingFloorIdSnapshot.has(groupFloorId))
      ) {
        return;
      }
      const isFloorReceiver = sceneNode.userData?.regionReceiverKind === "floor";
      // 投影源门槛：开了 castShadow、来自家具层（modelLayer === 'items'）、
      const isContactCaster =
        sceneNode.castShadow &&
        findUserDataInAncestors(sceneNode, "modelLayer") === "items" &&
        (Array.isArray(sceneNode.material) ? sceneNode.material : [sceneNode.material]).some(
          isContactCasterMaterial
        );
      if (!!isFloorReceiver || !!isContactCaster) {
        if (!sceneGroupsById.has(groupFloorId)) {
          sceneGroupsById.set(groupFloorId, {
            receivers: [],
            casters: []
          });
        }
        if (isFloorReceiver) {
          sceneGroupsById.get(groupFloorId).receivers.push(sceneNode);
        }
        if (isContactCaster) {
          sceneGroupsById.get(groupFloorId).casters.push(sceneNode);
        }
      }
    });
    for (const staleFloorState of floorStatesById.values()) {
      if (
        !isMotionSuspended &&
        (rebuildAllFloors || pendingFloorIdSnapshot.has(staleFloorState.id)) &&
        !sceneGroupsById.has(staleFloorState.id)
      ) {
        // 该楼层这轮没被扫描到（家具全删了 / 不再可见）。
        if (shouldReuseLayout) {
          staleFloorState.uniforms.plan2ContactOpacity.value = 0;
          staleFloorState.uniforms.plan2SurfaceOpacity.value = 0;
          staleFloorState.fade = null;
        } else {
          disposeFloorState(staleFloorState);
        }
        staleFloorState.casters = staleFloorState.instancedCasters = staleFloorState.receivers = 0;
      }
    }
    const deferredFloorIds = [];
    let buildCount = 0;
    for (const [groupId, group] of sceneGroupsById) {
      const floorState = getFloorState(groupId);
      const anchorObject = group.receivers[0] || null;
      // 锚点优先用 frameProvider 给的楼层帧；没有接收面时退回 null，则该帧只能全量重烘。
      const anchorFrame = frameProvider?.(groupId)?.clone() || anchorObject?.matrixWorld.clone();
      const layoutHash = anchorFrame ? computeLayoutKey(group, anchorFrame, contactShadowContext()) : null;
      // 内容签名变了：先把当前这份存进缓存再尝试取出目标那份（缓存命中时直接搬用贴图）。
      if (shouldReuseLayout && layoutHash && floorState.contentKey !== layoutHash) {
        restoreCachedLayout(floorState, layoutHash);
      }
      // 命中条件必须同时满足：允许复用、签名一致、贴图还在、烘焙帧还在。
      const canReuseLayout =
        shouldReuseLayout &&
        layoutHash &&
        floorState.target &&
        floorState.contentKey === layoutHash &&
        floorState.bakedFrame;
      // 增量模式下本帧已经烘过一个楼层 → 剩下的排到后续帧。
      if (!canReuseLayout && isIncrementalUpdate && buildCount >= 1) {
        deferredFloorIds.push(groupId);
        continue;
      }
      floorState.lastUsed = performance.now();
      const previousContactOpacity = floorState.uniforms.plan2ContactOpacity.value;
      const previousSurfaceOpacity = floorState.uniforms.plan2SurfaceOpacity.value;
      if (canReuseLayout) {
        stats.cacheHits++;
        floorState.uniforms.plan2ContactOpacity.value = settings.enabled ? settings.opacity : 0;
        floorState.uniforms.plan2SurfaceOpacity.value =
          settings.enabled && settings.surfaceEnabled && floorState.surface
            ? settings.surfaceOpacity
            : 0;
      } else {
        buildCount++;
        if (shouldReuseLayout) {
          storeCachedLayout(floorState);
        }
        buildContactMap(floorState, group.receivers, group.casters);
        floorState.contentKey = layoutHash;
        floorState.bakedFrame = anchorFrame;
        floorState.uniforms.plan2ContactTransform.value.identity();
      }
      if (floorState.fade) {
        // 淡入进行中又发生了重建：把终点改成新浓度，起点保持「当前显示值」，
        floorState.fade.to = floorState.uniforms.plan2ContactOpacity.value;
        floorState.fade.toSurface = floorState.uniforms.plan2SurfaceOpacity.value;
        floorState.uniforms.plan2ContactOpacity.value = previousContactOpacity;
        floorState.uniforms.plan2SurfaceOpacity.value = previousSurfaceOpacity;
        requestFrame();
      } else if (
        isIncrementalUpdate &&
        previousContactOpacity < floorState.uniforms.plan2ContactOpacity.value
      ) {
        floorState.fade = {
          started: performance.now(),
          from: previousContactOpacity,
          fromSurface: previousSurfaceOpacity,
          to: floorState.uniforms.plan2ContactOpacity.value,
          toSurface: floorState.uniforms.plan2SurfaceOpacity.value
        };
        floorState.uniforms.plan2ContactOpacity.value = previousContactOpacity;
        floorState.uniforms.plan2SurfaceOpacity.value = previousSurfaceOpacity;
        requestFrame();
      }
      floorState.anchor = anchorObject;
      floorState.casters = group.casters.length;
      floorState.receivers = group.receivers.length;
      floorState.instancedCasters = group.casters.filter(
        casterObject => casterObject.isInstancedMesh
      ).length;
    }
    updateBakedTransforms();
    // 保护名单：全量重建时是本次扫描到的所有楼层；增量时是所有「还挂着接收面」的楼层
    evictCaches(
      rebuildAllFloors
        ? sceneGroupsById
        : new Map(
            [...floorStatesById.values()]
              .filter(stateWithReceivers => stateWithReceivers.receivers > 0)
              .map(stateWithTarget => [stateWithTarget.id, true])
          )
    );
    stats.casters = stats.instancedCasters = stats.receivers = 0;
    for (const stateForStats of floorStatesById.values()) {
      stats.casters += stateForStats.casters;
      stats.instancedCasters += stateForStats.instancedCasters;
      stats.receivers += stateForStats.receivers;
    }
    stats.floors = [...floorStatesById.values()].filter(
      stateWithVisibleTarget =>
        stateWithVisibleTarget.target &&
        stateWithVisibleTarget.uniforms.plan2ContactOpacity.value > 0
    ).length;
    stats.builds += 1;
    needsRebuild = false;
    pendingFloorIds.clear();
    deferredFloorIds.forEach(deferredId => pendingFloorIds.add(deferredId));
    isIncrementalUpdate = deferredFloorIds.length > 0;
    if (isIncrementalUpdate) {
      requestFrame();
    }
  }
  /**
   * 释放控制器持有的全部资源（幂等）。
   */
  function disposeAll() {
    if (!isDisposed) {
      isDisposed = true;
      stats.disposed = true;
      for (const disposedFloorState of floorStatesById.values()) {
        disposeFloorState(disposedFloorState);
      }
      for (const disposedLayout of cachedLayoutsByKey.values()) {
        disposeFloorState(disposedLayout);
      }
      cachedLayoutsByKey.clear();
      pendingFloorIds.clear();
      lastRootObject = null;
      floorStatesById.clear();
      for (const disposedDepthMaterial of depthMaterialsByKey.values()) {
        disposedDepthMaterial.dispose();
      }
      depthMaterialsByKey.clear();
      placeholderTexture.dispose();
      blurQuad.geometry.dispose();
      blurMaterial.dispose();
    }
  }
  // 对外接口。sync 由主渲染循环每帧调用；其余方法都只是「改状态 + 标记失效」，
  const controller = {
    sync: syncFloors,
    invalidate: invalidate,
    dispose: disposeAll,
    stats: stats,
    settings: settings,
    setEnabled: setEnabled,
    setSuspended: setSuspended,
    setMotion: setMotion,
    /**
     * 只显示某个楼层的接触阴影（null 表示全部显示）。
     */
    setVisibleFloor(floorIdInput) {
      const nextVisibleFloorId = floorIdInput == null ? null : String(floorIdInput);
      if (nextVisibleFloorId !== visibleFloorId) {
        visibleFloorId = nextVisibleFloorId;
        for (const floorStateToHide of floorStatesById.values()) {
          if (!isMotionSuspended && !matchesVisibleFloor(floorStateToHide.id)) {
            floorStateToHide.fade = null;
            floorStateToHide.uniforms.plan2ContactOpacity.value =
              floorStateToHide.uniforms.plan2SurfaceOpacity.value = 0;
          }
        }
        invalidate(null, true);
      }
    },
    /**
     * 注入楼层锚点帧提供者（返回该楼层当前世界矩阵的函数）。
     */
    setFrameProvider(provider) {
      frameProvider = provider;
      invalidate();
    },
    // 取某楼层的 uniform 对象，供地面材质在构建时直接绑定（名字以 plan2 开头的那组）。
    getUniforms: floorKey => getFloorState(floorKey).uniforms
  };
  // 调试口子：控制台里可以 __plan2Contact.stats 看缓存命中与烘焙次数。
  if (typeof window !== "undefined") {
    window.__plan2Contact = controller;
  }
  return controller;
}
