/**
 * 镜头 / 楼层运动期间的呈现降级开关。
 */

/**
 * 创建运动呈现控制器。
 */
export function createMotionPresentation({
  reflections: setReflections,
  shadows: setShadows,
  liveCameraReflections: liveCameraReflectionsEnabled = false
}) {
  // 三个状态位分开记：地板在动、镜头在动、本次运动是否已经落定。
  let isFloorMotionActive = false;
  let isCameraMotionActive = false;
  let isMotionSettled = false;
  let shouldReflectLiveCamera = liveCameraReflectionsEnabled;

  // 每次状态变化都重算两个输出信号，调用方不需要自己推导组合条件。
  function publishMotionState() {
    setReflections(
      (isFloorMotionActive || (isCameraMotionActive && !shouldReflectLiveCamera)) &&
        !isMotionSettled
    );
    // 阴影只有地板运动才关：镜头运动时阴影贴图不受影响，关掉反而会闪。
    setShadows(isFloorMotionActive && !isMotionSettled);
  }
  return {
    floor(isFloorActive) {
      isFloorMotionActive = !!isFloorActive;
      // 新一轮运动开始，落定标记复位。
      if (isFloorMotionActive) {
        isMotionSettled = false;
      }
      publishMotionState();
    },
    camera(isCameraActive, { live: liveReflections = liveCameraReflectionsEnabled } = {}) {
      isCameraMotionActive = !!isCameraActive;
      shouldReflectLiveCamera = liveReflections;
      if (isCameraMotionActive) {
        isMotionSettled = false;
      }
      publishMotionState();
    },
    advance(progress) {
      // 进度到九成即视为落定：留出收尾时间提前恢复效果，比等到 1 更跟手。
      if (
        (!!isFloorMotionActive || !!isCameraMotionActive) &&
        !isMotionSettled &&
        !(progress < 0.9)
      ) {
        isMotionSettled = true;
        publishMotionState();
      }
    }
  };
}
