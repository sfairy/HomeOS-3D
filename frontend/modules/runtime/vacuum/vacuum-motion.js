/**
 * 扫地机的实时位姿动画、台词与跟随相机：把 HA 上报的「地图坐标系位姿」换算到 3D 户型坐标、
 * 驱动模型平滑移动，并在跟随视角下把挡在相机与扫地机之间的家具临时变透明。
 *
 * 与 HA 的字段约定：camera 域地图实体的 attributes 里，vacuum_position / robot_position 为机器人
 * 地图坐标，charger_position 为基站坐标，calibration_points 是「地图像素 ↔ 扫地机坐标」的三点标定，
 * heading 角度存在 a 字段（度）。地图地址由 vacuum-map.js 解析。
 */
// 状态条目归一与「按 ID 切域」只有一份实现（/static/utils/），这里经 static-helpers 桥取用。
import { resolveStateEntry } from "../core/static-helpers.js?v=2609211957";
// 模型定位键（楼层 + 模型）的唯一实现在 core/scene-model-key.js。
import { sceneModelKey } from "../core/scene-model-key.js?v=2609211957";
import {
  mapSource,
  vacuumStatusPresentation,
  vacuumBindingsForMap
} from "./vacuum-map.js?v=2609211957";
/** 是否为有限数字（同时排除数字字符串）。 */
const isFiniteNumber = candidateValue =>
  typeof candidateValue == "number" && Number.isFinite(candidateValue);
/** 校验一个点是否为合法的地图坐标；非法返回 null 而不是抛错。 */
const asValidMapPoint = pointCandidate =>
  pointCandidate && isFiniteNumber(pointCandidate.x) && isFiniteNumber(pointCandidate.y)
    ? pointCandidate
    : null;
/**
 * 把扫地机上报的坐标点换算成 3D 户型里的平面坐标（米）。
 * 三步：三点标定重心插值 → 地图像素坐标；像素按图尺寸归一化到 [-0.5, 0.5] 再乘地图宽 / 深，
 * 得到以地图中心（即户型原点）为原点的局部坐标；按 mapConfig 的旋转角与偏移落到楼层坐标系。
 */
function vacuumMapPoint(mapPoint, calibrationPoints, mapPixelSize, mapConfig) {
  // 边界校验一次做全：缺任何一项都无法换算，早退比中途出 NaN 更好排查。
  if (
    !asValidMapPoint(mapPoint) ||
    !Array.isArray(calibrationPoints) ||
    calibrationPoints.length < 3 ||
    !(mapPixelSize?.width > 0) ||
    !(mapPixelSize?.height > 0) ||
    !(mapConfig?.width > 0) ||
    !(mapConfig?.depth > 0)
  ) {
    return null;
  }
  const [firstCalibration, secondCalibration, thirdCalibration] = calibrationPoints;
  if (
    ![firstCalibration, secondCalibration, thirdCalibration].every(
      calibrationPoint =>
        asValidMapPoint(calibrationPoint?.vacuum) && asValidMapPoint(calibrationPoint?.map)
    )
  ) {
    return null;
  }
  // 以第一点为原点构造两个基向量，行列式即三角形的「面积的两倍」。
  const vacuumDelta2X = secondCalibration.vacuum.x - firstCalibration.vacuum.x;
  const vacuumDelta2Y = secondCalibration.vacuum.y - firstCalibration.vacuum.y;
  const vacuumDelta3X = thirdCalibration.vacuum.x - firstCalibration.vacuum.x;
  const vacuumDelta3Y = thirdCalibration.vacuum.y - firstCalibration.vacuum.y;
  const barycentricDeterminant = vacuumDelta2X * vacuumDelta3Y - vacuumDelta2Y * vacuumDelta3X;
  // 行列式接近 0 说明三点共线，重心坐标无解（会得到 Infinity）。
  if (Math.abs(barycentricDeterminant) < 1e-8) {
    return null;
  }
  const pointDeltaX = mapPoint.x - firstCalibration.vacuum.x;
  const pointDeltaY = mapPoint.y - firstCalibration.vacuum.y;
  // 求解目标点在「第一点 + 第二基 + 第三基」下的两个权重系数。
  const secondWeight =
    (pointDeltaX * vacuumDelta3Y - pointDeltaY * vacuumDelta3X) / barycentricDeterminant;
  const thirdWeight =
    (vacuumDelta2X * pointDeltaY - vacuumDelta2Y * pointDeltaX) / barycentricDeterminant;
  // 同样的权重作用在地图像素坐标上：三点确定的仿射变换唯一。
  const mapX =
    firstCalibration.map.x +
    secondWeight * (secondCalibration.map.x - firstCalibration.map.x) +
    thirdWeight * (thirdCalibration.map.x - firstCalibration.map.x);
  const mapY =
    firstCalibration.map.y +
    secondWeight * (secondCalibration.map.y - firstCalibration.map.y) +
    thirdWeight * (thirdCalibration.map.y - firstCalibration.map.y);
  // 像素 → 以图片中心为原点的局部米：-0.5 是因为图片中心对应户型原点。
  const localX = (mapX / mapPixelSize.width - 0.5) * mapConfig.width;
  const localY = (mapY / mapPixelSize.height - 0.5) * mapConfig.depth;
  const rotationRad = ((mapConfig.rotation || 0) * Math.PI) / 180;
  return {
    x: (mapConfig.x || 0) + localX * Math.cos(rotationRad) - localY * Math.sin(rotationRad),
    y: (mapConfig.y || 0) + localX * Math.sin(rotationRad) + localY * Math.cos(rotationRad)
  };
}
/**
 * 计算扫地机当前的位姿（位置 + 朝向 + 状态）。
 */
function vacuumTelemetry(vacuumBinding, statesByEntityId, mapResolution) {
  // 绑定了「上游共享地图」却没有解析出可用的地图绑定时，说明这张地图由别的绑定负责渲染，
  // 这条绑定就不再画第二台机器，避免同一台扫地机出现两份模型。
  if (
    vacuumBinding.map?.sourceMapId &&
    !vacuumBindingsForMap([vacuumBinding], statesByEntityId).length
  ) {
    return null;
  }
  const entityState =
    resolveStateEntry(statesByEntityId[vacuumBinding.entityId]);
  const statusPresentation = vacuumStatusPresentation(vacuumBinding, statesByEntityId);
  const mapStateEntry = statesByEntityId[vacuumBinding.map?.entityId];
  const mapAttributes = resolveStateEntry(mapStateEntry)?.attributes || {};
  const chargerPoint = asValidMapPoint(mapAttributes.charger_position);
  const robotPoint = asValidMapPoint(mapAttributes.vacuum_position || mapAttributes.robot_position);
  // 三个前置条件都满足才有意义：状态可用、基站坐标存在、地图尺寸已知。
  if (!statusPresentation.available || !chargerPoint || !mapResolution) {
    return null;
  }
  // 清扫类状态：这些状态下机器人位置可信，即使充电标记为 true 也以实际位置为准。
  const isCleaningState = ["cleaning", "sweeping", "mopping", "returning", "mapping"].includes(
    entityState?.state
  );
  // 回充判定：明确的停靠 / 充电状态，或「非清扫中 + charging 属性为 true」。
  const isDocked =
    ["docked", "charging", "charging_completed"].includes(entityState?.state) ||
    (!isCleaningState && entityState?.attributes?.charging === true);
  // 已回充时用基站坐标当位姿：机器人在充电桩上时上报的位置常常有抖动。
  const posePoint = isDocked ? chargerPoint : robotPoint;
  const chargerMapPoint = vacuumMapPoint(
    chargerPoint,
    mapAttributes.calibration_points,
    mapResolution,
    vacuumBinding.map
  );
  const poseMapPoint = vacuumMapPoint(
    posePoint,
    mapAttributes.calibration_points,
    mapResolution,
    vacuumBinding.map
  );
  if (!chargerMapPoint || !poseMapPoint) {
    return null;
  }
  /**
   * 计算朝向角。
   * 不能直接用 HA 的 a 字段：标定变换可能含旋转与缩放，角度会失真。这里把
   * 「沿 a 方向前进 100 个地图单位」的点也做同样变换，用变换后两点连线方向作朝向。
   */
  const headingAngle = headingSource => {
    if (!isFiniteNumber(headingSource?.a)) {
      return null;
    }
    const headingRad = (headingSource.a * Math.PI) / 180;
    const headingOriginPoint = vacuumMapPoint(
      headingSource,
      mapAttributes.calibration_points,
      mapResolution,
      vacuumBinding.map
    );
    const headingTargetPoint = vacuumMapPoint(
      {
        x: headingSource.x + Math.cos(headingRad) * 100,
        y: headingSource.y + Math.sin(headingRad) * 100
      },
      mapAttributes.calibration_points,
      mapResolution,
      vacuumBinding.map
    );
    if (headingOriginPoint && headingTargetPoint) {
      return Math.atan2(
        headingTargetPoint.y - headingOriginPoint.y,
        headingTargetPoint.x - headingOriginPoint.x
      );
    } else {
      return null;
    }
  };
  const poseHeading = headingAngle(posePoint);
  const chargerHeading = headingAngle(chargerPoint);
  return {
    // 位姿以基站为原点：模型在场景里是相对基准点摆放的，给相对值可以直接复用。
    x: poseMapPoint.x - chargerMapPoint.x,
    y: poseMapPoint.y - chargerMapPoint.y,
    // 朝向同样取相对值，并用 atan2(sin, cos) 取最短夹角。
    // 两边任一算不出朝向时给 0（保持模型原始朝向），而不是让模型乱转。
    angle:
      poseHeading !== null && chargerHeading !== null
        ? Math.atan2(Math.sin(poseHeading - chargerHeading), Math.cos(poseHeading - chargerHeading))
        : 0,
    docked: isDocked,
    paused: entityState?.state === "paused",
    active: statusPresentation.active
  };
}
/** 扫地机台词表，按当前行为分组；语料是固定的产品文案，改动即改变用户看到的措辞。 */
const VACUUM_CHAT = {
  working: [
    "我真勤快！",
    "主人真懒，还好有我。",
    "好累啊，再坚持一小会儿。",
    "灰尘别跑，我来啦！",
    "今天也在认真营业。",
    "这一片，交给我！"
  ],
  returning: ["电量告急，回家吃饭！", "打工结束，回窝充电。", "基站，我回来啦！"],
  washing: ["洗个拖布，继续加油。", "爱干净，也要洗洗自己。"]
};
/**
 * 取当前该显示的台词。
 */
export function vacuumQuip(quipComponent, quipStates, timestampMs) {
  if (quipComponent.funMessages === false) {
    return "";
  }
  const quipState =
    resolveStateEntry(quipStates[quipComponent.entityId]);
  const quipAttributes = quipState?.attributes || {};
  // 语料分组优先级：回充 > 洗拖布 / 烘干 > 正常工作。
  const quipMessages =
    quipState?.state === "returning" || quipAttributes.returning
      ? VACUUM_CHAT.returning
      : quipAttributes.washing || quipAttributes.drying
        ? VACUUM_CHAT.washing
        : VACUUM_CHAT.working;
  // 每 7 秒换一句：用时间戳取模而不是随机，保证同一时刻的渲染结果可复现。
  return quipMessages[Math.floor(timestampMs / 7000) % quipMessages.length];
}
/**
 * 创建扫地机位姿动画控制器。
 */
export function createVacuumMotion(sceneContext, requestRender) {
  const { THREE: THREE } = sceneContext;
  const motionEntriesByItemId = new Map();
  // 地图图片尺寸缓存：按实体 ID 存放，value 里含加载状态与重试信息。
  const mapSizesByEntityId = new Map();
  let motionItems = [];
  let entityStates = {};
  let isMotionEnabled = false;
  let isDisposed = false;
  /** 在场景里按「楼层 + 模型 ID」找到扫地机模型（同一模型 ID 在多层可重复）。 */
  const findModelObject = item => {
    let foundObject;
    sceneContext.modelRoot?.traverse(childObject => {
      if (
        childObject.userData?.environmentFloorId === item.floorId &&
        childObject.userData?.environmentModelId === item.modelId
      ) {
        foundObject = childObject;
      }
    });
    return foundObject;
  };
  /**
   * 为扫地机模型创建「可移动主体」。
   * 把模型里贴地的部分（刷盘 / 机身）单独摘出来挂到一个 Group 上，之后只移动
   * 这个 Group，充电桩等固定部件留在原地不动。
   */
  function createMotionEntry(modelRoot, motionItem) {
    modelRoot.updateWorldMatrix(true, true);
    // 世界矩阵的逆：用于把网格的包围盒换算回模型局部坐标系里判断位置。
    const inverseWorldMatrix = modelRoot.matrixWorld.clone().invert();
    const floorMeshes = [];
    const floorItem = sceneContext.document.floors
      .find(floor => floor.id === motionItem.floorId)
      ?.scene.items.find(sceneItem => sceneItem.id === motionItem.modelId);
    // 模型在户型文档里登记的高度 / 深度；缺失时用 0.85 / 0.5 的典型扫地机尺寸。
    const modelHeight = floorItem?.height || 0.85;
    const modelDepth = floorItem?.depth || 0.5;
    modelRoot.traverse(mesh => {
      if (!mesh.isMesh || !mesh.geometry || mesh.userData?.environmentEffect) {
        return;
      }
      mesh.geometry.computeBoundingBox();
      const meshBounds = mesh.geometry.boundingBox
        ?.clone()
        .applyMatrix4(inverseWorldMatrix.clone().multiply(mesh.matrixWorld));
      if (
        meshBounds &&
        // 两个几何特征挑出「贴地的机器本体」：高度低于模型总高的 30%，
        // 且横向中心比模型正面更靠里（排除贴在背面的充电桩 / 背板）。
        meshBounds.max.y < modelHeight * 0.3 &&
        meshBounds.getCenter(new THREE.Vector3()).z > modelDepth * 0.05
      ) {
        floorMeshes.push(mesh);
      }
    });
    if (!floorMeshes.length) {
      return null;
    }
    const combinedBounds = new THREE.Box3();
    floorMeshes.forEach(floorMesh => combinedBounds.expandByObject(floorMesh));
    // 移动中心取贴地部分的横向中心，并把 y 归零（机器人始终在地板上）。
    const centerPoint = modelRoot.worldToLocal(combinedBounds.getCenter(new THREE.Vector3()));
    centerPoint.y = 0;
    const bodyGroup = new THREE.Group();
    bodyGroup.name = "vacuum-mobile-body";
    bodyGroup.position.copy(centerPoint);
    modelRoot.add(bodyGroup);
    modelRoot.updateWorldMatrix(true, true);
    // 记录每个网格的原始父节点与变换：销毁时要精确还原（attach 会改写变换）。
    const originalTransforms = floorMeshes.map(sourceMesh => ({
      mesh: sourceMesh,
      parent: sourceMesh.parent,
      position: sourceMesh.position.clone(),
      quaternion: sourceMesh.quaternion.clone(),
      scale: sourceMesh.scale.clone()
    }));
    // 用 attach 而不是 add：attach 会保持世界变换不变，避免机器人在挂载瞬间跳位。
    floorMeshes.forEach(bodyMesh => bodyGroup.attach(bodyMesh));
    const restPosition = bodyGroup.position.clone();
    // 打上标记，供场景清理逻辑识别这个自制节点。
    modelRoot.userData.vacuumMobileRoot = bodyGroup;
    return {
      model: modelRoot,
      mobile: bodyGroup,
      rest: restPosition,
      originals: originalTransforms,
      x: 0,
      y: 0,
      angle: 0,
      target: null,
      initialized: false
    };
  }
  /** 销毁动画记录：还原网格的父节点与变换，摘除自制 Group，并刷新反射 / 重绘一次。 */
  function disposeMotionEntry(motionEntry) {
    for (const transform of motionEntry.originals) {
      transform.parent.add(transform.mesh);
      transform.mesh.position.copy(transform.position);
      transform.mesh.quaternion.copy(transform.quaternion);
      transform.mesh.scale.copy(transform.scale);
    }
    motionEntry.mobile.removeFromParent();
    delete motionEntry.model.userData.vacuumMobileRoot;
    // 模型回到原位也是一次场景变化：地面反射要失效重算，并请求一次重绘。
    sceneContext.invalidateReflections?.([motionEntry.item.floorId]);
    sceneContext.setVacuumMoving?.(true);
    sceneContext.requestRender?.();
  }
  /**
   * 确保拿到地图图片的像素尺寸（异步加载 + 缓存 + 失败退避）。
   * 地图坐标换算必须知道像素尺寸，而它只能等图片加载完才知道，因此返回 null
   * 表示「还在加载」，调用方下一轮再试。
   */
  function ensureMapSize(sizeItem) {
    const mapEntityId = sizeItem.map?.entityId;
    if (!mapEntityId || !mapSource(mapEntityId)) {
      return null;
    }
    const mapState = entityStates[mapEntityId];
    const sizeAttributes = resolveStateEntry(mapState)?.attributes || {};
    // 没有标定或基站坐标时地图无法用于换算，直接不加载图片。
    if (!sizeAttributes.calibration_points || !sizeAttributes.charger_position) {
      return null;
    }
    // 缓存键包含标定数据：标定变了说明地图重画过，必须重新读取尺寸。
    const cacheKey = JSON.stringify([mapEntityId, sizeAttributes.calibration_points]);
    let sizeCacheEntry = mapSizesByEntityId.get(mapEntityId);
    // 命中同一把键且不在退避窗口内：直接复用已有结果（失败期间 size 为 null）。
    if (
      sizeCacheEntry?.key === cacheKey &&
      (!sizeCacheEntry.retryAt || performance.now() < sizeCacheEntry.retryAt)
    ) {
      return sizeCacheEntry.size;
    }
    // 同一把键上的历史失败次数要延续，避免每次重试都从 1 秒重新开始。
    const failureCount = (sizeCacheEntry?.key === cacheKey && sizeCacheEntry.failures) || 0;
    if (sizeCacheEntry) {
      // 换键时先彻底放弃旧图：清定时器、摘回调、清 src，防止旧图回调作用到新条目上。
      clearTimeout(sizeCacheEntry.timer);
      sizeCacheEntry.image.onload = sizeCacheEntry.image.onerror = null;
      sizeCacheEntry.image.src = "";
    }
    const mapImage = new Image();
    sizeCacheEntry = {
      key: cacheKey,
      image: mapImage,
      size: null,
      failures: failureCount,
      retryAt: 0,
      timer: null
    };
    mapSizesByEntityId.set(mapEntityId, sizeCacheEntry);
    mapImage.onload = () => {
      // 事件到达时条目可能已被替换或整体销毁，用对象身份比对挡掉过期回调。
      if (!isDisposed && mapSizesByEntityId.get(mapEntityId) === sizeCacheEntry) {
        clearTimeout(sizeCacheEntry.timer);
        sizeCacheEntry.timer = null;
        sizeCacheEntry.retryAt = 0;
        sizeCacheEntry.failures = 0;
        sizeCacheEntry.size = {
          width: mapImage.naturalWidth,
          height: mapImage.naturalHeight
        };
        updateMotionEntries();
        requestRender();
      }
    };
    mapImage.onerror = () => {
      if (isDisposed || mapSizesByEntityId.get(mapEntityId) !== sizeCacheEntry) {
        return;
      }
      // 指数退避重试：1s、2s、4s，封顶 5 秒。图片可能只是页面刚打开时还没准备好。
      const retryDelayMs = Math.min(5000, 2 ** Math.min(sizeCacheEntry.failures++, 3) * 1000);
      sizeCacheEntry.retryAt = performance.now() + retryDelayMs;
      sizeCacheEntry.timer = setTimeout(() => {
        sizeCacheEntry.timer = null;
        // 定时器触发时同样校验：动画已关闭或条目已换就不重试。
        if (
          !isDisposed &&
          isMotionEnabled &&
          mapSizesByEntityId.get(mapEntityId) === sizeCacheEntry
        ) {
          sizeCacheEntry.retryAt = performance.now();
          updateMotionEntries();
          requestRender();
        }
      }, retryDelayMs);
    };
    mapImage.src = mapSource(mapEntityId);
    return null;
  }
  /** 按最新状态刷新所有扫地机的目标位姿（必要时创建 / 重建动画记录）。 */
  function updateMotionEntries() {
    for (const trackedItem of motionItems) {
      // 三种情况直接跳过：单条绑定关掉了动画、模型当前不可见、或全局动画关闭。
      if (
        trackedItem.motionEnabled === false ||
        trackedItem.visible === false ||
        !isMotionEnabled
      ) {
        continue;
      }
      const matchedModel = findModelObject(trackedItem);
      let trackedEntry = motionEntriesByItemId.get(trackedItem.id);
      if (trackedEntry?.model !== matchedModel) {
        // 模型换了（重建或改配置）：先释放旧的，避免两套移动组同时存在。
        if (trackedEntry) {
          disposeMotionEntry(trackedEntry);
        }
        motionEntriesByItemId.delete(trackedItem.id);
        trackedEntry = null;
      }
      if (!matchedModel) {
        continue;
      }
      const telemetry = vacuumTelemetry(trackedItem, entityStates, ensureMapSize(trackedItem));
      if (!telemetry) {
        if (trackedEntry) {
          // 数据暂不可用：只清掉目标，让机器人停在原地而不是跳回基站。
          trackedEntry.target = null;
        }
        continue;
      }
      if (!trackedEntry) {
        trackedEntry = createMotionEntry(matchedModel, trackedItem);
        if (!trackedEntry) {
          continue;
        }
        motionEntriesByItemId.set(trackedItem.id, trackedEntry);
      }
      trackedEntry.item = trackedItem;
      if (telemetry.paused) {
        // 暂停状态下目标位置不可信（常常是旧的），冻结在当前姿态。
        trackedEntry.target = null;
        continue;
      }
      if (
        trackedEntry.target?.x !== telemetry.x ||
        trackedEntry.target?.y !== telemetry.y ||
        trackedEntry.target?.angle !== telemetry.angle
      ) {
        trackedEntry.target = telemetry;
        if (!trackedEntry.initialized) {
          // 第一次拿到位姿：直接吸附到目标，避免机器人从模型原点滑过去。
          trackedEntry.x = telemetry.x;
          trackedEntry.y = telemetry.y;
          trackedEntry.angle = telemetry.angle;
          trackedEntry.initialized = true;
          trackedEntry.dirty = true;
        }
      }
    }
  }
  return {
    /**
     * 同步绑定列表与状态。
     */
    sync(items, syncStates, enabled) {
      motionItems = items;
      entityStates = syncStates;
      isMotionEnabled = enabled && !isDisposed;
      const activeItemIds = new Set(
        items
          .filter(listedItem => listedItem.motionEnabled !== false && listedItem.visible !== false)
          .map(mappedItem => mappedItem.id)
      );
      for (const [itemId, entry] of motionEntriesByItemId) {
        // 绑定被移除、被隐藏，或全局关闭时，把模型还原成静态状态。
        if (!activeItemIds.has(itemId) || !isMotionEnabled) {
          disposeMotionEntry(entry);
          motionEntriesByItemId.delete(itemId);
        }
      }
      if (isMotionEnabled) {
        updateMotionEntries();
      } else {
        sceneContext.setVacuumMoving?.(false);
      }
    },
    /**
     * 取某条绑定当前相对基站的偏移（供其它效果跟随扫地机）。
     */
    offset(offsetEntityId) {
      const offsetEntry = motionEntriesByItemId.get(offsetEntityId.replace(/^vacuum:/, ""));
      if (offsetEntry) {
        return {
          x: offsetEntry.x,
          y: offsetEntry.y
        };
      } else {
        return null;
      }
    },
    /**
     * 取某条绑定当前的世界坐标（供相机跟随）。
     */
    worldPosition(worldEntityId) {
      const worldEntry = motionEntriesByItemId.get(worldEntityId.replace(/^vacuum:/, ""));
      if (worldEntry) {
        return worldEntry.mobile.getWorldPosition(new THREE.Vector3());
      } else {
        return null;
      }
    },
    /**
     * 推进一帧动画。
     */
    tick(deltaSeconds) {
      if (!isMotionEnabled) {
        return false;
      }
      let isMoving = false;
      let didUpdate = false;
      for (const animatedEntry of motionEntriesByItemId.values()) {
        const target = animatedEntry.target;
        if (!target) {
          continue;
        }
        let deltaX = target.x - animatedEntry.x;
        let deltaY = target.y - animatedEntry.y;
        let distance = Math.hypot(deltaX, deltaY);
        // 世界距离超过 2.5 米说明不是「走过去」而是「换了一个位置」：
        // 例如用户重新划区、换了地图、或机器人被搬走，这时直接瞬移比穿墙滑行合理。
        if (
          sceneContext
            .worldPoint(animatedEntry.item.floorId, target.x, target.y, 0)
            ?.distanceTo(
              sceneContext.worldPoint(
                animatedEntry.item.floorId,
                animatedEntry.x,
                animatedEntry.y,
                0
              )
            ) > 2.5
        ) {
          animatedEntry.x = target.x;
          animatedEntry.y = target.y;
          deltaX = deltaY = distance = 0;
          animatedEntry.dirty = true;
        }
        // 指数平滑：1 - e^(-5Δt)，与帧率无关；Δt 夹到 0.1 秒，
        // 页面切后台回来时不会一步跳到位。
        const smoothingFactor = 1 - Math.exp(-Math.min(deltaSeconds, 0.1) * 5);
        animatedEntry.x += deltaX * smoothingFactor;
        animatedEntry.y += deltaY * smoothingFactor;
        // 角度同样取最短方向插值，避免从 179° 转到 -179° 时绕一整圈。
        let angleDelta = Math.atan2(
          Math.sin(target.angle - animatedEntry.angle),
          Math.cos(target.angle - animatedEntry.angle)
        );
        animatedEntry.angle += angleDelta * smoothingFactor;
        if (distance > 0.02 || Math.abs(angleDelta) > 0.002) {
          isMoving = true;
        } else {
          // 进入阈值内就直接对齐目标，避免无限逼近带来的持续重绘。
          animatedEntry.x = target.x;
          animatedEntry.y = target.y;
          animatedEntry.angle = target.angle;
        }
        // 完全没有位移且上一帧也没脏标记：跳过矩阵更新，省掉一次世界坐标换算。
        if (distance < 0.000001 && Math.abs(angleDelta) < 0.000001 && !animatedEntry.dirty) {
          continue;
        }
        animatedEntry.dirty = false;
        didUpdate = true;
        // 场景里楼层可能整体平移过，因此位移要在世界坐标里算：
        // 取楼层原点与目标点的世界坐标之差，作为本次移动的等效世界位移。
        const floorOrigin = sceneContext.worldPoint(animatedEntry.item.floorId, 0, 0, 0);
        const floorTarget = sceneContext.worldPoint(
          animatedEntry.item.floorId,
          animatedEntry.x,
          animatedEntry.y,
          0
        );
        if (!floorOrigin || !floorTarget) {
          continue;
        }
        animatedEntry.model.updateWorldMatrix(true, false);
        const restWorldPosition = animatedEntry.model.localToWorld(animatedEntry.rest.clone());
        const targetWorldPosition = restWorldPosition.add(floorTarget.sub(floorOrigin));
        animatedEntry.mobile.position.copy(animatedEntry.model.worldToLocal(targetWorldPosition));
        // 地图角度与模型朝向的符号相反，因此取负；rotation.y 与地图平面同轴，无需换算。
        animatedEntry.mobile.rotation.y = -animatedEntry.angle;
        animatedEntry.mobile.updateWorldMatrix(true, true);
        sceneContext.invalidateReflections?.([animatedEntry.item.floorId]);
      }
      // setVacuumMoving 同时驱动「动态反射」与动画循环的启停。
      sceneContext.setVacuumMoving?.(isMoving || didUpdate);
      if (didUpdate) {
        sceneContext.requestRender?.();
      }
      return isMoving || didUpdate;
    },
    /** 是否存在该绑定的位姿跟踪（ID 允许带 "vacuum:" 前缀）。 */
    hasTracking(trackedEntityId) {
      return motionEntriesByItemId.has(trackedEntityId.replace(/^vacuum:/, ""));
    },
    dispose() {
      isDisposed = true;
      for (const disposedEntry of motionEntriesByItemId.values()) {
        disposeMotionEntry(disposedEntry);
      }
      motionEntriesByItemId.clear();
      // 地图图片也要停掉：正在加载的图片在销毁后回调会去改已清空的缓存。
      for (const cacheEntry of mapSizesByEntityId.values()) {
        clearTimeout(cacheEntry.timer);
        cacheEntry.image.onload = cacheEntry.image.onerror = null;
        cacheEntry.image.src = "";
      }
      mapSizesByEntityId.clear();
      sceneContext.setVacuumMoving?.(false);
    }
  };
}
/**
 * 生成「俯视跟拍」相机姿势：落在焦点正上方 6 米、沿原视线方向后退 2.5 米。
 */
export function vacuumBirdCamera(camera, focusPoint) {
  // 只保留水平方向：俯视视角不需要俯仰分量，否则仰角会随原相机变化而漂移。
  const offsetX = (camera?.position?.[0] || 0) - (camera?.target?.[0] || 0);
  const offsetZ = (camera?.position?.[2] || 1) - (camera?.target?.[2] || 0);
  const horizontalDistance = Math.hypot(offsetX, offsetZ) || 1;
  // 相机落在焦点正上方 6 米、沿原视线方向水平后退 2.5 米：
  // 既能看全房间，又能看清扫地机拖动的地图轨迹。
  return {
    ...camera,
    mode: "perspective",
    position: [
      focusPoint[0] + (offsetX / horizontalDistance) * 2.5,
      focusPoint[1] + 6,
      focusPoint[2] + (offsetZ / horizontalDistance) * 2.5
    ],
    target: [...focusPoint],
    up: [0, 1, 0],
    zoom: 1,
    focalLength: 40,
    frameSize: 5
  };
}
/**
 * 把相机平移到新的跟随目标，保持原有的相对偏移与朝向。
 */
export function vacuumFollowPose(sourceCamera, followTarget) {
  return {
    ...sourceCamera,
    target: [...followTarget],
    // 逐轴平移：新位置 = 新目标 + （旧位置 - 旧目标），因此相对偏移完全不变。
    position: sourceCamera.position.map(
      (componentValue, axisIndex) =>
        followTarget[axisIndex] + componentValue - sourceCamera.target[axisIndex]
    )
  };
}
/**
 * 创建跟随相机的遮挡处理：把挡在相机与扫地机之间的家具临时透明化。
 */
export function createVacuumFollowCamera(threeNamespace) {
  const raycaster = new threeNamespace.Raycaster();
  // 记录「被透明化」的网格 → 原始材质与克隆材质，退出时精确还原。
  const hiddenMaterialsByMesh = new Map();
  let cachedModelRoot = null;
  let cachedSceneRevision = null;
  let cachedOccluderKey = "";
  let occluderMeshes = [];
  /**
   * 收集「可能挡住视线」的网格（家具）。
   */
  function collectOccluders(occluderContext, occlusionItem) {
    // 与全仓其它「楼层 + 模型」键同一套归一（见 core/scene-model-key.js）：裸 JSON 会把缺失的
    // 楼层编成 null、空串编成 ""，同一个跟随对象会以为自己换了两次，白白重建一次遮挡列表。
    const occluderKey = sceneModelKey(occlusionItem.floorId, occlusionItem.modelId);
    if (
      cachedModelRoot !== occluderContext.modelRoot ||
      cachedSceneRevision !== occluderContext.sceneRevision ||
      cachedOccluderKey !== occluderKey
    ) {
      // 场景或跟随对象变了：先还原旧材质再重建列表，避免还原到错误的网格上。
      restoreHiddenMaterials();
      cachedModelRoot = occluderContext.modelRoot;
      cachedSceneRevision = occluderContext.sceneRevision;
      cachedOccluderKey = occluderKey;
      occluderMeshes = [];
      cachedModelRoot?.traverse(object => {
        if (!!object.isMesh && !!object.geometry) {
          // 逐个祖先排查：属于环境效果（灯效、状态点）或扫地机自身模型的网格都不算遮挡物，
          // 否则机器人会把自己挡成透明，或灯效被当成家具。
          for (
            let ancestorObject = object;
            ancestorObject;
            ancestorObject = ancestorObject.parent
          ) {
            if (
              ancestorObject.userData?.environmentEffect ||
              (ancestorObject.userData?.environmentFloorId === occlusionItem.floorId &&
                ancestorObject.userData?.environmentModelId === occlusionItem.modelId)
            ) {
              return;
            }
          }
          occluderMeshes.push(object);
        }
      });
    }
  }
  /** 还原所有被透明化的材质并释放克隆；幂等。 */
  function restoreHiddenMaterials() {
    for (const [occluderMesh, hiddenMaterialEntry] of hiddenMaterialsByMesh) {
      // 只有当前材质仍是我们的克隆时才还原：期间若被别的逻辑替换过就不要覆盖。
      if (occluderMesh.material === hiddenMaterialEntry.replacement) {
        occluderMesh.material = hiddenMaterialEntry.original;
      }
      hiddenMaterialEntry.clones.forEach(disposedClone => disposedClone.dispose());
    }
    hiddenMaterialsByMesh.clear();
  }
  /**
   * 计算本帧需要透明化的网格，并更新材质。
   */
  function revealFurniture(revealContext, revealItem, revealFocus, cameraPosition) {
    collectOccluders(revealContext, revealItem);
    const visibleMeshes = new Set();
    // 以焦点为中心打 5 条射线（中心 + 前后左右各 0.18 米）：
    // 单条射线容易被家具的缝隙漏过，多采样能减少「边缘处家具突然闪现」。
    for (const [sampleOffsetX, sampleOffsetZ] of [
      [0, 0],
      [0.18, 0],
      [-0.18, 0],
      [0, 0.18],
      [0, -0.18]
    ]) {
      const samplePoint = revealFocus
        .clone()
        .add(new threeNamespace.Vector3(sampleOffsetX, 0, sampleOffsetZ));
      const rayDirection = samplePoint.sub(cameraPosition);
      const rayDistance = rayDirection.length();
      raycaster.set(cameraPosition, rayDirection.normalize());
      raycaster.near = 0;
      // 终点留出 0.015 米的余量：否则射线会打到扫地机自己身上，把自己也变透明。
      raycaster.far = Math.max(0, rayDistance - 0.015);
      for (const intersection of raycaster.intersectObjects(occluderMeshes, false)) {
        let isVisible = true;
        // 逐级检查可见性：Raycaster 不会跳过 invisible 的对象，
        // 若不排除，隐藏的网格也会被当成遮挡物。
        for (
          let visibleAncestor = intersection.object;
          visibleAncestor;
          visibleAncestor = visibleAncestor.parent
        ) {
          if (!visibleAncestor.visible) {
            isVisible = false;
          }
        }
        if (isVisible) {
          visibleMeshes.add(intersection.object);
        }
      }
    }
    for (const [hiddenMesh, staleMaterialEntry] of hiddenMaterialsByMesh) {
      // 本帧不再被挡住的网格：还原材质并释放克隆。
      if (!visibleMeshes.has(hiddenMesh)) {
        if (hiddenMesh.material === staleMaterialEntry.replacement) {
          hiddenMesh.material = staleMaterialEntry.original;
        }
        staleMaterialEntry.clones.forEach(staleClone => staleClone.dispose());
        hiddenMaterialsByMesh.delete(hiddenMesh);
      }
    }
    for (const visibleMesh of visibleMeshes) {
      let materialEntry = hiddenMaterialsByMesh.get(visibleMesh);
      if (!materialEntry) {
        // 首次透明化：必须克隆材质，直接改原材质会污染所有共用它的模型。
        const originalMaterial = visibleMesh.material;
        const materialList = Array.isArray(originalMaterial)
          ? originalMaterial
          : [originalMaterial];
        const clonedMaterials = materialList.map(material => material.clone());
        materialEntry = {
          original: originalMaterial,
          clones: clonedMaterials,
          replacement: Array.isArray(originalMaterial) ? clonedMaterials : clonedMaterials[0]
        };
        hiddenMaterialsByMesh.set(visibleMesh, materialEntry);
        visibleMesh.material = materialEntry.replacement;
      }
      // 每帧从原始材质重新拷贝参数再改透明度：这样其它逻辑（如主题切换）
      // 对原材质的修改仍会被带上，不会因为一次透明化就永久丢失。
      const originalMaterials = Array.isArray(materialEntry.original)
        ? materialEntry.original
        : [materialEntry.original];
      materialEntry.clones.forEach((materialClone, materialIndex) => {
        materialClone.copy(originalMaterials[materialIndex]);
        materialClone.transparent = true;
        // 0.1 的不透明度足够「看见轮廓但看穿」，比完全隐藏更不容易让人迷失空间感。
        materialClone.opacity = Math.min(originalMaterials[materialIndex].opacity, 0.1);
        // 关掉深度写入：半透明物体互相叠加时不会出现排序错乱的硬边。
        materialClone.depthWrite = false;
      });
    }
  }
  return {
    reset: restoreHiddenMaterials,
    reveal: revealFurniture
  };
}
