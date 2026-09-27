/**
 * 窗帘的开合动画（普通布帘与梦幻帘）：3D 户型里的窗帘模型是「一整片」静态网格，本模块在其上挂
 */

// 模型定位键（楼层 + 模型）的唯一实现在 core/scene-model-key.js。
import { sceneModelKey } from "../core/scene-model-key.js?v=2609271411";
// 未绑定窗帘的默认开合度、开合方向解析：唯一实现在 utils/cover-features.js，经
import {
  COVER_DEFAULT_PREVIEW_POSITION,
  resolveCoverDirection
} from "../core/static-helpers.js?v=2609271411";
// 系统「减少动态效果」偏好的唯一判定（实现见 core/motion-preference.js）：命中时姿态直接到位、
import { prefersReducedMotionNow } from "../core/motion-preference.js?v=2609271411";

import { createClothGeometry } from "./cloth-geometry.js?v=2609271411";
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
        "../../../static/3d-studio/loaders/studio-curtain-track.js?v=2609271411",
        import.meta.url
      )
    )
  : import("/static/3d-studio/loaders/studio-curtain-track.js?v=2609271411"));
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
 */
const MIN_PANEL_SCALE = 0.12;
/** 布面褶皱间距（米）：普通布帘每 15cm 一道褶。 */
const CLOTH_FOLD_SPACING_METERS = 0.15;
const COVER_KIND_ROLLER = "roller";
/**
 * 卷帘几何常量：全部与工作室 createRollerCurtain 逐值一致，
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
const ROLLER_HIDDEN_HEIGHT_METERS = 0.0001;
/** 布料类型：sheer 为纱（更透、褶皱更密），其余一律按 cloth 处理。 */
const resolveCurtainFabric = fabricBinding =>
  fabricBinding.curtainFabric === "sheer" ? "sheer" : "cloth";
/**
 * 未绑定实体时使用的固定开合位置（0–100）。
 */
const resolveUnboundPosition = unboundBinding =>
  Number.isFinite(unboundBinding.unboundPosition)
    ? Math.max(0, Math.min(100, unboundBinding.unboundPosition))
    : COVER_DEFAULT_PREVIEW_POSITION;
/**
 * 位置未知时骨架该摆在哪儿（0–100）。三层优先级：
 */
const resolvePoseFallback = posedRig =>
  posedRig.statePositionHint ??
  (posedRig.binding.entityId ? 0 : resolveUnboundPosition(posedRig.binding));
/**
 * 按帘宽推算褶皱数量。
 */
const resolveFoldCount = widthBinding =>
  Math.max(
    4,
    Math.min(
      96,
      Math.round(
        (Number(widthBinding.curtainWidth) || 1.8) /
          (resolveCoverDirection(widthBinding) === "split" ? 2 : 1) /
          (resolveCurtainFabric(widthBinding) === "sheer" ? 0.1 : CLOTH_FOLD_SPACING_METERS)
      )
    )
  );
/** 取归一化状态里的位置；非有限数值返回 null，表示「位置未知」。 */
const resolveStatePosition = receivedState =>
  typeof receivedState?.position == "number" && Number.isFinite(receivedState.position)
    ? Math.max(0, Math.min(100, receivedState.position))
    : null;
/**
 * 取归一化状态里的「状态推断位置」；非有限数值返回 null，表示状态也说不出该摆在哪。
 */
const resolveStatePositionHint = receivedState =>
  typeof receivedState?.statePositionHint == "number" &&
  Number.isFinite(receivedState.statePositionHint)
    ? Math.max(0, Math.min(100, receivedState.statePositionHint))
    : null;
/**
 * 读取窗帘模型的基准尺寸。
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
 */
export function resolveRollerRigMetrics(rigBasis) {
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
 */
function locateCurtainRig(environmentRoot) {
  const curtainParts = [];
  const rigRoots = [];
  // 递归收集两类节点：能接管的原生局部（布面 / 轨道，见 TRACK_PART_SET）与候选锚点
  function collectRigParts(visitedNode) {
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
      direction: resolveCoverDirection(binding),
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
    if (binding.coverKind === COVER_KIND_ROLLER) {
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
    panelMaterial.side = THREE.DoubleSide;
    panelMaterial.forceSinglePass = true;
    const isDream = binding.coverKind === "dream";
    // 只有「模型显式声明了轨道」或梦幻帘才构建轨道模型；
    const trackModel =
      located.anchor.userData.curtainTrackModel || isDream ? createTrack(binding) : null;
    const rigFolds = resolveFoldCount(binding);
    const sharedGeometry = trackModel ? null : getClothGeometry(rigFolds, fabricKind);
    const rigGroup = new THREE.Group();
    const basis = resolveRigBasis(located.anchor);
    rigGroup.name = "curtain-motion-" + binding.id;
    rigGroup.userData.curtainMotionRig = true;
    // 以标准帘尺寸为基准做等比缩放：自建几何按 1.8×2.4×0.18 建模，
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
      panelMesh.userData.externalModelSharedGeometry = true;
      panelMesh.userData.externalModelSharedTextures = true;
      panelMesh.userData.externalModelSharedMaterial = true;
      if (!trackModel) {
        // 无轨道时两片帘布各自贴向一侧（±0.9 米），中间留出对开的缝。
        panelMesh.position.set(side === "left" ? -0.9 : 0.9, 0.06, 0);
      }
      // 纱帘不投影：半透明的薄纱投出实心阴影很假；
      panelMesh.castShadow =
        !isSheerPanel && coveredParts.some(shadowCastingPart => shadowCastingPart.castShadow);
      panelMesh.receiveShadow = coveredParts.some(
        shadowReceivingPart => shadowReceivingPart.receiveShadow
      );
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
      direction: resolveCoverDirection(binding),
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
        // coverDirection 默认 "auto"：不在合法方向集合里，因此会继续回落到 curtainPosition。
        coverDirection: rawBinding.coverDirection || "auto",
        curtainPosition: rawBinding.curtainPosition || "split",
        coverKind: ["dream", "roller"].includes(rawBinding.coverKind)
          ? rawBinding.coverKind
          : "standard",
        ...normalizeTrack(rawBinding),
        // 帘型不再另起字段：绑定上的 coverKind 就是唯一答案（判定已在 core/stage/geometry.js
        curtainFabric: resolveCurtainFabric(rawBinding),
        unboundPosition: resolveUnboundPosition(rawBinding)
      }));
    const bindingsSignature = JSON.stringify(normalizedBindings);
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
      if (
        existingRig &&
        existingRig.dream === (entry.binding.coverKind === "dream") &&
        // 帘型必须一致：standard 与 roller 的骨架结构完全不同（一个是自建褶皱布面，
        existingRig.rollerStyle === (entry.binding.coverKind === COVER_KIND_ROLLER) &&
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
      const nextDirection = resolveCoverDirection(entryBinding);
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
    const prefersReducedMotion = prefersReducedMotionNow();
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
        movingRig.motionStart = timestampMs;
      }
      const progressRatio = Math.min(1, (timestampMs - movingRig.motionStart) / MOTION_DURATION_MS);
      // smoothstep：t²(3-2t)，两端一阶导为 0，起步与收尾都不突兀。
      const easingFactor = progressRatio * progressRatio * (3 - progressRatio * 2);
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
