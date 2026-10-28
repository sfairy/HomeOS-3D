import { coverState } from "../cover/cover-state";
import {
  airerAnimationPosePosition,
  airerVisualPosition,
  normalizeAirerDirection,
} from "./airer-direction";
import {
  motionPosition,
  reportInterval,
  reportedMotion,
  type MotionCurve,
  type MotionReports,
} from "../core/reported-motion";

/** 一个已定位的晾衣架骨架在帧间保留的状态（上游 `airerEntries`）。 */
interface AirerEntry {
  key: string;
  model: any;
  rig: any;
  position: number;
  motion: MotionCurve | null;
  signature: string;
  entityId?: string;
  state?: any;
  preparing?: boolean;
  light?: boolean;
  animationReversed?: boolean;
  directionBinding?: any;
  outlinePosition?: number | null;
  directions?: string;
  reportTime?: number | null;
  reportInterval?: number | null;
  reportDirection?: number;
  reports?: MotionReports | null;
}

export interface AirerMotionOptions {
  requestFrame?: () => void;
  requestAnimation?: () => void;
  setRenderObjects?: (renderObjects: unknown[]) => void;
  now?: () => number;
}

export function createAirerMotion({
  requestFrame: requestFrame = () => {},
  // 持续动画帧：不做节流的那一路。0.8.1 起跟随动画按屏幕刷新率推进，
  // 30fps 的定时器会把上报间隔的抖动放大成肉眼可见的顿挫。
  requestAnimation: requestAnimation = requestFrame,
  setRenderObjects: setRenderObjects = () => {},
  now: now = () => performance.now(),
}: AirerMotionOptions = {}) {
  let syncedRoot: any,
    syncedRevision: any,
    airerEntries: AirerEntry[] = [],
    renderObjects: any[] = [],
    hasAdvancedMotion = false,
    isDisposed = false;
  const airerKey = (binding: any) => binding.floorId + "/" + binding.modelId;

  /** 把「正在动的骨架」同步给宿主的动态渲染名单（反射通道据此决定要不要重画）。 */
  function syncRenderObjects() {
    const movingModels = airerEntries.filter((entry) => entry.motion).map((entry) => entry.model);
    movingModels.length === renderObjects.length &&
    movingModels.every((candidate, index) => candidate === renderObjects[index])
      ? undefined
      : ((renderObjects = movingModels), setRenderObjects(movingModels));
  }

  /** 面板读数：positionReversed */
  const panelVisualOf = (airerEntry: AirerEntry) =>
    airerVisualPosition(airerEntry.position, airerEntry.directionBinding || {});
  /** 3D pose：仅 animationReversed 生效 */
  const posePositionOf = (airerEntry: AirerEntry) =>
    airerAnimationPosePosition(airerEntry.position, {
      animationReversed: airerEntry.animationReversed,
    });

  function advanceMotion(entry: AirerEntry, timestamp: number) {
    const motion = entry.motion;
    if (!motion) return;
    // 曲线本身包含 tangent 缓动，帧末仍要清掉，否则会一直重算。
    ((entry.position = motionPosition(motion, timestamp)),
      timestamp >= motion.start + motion.duration && (entry.motion = null));
  }

  function applyPose(posedEntry: AirerEntry) {
    const posePosition = posePositionOf(posedEntry);
    (posedEntry.rig.pose(posePosition),
      posedEntry.outlinePosition !== posePosition &&
        ((posedEntry.model.userData.environmentOutlineRevision =
          (posedEntry.model.userData.environmentOutlineRevision || 0) + 1),
        (posedEntry.outlinePosition = posePosition)),
      (posedEntry.model.userData.environmentOutlineMoving =
        !posedEntry.preparing && !!(posedEntry.motion || posedEntry.state?.moving)));
  }

  return {
    sync({
      root: root,
      revision: revision,
      bindings: bindings = [],
      states: states = {},
      preparing: preparing = false,
    }: any) {
      if (isDisposed) return;
      const frameTime = now();
      (syncedRoot !== root || syncedRevision !== revision) &&
        ((syncedRoot = root),
        (syncedRevision = revision),
        (airerEntries = []),
        syncedRoot?.traverse((airerModel: any) => {
          airerModel.userData?.environmentModelType === "airer" &&
            airerModel.traverse((rigNode: any) => {
              rigNode.userData?.airerRig &&
                airerEntries.push({
                  key:
                    airerModel.userData.environmentFloorId +
                    "/" +
                    airerModel.userData.environmentModelId,
                  model: airerModel,
                  rig: rigNode.userData.airerRig,
                  position: 55,
                  motion: null,
                  signature: "",
                });
            });
        }));
      for (const airerEntry of airerEntries) {
        const airerBinding = bindings.find(
            (bindingCandidate: any) => airerKey(bindingCandidate) === airerEntry.key,
          ),
          cover = coverState(airerBinding?.entityId || "", states[airerBinding?.entityId]),
          entityId = airerBinding?.entityId || "";
        airerEntry.directionBinding = airerBinding || {};
        const direction = normalizeAirerDirection(airerBinding);
        // 有实体且开启动画反向时，pose 路径才反转
        airerEntry.animationReversed = !!(entityId && airerBinding?.animationReversed === true);
        const unboundPosition = airerBinding?.unboundPosition ?? airerEntry.rig.preview ?? 55,
          // 无位置回传时的目标：按 animationReversed 映射
          unboundTarget = airerEntry.animationReversed ? 100 - unboundPosition : unboundPosition,
          signature = JSON.stringify([
            entityId,
            cover.available,
            cover.state,
            cover.position,
            cover.opening,
            cover.closing,
            airerBinding?.travelSeconds,
            airerBinding?.unboundPosition,
            direction.positionReversed,
            direction.liftReversed,
            airerEntry.animationReversed,
            preparing,
          ]);
        if (signature !== airerEntry.signature) {
          preparing || advanceMotion(airerEntry, frameTime);
          const previousState = airerEntry.state,
            entityChanged =
              !airerEntry.signature ||
              entityId !== airerEntry.entityId ||
              airerEntry.preparing === true ||
              (previousState?.available === false && cover.position !== null),
            // 0.8.1：位置没动但「动 → 停」也要重算一次，否则停在半路的那一帧会留在旧值。
            justStopped = !!(previousState?.moving && !cover.moving),
            justStarted = !!(!previousState?.moving && cover.moving),
            positionReceived = cover.position !== previousState?.position,
            // 设备在开到位后仍会补一帧不同的位置（行程微调），此时没有 moving 标记，
            // 旧实现会直接跳过去；这里把它当成一次「静默位移」，仍走平滑跟随。
            reportedStopped = !!(
              !entityChanged &&
              !cover.moving &&
              !previousState?.moving &&
              cover.state === "open" &&
              previousState?.position != null &&
              positionReceived &&
              frameTime > (airerEntry.reportTime ?? 0)
            ),
            reportDirection = Math.sign((cover.position ?? 0) - (previousState?.position ?? 0)),
            directionFlipped = !!(
              reportedStopped &&
              airerEntry.reportDirection &&
              reportDirection !== airerEntry.reportDirection
            );
          airerEntry.directions = JSON.stringify([
            direction.positionReversed,
            direction.liftReversed,
          ]);
          const pendingMotion = airerEntry.motion;
          airerEntry.motion = null;
          const motionReversed =
            previousState?.moving && cover.moving && previousState.opening !== cover.opening;
          if (
            (entityChanged ||
              !cover.available ||
              justStarted ||
              justStopped ||
              motionReversed ||
              directionFlipped) &&
            ((airerEntry.reportTime = null),
            (airerEntry.reportInterval = null),
            (airerEntry.reportDirection = 0),
            (airerEntry.reports = null)),
            preparing
          )
            airerBinding?.entityId
              ? cover.available && cover.position !== null
                ? (airerEntry.position = cover.position)
                : entityChanged &&
                  cover.available &&
                  cover.moving &&
                  (airerEntry.position = unboundTarget)
              : (airerEntry.position = airerBinding?.unboundPosition ?? airerEntry.rig.preview ?? 55);
          else {
            if (!airerBinding?.entityId)
              airerEntry.position = airerBinding?.unboundPosition ?? airerEntry.rig.preview ?? 55;
            else {
              if (cover.available && cover.position !== null) {
                if ((cover.moving || reportedStopped) && positionReceived) {
                  const reportGap =
                      airerEntry.reportTime == null ||
                      (reportedStopped && airerEntry.reportInterval == null)
                        ? null
                        : frameTime - airerEntry.reportTime,
                    previousGap = airerEntry.reportInterval ?? 500;
                  // 0.8.1：间隔本身也要平滑，单次抖动不能直接改写跟随速度。
                  ((airerEntry.reportInterval = reportInterval(reportGap ?? 0, previousGap)),
                    (airerEntry.reportTime = frameTime),
                    (airerEntry.reportDirection = reportDirection));
                } else airerEntry.reportTime == null && (airerEntry.reportTime = frameTime);
                if (
                  entityChanged ||
                  (!cover.moving && !reportedStopped) ||
                  motionReversed
                )
                  airerEntry.position = cover.position;
                else {
                  if (airerEntry.position !== cover.position) {
                    const interval = airerEntry.reportInterval ?? 500,
                      motionDuration = Math.max(120, Math.min(5500, interval * 1.15));
                    airerEntry.motion = reportedMotion(
                      airerEntry.position,
                      cover.position,
                      frameTime,
                      motionDuration,
                      pendingMotion,
                      (airerEntry.reports ||= { samples: [], speed: 0 }),
                    );
                  }
                }
              } else {
                if (cover.available && cover.moving) {
                  const targetPosition = cover.opening ? 100 : 0;
                  (entityChanged && (airerEntry.position = unboundTarget),
                    targetPosition !== airerEntry.position &&
                      (airerEntry.motion = {
                        from: airerEntry.position,
                        to: targetPosition,
                        start: frameTime,
                        duration: Math.max(
                          180,
                          (Math.abs(targetPosition - airerEntry.position) / 100) *
                            (airerBinding?.travelSeconds || 20) *
                            1000,
                        ),
                      }));
                }
              }
            }
          }
          ((airerEntry.signature = signature),
            (airerEntry.entityId = entityId),
            (airerEntry.state = cover),
            (airerEntry.preparing = preparing),
            applyPose(airerEntry),
            requestFrame());
        }
        const lightBinding = (airerBinding?.extraControls || []).find((control: any) =>
            control.entityId.startsWith("light."),
          ),
          lightState = states[lightBinding?.entityId],
          lightEntityState = lightState?.newState || lightState,
          lightOn =
            !preparing &&
            lightEntityState?.available !== false &&
            lightEntityState?.state === "on";
        airerEntry.light !== lightOn &&
          ((airerEntry.light = lightOn), airerEntry.rig.setLight(lightOn), requestFrame());
      }
      syncRenderObjects();
    },
    tick(tickTime = now()) {
      hasAdvancedMotion = false;
      for (const tickEntry of airerEntries)
        tickEntry.motion &&
          (advanceMotion(tickEntry, tickTime),
          applyPose(tickEntry),
          (hasAdvancedMotion ||= !!tickEntry.motion),
          requestAnimation());
      return (syncRenderObjects(), hasAdvancedMotion);
    },
    read(readBinding: any, baseState: any) {
      const matchedEntry = airerEntries.find(
        (candidate: AirerEntry) => candidate.key === airerKey(readBinding),
      );
      return {
        ...baseState,
        estimated: baseState.position === null,
        visualPosition: matchedEntry ? panelVisualOf(matchedEntry) : null,
      };
    },
    nextDelay() {
      // 0 表示「下一帧继续」，由 requestAnimation 驱动；返回 Infinity 表示不再动。
      return airerEntries.some((activeEntry) => activeEntry.motion) ? 0 : Infinity;
    },
    dispose() {
      isDisposed = true;
      for (const disposedEntry of airerEntries)
        delete disposedEntry.model.userData.environmentOutlineMoving;
      ((airerEntries = []), syncRenderObjects(), (syncedRoot = null), (hasAdvancedMotion = false));
    },
  };
}
