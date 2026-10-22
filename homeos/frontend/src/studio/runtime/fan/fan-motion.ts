import { createAnimationCadence } from "../core/animation-work";
import { createExtractorAirflow } from "../environment/exhaust-airflow";
import { exhaustFanState } from "../climate/climate-state";
import { fanMotionState, resolveFanBindingState } from "./fan-state";

const FAN_MODEL_TYPES = new Set(["fan", "ceiling-fan", "exhaust-fan"]),
  /**
   * 排气扇的扇叶转速**不看 HA 上报**：开关型实体没有百分比，`fan.*` 的百分比也不参与
   * 视觉，固定按 40% 折算（`-(3 + 40 × 0.16)` ≈ -9.4 rad/s，与吊扇同一公式）。
   */
  EXHAUST_FIXED_PERCENTAGE = 40;

export function createFanMotion({
  THREE: three = null,
  requestFrame: onRequestFrame = () => {},
  requestAnimation: onRequestAnimation = onRequestFrame,
  setRenderObjects: onSetRenderObjects = (_renderObjects: any[]) => {},
  isVisible: isModelInView = (_target: any) => true,
  reducedMotion: prefersReducedMotion = () =>
    globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
}: {
  THREE?: any;
  requestFrame?: (...args: any[]) => any;
  requestAnimation?: (...args: any[]) => any;
  setRenderObjects?: (renderObjects: any[]) => void;
  isVisible?: (target: any) => boolean;
  reducedMotion?: () => boolean;
} = {}) {
  let currentSceneRoot: any,
    currentRevision: any,
    fanModels: any = [],
    isAnimating = false,
    isDisposed = false,
    lastFrameTimestamp: any = null;
  // 30fps 节拍：同一帧被多次回调时不重复推进角度（0.7.8 `animation-work`）。
  const animationCadence = createAnimationCadence(),
    isNodeVisible = (sceneNode: any) => {
      for (let currentNode = sceneNode; currentNode; currentNode = currentNode.parent) {
        if (currentNode.visible === false) return false;
        if (currentNode === currentSceneRoot) return isModelInView(sceneNode);
      }
      return false;
    },
    isOutlineMoving = (fanEntry: any) =>
      !prefersReducedMotion() &&
      isNodeVisible(fanEntry.model) &&
      (fanEntry.state.on ||
        ((fanEntry.ceiling || fanEntry.exhaust) && Math.abs(fanEntry.velocity) >= 0.01)),
    /** 吊扇 / 排气扇是「惯性」模型，落地扇没有；只有它们要按 `velocity` 收尾。 */
    hasInertia = (fanEntry: any) => fanEntry.ceiling || fanEntry.exhaust,
    resetFanAnimations = () =>
      fanModels.forEach((fanEntry: any) => {
        /** 排气扇的气幕是本控制器持有的资源，换场景 / 销毁时必须真的释放。 */
        fanEntry.flow?.dispose();
        fanEntry.yaw && (fanEntry.yaw.rotation.y = 0);
        fanEntry.rotor &&
          hasInertia(fanEntry) &&
          (fanEntry.rotor.rotation[fanEntry.exhaust ? "z" : "y"] = 0);
        fanEntry.velocity = 0;
        delete fanEntry.model.userData.environmentOutlineMoving;
      }),
    /**
     * 把"当前真正需要逐帧渲染的部件"交给宿主：吊扇 / 排气扇在惯性未归零时仍要渲染，
     * 落地扇只在运行时才算；气幕可见时把气幕网格也带上。
     */
    publishRenderObjects = () => {
      let hasChanged = false;
      const renderObjects: any[] = [];
      for (const fanEntry of fanModels) {
        const isActive =
            !prefersReducedMotion() &&
            (fanEntry.state.on || (hasInertia(fanEntry) && Math.abs(fanEntry.velocity) >= 0.01)),
          renderObject =
            (isActive &&
              (fanEntry.state.on && fanEntry.state.oscillating && fanEntry.yaw
                ? fanEntry.yaw
                : fanEntry.rotor)) ||
            null,
          isFlowVisible = !!fanEntry.flow?.mesh.visible;
        (fanEntry.renderObject !== renderObject &&
          ((fanEntry.renderObject = renderObject), (hasChanged = true)),
          fanEntry.renderFlowObject !== isFlowVisible &&
            ((fanEntry.renderFlowObject = isFlowVisible), (hasChanged = true)),
          renderObject && renderObjects.push(renderObject),
          isFlowVisible && fanEntry.flow && renderObjects.push(fanEntry.flow.mesh));
      }
      hasChanged && onSetRenderObjects(renderObjects);
    };
  return {
    sync({
      root: sceneRoot,
      revision: revision,
      bindings: modelBindings = [],
      states: statesByEntityId = {},
    }: any) {
      if (isDisposed) return;
      const needsRebuild = currentSceneRoot !== sceneRoot || currentRevision !== revision;
      needsRebuild &&
        (resetFanAnimations(),
        (currentSceneRoot = sceneRoot),
        (currentRevision = revision),
        (fanModels = []),
        (lastFrameTimestamp = null),
        currentSceneRoot?.traverse((fanNode: any) => {
          const modelType =
            fanNode.userData?.environmentModelType || fanNode.userData?.itemType;
          if (!FAN_MODEL_TYPES.has(modelType)) return;
          const fanType = modelType === "exhaust-fan" ? "exhaust-fan" : modelType,
            isExhaust = fanType === "exhaust-fan",
            isCeiling = fanType === "ceiling-fan",
            fanModel: any = {
              model: fanNode,
              exhaust: isExhaust,
              ceiling: isCeiling,
              swingTime: 0,
              velocity: 0,
              visualMode: isCeiling ? "ceiling" : isExhaust ? "exhaust" : "tower",
              state: fanMotionState(null, { modelType: fanType }),
            };
          (fanNode.traverse((fanPartNode: any) => {
            fanPartNode.userData?.fanPart &&
              ((fanModel as any)[fanPartNode.userData.fanPart] = fanPartNode);
          }),
            /**
             * 向内气幕挂在转子父节点上（跟着外壳走，不跟着叶片转）：
             * 尺寸按 0.34 建模、颜色取冷灰，与 0.8.0 的取值一致。
             */
            isExhaust &&
              three &&
              fanModel.rotor &&
              ((fanModel.flow = createExtractorAirflow(three, 0.34, 0xc0cad7)),
              fanModel.rotor.parent?.add(fanModel.flow.mesh)),
            fanModels.push(fanModel));
        }));
      let hasStateChange = false;
      for (const syncFanModel of fanModels) {
        const matchedBinding = modelBindings.find(
            (binding: any) =>
              binding.floorId === syncFanModel.model.userData.environmentFloorId &&
              binding.modelId === syncFanModel.model.userData.environmentModelId,
          ),
          nextMotionState = syncFanModel.exhaust
            ? exhaustFanState(matchedBinding || {}, statesByEntityId)
            : matchedBinding
              ? resolveFanBindingState(
                  {
                    ...matchedBinding,
                    modelType: syncFanModel.model.userData?.environmentModelType,
                    visualMode: syncFanModel.visualMode,
                  },
                  statesByEntityId,
                )
              : fanMotionState(null, { visualMode: syncFanModel.visualMode }),
          // 动画开关跟 running；排气扇固定 40% / 正转，忽略 HA 上报的风速与方向。
          motionView = {
            ...nextMotionState,
            on: !!(nextMotionState as any).running,
            percentage: syncFanModel.exhaust
              ? EXHAUST_FIXED_PERCENTAGE
              : ((nextMotionState as any).percentage ?? 40),
            direction: syncFanModel.exhaust ? 1 : (nextMotionState as any).direction,
          };
        (JSON.stringify(motionView) !== JSON.stringify(syncFanModel.state) &&
          (hasStateChange = true),
          (syncFanModel.state = motionView),
          /**
           * 实体不可用或本模型还没绑定时，残留的转速要立刻归零 —— 否则设备离线后扇叶
           * 会一直惯性转下去（0.8.0 同款处理）。
           */
          (!(nextMotionState as any).available || !matchedBinding) &&
            (syncFanModel.velocity = 0),
          syncFanModel.flow &&
            ((!(nextMotionState as any).available || !matchedBinding || prefersReducedMotion()) &&
              syncFanModel.flow.reset(),
            syncFanModel.flow.configure(
              !!motionView.on && !prefersReducedMotion(),
              true,
            )),
          (syncFanModel.model.userData.environmentOutlineMoving = isOutlineMoving(syncFanModel)));
      }
      (publishRenderObjects(),
        hasStateChange && (animationCadence.reset(), onRequestFrame()));
    },
    tick(timestampMs: any) {
      if (isDisposed) return false;
      // 整棵场景树都不可见时不必推进动画，也不必继续请求帧。
      if (!fanModels.some((fanEntry: any) => isNodeVisible(fanEntry.model)))
        return (
          (isAnimating = false),
          (lastFrameTimestamp = null),
          animationCadence.reset(),
          false
        );
      // 未到 30fps 阈值：保持上一帧的"是否在动"，但不再累加角度。
      if (animationCadence.take(timestampMs) === null) return isAnimating;
      const frameDeltaSeconds =
        lastFrameTimestamp === null
          ? 0
          : Math.max(0, Math.min(0.08, (timestampMs - lastFrameTimestamp) / 1000));
      if (((lastFrameTimestamp = timestampMs), (isAnimating = false), prefersReducedMotion()))
        return (
          fanModels.forEach((fanEntry: any) => {
            fanEntry.model.userData.environmentOutlineMoving = false;
            fanEntry.flow?.reset();
          }),
          publishRenderObjects(),
          false
        );
      for (const tickFanModel of fanModels) {
        tickFanModel.model.userData.environmentOutlineMoving =
          isOutlineMoving(tickFanModel);
        if (!isNodeVisible(tickFanModel.model)) continue;
        if (tickFanModel.flow) {
          const wasFlowVisible = tickFanModel.flow.mesh.visible;
          (tickFanModel.flow.configure(tickFanModel.state.on, true),
            (isAnimating = tickFanModel.flow.update(frameDeltaSeconds) || isAnimating),
            wasFlowVisible !== tickFanModel.flow.mesh.visible && publishRenderObjects());
        }
        if (hasInertia(tickFanModel)) {
          if (!tickFanModel.rotor) continue;
          // 吊扇 / 排气扇共用指数收敛的速度模型：停机后有可见惯性，而不是硬切。
          const targetVelocity = tickFanModel.state.on
              ? -tickFanModel.state.direction *
                (3 + tickFanModel.state.percentage * 0.16)
              : 0,
            settleRate = targetVelocity ? 5 : 3,
            velocityDecay = Math.exp(-settleRate * frameDeltaSeconds),
            rotationDelta =
              targetVelocity * frameDeltaSeconds +
              ((tickFanModel.velocity - targetVelocity) * (1 - velocityDecay)) / settleRate;
          (tickFanModel.velocity =
            targetVelocity + (tickFanModel.velocity - targetVelocity) * velocityDecay),
            !targetVelocity &&
              Math.abs(tickFanModel.velocity) < 0.01 &&
              (tickFanModel.velocity = 0),
            (tickFanModel.model.userData.environmentOutlineMoving =
              isOutlineMoving(tickFanModel)),
            /** 吊扇绕 Y 轴、排气扇绕 Z 轴（扇面朝 +Z，见 GLB `extras.frontAxis`）。 */
            (tickFanModel.rotor.rotation[tickFanModel.exhaust ? "z" : "y"] =
              (tickFanModel.rotor.rotation[tickFanModel.exhaust ? "z" : "y"] +
                rotationDelta) %
              (Math.PI * 2)),
            (isAnimating ||=
              targetVelocity !== 0 || tickFanModel.velocity !== 0);
          continue;
        }
        tickFanModel.state.on &&
          ((isAnimating = true),
          tickFanModel.rotor &&
            (tickFanModel.rotor.rotation.z =
              (tickFanModel.rotor.rotation.z -
                tickFanModel.state.direction *
                  (3 + tickFanModel.state.percentage * 0.16) *
                  frameDeltaSeconds) %
              (Math.PI * 2)),
          tickFanModel.yaw &&
            tickFanModel.state.oscillating &&
            ((tickFanModel.swingTime += frameDeltaSeconds),
            (tickFanModel.yaw.rotation.y =
              (Math.sin(tickFanModel.swingTime * 0.6) * Math.PI) / 4)));
      }
      return (publishRenderObjects(), isAnimating && onRequestAnimation(), isAnimating);
    },
    nextDelay() {
      return isAnimating ? 1000 / 30 : Infinity;
    },
    dispose() {
      isDisposed ||
        ((isDisposed = true),
        resetFanAnimations(),
        onSetRenderObjects([]),
        (fanModels = []),
        (currentSceneRoot = null),
        (isAnimating = false),
        (lastFrameTimestamp = null));
    },
  };
}
