/**
 * 接触阴影（Contact Shadow）控制器：为家具与地面接触处烘焙一圈压暗的贴地阴影，也负责家具顶面之间的「表面烘焙」。
 * 它是环境遮蔽（AO）的廉价近似，不追求全局光照的物理正确，只求把物体「钉」在地板上。
 * 对外：createContactShadowController（控制器工厂，返回 sync / invalidate / dispose / settings）。材质资格判定 isContactCasterMaterial 只在本文件内使用，刻意不导出 —— 需要时再 export 回来（成本一行）。
 * 为什么不用实时阴影贴图：家具动辄上千网格，逐帧渲染 shadow map 的 draw call 与显存开销不可接受，且相机常做楼层切换与环绕会闪烁抖动。
 * 因此改为「只在需要时烘焙一次」：从地板下方 6cm 处朝上拍一张正交深度图，把深度换算成遮蔽浓度存进 RedFormat 贴图，地面材质着色器再按世界坐标采样。
 * 关键约定：所有贴图都在「楼层锚点帧」里烘焙，须维护 plan2ContactTransform 把世界坐标变换回烘焙时的坐标系，锚点一动（楼层过渡、家具搬动）就要重算或重烘焙。
 * 烘焙会临时改写 renderer 的 renderTarget / viewport / scissor / clearColor / autoClear / shadowMap / xr，finally 里必须逐项还原，否则主渲染会花屏。
 * 遮蔽强度统一走 plan2ContactOpacity / plan2SurfaceOpacity 两个 uniform 做淡入淡出，开关、挂起、楼层切换都只改这两个值，不重建贴图。
 */
import { roundToDecimals } from "../../utils/numbers.js?v=2609271208";
import { computeSurfaceLevels, computeLayoutKey, getDepthMaterial, bakeSurfaceLevels } from "./contact-shadow-passes.js";

/**
 * 沿父链向上查找某个 userData 字段，返回第一个存在的值。
 * 用途：网格本身通常不带楼层 / 层级信息，信息挂在某个祖先 Group 上，所以判断归属时一律用「向上查找」而不是只看自身。
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
 * three.js 的 visible 只影响自身渲染，父节点隐藏时子节点同样不会出现在画面里；而遍历到的网格可能挂在一个被临时隐藏的 Group（比如隐藏层、楼层过渡中的旧楼层）下。
 * 只看 mesh.visible 会把看不见的物体也算成投影源，烘出多余的阴影。
 */
function isVisibleWithAncestors(rootObject3d) {
  for (let ancestorNode = rootObject3d; ancestorNode; ancestorNode = ancestorNode.parent) {
    if (!ancestorNode.visible) {
      return false;
    }
  }
  return true;
}
/**
 * 判断一个材质是否有资格作为「接触阴影投影源」：深度烘焙通道只渲染不透明实体，任何半透明 / 折射 / 镂空材质在深度图里都会变成一个实心板，把阴影错烘成一大片黑块。
 * 判定口径（四条全过才算数）：opacity >= 0.98 —— 几乎不透明的才算实体，0.98 是给浮点误差留的余量；transmission 必须为 0，排除玻璃类折射材质。
 * 允许 transparent，但必须配 alphaTest > 0 —— 树叶、栏杆这类靠 alphaTest 抠洞的材质在深度通道里能正确镂空，反而应该参与，否则树下会缺阴影。
 */
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
 * 只收近似水平朝上的面（墙面与斜面交给地面通道），按 1cm 分桶（heightKey）合并，桶内记面积加权平均高度与最高点，按总面积取前 levelLimit 个再按高度升序输出。 阈值来历：triangleArea < 0.004 滤掉小于 4cm² 的碎面（倒角、螺丝、贴花），不滤会让统计被噪声主导；faceNormal.y < triangleArea * 1.98 等价于 cos(倾角) < 0.99（叉积模长即 2 倍面积），只保留与水平面夹角约 8° 以内的面，避免把沙发表面当桌面。
 * surfaceHeight <= 0.12 丢弃距地板 12cm 以内的面（踢脚、地面找平层），它们会与地面通道烘出同一条阴影。
 */

/**
 * 创建接触阴影控制器（一个渲染器一份，内部状态跨帧复用）。
 * sync 流程：按楼层收集地面接收面（regionReceiverKind === 'floor'）与投影源（castShadow + modelLayer === 'items' + 材质合格）；用内容签名（几何 + 材质 + 变换，见 computeLayoutKey）判断布局是否变化，没变就命中缓存复用贴图。 需要重烘时从地板下方 6cm 处朝上拍深度图并做两轮模糊，必要时把各级水平面各拍一张拼成图集并生成「高度 → 图集格子」查找表。
 * 失效与重建时机：场景编辑调 invalidate(floorIds) 只重烘受影响楼层；换根节点整体作废；楼层过渡调 setMotion(true) 挂起重建、只留旧贴图做淡出；增量模式下每帧最多补烘 1 个楼层，其余留到 deferredFloorIds，保证单帧渲染预算不被烘焙吃光。
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
  // 改动其中任何一项都会进入 computeLayoutKey 的签名，从而自动触发重新烘焙。
  const settings = {
    enabled: true,
    // 地面阴影浓度上限；0.78 是试出来的值 —— 再深会把木地板的纹理压没，再浅则家具像浮空。
    opacity: 0.78,
    // 地面深度图的边长（像素）。1024 足以覆盖一层的接触范围，且模糊两轮后看不出锯齿。
    resolution: 1024,
    // 参与接触阴影的最大高度（米）：高过 2.5m 的吊灯、吊柜对地面的接触贡献可忽略，
    // 同时这个值也是深度相机的远平面（+0.06 余量）。
    maxHeight: 2.5,
    // 浓度随高度衰减的尺度（米）：density = exp(-height / heightFalloff)，
    // 1.2 让阴影在离地约 1m 处基本消失，接近真实接触遮蔽的观感。
    heightFalloff: 1.2,
    // 模糊半径（米）。按世界尺寸给定、再除以地面贴图的世界宽高换算成 UV，
    // 这样不同大小房间的阴影柔和度一致。
    blurMeters: 0.055,
    // 投影在屏幕空间的两个方向的偏移量：制造「光源略偏一侧」的方向感，
    // 否则正交深度图会得到完全对称的死板阴影。
    offsetX: 0.28,
    offsetZ: -0.22,
    // 表面烘焙（家具顶面之间的相互压暗）开关与浓度；比地面浅一些，避免顶面发脏。
    surfaceEnabled: true,
    surfaceOpacity: 0.55,
    // 每级表面的单张分片边长；256 已经足够，因为表面遮蔽范围小、且会做多轮模糊。
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
  // MeshDepthMaterial，避免每件家具都编译一次深度着色器。
  const depthMaterialsByKey = new Map();
  // 几何缓存键 / 接收面包围盒：用 WeakMap，几何被回收后缓存自动失效，
  // 不会随场景反复编辑无限增长。
  const geometryCacheEntryByGeometry = new WeakMap();
  const receiverBoundsCacheByGeometry = new WeakMap();
  // 已烘焙的布局缓存（键为「楼层 ID + 内容签名」）：同样的场景内容换楼层时可直接搬用贴图。
  // 这里用 Map 而非 WeakMap，因为键是字符串，需要显式按 LRU 淘汰。
  const cachedLayoutsByKey = new Map();
  // 1x1 黑色占位纹理：uniform 不能为 null，未烘焙的楼层统一指向它，
  // 材质只需读 plan2ContactOpacity === 0 就能跳过采样。
  const placeholderTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  placeholderTexture.needsUpdate = true;
  let needsRebuild = true;
  let isDisposed = false;
  let isSuspended = false;
  let isMotionSuspended = false;
  let lastRootObject = null;
  // 外部注入的「楼层锚点帧」提供者：返回该楼层当前的世界矩阵。
  // 楼层过渡时锚点在动，用它把贴图变换到当前位置，比重新烘焙便宜得多。
  let frameProvider = null;
  // 增量模式：本帧只补烘 1 个楼层，其余排队到后续帧，避免一帧内大量烘焙造成掉帧。
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
  // 阴影图必须做柔性模糊，否则正交深度图会在家具边缘留下硬边锯齿。
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
    // 9 抽头高斯模糊的「线性采样优化版」：中心权重 0.227027、近邻合计 0.316216、远邻合计 0.070270，采样偏移 1.384615 / 3.230769 —— 经典常量，用 5 次采样拟合 9 抽头高斯，省掉一半纹理读取。
    // spread 在「模糊结果」与「邻域最大值」之间插值：取最大值相当于做膨胀、让阴影稍微外扩，避免模糊后贴地阴影缩进家具底下露出缝隙。
    fragmentShader:
      "uniform sampler2D source; uniform vec2 stepSize; uniform float spread; varying vec2 shadowUv;\n      void main() {\n        float center = texture2D(source, shadowUv).r;\n        float nearA = texture2D(source, shadowUv + stepSize * 1.384615).r;\n        float nearB = texture2D(source, shadowUv - stepSize * 1.384615).r;\n        float farA = texture2D(source, shadowUv + stepSize * 3.230769).r;\n        float farB = texture2D(source, shadowUv - stepSize * 3.230769).r;\n        float value = mix(center * 0.227027 + (nearA + nearB) * 0.316216 + (farA + farB) * 0.070270,\n          max(center, max(max(nearA, nearB), max(farA, farB))), spread);\n        gl_FragColor = vec4(vec3(value), 1.0);\n      }"
  });
  const blurQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurMaterial);
  // 关闭视锥剔除：这个四边形靠顶点着色器直接写 NDC，包围球在相机空间里没有意义，
  // 交给 three.js 剔除会被误判为不可见。
  blurQuad.frustumCulled = false;
  blurScene.add(blurQuad);
  /**
   * 取（必要时创建）某楼层的地面阴影状态。
   * 每个楼层独立持有自己的渲染目标与 uniform 对象：uniform 必须逐层独立，否则多层同时可见时后烘焙的楼层会覆盖前一层的贴图。
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
        // 一组是地面通道：变换矩阵 / 深度图 / 世界包围盒 / 地面高度 / 浓度；
        // 另一组是表面通道：高度图集 / 图集 UV 包围盒 / 高矮查找表 / 图集布局 / 浓度。
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
   * 挂起时把浓度直接清零并作废缓存；恢复时走一次完整重建 —— 因为挂起期间场景可能被改过，复用的贴图不再可信。
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
   * 进入：给所有楼层挂上 240ms 的淡出动画，让阴影平滑消失，而不是在运动中途还挂着与位置不符的旧阴影。
   * 退出：清掉动画、允许复用布局（isIncrementalUpdate + shouldReuseLayout），位置变了的楼层只需重烘一轮而不是全量重建。
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
   * 数学：plan2ContactTransform = invert(当前锚点矩阵) × 烘焙时的锚点矩阵。
   * 着色器用它把世界坐标先搬到烘焙坐标系再采样，所以锚点动了不必重烘，只需在每帧 sync 时更新这个矩阵（楼层过渡时省下大量烘焙）。
   */
  function updateBakedTransforms() {
    for (const bakedFloorState of floorStatesById.values()) {
      if (!bakedFloorState.bakedFrame) {
        continue;
      }
      bakedFloorState.anchor?.updateWorldMatrix(true, false);
      // updateWorldMatrix(true, false)：向上刷新祖先矩阵（true）但不递归子节点（false），
      // 只需要锚点自身的世界矩阵，递归子节点在大场景里是纯浪费。
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
   * 取（必要时创建）用于深度烘焙的材质。不用普通 MeshDepthMaterial：它输出的是「距离远近」，而接触阴影需要「离地高度 → 浓度」。
   * onBeforeCompile 注入两段：顶点按投影矩阵元素把顶点朝 (offsetX, offsetZ) 偏移、偏移量正比于离地高度（效果是阴影只从贴地部分长出来，形成短促的贴地影）。 片元把原生深度还原成高度，再用 exp(-height / falloff) 转成浓度，末尾用 smoothstep(1.8, 2.5) 把超过 maxHeight 的部分收到 0，避免远处出现硬截断。
   * @param {boolean} [isSurfaceBake=false] 表面烘焙：表面级高度差很小，会换一组近平面 / 衰减 / 截断参数（1.5 / 0.5 / 0.8~1.5）。@throws {Error} 注入点 project_vertex 缺失（three.js 版本不兼容）时抛出。
   */
  
  /**
   * 把深度材质缓存裁到上限。
   *
   * 64 是「一层楼的独立材质数量」量级：正常户型远小于它，频繁编辑时也不会无界增长。
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
   * 注意只清渲染目标与 uniform 指向，不删除 floorStatesById 里的条目：状态对象本身很轻，留着可以避免下一帧重建时反复分配。
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
   * ping 缓冲只用于模糊的中间结果，不需要深度缓冲；两者都用 RedFormat —— 只要一个通道，内存占用是 RGBA 的四分之一。
   * 模糊只有 4 轮，反复读写也不会出现明显精度损失。
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
   * 为什么需要：家具顶面之间也会有接触阴影，但地面通道的相机在地板下方拍不到这些高度；给每级都保留一张独立贴图又太费显存，故按方形图集拼起来（atlasColumns × atlasColumns 个格子），再额外生成一张一维查找表，运行时按「该像素离地高度」查出应采样哪个格子。 流程：computeSurfaceLevels 得到高度级列表，空则直接清空资源；图集边长受设备 maxTextureSize 约束，格子数多了自动降分辨率；每级把正交相机摆在该级最高点上方 3mm（贴太近会自遮挡、太远则漏掉细节），朝上拍一张后做 4 轮由粗到细的模糊，再用 viewport 只写入图集对应的格子。
   * 最后生成 2048 采样的一维查找表：把 0 ~ 最高级 + 5cm 的高度区间等分，每格记录最近的级号（容差 1.8cm，找不到就留 0 / alpha 0 表示无遮蔽）。
   */
  
  /**
   * 烘焙一层楼的接触阴影贴图。相机摆位是整套方案的核心：正交相机放在地板面下方 6cm、朝正上方拍。
   * 放在「下方」而不是「上方」：地面本身（与相机同高、甚至更低的三角面）不会挡住视线，只有家具的侧壁会被拍到，深度图里自然形成一圈贴地的暗边。 6cm 是经验值：太小会把地板自身拍进深度，太大则阴影从家具边缘往外溢出不真实。
   * 渲染前会把投影源 clone 一份放进临时场景，并整体替换成深度材质（不动原场景，避免改材质触发热更新或影响其他渲染通道）。@throws {Error} 烘焙过程中渲染报错时，先清空该层资源再原样抛出，不留下半成品状态。
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
    // 外扩 25cm：让最靠墙的家具也能在画面内留出阴影余量，否则边缘处阴影会被裁成直边。
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
    // 用兜底而不是直接跳过该网格，是为了让克隆体的层级与同级网格的矩阵保持同步；
    // 结果按源材质缓存（depthMaterialsByCaster），同一材质不会重复创建。
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
      // 深层子节点会由遍历时的其他 caster 单独入列，这里再递归就会重复渲染。
      const casterClone = casterSource.clone(false);
      casterClone.material = Array.isArray(casterSource.material)
        ? casterSource.material.map(toDepthMaterial)
        : toDepthMaterial(casterSource.material);
      // 直接拷贝源对象的世界矩阵并关掉自动更新：克隆体不在原层级里，
      // 靠 three.js 自己算矩阵会得到错误结果；这里要的是「世界坐标下的快照」。
      casterClone.matrix.copy(casterSource.matrixWorld);
      casterClone.matrixWorld.copy(casterSource.matrixWorld);
      casterClone.matrixAutoUpdate = false;
      casterClone.matrixWorldAutoUpdate = true;
      // 深度通道不需要阴影，且必须避免 three.js 在渲染时把阴影相机也算进来。
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
    // 否则主渲染的 viewport / scissor / 清屏色会残留，表现为画面被裁或背景变黑。
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
      // 关掉 XR 是因为立体渲染会让每次 render 重复绘制两遍。
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
        // 再按 Y 方向做一遍。两遍都往返于主图与 ping 缓冲之间，避免读写同一张贴图。
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
      // 方块状采样痕迹，两轮叠加能在几乎不增加开销的前提下把过渡磨平。
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
      // 而错误仍要向上抛，交给调用方决定是否禁用本层。
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
      // 必须显式 dispose，否则每次重烘都会泄漏一份实例缓冲。
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
   * 快路径：几何是参数化类型（BoxGeometry 等）且属性没被改过（version === 0），直接序列化 type + parameters，去掉 uuid 保证内容相同即签名相同；慢路径：手改过顶点或来自外部模型的几何，只能对底层 buffer 做 FNV 双通道哈希。 无论走哪条路，结果都与「position 属性 + index 属性的版本号」绑定缓存，版本一变（哪怕 buffer 被整体替换而属性对象没换）就重算。
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
        // 所以这里不中断阴影构建。
        geometryKey = JSON.stringify(
          [bufferGeometry.type, bufferGeometry.parameters],
          (jsonKey, jsonValue) => (jsonKey === "uuid" ? undefined : jsonValue)
        );
      } catch {}
    }
    if (!geometryKey) {
      // 双通道哈希（两个不同的 FNV 乘数）拼出 64 位签名：单通道在几千个几何的规模下
      // 有可观测的碰撞概率，碰撞会导致「内容不同却复用同一张阴影」。
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
   * 签名含四类信息：settings（任何烘焙参数变化都必须重烘）；接收面只取经锚点帧归一化后的世界包围盒（比整个几何短得多），并按位置缓存包围盒，属性版本没变就不重算。 投影源取几何签名 + 实例数量 + 形变权重 + 变换矩阵 + 材质签名，材质签名刻意只保留「会影响深度输出」的字段（alphaTest、贴图、位移量），改颜色、改金属度不会触发重烘。
   * 所有矩阵元素都乘 10000 后取整再比较：浮点末位抖动不该被当成内容变化，这是「拖拽家具时不疯狂重烘」的关键。@returns {string} 内容签名（JSON 字符串）。
   */
  
  /**
   * 估算一份缓存状态占用的显存字节数，用于总预算控制。
   * 只能估算：贴图的实际显存布局由驱动决定，这里按「单通道算 1~5 字节、多通道算 4~8 字节」的保守口径折算，够用来判断有没有超预算。
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
   * 存进去的是「资源 + uniform 值的快照」：uniform 里的向量 / 矩阵需要 clone，纹理则只存引用（转移所有权，原状态对象随即被清空）。
   * ping 缓冲不保存 —— 它只是模糊的中间结果，下次重建时可以重新分配。
   */
  function storeCachedLayout(builtEntry) {
    if (!builtEntry.target || !builtEntry.contentKey) {
      return;
    }
    const layoutKey = JSON.stringify([builtEntry.id, builtEntry.contentKey]);
    const displacedEntry = cachedLayoutsByKey.get(layoutKey);
    // 同一把键已存在说明内容一模一样但状态对象换了（比如根节点被替换）：
    // 先把旧的那份释放掉，否则会泄漏一整套渲染目标。
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
   * 先把当前状态存回缓存（交换语义）：调用方通常在「内容即将变化」时调用它，当前这份结果对之后仍可能有用，不该白白丢弃。
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
    // 刚恢复的贴图必须从「全透明」开始淡入，否则楼层切换瞬间会出现阴影跳变。
    restoredEntry.uniforms.plan2ContactOpacity.value =
      restoredEntry.uniforms.plan2SurfaceOpacity.value = 0;
    return true;
  }
  /**
   * 按显存预算与数量上限淘汰缓存。
   * 策略：先用所有状态对象（按 lastUsed 从新到旧）填预算，装不下的整体释放；再把布局缓存限制在 8 份以内，并与已占用显存合计不超过 32MB。 32MB 上限是为了让接触阴影在低端显卡上也不至于挤掉主渲染的贴图。
   * @param {Set<string>|Map<string, *>} protectedIds 必须保留的楼层 ID 集合（本次重建涉及的楼层）。
   */
  function evictCaches(protectedIds) {
    const evictionCandidates = [...floorStatesById.values()]
      .filter(candidateState => candidateState.target && !protectedIds.has(candidateState.id))
      .sort((stateA, stateB) => (stateB.lastUsed || 0) - (stateA.lastUsed || 0));
    let retainedBytes = 0;
    let retainedFloorCount = 0;
    for (const evictedFloor of evictionCandidates) {
      // ping 缓冲丢了代价很小（重建时按需分配），先丢它腾地方，再考虑整体释放。
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
   * 调用方每帧调一次，函数自己决定「这帧要不要干活」：没有待办就直接返回。
   * 增量模式下每帧最多烘 1 个楼层，剩下的塞回 pendingFloorIds 并再请求一帧，把烘焙开销摊到多帧，避免楼层切换时出现肉眼可见的卡顿。
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
    // 不清会把上一个文档的阴影贴到新场景上。
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
    // 直接用它做判断会边遍历边改，把本轮没打算处理的楼层也牵进来。
    const pendingFloorIdSnapshot = new Set(pendingFloorIds);
    rootObject.updateWorldMatrix(true, true);
    const sceneGroupsById = new Map();
    rootObject.traverse(sceneNode => {
      // 楼层过渡中正在离场的旧楼层不参与烘焙：它在做位移 / 淡出，
      // 烘出来的阴影会跟着旧位置留在画面上。
      if (
        !sceneNode.isMesh ||
        !isVisibleWithAncestors(sceneNode) ||
        findUserDataInAncestors(sceneNode, "floorTransitionLeaving")
      ) {
        return;
      }
      // 楼层归属优先取 regionFloorId（区域级），退回 floorId，都没有就归到 default。
      // 与区域光照模块共用同一套字段名，改名要同步改那边。
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
      // 且至少有一个材质有资格进深度通道。三层过滤缺一不可。
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
        // 复用布局模式（setMotion 退出、楼层切换）下保留贴图只关浓度，
        // 因为很可能马上还要用；否则直接释放，避免显存里留一堆孤儿贴图。
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
      // 少一项都会拿到过期贴图，因此宁可多烘一次。
      const canReuseLayout =
        shouldReuseLayout &&
        layoutHash &&
        floorState.target &&
        floorState.contentKey === layoutHash &&
        floorState.bakedFrame;
      // 增量模式下本帧已经烘过一个楼层 → 剩下的排到后续帧。
      // 这是「楼层切换时不掉帧」的核心节流点。
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
        // 于是动画不会跳变，只是改向新的目标收敛。
        floorState.fade.to = floorState.uniforms.plan2ContactOpacity.value;
        floorState.fade.toSurface = floorState.uniforms.plan2SurfaceOpacity.value;
        floorState.uniforms.plan2ContactOpacity.value = previousContactOpacity;
        floorState.uniforms.plan2SurfaceOpacity.value = previousSurfaceOpacity;
        requestFrame();
      } else if (
        isIncrementalUpdate &&
        previousContactOpacity < floorState.uniforms.plan2ContactOpacity.value
      ) {
        // 增量重建后浓度从 0 恢复到目标值：不能直接赋值，否则会「啪」地跳出来，
        // 因此挂一段淡入，并把当前值先还原成旧的（0），让 syncFloors 的淡入逻辑接手。
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
    // （它们下一帧很可能立刻要用），其余都可以按预算淘汰。
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
   * 释放顺序：贴图 → 材质 → 共享几何 / 纹理由创建方负责；占位纹理与模糊四边形是控制器自己 new 的，必须一并 dispose，否则热重载时会留下泄漏。
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
  // 真正的烘焙统一发生在下一次 sync 里，保证不会在无关调用栈上长时间阻塞。
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
     * 楼层切换时用它把非当前楼层的浓度立刻清零，而不是等重建 —— 这样即使该层还没烘好，也不会在画面上残留其他楼层的阴影。
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
     *
     * 换了提供者等于「锚点定义变了」，必须作废缓存重烘，不能沿用旧贴图。
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
