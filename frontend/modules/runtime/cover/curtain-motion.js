/**
 * 窗帘的开合动画（普通布帘与梦幻帘）：3D 户型里的窗帘模型是「一整片」静态网格，本模块在其上挂
 * 自制的布料网格，按开合百分比实时改变形状并隐藏原静态网格。
 *
 * 与渲染器的约定：轨道几何构建与姿态采样统一来自 3d-studio/loaders/studio-curtain-track.js，
 * 避免 3D 预览与渲染产物出现两套窗帘算法。
 * 与 HA 的约定：位置取归一化状态的 position（0–100，0 全关）；梦幻帘另取 tiltPosition（0–100 叶片角度，
 * 50 表示 90° 打开）；开合方向 coverDirection / curtainPosition 取值 left / right / split。
 */

// 模型定位键（楼层 + 模型）的唯一实现在 core/scene-model-key.js。
import { sceneModelKey } from "../core/scene-model-key.js?v=20260921151446";

// 轨道模型与布料几何的构建原语；开发环境走相对路径，生产环境走带缓存戳的静态路径。
const {
  normalizeCurtainTrack: normalizeTrack,
  createCurtainTrack: createTrack,
  createTrackClothGeometry: buildTrackClothGeometry,
  poseTrackCloth: poseClothGeometry,
  curtainPanelRanges: samplePanelRanges,
  createDreamBladeGeometry: createBladeGeometry,
  poseDreamBlades: poseBladeGeometry
} = await (import.meta.url.startsWith("file:")
  ? import(
      new URL(
        "../../../static/3d-studio/loaders/studio-curtain-track.js?v=20260921151446",
        import.meta.url
      )
    )
  : import("/static/3d-studio/loaders/studio-curtain-track.js?v=20260921151446"));
/** 允许的开合方向：left 只开左幅、right 只开右幅、split 对开。 */
const DIRECTION_SET = new Set(["left", "right", "split"]);
/** 会被本模块接管（隐藏）的局部：cloth 是布料面，band 是帘头装饰带。 */
const CLOTH_PART_SET = new Set(["cloth", "band"]);
/** 组成一整套窗帘骨架的局部类型：轨道、端盖，以及上面的布面与帘头。 */
const TRACK_PART_SET = new Set(["rod", "cap", ...CLOTH_PART_SET]);
/** 动画帧间隔：窗帘动画限流在 30fps，省下算力给场景本身。 */
const FRAME_INTERVAL_MS = 1000 / 30;
/** 单次开合动画时长（毫秒）；420ms 是实测手感上「跟手但不突兀」的取值。 */
const MOTION_DURATION_MS = 420;
/**
 * 窗帘完全收拢时保留的最小宽度比例。
 * 不能收到 0：零宽几何体的包围盒退化，光照与阴影都会出错，视觉上还会「啪」地消失；
 * 12% 相当于布面折叠后的物理厚度。
 */
const MIN_PANEL_SCALE = 0.12;
/** 布面褶皱间距（米）：普通布帘每 15cm 一道褶。 */
const CLOTH_FOLD_SPACING_METERS = 0.15;
/** 布料类型：sheer 为纱（更透、褶皱更密），其余一律按 cloth 处理。 */
const resolveCurtainFabric = fabricBinding =>
  fabricBinding.curtainFabric === "sheer" ? "sheer" : "cloth";
/** 未绑定实体时使用的固定开合位置（0–100），非法或缺失一律按 0（全关）。 */
const resolveUnboundPosition = unboundBinding =>
  !unboundBinding.entityId && Number.isFinite(unboundBinding.unboundPosition)
    ? Math.max(0, Math.min(100, unboundBinding.unboundPosition))
    : 0;
/**
 * 按帘宽推算褶皱数量。
 * 公式：帘宽 ÷（对开时折半）÷ 褶皱间距（纱帘 0.1 米）；结果夹在 4–96 之间 ——
 * 太少看不出褶皱，太多会让顶点数爆炸（每个褶皱要 6 段）。
 */
const resolveFoldCount = widthBinding =>
  Math.max(
    4,
    Math.min(
      96,
      Math.round(
        (Number(widthBinding.curtainWidth) || 1.8) /
          (resolveCurtainDirection(widthBinding) === "split" ? 2 : 1) /
          (resolveCurtainFabric(widthBinding) === "sheer" ? 0.1 : CLOTH_FOLD_SPACING_METERS)
      )
    )
  );
/**
 * 取开合方向。
 *
 * coverDirection 是新字段，curtainPosition 是历史字段，两者都不合法时按对开处理。
 */
const resolveCurtainDirection = directionBinding =>
  DIRECTION_SET.has(directionBinding.coverDirection)
    ? directionBinding.coverDirection
    : DIRECTION_SET.has(directionBinding.curtainPosition)
      ? directionBinding.curtainPosition
      : "split";
/** 取归一化状态里的位置；非有限数值返回 null，表示「位置未知」。 */
const resolveStatePosition = receivedState =>
  typeof receivedState?.position == "number" && Number.isFinite(receivedState.position)
    ? Math.max(0, Math.min(100, receivedState.position))
    : null;
/**
 * 读取窗帘模型的基准尺寸。
 * 由模型导出时写入 userData.curtainRigBasis（宽、高、厚，单位米），三个分量
 * 都必须是正的有限数；缺失时回落到标准帘尺寸 1.8 × 2.4 × 0.18。
 */
const resolveRigBasis = rigAnchor =>
  Array.isArray(rigAnchor.userData?.curtainRigBasis) &&
  rigAnchor.userData.curtainRigBasis.length === 3 &&
  rigAnchor.userData.curtainRigBasis.every(
    basisComponent =>
      typeof basisComponent == "number" && Number.isFinite(basisComponent) && basisComponent > 0
  )
    ? [...rigAnchor.userData.curtainRigBasis]
    : [1.8, 2.4, 0.18];
/**
 * 程序化生成布料网格（正弦褶皱的薄壳）。
 * 不用模型平板是因为它表现不出「收拢时褶皱变密变深」；这里沿帘宽铺 N 个正弦褶皱，
 * 并生成正/反/上/下四面与两侧端盖，使布料有真实厚度（0.003 米）和可用法线。
 */
function createClothGeometry(three, folds, fabric) {
  const isSheer = fabric === "sheer";
  // 每道褶皱至少 6 段才能画出平滑的正弦；总数下限 64 段，保证窄帘也不出现折角。
  const segmentCount = Math.max(64, folds * 6);
  // 2.28168 是模型导出的实际帘高（米），用固定值而非模型量得的尺寸，
  // 避免模型带缩放时布料高度被二次放大。
  const panelHeight = 2.28168;
  // 纱更薄，褶皱幅度取布帘的一半，看起来更轻盈。
  const foldAmplitude = isSheer ? 0.023 : 0.046;
  const clothThickness = 0.003;
  const positionArray = [];
  const normalArray = [];
  const uvArray = [];
  // 顶点色数组：与轨道帘同一套褶皱明暗公式，保证自建几何与轨道几何的暗部层次一致。
  const colorArray = [];
  const indexArray = [];
  // 褶皱位移与斜率：位移取正弦，斜率取导数，用于把法线扭转成垂直于布面。
  const foldDisplacement = seamRatio => foldAmplitude * Math.sin(seamRatio * folds * Math.PI * 2);
  // 上式的解析导数（∂/∂seamRatio）：直接用导数当切线算出布面法线，
  // 比有限差分稳定，且与 foldDisplacement 严格同相位。
  const foldSlope = seamSlopeRatio =>
    foldAmplitude * folds * Math.PI * 2 * Math.cos(seamSlopeRatio * folds * Math.PI * 2);
  /** 写入一个顶点（位置 / 法线 / UV / 褶皱明暗）。 */
  const pushVertex = (
    positionX,
    positionY,
    positionZ,
    normalX,
    normalY,
    normalZ,
    textureU,
    textureV
  ) => {
    positionArray.push(positionX, positionY, positionZ);
    normalArray.push(normalX, normalY, normalZ);
    uvArray.push(textureU, textureV);
    // 褶皱暗部：positionX 在这里就是沿帘宽的比例，波谷压暗、波峰保持原色。
    // 暗部深度按面料区分（纱帘 16%、布帘 34%），并用平方让暗部收在波谷附近。
    const foldDarkness = 0.5 - Math.sin(positionX * folds * Math.PI * 2) * 0.5;
    const foldShade = 1 - (isSheer ? 0.16 : 0.34) * foldDarkness * foldDarkness;
    colorArray.push(foldShade, foldShade, foldShade);
  };
  // 纱帘只生成正面（背面看不见且更省三角形）；布帘四面全做，才有厚度感。
  for (const face of isSheer ? ["front"] : ["front", "back", "top", "bottom"]) {
    // 记录本面第一个顶点的下标，后面按它拼三角形索引。
    const faceVertexOffset = positionArray.length / 3;
    for (let segmentIndex = 0; segmentIndex <= segmentCount; segmentIndex++) {
      const alongRatio = segmentIndex / segmentCount;
      const foldOffset = foldDisplacement(alongRatio);
      const foldSlopeSample = foldSlope(alongRatio);
      // 法线要垂直于倾斜的布面，因此按斜率归一化。
      const normalLength = Math.hypot(foldSlopeSample, 1);
      if (face === "front" || face === "back") {
        // 正反面沿厚度方向各偏 half thickness，法线的 z 分量即朝外方向。
        const outwardSign = face === "front" ? 1 : -1;
        for (const vertexHeight of [0, panelHeight]) {
          pushVertex(
            alongRatio,
            vertexHeight,
            foldOffset + (outwardSign * clothThickness) / 2,
            (-outwardSign * foldSlopeSample) / normalLength,
            0,
            outwardSign / normalLength,
            alongRatio,
            vertexHeight / panelHeight
          );
        }
      } else {
        // 上下面：法线朝向 ±Y，顶点沿厚度方向取两端（形成一条厚度边）。
        const verticalSign = face === "top" ? 1 : -1;
        for (const thicknessOffset of [-clothThickness / 2, clothThickness / 2]) {
          pushVertex(
            alongRatio,
            verticalSign > 0 ? panelHeight : 0,
            foldOffset + thicknessOffset,
            0,
            verticalSign,
            0,
            alongRatio,
            thicknessOffset > 0 ? 1 : 0
          );
        }
      }
      if (segmentIndex < segmentCount) {
        const segmentVertexIndex = faceVertexOffset + segmentIndex * 2;
        // 三角形绕序按面分别处理：正面与底面用一套，其余用反向的另一套，
        // 目的是让所有面的法线都朝外，避免出现黑面。
        if (face === "front" || face === "bottom") {
          indexArray.push(
            segmentVertexIndex,
            segmentVertexIndex + 2,
            segmentVertexIndex + 1,
            segmentVertexIndex + 1,
            segmentVertexIndex + 2,
            segmentVertexIndex + 3
          );
        } else {
          indexArray.push(
            segmentVertexIndex,
            segmentVertexIndex + 1,
            segmentVertexIndex + 2,
            segmentVertexIndex + 1,
            segmentVertexIndex + 3,
            segmentVertexIndex + 2
          );
        }
      }
    }
  }
  // 两侧端盖：把布面在 x=0 与 x=1 处封口（纱帘不封，因为只有单面）。
  for (const edgeX of isSheer ? [] : [0, 1]) {
    const capVertexOffset = positionArray.length / 3;
    const edgeNormalSign = edgeX === 0 ? -1 : 1;
    for (const edgeHeight of [0, panelHeight]) {
      for (const edgeThicknessOffset of [-clothThickness / 2, clothThickness / 2]) {
        pushVertex(
          edgeX,
          edgeHeight,
          foldDisplacement(edgeX) + edgeThicknessOffset,
          edgeNormalSign,
          0,
          0,
          edgeThicknessOffset > 0 ? 1 : 0,
          edgeHeight / panelHeight
        );
      }
    }
    // 端盖的绕序同样按法线方向选择，保证朝外。
    if (edgeNormalSign > 0) {
      indexArray.push(
        capVertexOffset,
        capVertexOffset + 2,
        capVertexOffset + 1,
        capVertexOffset + 1,
        capVertexOffset + 2,
        capVertexOffset + 3
      );
    } else {
      indexArray.push(
        capVertexOffset,
        capVertexOffset + 1,
        capVertexOffset + 2,
        capVertexOffset + 1,
        capVertexOffset + 3,
        capVertexOffset + 2
      );
    }
  }
  const geometry = new three.BufferGeometry();
  geometry.setAttribute("position", new three.Float32BufferAttribute(positionArray, 3));
  geometry.setAttribute("normal", new three.Float32BufferAttribute(normalArray, 3));
  geometry.setAttribute("uv", new three.Float32BufferAttribute(uvArray, 2));
  geometry.setAttribute("color", new three.Float32BufferAttribute(colorArray, 3));
  geometry.setIndex(indexArray);
  // 包围盒与包围球是必须的：视锥剔除与射线拾取都依赖它们。
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
/** 判断 descendant 是否在 ancestor 的子树里（含自身）。 */
function isDescendantOf(descendant, ancestor) {
  for (let walkedNode = descendant; walkedNode; walkedNode = walkedNode.parent) {
    if (walkedNode === ancestor) {
      return true;
    }
  }
  return false;
}
/**
 * 在窗帘模型里定位「可被接管的骨架」。
 * 需要找到两样东西：会被隐藏的原生局部（轨道杆、端盖、布面、帘头），
 * 以及能容纳自制骨架的锚点（优先模型自带的 curtainRigRoot）。
 */
function locateCurtainRig(environmentRoot) {
  const curtainParts = [];
  const rigRoots = [];
  // 递归收集两类节点：能接管的原生局部（布面 / 轨道，见 TRACK_PART_SET）与候选锚点
  // （带 curtainRigRoot 标记）；遇到自制骨架或嵌套独立模型就停止深入。
  function collectRigParts(visitedNode) {
    // 两个排除条件：已经属于自制骨架的节点（避免把自己的产物又收进来），
    // 以及嵌套的独立环境模型（它有自己的坐标基准，不属于本模型）。
    if (
      !visitedNode.userData?.curtainMotionRig &&
      !visitedNode.userData?.curtainMotionPanel &&
      (visitedNode === environmentRoot || visitedNode.userData?.environmentModelId == null)
    ) {
      if (visitedNode.userData?.curtainRigRoot === true) {
        rigRoots.push(visitedNode);
      }
      if (visitedNode.isMesh && TRACK_PART_SET.has(visitedNode.userData?.curtainPart)) {
        curtainParts.push(visitedNode);
      }
      for (const child of visitedNode.children || []) {
        collectRigParts(child);
      }
    }
  }
  collectRigParts(environmentRoot);
  // 没有布面局部就说明这个模型不是窗帘，直接放弃接管。
  if (
    !curtainParts.some(curtainPartNode => CLOTH_PART_SET.has(curtainPartNode.userData.curtainPart))
  ) {
    return null;
  }
  // 优先选「包含全部局部」的 rigRoot；没有则从第一个局部的父节点逐级上溯，
  // 直到找到一个能包住所有局部的祖先作为锚点。
  let anchor = rigRoots.find(anchorCandidate =>
    curtainParts.every(partNode => isDescendantOf(partNode, anchorCandidate))
  );
  if (!anchor) {
    for (
      anchor = curtainParts[0].parent;
      anchor && !curtainParts.every(candidatePart => isDescendantOf(candidatePart, anchor));
    ) {
      anchor = anchor.parent;
    }
  }
  // 锚点必须在模型子树内：否则说明上溯过头，「恢复原生可见性」会作用到模型之外。
  if (anchor && isDescendantOf(anchor, environmentRoot)) {
    return {
      anchor: anchor,
      parts: curtainParts
    };
  } else {
    return null;
  }
}
/**
 * 创建窗帘动画控制器。
 */
export function createCurtainMotion({
  THREE: THREE,
  requestRender: requestRender = () => {}
} = {}) {
  let syncedModelRoot = null;
  let syncedSceneRevision;
  let syncedBindingsSignature = "";
  let isDisposed = false;
  // 按「布料类型:褶皱数」缓存几何体：同一户型里大量窗帘共用少数几种规格。
  const clothGeometryCache = new Map();
  /** 取（或惰性创建）指定规格的布料几何体。 */
  function getClothGeometry(foldCount, fabricName) {
    const cacheKey = fabricName + ":" + foldCount;
    if (!clothGeometryCache.has(cacheKey)) {
      clothGeometryCache.set(cacheKey, createClothGeometry(THREE, foldCount, fabricName));
    }
    return clothGeometryCache.get(cacheKey);
  }
  let rigsByBindingId = new Map();
  // 缓存最近一次收到的开合状态：绑定重建后可以直接套用，避免窗帘闪回全关。
  let coverStatesByEntityId = new Map();
  let lastUpdateMs = -Infinity;
  // 以下两个「脏标记 + 缓存键」是给渲染层用的：只有键变了才需要重绘。
  let isPoseKeyDirty = true;
  let cachedPoseKey = "";
  let previousEntityIdByBindingId = new Map();
  let generationCounter = 1;
  let isStructureKeyDirty = true;
  let cachedStructureKey = "";
  /** 标记姿态已变并请求重绘。 */
  function markPoseDirty() {
    isPoseKeyDirty = true;
    requestRender();
  }
  /**
   * 为一条绑定创建自制骨架。
   */
  function createRig(model, binding, located) {
    const coveredParts = located.parts.filter(coveredPart =>
      CLOTH_PART_SET.has(coveredPart.userData.curtainPart)
    );
    const clothMaterials = coveredParts
      .filter(clothOnlyPart => clothOnlyPart.userData.curtainPart === "cloth")
      .flatMap(partMesh =>
        Array.isArray(partMesh.material) ? partMesh.material : [partMesh.material]
      )
      .filter(Boolean);
    // 取「颜色最亮」的布料材质作为模板：模型里往往有内外两层，亮的那层才是正面可见的。
    const materialBrightness = material =>
      material.color ? material.color.r + material.color.g + material.color.b : 0;
    const brightestMaterial = clothMaterials.reduce(
      (bestMaterial, candidateMaterial) =>
        !bestMaterial || materialBrightness(candidateMaterial) > materialBrightness(bestMaterial)
          ? candidateMaterial
          : bestMaterial,
      null
    );
    const fabricKind = resolveCurtainFabric(binding);
    const isSheerPanel = fabricKind === "sheer";
    // 纱帘用固定的半透明白（0xf5f3ee），并关闭深度写入：
    // 多层半透明布面互相遮挡时不会出现「谁在前谁在后」的硬边。
    // 布帘则克隆模型自带的材质，保留原有的纹理与颜色。
    const panelMaterial = isSheerPanel
      ? new THREE.MeshStandardMaterial({
          color: 16118766,
          roughness: 1,
          metalness: 0,
          transparent: true,
          opacity: 0.48,
          depthWrite: false
        })
      : brightestMaterial?.clone?.() ||
        // 兜底材质：0xc7cdd2 是中性浅灰，接近常见窗帘面料。
        new THREE.MeshStandardMaterial({
          color: 13094354,
          roughness: 0.94,
          metalness: 0
        });
    // 向白色靠拢 20%：模型原始贴图偏暗，提亮后与场景整体曝光更协调。
    panelMaterial.color?.lerp(new THREE.Color(16777215), 0.2);
    // 模型自带的自发光可能很强，会盖掉褶皱的明暗层次，这里压到 0.06 以内。
    panelMaterial.emissiveIntensity = Math.min(panelMaterial.emissiveIntensity ?? 0, 0.06);
    // 开启顶点色：几何里写的褶皱明暗只有在材质打开这一项后才参与着色。
    panelMaterial.vertexColors = true;
    // 布料是单层薄面，必须双面可见；forceSinglePass 让双面渲染只算一遍光照，
    // 否则每片帘子的着色成本翻倍。
    panelMaterial.side = THREE.DoubleSide;
    panelMaterial.forceSinglePass = true;
    const isDream = binding.coverKind === "dream";
    // 只有「模型显式声明了轨道」或梦幻帘才构建轨道模型；
    // 普通窗帘没有轨道结构，直接用共享的布料几何体即可。
    const trackModel =
      located.anchor.userData.curtainTrackModel || isDream ? createTrack(binding) : null;
    const rigFolds = resolveFoldCount(binding);
    const sharedGeometry = trackModel ? null : getClothGeometry(rigFolds, fabricKind);
    const rigGroup = new THREE.Group();
    const basis = resolveRigBasis(located.anchor);
    rigGroup.name = "curtain-motion-" + binding.id;
    rigGroup.userData.curtainMotionRig = true;
    // 以标准帘尺寸为基准做等比缩放：自建几何按 1.8×2.4×0.18 建模，
    // 模型实际尺寸不同时靠缩放对齐；有轨道模型时不再缩放（轨道已按配置生成）。
    rigGroup.scale.set(
      ...(trackModel ? [1, 1, 1] : [basis[0] / 1.8, basis[1] / 2.4, basis[2] / 0.18])
    );
    located.anchor.add(rigGroup);
    const panels = ["left", "right"].map(side => {
      const panelMesh = new THREE.Mesh(
        isDream
          ? createBladeGeometry(THREE, trackModel, basis[1])
          : trackModel
            ? buildTrackClothGeometry(THREE, trackModel, basis[1], fabricKind)
            : sharedGeometry,
        panelMaterial
      );
      panelMesh.name = "curtain-motion-" + binding.id + "-" + side;
      panelMesh.userData.curtainMotionPanel = true;
      panelMesh.userData.curtainSide = side;
      // 三个 externalModelShared* 标记：几何体 / 纹理 / 材质是共享或克隆来的，
      // 提示清理逻辑只摘除节点，不要销毁这些资源。
      panelMesh.userData.externalModelSharedGeometry = true;
      panelMesh.userData.externalModelSharedTextures = true;
      panelMesh.userData.externalModelSharedMaterial = true;
      if (!trackModel) {
        // 无轨道时两片帘布各自贴向一侧（±0.9 米），中间留出对开的缝。
        panelMesh.position.set(side === "left" ? -0.9 : 0.9, 0.06, 0);
      }
      // 纱帘不投影：半透明的薄纱投出实心阴影很假；
      // 其余情况沿用原模型是否投影的设置。
      panelMesh.castShadow =
        !isSheerPanel && coveredParts.some(shadowCastingPart => shadowCastingPart.castShadow);
      panelMesh.receiveShadow = coveredParts.some(
        shadowReceivingPart => shadowReceivingPart.receiveShadow
      );
      // 初始隐藏：等第一次 applyRigPose 算完再显示，避免出现一帧「全开」的闪烁。
      panelMesh.visible = false;
      rigGroup.add(panelMesh);
      return panelMesh;
    });
    return {
      model: model,
      binding: binding,
      dream: isDream,
      fabric: fabricKind,
      folds: rigFolds,
      track: trackModel,
      anchor: located.anchor,
      parts: located.parts,
      rig: rigGroup,
      basis: basis,
      // generation 参与 poseKey：重建过的骨架即使外观相同也要重绘一次。
      generation: generationCounter++,
      panels: panels,
      material: panelMaterial,
      // 记录被隐藏的原生局部的原始可见性，便于销毁时精确还原。
      originals: new Map(coveredParts.map(sourcePart => [sourcePart, sourcePart.visible])),
      direction: resolveCurtainDirection(binding),
      position: null,
      target: null,
      motionFrom: null,
      motionStart: null
    };
  }
  /** 销毁一条骨架：还原原生可见性、摘除节点、释放自建资源。 */
  function disposeRig(discardedRig) {
    for (const [restoredPart, wasVisible] of discardedRig.originals) {
      restoredPart.visible = wasVisible;
    }
    discardedRig.rig.removeFromParent();
    // 只有自建的轨道几何需要销毁；共享几何体由缓存统一管理。
    if (discardedRig.track) {
      for (const panelToDispose of discardedRig.panels) {
        panelToDispose.geometry.dispose();
      }
    }
    discardedRig.material.dispose();
  }
  /** 清除运动状态并立即按静态位置摆放（绑定/实体变更时用）。 */
  function resetRigMotion(resetTargetRig) {
    resetTargetRig.position = null;
    resetTargetRig.target = null;
    resetTargetRig.motionFrom = null;
    resetTargetRig.motionStart = null;
    resetTargetRig.bladePosition = null;
    applyRigPose(resetTargetRig);
  }
  /**
   * 按当前开合位置摆放骨架（即时生效，不做动画）。
   */
  function applyRigPose(posedRig) {
    // 没有实体时的位置来自配置的固定值；有实体但位置未知时也会落到这个分支。
    const positionRatio = posedRig.position ?? resolveUnboundPosition(posedRig.binding);
    if (posedRig.track) {
      // 有轨道模型：原生局部全部隐藏，改由轨道自己的采样函数给出每片帘的范围。
      for (const originalPart of posedRig.originals.keys()) {
        originalPart.visible = false;
      }
      samplePanelRanges(posedRig.track, positionRatio, posedRig.direction).forEach(
        (panelRange, sideIndex) => {
          const panel = posedRig.panels[sideIndex];
          panel.visible = panelRange.visible;
          const panelPose = {
            ...panelRange,
            side: sideIndex,
            split: posedRig.direction === "split"
          };
          if (posedRig.dream) {
            // 梦幻帘：叶片角度默认 50（即 90° 打开）。
            poseBladeGeometry(
              panel.geometry,
              posedRig.track,
              panelPose,
              posedRig.bladePosition ?? 50
            );
          } else {
            poseClothGeometry(panel.geometry, posedRig.track, panelPose);
          }
        }
      );
      isPoseKeyDirty = true;
      return;
    }
    // 无轨道：用「横向压缩 + 按方向显隐」近似开合。
    const isSplit = posedRig.direction === "split";
    // 对开时单幅宽度：布帘 0.906（略大于 0.9，让两幅在中间轻微重叠，不留缝），纱帘取 0.9。
    const panelWidth = isSplit ? (posedRig.fabric === "sheer" ? 0.9 : 0.906) : 1.8;
    // 位置百分比越大，布面越收拢；收到 MIN_PANEL_SCALE 为止。
    const clothScale = 1 - ((1 - MIN_PANEL_SCALE) * positionRatio) / 100;
    for (const hiddenPart of posedRig.originals.keys()) {
      hiddenPart.visible = false;
    }
    for (const posedPanel of posedRig.panels) {
      const isLeftPanel = posedPanel.userData.curtainSide === "left";
      // split 时两幅都显示；否则只显示与开合方向一致的那一幅。
      posedPanel.visible = isSplit || posedRig.direction === (isLeftPanel ? "left" : "right");
      // 右幅用负缩放做镜像，保证两幅的褶皱朝向对称。
      posedPanel.scale.x = (isLeftPanel ? 1 : -1) * panelWidth * clothScale;
      posedPanel.updateMatrix();
    }
    isPoseKeyDirty = true;
  }
  /**
   * 更新骨架的目标位置（处理动画起点）。
   */
  function updateRigTarget(motionRig, receivedMotionState, immediate = false) {
    const incomingPosition = resolveStatePosition(receivedMotionState);
    const bladeChanged = motionRig.bladePosition !== receivedMotionState.bladePosition;
    motionRig.bladePosition = receivedMotionState.bladePosition;
    // 叶片角度变化要立即生效（梦幻帘调叶片不该有 420ms 的滞后）。
    if (bladeChanged && motionRig.dream) {
      applyRigPose(motionRig);
    }
    if (incomingPosition === null) {
      // 位置未知（设备掉线 / 未上报）：保持在当前位置不动，而不是跳回 0。
      const hadPendingMotion = motionRig.target !== motionRig.position;
      motionRig.target = motionRig.position;
      motionRig.motionStart = null;
      return hadPendingMotion || bladeChanged;
    }
    if (motionRig.position === null || immediate) {
      // 首次定位或要求立即到位：不设动画起点，直接摆放。
      const positionChanged =
        motionRig.position !== incomingPosition || motionRig.target !== incomingPosition;
      motionRig.position = incomingPosition;
      motionRig.target = incomingPosition;
      motionRig.motionStart = null;
      if (positionChanged) {
        applyRigPose(motionRig);
      }
      return positionChanged || bladeChanged;
    }
    if (motionRig.target === incomingPosition) {
      return bladeChanged;
    } else {
      // 新的目标位置：记录动画起点，真正的推进交给 update()。
      motionRig.target = incomingPosition;
      motionRig.motionFrom = motionRig.position;
      motionRig.motionStart = null;
      return true;
    }
  }
  /**
   * 应用绑定列表（场景结构变化时调用）。
   */
  function setBindings(modelRoot, bindings = [], sceneRevision) {
    if (isDisposed) {
      return;
    }
    const seenBindingIds = new Set();
    const seenModelKeys = new Set();
    // 归一化绑定：过滤非法项、按 id 与「楼层+模型」去重、把字段补齐成固定类型。
    const normalizedBindings = (Array.isArray(bindings) ? bindings : [])
      .filter(candidateBinding => {
        if (!candidateBinding || candidateBinding.id == null || candidateBinding.modelId == null) {
          return false;
        }
        const bindingIdKey = String(candidateBinding.id);
        const rawLocationKey = sceneModelKey(candidateBinding.floorId, candidateBinding.modelId);
        // 同一个模型只能被一条绑定接管，否则两套骨架会互相打架。
        if (seenBindingIds.has(bindingIdKey) || seenModelKeys.has(rawLocationKey)) {
          return false;
        } else {
          seenBindingIds.add(bindingIdKey);
          seenModelKeys.add(rawLocationKey);
          return true;
        }
      })
      .map(rawBinding => ({
        id: String(rawBinding.id),
        entityId: String(rawBinding.entityId ?? ""),
        floorId: String(rawBinding.floorId ?? ""),
        modelId: String(rawBinding.modelId),
        // 帘宽默认 1.8 米，用于推算褶皱数。
        curtainWidth: Number(rawBinding.curtainWidth) > 0 ? Number(rawBinding.curtainWidth) : 1.8,
        // coverDirection 默认 "auto"：不在 DIRECTION_SET 里，因此会继续回落到 curtainPosition。
        coverDirection: rawBinding.coverDirection || "auto",
        curtainPosition: rawBinding.curtainPosition || "split",
        coverKind: rawBinding.coverKind === "dream" ? "dream" : "standard",
        ...normalizeTrack(rawBinding),
        curtainFabric: resolveCurtainFabric(rawBinding),
        unboundPosition: resolveUnboundPosition(rawBinding)
      }));
    const bindingsSignature = JSON.stringify(normalizedBindings);
    // 根节点、场景修订号、绑定签名三者都没变就完全跳过，避免重复建骨架。
    if (
      syncedModelRoot === modelRoot &&
      syncedSceneRevision === sceneRevision &&
      syncedBindingsSignature === bindingsSignature
    ) {
      return;
    }
    const entityIdByBindingId = new Map(
      normalizedBindings.map(normalizedEntry => [normalizedEntry.id, normalizedEntry.entityId])
    );
    for (const staleBindingId of coverStatesByEntityId.keys()) {
      // 绑定被删除、或换了绑定的实体时，清掉缓存的状态：
      // 否则新实体第一次上报前会先套用旧窗帘的位置。
      if (
        !entityIdByBindingId.has(staleBindingId) ||
        (previousEntityIdByBindingId.has(staleBindingId) &&
          previousEntityIdByBindingId.get(staleBindingId) !==
            entityIdByBindingId.get(staleBindingId))
      ) {
        coverStatesByEntityId.delete(staleBindingId);
      }
    }
    previousEntityIdByBindingId = entityIdByBindingId;
    syncedModelRoot = modelRoot || null;
    syncedSceneRevision = sceneRevision;
    syncedBindingsSignature = bindingsSignature;
    const modelsByLocationKey = new Map();
    if (normalizedBindings.length) {
      // 遍历场景，把「楼层 + 模型 ID」映射到窗帘模型节点；楼层 ID 允许向上继承。
      syncedModelRoot?.traverse?.(sceneNode => {
        if (
          sceneNode.userData?.environmentModelType !== "curtain" ||
          sceneNode.userData?.environmentModelId == null
        ) {
          return;
        }
        let nodeFloorId = sceneNode.userData.environmentFloorId;
        for (
          let parentNode = sceneNode.parent;
          nodeFloorId == null && parentNode;
          parentNode = parentNode.parent
        ) {
          nodeFloorId = parentNode.userData?.environmentFloorId;
        }
        modelsByLocationKey.set(
          sceneModelKey(nodeFloorId, sceneNode.userData.environmentModelId),
          sceneNode
        );
      });
    }
    const locatedEntries = normalizedBindings
      .map(locatedBinding => {
        const environmentModel = modelsByLocationKey.get(
          sceneModelKey(locatedBinding.floorId, locatedBinding.modelId)
        );
        const locatedRig = environmentModel ? locateCurtainRig(environmentModel) : null;
        // 模型不存在或里面没有可接管的布面：跳过这条绑定（下一个修订号再试）。
        if (locatedRig) {
          return {
            binding: locatedBinding,
            model: environmentModel,
            located: locatedRig
          };
        } else {
          return null;
        }
      })
      .filter(Boolean);
    const reusedRigsByBindingId = new Map();
    for (const entry of locatedEntries) {
      const existingRig = rigsByBindingId.get(entry.binding.id);
      // 复用条件逐项列出：类型、轨道配置、布料、模型、锚点，以及被接管的局部列表
      // 必须完全一致 —— 任何一项不同都意味着几何需要重建。
      if (
        existingRig &&
        existingRig.dream === (entry.binding.coverKind === "dream") &&
        (!existingRig.track ||
          JSON.stringify([
            normalizeTrack(existingRig.binding),
            existingRig.binding.curtainWidth
          ]) === JSON.stringify([normalizeTrack(entry.binding), entry.binding.curtainWidth])) &&
        existingRig.fabric === resolveCurtainFabric(entry.binding) &&
        existingRig.model === entry.model &&
        existingRig.anchor === entry.located.anchor &&
        existingRig.parts.length === entry.located.parts.length &&
        existingRig.parts.every((part, partIndex) => part === entry.located.parts[partIndex])
      ) {
        reusedRigsByBindingId.set(entry.binding.id, existingRig);
      }
    }
    for (const [removedBindingId, removedRig] of rigsByBindingId) {
      if (!reusedRigsByBindingId.has(removedBindingId)) {
        disposeRig(removedRig);
      }
    }
    const previousRigsByBindingId = rigsByBindingId;
    rigsByBindingId = new Map();
    for (const {
      binding: entryBinding,
      model: entryModel,
      located: entryLocated
    } of locatedEntries) {
      const nextRig =
        reusedRigsByBindingId.get(entryBinding.id) ||
        createRig(entryModel, entryBinding, entryLocated);
      const previousRig = previousRigsByBindingId.get(entryBinding.id);
      // 骨架被重建（但模型与实体都没换）时，把运动状态搬过去：
      // 否则重建的瞬间窗帘会跳回原点。
      if (
        previousRig &&
        previousRig !== nextRig &&
        previousRig.model === entryModel &&
        previousRig.binding.entityId === entryBinding.entityId
      ) {
        for (const motionFieldName of [
          "position",
          "target",
          "motionFrom",
          "motionStart",
          "bladePosition"
        ]) {
          nextRig[motionFieldName] = previousRig[motionFieldName];
        }
        applyRigPose(nextRig);
      }
      const nextDirection = resolveCurtainDirection(entryBinding);
      if (nextRig.binding.entityId !== entryBinding.entityId) {
        resetRigMotion(nextRig);
      }
      nextRig.binding = entryBinding;
      const nextFolds = resolveFoldCount(entryBinding);
      if (!nextRig.track && nextRig.folds !== nextFolds) {
        // 褶皱数变了：换成缓存里的另一份几何体（不销毁旧的，缓存还要复用）。
        nextRig.folds = nextFolds;
        for (const panelToRefold of nextRig.panels) {
          panelToRefold.geometry = getClothGeometry(nextFolds, nextRig.fabric);
        }
      }
      // 模型尺寸或配置可能已变，重新读取基准并重算缩放。
      nextRig.basis = resolveRigBasis(nextRig.anchor);
      nextRig.rig.scale.set(
        ...(nextRig.track
          ? [1, 1, 1]
          : [nextRig.basis[0] / 1.8, nextRig.basis[1] / 2.4, nextRig.basis[2] / 0.18])
      );
      if (nextRig.direction !== nextDirection) {
        nextRig.direction = nextDirection;
        applyRigPose(nextRig);
      }
      rigsByBindingId.set(entryBinding.id, nextRig);
      if (coverStatesByEntityId.has(entryBinding.id)) {
        // 已有缓存状态就直接套用，避免新建的骨架停在默认位置。
        updateRigTarget(nextRig, coverStatesByEntityId.get(entryBinding.id));
      }
      if (nextRig.position === null) {
        applyRigPose(nextRig);
      }
    }
    isStructureKeyDirty = true;
    markPoseDirty();
  }
  /**
   * 写入某条绑定的开合状态。
   */
  function setState(
    coverBindingId,
    receivedCoverState,
    { immediate: immediateState = false } = {}
  ) {
    if (isDisposed || coverBindingId == null) {
      return;
    }
    const coverBindingIdKey = String(coverBindingId);
    const nextMotionState = {
      position: resolveStatePosition(receivedCoverState),
      // tiltPosition 非有限数时按「无叶片信息」处理，让 applyRigPose 用默认的 50。
      bladePosition: Number.isFinite(receivedCoverState?.tiltPosition)
        ? receivedCoverState.tiltPosition
        : null
    };
    coverStatesByEntityId.set(coverBindingIdKey, nextMotionState);
    const boundRig = rigsByBindingId.get(coverBindingIdKey);
    if (boundRig && updateRigTarget(boundRig, nextMotionState, immediateState)) {
      markPoseDirty();
    }
  }
  /** 是否还有窗帘在动画中（位置未到达目标）。 */
  function isMoving() {
    return (
      !isDisposed &&
      [...rigsByBindingId.values()].some(
        pendingRig => pendingRig.position !== null && pendingRig.target !== pendingRig.position
      )
    );
  }
  /**
   * 推进动画帧。
   */
  function update(timestampMs) {
    if (
      !isMoving() ||
      // 逗号表达式：先把非法的时间戳补成当前时间，再判断是否落在同一帧内需要跳过。
      (Number.isFinite(timestampMs) || (timestampMs = globalThis.performance?.now() ?? Date.now()),
      timestampMs >= lastUpdateMs && timestampMs - lastUpdateMs < FRAME_INTERVAL_MS)
    ) {
      return false;
    }
    // 把「上次更新时刻」吸附到帧网格上（减去余数），避免每帧都少算一点导致的累计漂移，
    // 让 30fps 的节流长期稳定在 30fps 而不是慢慢掉到 25fps。
    lastUpdateMs =
      Number.isFinite(lastUpdateMs) && timestampMs >= lastUpdateMs
        ? timestampMs - ((timestampMs - lastUpdateMs) % FRAME_INTERVAL_MS)
        : timestampMs;
    let didAnimate = false;
    for (const movingRig of rigsByBindingId.values()) {
      if (movingRig.position === null || movingRig.target === movingRig.position) {
        continue;
      }
      if (movingRig.motionStart === null || timestampMs < movingRig.motionStart) {
        // 第一次推进（或时间回退）时把当前时刻记为动画起点。
        movingRig.motionStart = timestampMs;
      }
      const progressRatio = Math.min(1, (timestampMs - movingRig.motionStart) / MOTION_DURATION_MS);
      // smoothstep：t²(3-2t)，两端一阶导为 0，起步与收尾都不突兀。
      const easingFactor = progressRatio * progressRatio * (3 - progressRatio * 2);
      // 进度满时直接用目标值：避免浮点误差残留一个极小的差值，导致动画永不结束。
      const nextPosition =
        progressRatio === 1
          ? movingRig.target
          : movingRig.motionFrom + (movingRig.target - movingRig.motionFrom) * easingFactor;
      if (nextPosition !== movingRig.position) {
        movingRig.position = nextPosition;
        applyRigPose(movingRig);
        didAnimate = true;
      }
    }
    return didAnimate;
  }
  /**
   * 姿态键：只要它不变，渲染出来的画面就一样，渲染层可据此跳过重绘。
   *
   * 键里包含位置（保留两位小数，避免亚像素抖动导致频繁重绘）与所有影响外观的配置。
   */
  function poseKey() {
    if (isPoseKeyDirty) {
      cachedPoseKey = JSON.stringify(
        [...rigsByBindingId.values()]
          .map(poseRig => [
            poseRig.binding.id,
            poseRig.binding.floorId,
            poseRig.binding.modelId,
            poseRig.binding.entityId,
            poseRig.generation,
            poseRig.direction,
            poseRig.basis,
            poseRig.folds,
            poseRig.bladePosition,
            poseRig.position === null
              ? "preview-" + resolveUnboundPosition(poseRig.binding)
              : Math.round(poseRig.position * 100) / 100
          ])
          .sort((leftPoseEntry, rightPoseEntry) =>
            leftPoseEntry[0].localeCompare(rightPoseEntry[0])
          )
      );
      isPoseKeyDirty = false;
    }
    return cachedPoseKey;
  }
  /**
   * 结构键：只反映「几何结构」而不含位置 / 实体。
   *
   * 渲染层用它区分「只是位置变了」（可复用已有资源）与「结构变了」（需要重建）。
   */
  function structureKey() {
    if (isStructureKeyDirty) {
      cachedStructureKey = JSON.stringify(
        [...rigsByBindingId.values()]
          .map(structureRig => [
            structureRig.binding.id,
            structureRig.binding.floorId,
            structureRig.binding.modelId,
            structureRig.generation,
            structureRig.direction,
            structureRig.basis,
            structureRig.folds
          ])
          .sort((leftStructureEntry, rightStructureEntry) =>
            leftStructureEntry[0].localeCompare(rightStructureEntry[0])
          )
      );
      isStructureKeyDirty = false;
    }
    return cachedStructureKey;
  }
  // 释放整个窗帘运动子系统：逐个销毁自制骨架，清空各类按实体 / 绑定索引的缓存，
  // 最后统一销毁共享的布面几何体（骨架销毁时刻意不碰它们，避免重复 dispose）。
  function dispose() {
    if (!isDisposed) {
      isDisposed = true;
      for (const disposedRig of rigsByBindingId.values()) {
        disposeRig(disposedRig);
      }
      rigsByBindingId.clear();
      coverStatesByEntityId.clear();
      previousEntityIdByBindingId.clear();
      // 共享几何体在最后统一销毁（骨架销毁时不碰它们）。
      for (const cachedGeometry of clothGeometryCache.values()) {
        cachedGeometry.dispose();
      }
      clothGeometryCache.clear();
      syncedModelRoot = null;
      // 置脏以便外部再取键时拿到空集合的键。
      isPoseKeyDirty = true;
      isStructureKeyDirty = true;
      requestRender();
    }
  }
  return {
    setBindings: setBindings,
    setState: setState,
    update: update,
    isMoving: isMoving,
    poseKey: poseKey,
    structureKey: structureKey,
    dispose: dispose
  };
}
