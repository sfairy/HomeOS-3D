export function createMotionPresentation({
  reflections: setReflections,
  shadows: setShadows,
  liveCameraReflections: isLiveCameraEnabled = false,
}: any) {
  let isFloorActive = false,
    isCameraActive = false,
    isAdvanced = false,
    isLiveActive = isLiveCameraEnabled;
  function publish() {
    (setReflections(isFloorActive || (isCameraActive && !isLiveActive && !isAdvanced)),
      setShadows(isFloorActive));
  }
  return {
    floor(floorActive: any) {
      ((isFloorActive = !!floorActive), isFloorActive && (isAdvanced = false), publish());
    },
    camera(cameraActive: any, { live: isLiveRequested = isLiveCameraEnabled } = {}) {
      ((isCameraActive = !!cameraActive),
        (isLiveActive = isLiveRequested),
        isCameraActive && (isAdvanced = false),
        publish());
    },
    advance(progress: any) {
      !(isFloorActive || isCameraActive) ||
        isAdvanced ||
        progress < 0.9 ||
        ((isAdvanced = true), publish());
    },
  };
}
