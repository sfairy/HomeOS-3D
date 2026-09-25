/**
 * 3D 相机运动的姿态解算、缓动与采样：相机镜头移动（聚焦设备、切楼层、灯光视角）都经过这里。
 * 把「目标点 + 位置 + 上方向」换算成旋转四元数，再按缓动函数在两点间采样逐帧姿势；
 * 楼层切换与聚焦走不同插值策略。
 *
 * 约定：position / target / up 都是长度 3 的世界坐标数组，可选的 zoom / focalLength / frameSize
 * 会一并插值；相机始终沿自身 +Z 看向目标，旋转以 (right, up, forward) 为基。
 */
// 夹取与换算统一走 utils/numbers.js（唯一实现，经 static-helpers 桥取用）：clampNumber 保证写进
// 渲染层的值落在合法区间；finiteNumberOr 把 NaN / undefined 这类「缺失」与合法的 0 区分开
// （0 往往有语义，不能被当成缺失）。
import { clampNumber, finiteNumberOr } from "../core/static-helpers.js?v=2609251920";
/**
 * 浅拷贝一份姿势，数组字段单独复制。
 *
 * 采样函数会把结果交回给调用方，直接返回内部引用会被外部改动污染缓存。
 */
function clonePose(pose) {
  return Object.fromEntries(
    Object.entries(pose).map(([poseKey, poseField]) => [
      poseKey,
      Array.isArray(poseField) ? [...poseField] : poseField
    ])
  );
}
/** 按轴读取三元组并构造 Vector3；缺项逐个用兜底数组补齐（而不是整体兜底）。 */
function readVector3(three, sourceArray, fallbackArray) {
  return new three.Vector3(
    ...[0, 1, 2].map(axisIndex =>
      finiteNumberOr(sourceArray?.[axisIndex], fallbackArray[axisIndex])
    )
  );
}
/**
 * 把姿势解算成「目标点 + 距离 + 旋转」。
 * 以 position → target 为前方向（three.js 默认 +Z），用 up 做 Gram-Schmidt
 * 正交化得上方向，再由三者叉乘出右方向，组装成矩阵后取四元数。
 */
function resolveCameraPose(threeNamespace, poseConfig) {
  const targetVector = readVector3(threeNamespace, poseConfig.target, [0, 0, 0]);
  // position 是绝对坐标，转换为相对目标点的偏移量后只关心方向与长度。
  const offsetVector = readVector3(threeNamespace, poseConfig.position, [0, 3, 6])
    .clone()
    .sub(targetVector);
  const distanceValue = Math.max(offsetVector.length(), 1e-8);
  if (offsetVector.lengthSq() < 1.0000000000000001e-16) {
    // 位置与目标重合：没有方向可言，退化成「从 +Z 看过去」。
    offsetVector.set(0, 0, 1);
  }
  offsetVector.normalize();
  const upVector = readVector3(threeNamespace, poseConfig.up, [0, 1, 0]);
  // 正交化：减去 up 在视线方向上的分量，得到垂直于视线的那部分。
  upVector.addScaledVector(offsetVector, -upVector.dot(offsetVector));
  if (upVector.lengthSq() < 1.0000000000000001e-16) {
    // up 与视线共线（例如垂直俯视）时无法正交化，改用一个必然不共线的候选方向：
    // 视线接近竖直时取 ±Z，否则取 +Y。
    upVector.set(
      0,
      Math.abs(offsetVector.y) < 0.9 ? 1 : 0,
      Math.abs(offsetVector.y) < 0.9 ? 0 : -1
    );
    upVector.addScaledVector(offsetVector, -upVector.dot(offsetVector));
  }
  upVector.normalize();
  // 右方向由 up × forward 得到，再用 forward × right 反算 up，保证三者严格正交。
  const rightVector = upVector.clone().cross(offsetVector).normalize();
  upVector.crossVectors(offsetVector, rightVector).normalize();
  const rotationQuaternion = new threeNamespace.Quaternion().setFromRotationMatrix(
    new threeNamespace.Matrix4().makeBasis(rightVector, upVector, offsetVector)
  );
  return {
    target: targetVector,
    distance: distanceValue,
    rotation: rotationQuaternion
  };
}
/**
 * 尝试把旋转表达成「环绕角度」。
 */
function readOrbitAngles(threeLib, viewPose, resolvedPose) {
  // 俯视视角在数学上是奇异点（theta 无意义），直接用四元数插值更稳。
  if (viewPose.view === "top") {
    return null;
  }
  const forwardVector = new threeLib.Vector3(0, 0, 1).applyQuaternion(resolvedPose.rotation);
  // 两种情况不能用角度插值：1) 视线接近竖直（水平投影过短，theta 抖动剧烈）；
  // 2) 相机带「翻滚」（roll）—— 用 lookAt(forward, 原点, +Y) 重建的四元数与实际
  // 旋转不一致，说明存在角度插值表达不了的滚转。
  if (
    Math.hypot(forwardVector.x, forwardVector.z) < 0.00001 ||
    new threeLib.Quaternion()
      .setFromRotationMatrix(
        new threeLib.Matrix4().lookAt(
          forwardVector,
          new threeLib.Vector3(),
          new threeLib.Vector3(0, 1, 0)
        )
      )
      .angleTo(resolvedPose.rotation) > 0.00001
  ) {
    return null;
  } else {
    return {
      theta: Math.atan2(forwardVector.x, forwardVector.z),
      phi: Math.acos(clampNumber(forwardVector.y, -1, 1))
    };
  }
}
/**
 * 默认的缓动曲线：三次缓出（ease-out cubic）。
 */
function cameraMotionProgress(progressElapsedMs, progressDurationMs) {
  if (progressDurationMs <= 0 || progressElapsedMs >= progressDurationMs) {
    return 1;
  } else {
    // 1-(1-t)^3：起步快、收尾慢，适合镜头推进；NaN 时间按 0 处理，避免污染整条曲线。
    return (
      1 -
      (1 -
        clampNumber(
          Number.isNaN(progressElapsedMs) ? 0 : progressElapsedMs / progressDurationMs,
          0,
          1
        )) **
        3
    );
  }
}
/** 判定「已经停稳」的默认阈值：指数衰减到该值以下即视为到位。 */
const DEFAULT_SETTLE_EPSILON = 0.0001;
/** 收尾归一化窗口（毫秒）：见 createDampedCameraMotion 中对尾巴的处理。 */
const SETTLE_WINDOW_MS = 500;
/**
 * 创建「阻尼收敛」式相机运动（不做定时长，而是按指数衰减直到停稳）。
 * 与释放运动不同，没有固定总时长：进度按 e^(-rt) 连续逼近 1，由调用方用
 * settled() 判断何时结束。不同 owner 速率不同 —— 楼层切换最快、聚焦最慢。
 */
export function createDampedCameraMotion(
  threeCore,
  dampedFromPose,
  dampedToPose,
  {
    immediate: immediateStart = false,
    owner: ownerKind = "focus",
    floorFrame: floorFrame = null
  } = {}
) {
  const isFocusOwner = ownerKind === "focus";
  // 速率（每秒的指数衰减系数）：楼层切换需要更利落，聚焦需要更柔和。
  const moveRatePerSecond = ownerKind === "floor" ? 8 : isFocusOwner ? 5 : 6;
  const turnRatePerSecond = ownerKind === "floor" ? 7 : isFocusOwner ? 4 : 5;
  // 停稳阈值：楼层切换要求更精确（0.0005），避免停在两层之间时出现细微抖动。
  const settleEpsilon = ownerKind === "floor" ? 0.0005 : DEFAULT_SETTLE_EPSILON;
  // 指数衰减系数：把「每秒衰减率」换算成经过 decayElapsedMs 后剩下的比例。
  // 只依赖真实经过时间（而不是帧数），因此掉帧或不同刷新率下的轨迹一致。
  const decayFactor = (decayElapsedMs, decayRatePerSecond) =>
    Math.exp((-decayRatePerSecond * Math.max(0, finiteNumberOr(decayElapsedMs, 0))) / 1000);
  /** 是否停稳：立即模式或剩余幅度已小于阈值。 */
  const isDampingSettled = dampingElapsedMs =>
    immediateStart || decayFactor(dampingElapsedMs, turnRatePerSecond) <= settleEpsilon;
  // 指数曲线逼近到 settleEpsilon 所需时间，再往前留出 500ms 的收尾窗口。
  const dampingTailMs = (-Math.log(settleEpsilon) * 1000) / turnRatePerSecond - SETTLE_WINDOW_MS;
  /**
   * 阻尼进度。
   * 纯指数曲线永远到不了 1，会让相机在最后几像素磨蹭很久；故在最后 SETTLE_WINDOW_MS 内换成
   * 一段三次多项式，系数由衔接点处取值与一阶 / 二阶导数分别相等解出（Hermite 型），末端精确落 1。
   */
  const dampedProgress = (dampedElapsedMs, dampedRatePerSecond = moveRatePerSecond) => {
    if (isDampingSettled(dampedElapsedMs)) {
      return 1;
    }
    if (!isFocusOwner || dampedElapsedMs <= dampingTailMs) {
      return 1 - decayFactor(dampedElapsedMs, dampedRatePerSecond);
    }
    const tailRatio = clampNumber((dampedElapsedMs - dampingTailMs) / SETTLE_WINDOW_MS, 0, 1);
    const tailRemaining = 1 - tailRatio;
    // rateWindowRatio = 该速率在收尾窗口内「衰减掉的比例」，作为多项式系数的输入。
    const rateWindowRatio = (dampedRatePerSecond * SETTLE_WINDOW_MS) / 1000;
    const tailEaseValue =
      tailRemaining ** 3 *
      (1 +
        (3 - rateWindowRatio) * tailRatio +
        (6 - rateWindowRatio * 3 + rateWindowRatio * 0.5 * rateWindowRatio) *
          tailRatio *
          tailRatio);
    return 1 - decayFactor(dampingTailMs, dampedRatePerSecond) * tailEaseValue;
  };
  const dampedEasing = {
    settled: isDampingSettled,
    move: dampedMoveMs => dampedProgress(dampedMoveMs),
    turn: dampedTurnMs => dampedProgress(dampedTurnMs, turnRatePerSecond)
  };
  return {
    settled: isDampingSettled,
    progress: dampedEasing.move,
    // createFocusCameraSampler 的时长传 0：实际进度完全由 easingHooks 决定，
    // 不走按时长归一化的默认曲线。
    sample: createFocusCameraSampler(
      threeCore,
      dampedFromPose,
      dampedToPose,
      0,
      isFocusOwner ? "focus-orbit" : ownerKind,
      floorFrame,
      dampedEasing
    )
  };
}
/**
 * 创建姿势采样器：把「已用时长」映射成「当前姿势」。
 */
function createFocusCameraSampler(
  threeFrame,
  initialPose,
  targetPose,
  motionDurationMs = 1100,
  motionMode = "focus",
  floorFrameData = null,
  easingHooks = null
) {
  initialPose = clonePose(initialPose);
  targetPose = clonePose(targetPose);
  const resolvedDurationMs = Math.max(0, finiteNumberOr(motionDurationMs, 1100));
  // 解算结果较重，只在第一次采样时算一次并缓存。
  let fromPose;
  let toPose;
  let pivotFrame;
  let orbitAngles;
  return function (sampleTimeMs) {
    const sampleElapsed = Number.isNaN(sampleTimeMs) ? 0 : sampleTimeMs;
    // 已结束：直接给目标姿势（返回副本，避免调用方改动内部状态）。
    if (
      easingHooks
        ? easingHooks.settled(sampleElapsed)
        : resolvedDurationMs === 0 || sampleElapsed >= resolvedDurationMs
    ) {
      return clonePose(targetPose);
    }
    // 还没有开始：给起始姿势。
    if (!(sampleElapsed > 0)) {
      return clonePose(initialPose);
    }
    fromPose ||= resolveCameraPose(threeFrame, initialPose);
    toPose ||= resolveCameraPose(threeFrame, targetPose);
    // 位移与转向可用不同进度；无自定义钩子时两者一致。
    const moveProgress = easingHooks
      ? easingHooks.move(sampleElapsed)
      : cameraMotionProgress(sampleElapsed, resolvedDurationMs);
    const turnProgress = easingHooks ? easingHooks.turn(sampleElapsed) : moveProgress;
    // 旋转用球面插值：比欧拉角插值稳定，不会在中途出现速度突变。
    const slerpedRotation = fromPose.rotation
      .clone()
      .slerp(toPose.rotation, turnProgress)
      .normalize();
    if (motionMode === "focus-orbit") {
      // 环绕模式：把旋转换成 (theta, phi) 角度后线性插值，
      // 这样相机会沿弧线绕目标转，而不是沿直线方向插值（后者看起来像「贴着墙平移」）。
      if (orbitAngles === undefined) {
        const fromOrbitAngles = readOrbitAngles(threeFrame, initialPose, fromPose);
        const toOrbitAngles = readOrbitAngles(threeFrame, targetPose, toPose);
        orbitAngles =
          fromOrbitAngles && toOrbitAngles
            ? {
                start: fromOrbitAngles,
                end: toOrbitAngles,
                // 用 atan2(sin, cos) 求最短角度差，避免绕远路（例如 +350° 而不是 -10°）。
                deltaTheta: Math.atan2(
                  Math.sin(toOrbitAngles.theta - fromOrbitAngles.theta),
                  Math.cos(toOrbitAngles.theta - fromOrbitAngles.theta)
                )
              }
            : null;
      }
      if (orbitAngles) {
        const {
          start: startOrbitAngles,
          end: endOrbitAngles,
          deltaTheta: orbitDeltaTheta
        } = orbitAngles;
        const orbitDirection = new threeFrame.Vector3().setFromSphericalCoords(
          1,
          startOrbitAngles.phi + (endOrbitAngles.phi - startOrbitAngles.phi) * turnProgress,
          startOrbitAngles.theta + orbitDeltaTheta * turnProgress
        );
        slerpedRotation.setFromRotationMatrix(
          new threeFrame.Matrix4().lookAt(
            orbitDirection,
            new threeFrame.Vector3(),
            new threeFrame.Vector3(0, 1, 0)
          )
        );
      }
    }
    // 常规路径：目标点线性插值，位置 = 目标点 + 旋转方向 × 距离。
    let interpolatedTarget = fromPose.target.clone().lerp(toPose.target, moveProgress);
    const interpolatedDistance = Math.max(
      1e-8,
      fromPose.distance + (toPose.distance - fromPose.distance) * moveProgress
    );
    let interpolatedPosition = new threeFrame.Vector3(0, 0, interpolatedDistance)
      .applyQuaternion(slerpedRotation)
      .add(interpolatedTarget);
    if (motionMode === "floor" && floorFrameData?.fromPivot && floorFrameData?.toPivot) {
      // 楼层模式：两个楼层各有自己的枢轴（楼层中心）。直接在世界坐标插值会让相机
      // 走出一个大弧线甚至穿墙；改为「各自转到枢轴局部坐标 → 在局部空间插值 → 转回世界」。
      if (!pivotFrame) {
        const fromPivotVector = readVector3(threeFrame, floorFrameData.fromPivot, [0, 0, 0]);
        const toPivotVector = readVector3(threeFrame, floorFrameData.toPivot, [0, 0, 0]);
        /** 把世界坐标点转到「以枢轴为原点、按枢轴姿态旋转」的局部坐标。 */
        const toPivotLocalPoint = (worldPoint, pivotPoint, pivotRotation) =>
          readVector3(threeFrame, worldPoint, [0, 0, 0])
            .sub(pivotPoint)
            .applyQuaternion(pivotRotation.clone().invert());
        pivotFrame = {
          fromPivot: fromPivotVector,
          toPivot: toPivotVector,
          fromPosition: toPivotLocalPoint(initialPose.position, fromPivotVector, fromPose.rotation),
          toPosition: toPivotLocalPoint(targetPose.position, toPivotVector, toPose.rotation),
          fromTarget: toPivotLocalPoint(initialPose.target, fromPivotVector, fromPose.rotation),
          toTarget: toPivotLocalPoint(targetPose.target, toPivotVector, toPose.rotation)
        };
      }
      const pivotVector = pivotFrame.fromPivot.clone().lerp(pivotFrame.toPivot, moveProgress);
      interpolatedPosition = pivotFrame.fromPosition
        .clone()
        .lerp(pivotFrame.toPosition, moveProgress)
        .applyQuaternion(slerpedRotation)
        .add(pivotVector);
      interpolatedTarget = pivotFrame.fromTarget
        .clone()
        .lerp(pivotFrame.toTarget, moveProgress)
        .applyQuaternion(slerpedRotation)
        .add(pivotVector);
    }
    // up 直接取旋转后的 +Y：这样插值过程中相机不会出现额外滚转。
    const animatedUpVector = new threeFrame.Vector3(0, 1, 0)
      .applyQuaternion(slerpedRotation)
      .normalize();
    // 先铺起始与目标姿势的全部字段，再用插值结果覆盖几何字段：
    // 这样 mode / view 之类的非数值字段也能被保留。
    const sampledPose = {
      ...clonePose(initialPose),
      ...clonePose(targetPose),
      position: interpolatedPosition.toArray(),
      target: interpolatedTarget.toArray(),
      up: animatedUpVector.toArray()
    };
    // 可选数值字段只在两端出现过时才插值，避免凭空给姿势加上默认值。
    for (const [poseKeyName, poseKeyDefault] of [
      ["zoom", 1],
      ["focalLength", 50],
      ["frameSize", 10]
    ]) {
      if (poseKeyName in initialPose || poseKeyName in targetPose) {
        const fromKeyValue = finiteNumberOr(initialPose[poseKeyName], poseKeyDefault);
        const toKeyValue = finiteNumberOr(targetPose[poseKeyName], poseKeyDefault);
        sampledPose[poseKeyName] = fromKeyValue + (toKeyValue - fromKeyValue) * moveProgress;
      }
    }
    return sampledPose;
  };
}
/**
 * 沿射线前进并裁剪到 ±10000 的立方体边界内。
 * 用于把「从目标点朝某方向按给定长度外移」的相机位置限制在场景坐标范围内；
 * 若射线一开始就朝外（可用距离为 0），则反向重试一次。
 */
function clipRayToBounds(threeModule, rayOrigin, rayDirection, maxTravelDistance) {
  let travelDistance = maxTravelDistance;
  for (const axisName of ["x", "y", "z"]) {
    if (Math.abs(rayDirection[axisName]) > 1e-8) {
      // 该轴方向上的边界（±10000），取到达它所需的参数距离。
      const axisLimit = Math.sign(rayDirection[axisName]) * 10000;
      travelDistance = Math.min(
        travelDistance,
        Math.max(0, (axisLimit - rayOrigin[axisName]) / rayDirection[axisName])
      );
    }
  }
  if (travelDistance < 1e-8) {
    // 起点已经贴在边界上且朝外：掉头向场景内部走。
    rayDirection.copy(rayOrigin).negate();
    if (rayDirection.lengthSq() < 1e-8) {
      // 起点就是原点：没有可用的反向参照，固定朝 +Z。
      rayDirection.set(0, 0, 1);
    }
    rayDirection.normalize();
    return clipRayToBounds(
      threeModule,
      rayOrigin,
      rayDirection,
      Math.min(maxTravelDistance, 10000)
    );
  } else {
    return rayOrigin.clone().addScaledVector(rayDirection, travelDistance);
  }
}
/**
 * 计算灯光编辑用的相机姿势（由灯光配置推导）。
 */
export function automaticLightCamera(threeToolkit, lightConfig, lightTarget) {
  const lightOptions = lightConfig || {};
  const { distance: lightDistance, rotation: lightRotation } = resolveCameraPose(
    threeToolkit,
    lightOptions
  );
  // 目标点夹到 ±10000，与射线的边界裁剪保持一致。
  const lightTargetPoint = readVector3(threeToolkit, lightTarget, [0, 0, 0]).clampScalar(
    -10000,
    10000
  );
  const isPerspectiveMode = lightOptions.mode === "perspective";
  const lightForwardDirection = new threeToolkit.Vector3(0, 0, 1)
    .applyQuaternion(lightRotation)
    .normalize();
  // 透视模式下相机站得近一半（同样的距离在透视投影里看起来更远），最短 3；
  // 正交模式用全距离，同样最短 3，避免相机与目标重合。
  const lightRayLength = isPerspectiveMode
    ? Math.max(3, lightDistance * 0.5)
    : Math.max(3, lightDistance);
  const lightPositionPoint = clipRayToBounds(
    threeToolkit,
    lightTargetPoint,
    lightForwardDirection,
    lightRayLength
  );
  const lightViewDirection = lightPositionPoint.clone().sub(lightTargetPoint).normalize();
  const lightUpCandidate = readVector3(threeToolkit, lightOptions.up, [0, 1, 0]);
  const lightUpLength = lightUpCandidate.length();
  // up 必须非零，且不能与视线共线（叉积非零），否则无法确定相机姿态。
  const hasUsableUp =
    lightUpLength > 1e-8 &&
    lightUpCandidate.clone().divideScalar(lightUpLength).cross(lightViewDirection).lengthSq() >
      1.0000000000000001e-16;
  const lightUpVector = hasUsableUp
    ? lightUpCandidate
    : new threeToolkit.Vector3(0, 1, 0).applyQuaternion(lightRotation).normalize();
  const lightCameraPose = {
    mode: isPerspectiveMode ? "perspective" : "orthographic",
    position: lightPositionPoint.toArray(),
    target: lightTargetPoint.toArray(),
    up: lightUpVector.toArray(),
    // 正交模式放大 2.2 倍：灯光编辑需要看到整个房间的范围而不是局部特写；zoom 夹在 0.01–100。
    zoom: clampNumber(
      finiteNumberOr(lightOptions.zoom, 1) * (isPerspectiveMode ? 1 : 2.2),
      0.01,
      100
    ),
    frameSize: clampNumber(finiteNumberOr(lightOptions.frameSize, 10), 0.001, 20000),
    focalLength: clampNumber(finiteNumberOr(lightOptions.focalLength, 50), 18, 120),
    view: lightOptions.view === "top" ? "top" : "free",
    topRotation: clampNumber(finiteNumberOr(lightOptions.topRotation, 0), 0, 360)
  };
  if (!hasUsableUp) {
    // 上面那一步只是「暂时」换了个 up 方向，换完还需要重新解算一次姿态，
    // 再把解算结果的上方向写回配置，保证下游拿到的是自洽的姿势。
    const correctedLightPose = resolveCameraPose(threeToolkit, lightCameraPose);
    lightCameraPose.up = new threeToolkit.Vector3(0, 1, 0)
      .applyQuaternion(correctedLightPose.rotation)
      .normalize()
      .toArray();
  }
  return lightCameraPose;
}
/**
 * 计算空调编辑用的相机姿势：从斜上方对准空调并完整取景。
 */
export function automaticAirConditionerCamera(
  threeContext,
  conditionerConfig,
  conditionerTarget,
  conditionerDirection,
  conditionerFrameWeight,
  { minimumFrameSize: minimumFrameSize = 3, minimumDistance: minimumDistance = 3 } = {}
) {
  const conditionerOptions = conditionerConfig || {};
  const conditionerTargetPoint = readVector3(
    threeContext,
    conditionerTarget,
    [0, 0, 0]
  ).clampScalar(-10000, 10000);
  const flatDirection = readVector3(threeContext, conditionerDirection, [0, 0, 1]);
  // 只保留水平分量：空调相机是「斜上方俯视」，竖向分量由固定的仰角决定。
  flatDirection.y = 0;
  // 归一化用的是 x / z 分量中较大的那个（而不是向量长度），
  // 这样斜 45° 的朝向不会被缩得比正朝向短，取景距离更稳定。
  const directionMagnitude = Math.max(Math.abs(flatDirection.x), Math.abs(flatDirection.z));
  if (directionMagnitude < 1e-8) {
    // 朝向退化成竖直（没有水平分量）：默认朝 +Z。
    flatDirection.set(0, 0, 1);
  } else {
    flatDirection.divideScalar(directionMagnitude).normalize();
  }
  const unitUpVector = new threeContext.Vector3(0, 1, 0);
  // 0.38 的抬升量经验值：既能看到顶面，又不会变成垂直俯视。
  const elevatedDirection = flatDirection.clone().addScaledVector(unitUpVector, 0.38).normalize();
  // 由抬升方向与世界上方向叉乘得到「侧向」，再由侧向与抬升方向叉乘得到「竖直」，
  // 三者构成一组正交基，用于按方向估算物体在画面里的范围。
  const lateralDirection = unitUpVector.clone().cross(elevatedDirection).normalize();
  const verticalDirection = elevatedDirection.clone().cross(lateralDirection).normalize();
  const frameWeightVector = readVector3(threeContext, conditionerFrameWeight, [0.9, 0.28, 0.22]);
  for (const weightAxisName of ["x", "y", "z"]) {
    // 权重取绝对值并夹到 [0.01, 10000]：允许用负号表达「反向偏移」，但不允许为 0
    // （否则某个方向会被算成没有厚度，取景尺寸偏小）。
    frameWeightVector[weightAxisName] = clampNumber(
      Math.abs(frameWeightVector[weightAxisName]),
      0.01,
      10000
    );
  }
  // 加权范围：把方向向量投影到各轴上，乘以对应权重后求和，得到「该方向上的视觉尺寸」。
  const weightedExtent = extentDirection =>
    Math.abs(extentDirection.x) * frameWeightVector.x +
    Math.abs(extentDirection.y) * frameWeightVector.y +
    Math.abs(extentDirection.z) * frameWeightVector.z;
  const viewportAspect = clampNumber(
    finiteNumberOr(
      conditionerOptions.aspect,
      finiteNumberOr(conditionerOptions.viewportAspect, 1.6)
    ),
    0.25,
    4
  );
  const verticalExtent = weightedExtent(verticalDirection);
  const lateralExtent = weightedExtent(lateralDirection);
  const forwardExtent = weightedExtent(elevatedDirection);
  // 取景尺寸取三者最大值：竖向空间的 2.1 倍（留出上下边距），
  // 或横向范围按宽高比折算后的 1.8 倍；再夹到 [minimumFrameSize, 20000]。
  const frameSizeValue = clampNumber(
    Math.max(minimumFrameSize, verticalExtent * 2.1, (lateralExtent / viewportAspect) * 1.8),
    minimumFrameSize,
    20000
  );
  const usesPerspective = conditionerOptions.mode === "perspective";
  // 固定 35mm 等效焦距：接近人眼观感，避免长焦压缩或广角畸变影响判断。
  const focalLengthMm = 35;
  // 相机距离：透视模式由取景尺寸（乘宽高比）+ 纵深的一半推导；正交模式只看纵深。
  const cameraDistance = clampNumber(
    usesPerspective
      ? frameSizeValue * Math.max(viewportAspect, 1) + forwardExtent * 0.5
      : forwardExtent * 0.5 + 2,
    minimumDistance,
    10000
  );
  let conditionerPosition = clipRayToBounds(
    threeContext,
    conditionerTargetPoint,
    elevatedDirection.clone(),
    cameraDistance
  );
  if (conditionerPosition.distanceTo(conditionerTargetPoint) < minimumDistance - 1e-8) {
    // 目标点贴近边界时射线会被裁得很短，相机几乎贴到空调上；
    // 退化为「从原点方向往外看」，符号由目标所在的象限决定，保证方向始终朝向场景外部。
    const fallbackDirection = new threeContext.Vector3(
      -Math.sign(conditionerTargetPoint.x),
      -Math.sign(conditionerTargetPoint.y) * 0.38,
      -Math.sign(conditionerTargetPoint.z)
    );
    if (Math.abs(fallbackDirection.x) + Math.abs(fallbackDirection.z) < 1e-8) {
      fallbackDirection.z = 1;
    }
    conditionerPosition = clipRayToBounds(
      threeContext,
      conditionerTargetPoint,
      fallbackDirection.normalize(),
      cameraDistance
    );
  }
  return {
    mode: usesPerspective ? "perspective" : "orthographic",
    position: conditionerPosition.toArray(),
    target: conditionerTargetPoint.toArray(),
    up: unitUpVector.toArray(),
    zoom: 1,
    frameSize: frameSizeValue,
    focalLength: focalLengthMm,
    view: "free",
    topRotation: 0
  };
}
