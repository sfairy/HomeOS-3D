/**
 * 镜头 / 楼层运动期间的呈现降级开关。
 *
 * 位置：3D 工作室的动画（楼层切换、镜头飞行）与地面反射、接触阴影之间的调度层。
 * 职责：把「地板在动」「镜头在动」「运动是否已落定」三件事汇总成两个布尔信号，
 *   交给外部去挂起或恢复反射与阴影，避免运动过程中反复重算高开销的贴图。
 * 对外：createMotionPresentation 工厂函数，返回 floor / camera / advance 三个方法。
 * 约定：反射是否开启还受 liveCameraReflections 影响 —— 开启镜头实时反射时，
 *   镜头运动不再需要挂起反射，只有楼层运动才会。
 */

/**
 * 创建运动呈现控制器。
 *
 * @param {object} options 依赖注入。
 * @param {function(boolean): void} options.reflections 反射开关回调参数为「是否挂起反射」。
 * @param {function(boolean): void} options.shadows 阴影开关回调参数为「是否处于运动态」。
 * @param {boolean} [options.liveCameraReflections] 镜头运动时是否保留实时反射，默认否。
 * @returns {{floor: function(boolean): void, camera: function(boolean, object=): void,
 *   advance: function(number): void}} 控制器实例。
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
    // 运动落定后立即恢复反射，避免停在「最后一帧」时反射仍被挂起。
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
