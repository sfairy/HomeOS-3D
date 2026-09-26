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
import { sceneModelKey } from "../core/scene-model-key.js?v=2609260900";
// 未绑定窗帘的默认开合度：唯一实现在 utils/cover-features.js，经 core/static-helpers.js 取值 ——
// runtime 资源挂在 /api/v1/modules/interaction3d/ 下，直接写相对路径会 404（见该文件的说明）。
import { COVER_DEFAULT_PREVIEW_POSITION } from "../core/static-helpers.js?v=2609260900";
// 系统「减少动态效果」偏好的唯一判定（实现见 core/motion-preference.js）：命中时姿态直接到位、
// 不做 420ms 插值。垂帘与卷帘共用同一个判定，保证两种帘型在无障碍设置下表现一致。
import { prefersReducedMotionNow } from "../core/motion-preference.js?v=2609260900";

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
        "../../../static/3d-studio/loaders/studio-curtain-track.js?v=2609260900",
        import.meta.url
      )
    )
  : import("/static/3d-studio/loaders/studio-curtain-track.js?v=2609260900"));
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
/**
 * 卷帘（roller）形态令牌。与 3d-studio/loaders/studio-curtain-track.js 的 CURTAIN_STYLE_ROLLER
 * 同值：帘型是模型属性（curtainStyle），不是交互配置，后端 coverKind 不认它。
 */
const CURTAIN_STYLE_ROLLER = "roller";
/**
 * 卷帘几何常量：全部与工作室 createRollerCurtain 逐值一致，
 * 否则「3D 工作室里看到的卷帘」与「运行时的卷帘」会停在不同的半径 / 高度上。
 */
/** 布厚（米）：只参与面积守恒反算卷管半径，不参与渲染。 */
const ROLLER_FABRIC_THICKNESS_METERS = 0.0016;
/** 卷管基准半径（米）：min(0.045, 帘高 × 0.12) —— 上限与占比两处都与工作室一致。 */
const ROLLER_TUBE_RADIUS_MAX_METERS = 0.045;
const ROLLER_TUBE_RADIUS_HEIGHT_RATIO = 0.12;
/** 帘布底边离地（米）：留一点缝，帘布不会插进地面。 */
const ROLLER_PANEL_BOTTOM_METERS = 0.035;
/** 帘布平铺高度的下限（米）：与工作室的 max(0.04, ...) 一致，矮窗也不会退化成零高。 */
const ROLLER_PANEL_MIN_HEIGHT_METERS = 0.04;
/** 卷帘「已完全卷起」的高度阈值（米）：低于它就把帘布藏掉，避免留一条零宽的面。 */
const ROLLER_HIDDEN_HEIGHT_METERS = 0.0001;
/** 布料类型：sheer 为纱（更透、褶皱更密），其余一律按 cloth 处理。 */
const resolveCurtainFabric = fabricBinding =>
  fabricBinding.curtainFabric === "sheer" ? "sheer" : "cloth";
/**
 * 归一帘型：只有显式的 "roller" 才算卷帘，其余（含缺失 / 非法值）一律按垂帘 cloth 处理。
 * 与工作室 normalizeCurtainTrack 的兜底一致 —— 老模型没有这个字段时行为与新增之前逐值相同。
 */
const resolveCurtainStyle = styleBinding =>
  styleBinding.curtainStyle === CURTAIN_STYLE_ROLLER ? CURTAIN_STYLE_ROLLER : "cloth";
/**
 * 未绑定实体时使用的固定开合位置（0–100）。
 * 非法或缺失一律按 COVER_DEFAULT_PREVIEW_POSITION（默认「打开」）：与「窗帘默认处于打开状态」一致。
 */
const resolveUnboundPosition = unboundBinding =>
  Number.isFinite(unboundBinding.unboundPosition)
    ? Math.max(0, Math.min(100, unboundBinding.unboundPosition))
    : COVER_DEFAULT_PREVIEW_POSITION;
/**
 * 位置未知时骨架该摆在哪儿（0–100）。三层优先级：
 *
 * 1. 状态推断值（`statePositionHint`）：设备虽然没给 current_position，但明确说自己在 open / closed；
 * 2. 已绑定实体退回 0（全关）：状态也说不清时保持原行为，不借用 unboundPosition；
 * 3. 未绑定实体才用配置的 unboundPosition（默认 100）。
 *
 * 第 2 条是关键：`unboundPosition` 是为「还没绑定实体」的预览窗帘准备的展示值，
 * 一旦套到真实设备上，帘布就会停在配置值上、与实际开合长期不符。
 */
const resolvePoseFallback = posedRig =>
  posedRig.statePositionHint ??
  (posedRig.binding.entityId ? 0 : resolveUnboundPosition(posedRig.binding));
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
 * 取归一化状态里的「状态推断位置」；非有限数值返回 null，表示状态也说不出该摆在哪。
 * 只读 coverState 算好的 statePositionHint，不在这一层重新解释 state 文案。
 */
const resolveStatePositionHint = receivedState =>
  typeof receivedState?.statePositionHint == "number" &&
  Number.isFinite(receivedState.statePositionHint)
    ? Math.max(0, Math.min(100, receivedState.statePositionHint))
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
 * 卷帘的几何常量解算（纯函数，导出以便姿态自检脚本直接量数）。
 *
 * 卷管轴心高度 = 帘高 − sqrt(基准半径² + 帘高 × 布厚 / π)：这样「放下的布 + 卷在管上的布」
 * 总面积恒定，卷起时管半径按面积守恒增大，不会出现卷到一半布面长度对不上的跳变。
 * 公式与工作室 createRollerCurtain 逐值一致。
 */
export function resolveRollerRigMetrics(rigBasis) {
  // 帘高为 0 或非法时给一个正值兜底，避免除零 / NaN 传进几何。
  const rollerHeight =
    Number.isFinite(rigBasis?.[1]) && rigBasis[1] > 0 ? rigBasis[1] : 2.4;
  const rollerWidth = Number.isFinite(rigBasis?.[0]) && rigBasis[0] > 0 ? rigBasis[0] : 1.8;
  const tubeBaseRadius = Math.min(
    ROLLER_TUBE_RADIUS_MAX_METERS,
    rollerHeight * ROLLER_TUBE_RADIUS_HEIGHT_RATIO
  );
  const rollerTopY =
    rollerHeight -
    Math.sqrt(tubeBaseRadius ** 2 + (rollerHeight * ROLLER_FABRIC_THICKNESS_METERS) / Math.PI);
  const panelHeight = Math.max(
    ROLLER_PANEL_MIN_HEIGHT_METERS,
    rollerTopY - ROLLER_PANEL_BOTTOM_METERS
  );
  return {
    rollerWidth: rollerWidth,
    rollerHeight: rollerHeight,
    tubeBaseRadius: tubeBaseRadius,
    rollerTopY: rollerTopY,
    panelHeight: panelHeight
  };
}
/**
 * 卷帘在给定开合百分比下的姿态解算（纯函数）。
 *
 * 百分比口径：0 = 完全放下（盖住窗口），100 = 完全卷起，与 HA 的 current_position 一致，
 * 也与普通窗帘「位置越大越打开」的语义一致 —— 因此直接沿用同一份 position。
 * 面积守恒：卷起的布长按布厚摊到卷管截面上，半径 r = sqrt(r0² + 卷起长度 × 布厚 / π)。
 */
export function resolveRollerPose(rollerMetrics, positionRatio) {
  const clampedRatio = Math.max(
    0,
    Math.min(100, Number.isFinite(positionRatio) ? positionRatio : 0)
  );
  const rolledFraction = clampedRatio / 100;
  const rolledLength = rollerMetrics.panelHeight * rolledFraction;
  const hangingLength = rollerMetrics.panelHeight - rolledLength;
  return {
    rolledFraction: rolledFraction,
    rolledLength: rolledLength,
    hangingLength: hangingLength,
    // 卷管轴心（帘布顶边）高度：恒定不动，支架也跟着固定。
    top: rollerMetrics.rollerTopY,
    // 帘布下沿 = 底杆中心；完全卷起时与 top 重合。
    bottom: rollerMetrics.rollerTopY - hangingLength,
    // 当前卷径：随卷起长度单调增大。帘布面始终贴在这个半径外侧。
    tubeRadius: Math.sqrt(
      rollerMetrics.tubeBaseRadius ** 2 +
        (rolledLength * ROLLER_FABRIC_THICKNESS_METERS) / Math.PI
    ),
    // 完全卷起时平面退化成一条线，直接隐藏，免得留下一条零宽的面。
    visible: hangingLength > ROLLER_HIDDEN_HEIGHT_METERS
  };
}
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
   * 为卷帘模型创建骨架。
   *
   * 与垂帘不同：卷帘是一整片**平面**，运行时不需要生成褶皱几何，而是直接驱动模型自身的部件
   * —— 帘布平面、顶部卷管、底杆；支架保持不动。这样既不重复工作室的 createRollerCurtain，
   * 也不新增任何几何体（缓存的布面几何对卷帘完全用不上）。
   *
   * 部件角色从模型自带的 userData.curtainPart 推：工作室给帘布平面与卷管都打了 "cloth"
   * （两者用的是同一份帘布材质），底杆是 "band"，支架是 "cap"。帘布与卷管的区分靠**顶点数**：
   * 帘布是 1×1 段的 PlaneGeometry（固定 4 个顶点），卷管是 32 边圆柱（远多于 4 个）。之所以
   * 不用 geometry.type，是因为该字段只在本页现场构建时是 PlaneGeometry / CylinderGeometry，
   * 一旦经外部流水线导出就统一变成 BufferGeometry，顶点数在两种来源下都稳定。
   */
  function createRollerRig(model, binding, located) {
    const clothParts = located.parts.filter(
      locatedPart => locatedPart.userData?.curtainPart === "cloth"
    );
    // 帘布平面取顶点最少的那件；卷管是其它的（正常只有一件）。
    const panelPart = clothParts.reduce(
      (fewestVertexPart, candidatePart) =>
        !fewestVertexPart ||
        (candidatePart.geometry?.attributes?.position?.count ?? Infinity) <
          (fewestVertexPart.geometry?.attributes?.position?.count ?? Infinity)
          ? candidatePart
          : fewestVertexPart,
      null
    );
    const tubePart = clothParts.find(clothPart => clothPart !== panelPart) || null;
    // 没有可驱动的帘布（模型结构异常）时返回 null，由 createRig 退回垂帘路径，避免整扇帘子消失。
    if (!panelPart) {
      return null;
    }
    const rigBasis = resolveRigBasis(located.anchor);
    return {
      model: model,
      binding: binding,
      // 帘型进骨架：它同时是「复用旧骨架」判据的一部分（见 setBindings 的复用条件）。
      rollerStyle: true,
      roller: {
        panel: panelPart,
        tube: tubePart,
        // 底杆骑在帘布下沿，随开合上下走；找不到时不驱动，不影响帘布本身。
        bottomBar:
          located.parts.find(locatedPart => locatedPart.userData?.curtainPart === "band") || null,
        metrics: resolveRollerRigMetrics(rigBasis)
      },
      dream: false,
      fabric: resolveCurtainFabric(binding),
      // 卷帘没有褶皱几何，也没有自制轨道；folds / track 显式留空，让各处的垂帘分支自动跳过。
      folds: null,
      track: null,
      anchor: located.anchor,
      parts: located.parts,
      // 不新建节点：rig 留空，disposeRig 与缩放逻辑据 rollerStyle 跳过。
      rig: null,
      basis: rigBasis,
      generation: generationCounter++,
      panels: [],
      // 卷帘不隐藏任何原生局部（面板 / 卷管 / 底杆都要留着驱动），originals 为空。
      originals: new Map(),
      direction: resolveCurtainDirection(binding),
      position: null,
      target: null,
      motionFrom: null,
      motionStart: null,
      bladePosition: null,
      statePositionHint: null
    };
  }
  /**
   * 为一条绑定创建自制骨架。
   */
  function createRig(model, binding, located) {
    // 卷帘走单独的骨架：驱动模型自身的帘布 / 卷管 / 底杆，不生成褶皱几何。
    if (binding.curtainStyle === CURTAIN_STYLE_ROLLER) {
      const rollerRig = createRollerRig(model, binding, located);
      if (rollerRig) {
        return rollerRig;
      }
    }
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
      // 非卷帘骨架：rollerStyle / roller 显式落空，复用判据与各分支据此区分两种形态。
      rollerStyle: false,
      roller: null,
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
      motionStart: null,
      // 位置缺失时的兜底姿态（0 / 100 / null）；由 setState 从设备状态写入。
      statePositionHint: null
    };
  }
  /** 销毁一条骨架：还原原生可见性、摘除节点、释放自建资源。 */
  function disposeRig(discardedRig) {
    for (const [restoredPart, wasVisible] of discardedRig.originals) {
      restoredPart.visible = wasVisible;
    }
    if (discardedRig.rollerStyle) {
      // 卷帘骨架只驱动模型自身的部件：没有自制节点要摘除，也没有自建几何 / 材质要释放。
      return;
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
    resetTargetRig.statePositionHint = null;
    applyRigPose(resetTargetRig);
  }
  /**
   * 按开合位置摆放卷帘骨架。
   *
   * 1. 帘布平面：逐顶点改写 4 个角（顶边钉在卷管轴心，底边随开合上下）。不缩放整片，是因为
   *    模型里帘布的顶点已被工作室按「导出时的预览开合度」摆好，直接缩放会把那段预览误差一并
   *    继承下来；改写顶点既精确又零分配（固定 4 个顶点）。
   * 2. 卷管：几何是半径 1 的单位圆柱（轴向已被 rotation.z 转到 x），径向缩放 = 当前卷径。
   * 3. 底杆：骑在帘布下沿，与帘布同一深度（贴着卷管外侧）。
   */
  function poseRollerRig(posedRig, positionRatio) {
    const rollerRig = posedRig.roller;
    const rollerPose = resolveRollerPose(rollerRig.metrics, positionRatio);
    const panelMesh = rollerRig.panel;
    const panelGeometry = panelMesh?.geometry;
    const panelPositionAttribute = panelGeometry?.attributes?.position;
    // PlaneGeometry 的 4 个顶点顺序是「左上、右上、左下、右下」：前两个是顶边。
    if (panelPositionAttribute && panelPositionAttribute.count >= 4) {
      const halfWidth = rollerRig.metrics.rollerWidth / 2;
      for (let panelVertexIndex = 0; panelVertexIndex < 4; panelVertexIndex++) {
        panelPositionAttribute.setXYZ(
          panelVertexIndex,
          panelVertexIndex % 2 ? halfWidth : -halfWidth,
          panelVertexIndex < 2 ? rollerPose.top : rollerPose.bottom,
          // 帘布面始终落在卷管外侧，看起来是从卷管上垂下来而不是从轴心穿过。
          rollerPose.tubeRadius
        );
      }
      panelPositionAttribute.needsUpdate = true;
      // 卷起的部分不显示：用 UV 的纵向取值把有花纹的贴图也一起收上去。
      const panelUvAttribute = panelGeometry.attributes.uv;
      if (panelUvAttribute && panelUvAttribute.count >= 4) {
        for (let panelUvIndex = 0; panelUvIndex < 4; panelUvIndex++) {
          panelUvAttribute.setY(
            panelUvIndex,
            panelUvIndex < 2 ? 1 - rollerPose.rolledFraction : 0
          );
        }
        panelUvAttribute.needsUpdate = true;
      }
      // 顶点整体挪过位置，包围体要重算，否则视锥剔除与射线拾取都会出错。
      panelGeometry.computeBoundingBox();
      panelGeometry.computeBoundingSphere();
    }
    panelMesh.visible = rollerPose.visible;
    if (rollerRig.tube) {
      rollerRig.tube.scale.set(rollerPose.tubeRadius, 1, rollerPose.tubeRadius);
    }
    if (rollerRig.bottomBar) {
      rollerRig.bottomBar.position.set(0, rollerPose.bottom, rollerPose.tubeRadius);
    }
    isPoseKeyDirty = true;
  }
  /**
   * 按当前开合位置摆放骨架（即时生效，不做动画）。
   */
  function applyRigPose(posedRig) {
    // 位置未知时依次回落到「状态推断值 → 已绑定的全关 → 未绑定的配置值」，见 resolvePoseFallback。
    const positionRatio = posedRig.position ?? resolvePoseFallback(posedRig);
    if (posedRig.rollerStyle) {
      poseRollerRig(posedRig, positionRatio);
      return;
    }
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
    const nextStatePositionHint = resolveStatePositionHint(receivedMotionState);
    const statePositionHintChanged = motionRig.statePositionHint !== nextStatePositionHint;
    motionRig.statePositionHint = nextStatePositionHint;
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
      // 例外：骨架本来就没有位置、只能靠状态推断时，状态变了要按新推断重摆一次，
      // 否则设备从 open 走到 closed 后帘布会一直停在旧姿态上。
      if (statePositionHintChanged && motionRig.position === null) {
        applyRigPose(motionRig);
        return true;
      }
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
        // 帘型是模型属性（见 core/stage/geometry.js 的 resolveCurtainGeometry），这里与 curtainFabric
        // 同一层显式落键：缺失 / 非法一律归一成 cloth，卷帘才进 roller。
        curtainStyle: resolveCurtainStyle(rawBinding),
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
        // 帘型必须一致：cloth 与 roller 的骨架结构完全不同（一个是自建褶皱布面，
        // 一个是模型自带平面 / 卷管 / 底杆），漏了这一项就会把旧骨架张冠李戴地复用。
        existingRig.rollerStyle === (entry.binding.curtainStyle === CURTAIN_STYLE_ROLLER) &&
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
      if (!nextRig.track && !nextRig.rollerStyle && nextRig.folds !== nextFolds) {
        // 褶皱数变了：换成缓存里的另一份几何体（不销毁旧的，缓存还要复用）。
        nextRig.folds = nextFolds;
        for (const panelToRefold of nextRig.panels) {
          panelToRefold.geometry = getClothGeometry(nextFolds, nextRig.fabric);
        }
      }
      // 模型尺寸或配置可能已变，重新读取基准。
      nextRig.basis = resolveRigBasis(nextRig.anchor);
      if (nextRig.rollerStyle) {
        // 卷帘没有自制节点可缩放；按最新基准重算几何常量，后续姿态才用得上新尺寸。
        nextRig.roller.metrics = resolveRollerRigMetrics(nextRig.basis);
      } else {
        nextRig.rig.scale.set(
          ...(nextRig.track
            ? [1, 1, 1]
            : [nextRig.basis[0] / 1.8, nextRig.basis[1] / 2.4, nextRig.basis[2] / 0.18])
        );
      }
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
      // 位置缺失时的兜底姿态：由设备 state 推断，见 resolvePoseFallback。
      statePositionHint: resolveStatePositionHint(receivedCoverState),
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
    // 「减少动态效果」命中时不做插值：位置直接落到目标（与 applyRigPose 的即时路径同一口径）。
    // 每次 update 只读一次系统偏好（判定与理由见 core/motion-preference.js），不逐骨架重读。
    const prefersReducedMotion = prefersReducedMotionNow();
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
        progressRatio === 1 || prefersReducedMotion
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
              ? // 位置未知时画面由兜底姿态决定，键里必须带上它本身而不是固定前缀，
                // 否则从「状态推断 100」变到「状态推断 0」会被判成没变化、不重绘。
                "fallback-" + resolvePoseFallback(poseRig)
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
            // 帘型参与结构键：渲染层据此判断「只是位置变了」与「形态变了需要重建资源」。
            structureRig.rollerStyle,
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
