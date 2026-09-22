/*
 * 几何与相机位姿换算。
 *
 * 屏幕坐标到地面/楼层的换算、相机位姿的相等判定与约束，以及焦点可用性判定。
 *
 * 由 core/stage.js 的 mountStage 外提而来：这里只放函数，对外部状态与兄弟函数的读写一律经
 * ctx —— ctx 的每一项都是 stage.js 里的 getter/setter，读到的始终是调用时刻的值。
 */
export function createStageGeometry(ctx) {
  /**
   * 归一化窗帘几何参数：宽度、开合方式、轨道形状、布料与梦幻帘标记。
   * 轨道相关参数只来自场景模型（编辑器才有），布料与 coverKind 允许配置覆盖
   * 模型；unboundPosition 是未绑定实体时的预览开合度。
   */
  function resolveCurtainGeometry(sceneItemSource, itemConfig = {}) {
    // 场景模型的开合预览：模型没写这个字段时（undefined）保持缺失，由下游定默认值；
    // 显式写了 0 仍表示关闭，因此不能用 `|| 0` 这类会把 0 也吞掉的写法。
    const sceneCurtainPreview = Number(sceneItemSource?.curtainPreview);
    return {
      curtainWidth: Number(sceneItemSource?.width) || 1.8,
      curtainPosition: sceneItemSource?.curtainPosition || "split",
      curtainTrack: sceneItemSource?.curtainTrack || "straight",
      curtainCorner: sceneItemSource?.curtainCorner,
      curtainLeftLength: sceneItemSource?.curtainLeftLength,
      curtainRightLength: sceneItemSource?.curtainRightLength,
      curtainMeet: sceneItemSource?.curtainMeet,
      curtainFabric: sceneItemSource?.curtainFabric || itemConfig.curtainFabric || "cloth",
      coverKind: itemConfig.coverKind === "dream" ? "dream" : "standard",
      // 未绑定的预览开合度：配置优先，其次模型自带的预览值。两者都没有时**故意留空** ——
      // 默认值（COVER_DEFAULT_PREVIEW_POSITION）的唯一归属在 curtain-motion 的
      // resolveUnboundPosition；这里再写一份字面量，就会与「3D 工作室里看到的开合度」分叉，
      // 同一扇窗在不同页面显示成不同值。
      unboundPosition: Number.isFinite(itemConfig.unboundPosition)
        ? itemConfig.unboundPosition
        : Number.isFinite(sceneCurtainPreview)
          ? sceneCurtainPreview
          : undefined
    };
  }

  // 比较两个相机姿态是否等价：缩放用 1e-6 容差、位置分量用更小的容差。
  // 容差太小会被浮点误差判成「变了」而反复重启过渡。
  function cameraPosesEqual(poseA, poseB) {
    return (
      poseA.mode === poseB.mode &&
      Math.abs(poseA.zoom - poseB.zoom) < 0.000001 &&
      ["position", "target", "up"].every(poseKey =>
        (poseA[poseKey] || [0, 1, 0]).every(
          (poseValue, poseValueIndex) =>
            Math.abs(poseValue - (poseB[poseKey] || [0, 1, 0])[poseValueIndex]) < 0.000001
        )
      ) &&
      ["frameSize", "focalLength"].every(
        numberKey => Math.abs((poseA[numberKey] || 0) - (poseB[numberKey] || 0)) < 0.000001
      )
    );
  }

  // 约束相机姿态：非俯视（top）视图要夹住缩放与目标点，
  // 防止外部存进越界值把视角带飞。
  function constrainCameraPose(cameraPose) {
    if (!cameraPose) {
      return cameraPose;
    }
    if (cameraPose.view !== "top") {
      return ctx.stageOptions.constrainCameraPose({
        ...cameraPose,
        up: [0, 1, 0]
      });
    }
    const poseTargetPoint = new ctx.THREE.Vector3(...cameraPose.target);
    const topViewHeight = Math.max(
      new ctx.THREE.Vector3(...cameraPose.position).distanceTo(poseTargetPoint),
      0.001
    );
    const topRotationRad = ctx.THREE.MathUtils.degToRad(cameraPose.topRotation || 0);
    const upVector = new ctx.THREE.Vector3(
      ...(cameraPose.up || [Math.sin(topRotationRad), 0, -Math.cos(topRotationRad)])
    );
    upVector.y = 0;
    if (upVector.lengthSq() < 1e-12) {
      upVector.set(Math.sin(topRotationRad), 0, -Math.cos(topRotationRad));
    }
    return ctx.stageOptions.constrainCameraPose({
      ...cameraPose,
      position: [poseTargetPoint.x, poseTargetPoint.y + topViewHeight, poseTargetPoint.z],
      up: upVector.normalize().toArray()
    });
  }

  // 相机姿态一律经宿主转换：舞台侧存的是「相对楼层」坐标，由宿主叠加楼层抬升。
  // absolute 为 true 表示传入的已经是世界坐标，不再二次叠加。
  const transformCameraPose = (pose, floorSelectionId = ctx.config.floorSelection, absolute = false) =>
    ctx.stageOptions.transformCamera?.(pose, floorSelectionId, absolute) ?? pose;

  // 取当前相机在世界坐标下的姿态快照，用于恢复视角与判断相机是否变化。
  const currentCameraSnapshot = () =>
    transformCameraPose(ctx.stageOptions.cameraState(true), ctx.config.floorSelection, true);

  // 把指针位置换算成该楼层的平面坐标；指针没有落在楼层上时返回 null。
  function pointerToFloorPoint(dragPointerEvent, dragBinding) {
    const floorOrigin = ctx.stageOptions.worldPoint(dragBinding.floorId, 0, 0, dragBinding.height);
    if (!floorOrigin) {
      return null;
    }
    const canvasContainerRect = ctx.containerElement.getBoundingClientRect();
    const raycaster = new ctx.THREE.Raycaster();
    const pointerNdc = new ctx.THREE.Vector2(
      ((dragPointerEvent.clientX - canvasContainerRect.left) / canvasContainerRect.width) * 2 - 1,
      1 - ((dragPointerEvent.clientY - canvasContainerRect.top) / canvasContainerRect.height) * 2
    );
    if (ctx.stageOptions.presentationRay) {
      ctx.stageOptions.presentationRay(dragBinding.floorId, pointerNdc, raycaster);
    } else {
      raycaster.setFromCamera(pointerNdc, ctx.stageOptions.camera);
    }
    const hitPoint = raycaster.ray.intersectPlane(
      new ctx.THREE.Plane(new ctx.THREE.Vector3(0, 1, 0), -floorOrigin.y),
      new ctx.THREE.Vector3()
    );
    if (!hitPoint) {
      return null;
    }
    const xAxisVector = ctx.stageOptions
      .worldPoint(dragBinding.floorId, 1, 0, dragBinding.height)
      .sub(floorOrigin);
    const yAxisVector = ctx.stageOptions
      .worldPoint(dragBinding.floorId, 0, 1, dragBinding.height)
      .sub(floorOrigin);
    const offsetVector = hitPoint.sub(floorOrigin);
    return {
      x: Math.round((offsetVector.dot(xAxisVector) / xAxisVector.lengthSq()) * 100) / 100,
      y: Math.round((offsetVector.dot(yAxisVector) / yAxisVector.lengthSq()) * 100) / 100
    };
  }

  // 只有这几类设备点标记后会弹出面板（聚焦流程）；其余绑定点一下就是就地执行，
  // 不进聚焦态。用于决定标记是否需要「选中」视觉与是否接管指针。
  const isFocusableDevice = device =>
    ["nas", "television", "vacuum", "presence", "camera"].includes(device?.deviceKind);
  return { cameraPosesEqual, constrainCameraPose, currentCameraSnapshot, isFocusableDevice, pointerToFloorPoint, resolveCurtainGeometry, transformCameraPose };
}
