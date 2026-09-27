/*
 * 灯光状态解算。
 */

type LightBinding = {
  id: string;
  entityId?: string;
  [key: string]: unknown;
};

type LightSnapshot = {
  on?: boolean;
  available?: boolean;
  brightness?: number;
  brightnessSupported?: boolean;
  temperatureSupported?: boolean;
  kelvin?: number;
  minimum?: number;
  maximum?: number;
  [key: string]: unknown;
};

type LightStateCtx = {
  lightStateCache: {
    resolve: (entityId: string, state: unknown) => LightSnapshot;
  };
  statesByEntityId: Record<string, unknown>;
  lightPreview: {
    state: (entityId: string, base: LightSnapshot) => LightSnapshot;
  };
  isEditing: boolean;
  isViewEditing: boolean;
  focusMode?: string | null;
  lightEffectPreview?: {
    id?: string;
    kind: string;
  } | null;
  stageOptions: {
    floorTransitionActive?: boolean;
    floorEffectsFollow?: boolean;
    setEditorEffects?: (previewMode: boolean, hasPreviewLight: boolean) => void;
    setLightStates: (lights: unknown[], options?: unknown) => void;
  };
  cameraTransition?: { owner?: string } | null;
  config: { lights?: LightBinding[] };
  lightRenderState: (state: LightSnapshot) => Record<string, unknown>;
};

export function createLightStateReaders(ctx: LightStateCtx) {
  const readLightState = (entityId: string) =>
    ctx.lightStateCache.resolve(entityId || "", ctx.statesByEntityId[entityId]);

  // 一帧里要用的灯状态：正在预览灯光效果时用预览值覆盖真实值，
  const resolveLightState = (lightEntityId: string) =>
    ctx.lightPreview.state(lightEntityId, readLightState(lightEntityId));

  // 取某盏灯的渲染状态：编辑态下若正在预览该灯的灯光效果，强制按「开且可用」渲染，
  function lightStateForBinding(lightBinding: LightBinding) {
    const lightSnapshot = resolveLightState(lightBinding.entityId || "");
    if (ctx.isEditing && ctx.lightEffectPreview?.id === lightBinding.id) {
      lightSnapshot.on = true;
      lightSnapshot.available = true;
      if (ctx.lightEffectPreview.kind !== "defaults") {
        lightSnapshot.brightness = ctx.lightEffectPreview.kind === "brightnessMin" ? 1 : 100;
      }
      if (ctx.lightEffectPreview.kind.startsWith("brightness")) {
        lightSnapshot.brightnessSupported = true;
      }
      if (ctx.lightEffectPreview.kind.startsWith("temperature")) {
        lightSnapshot.temperatureSupported = true;
        lightSnapshot.kelvin = ctx.lightEffectPreview.kind.endsWith("Min")
          ? lightSnapshot.minimum
          : lightSnapshot.maximum;
      }
    }
    return lightSnapshot;
  }

  // 把灯光状态铺到 3D 场景；preview 表示允许采用本地预览值（滑杆拖动中）。
  function applyLightStates(options?: Record<string, unknown>) {
    const previewMode = ctx.isEditing || ctx.isViewEditing;
    const previewLightId =
      previewMode && !ctx.isViewEditing && ctx.focusMode !== "edit" ? ctx.lightEffectPreview?.id : null;
    ctx.stageOptions.setEditorEffects?.(previewMode, !!previewLightId);
    if (
      (!ctx.stageOptions.floorTransitionActive && ctx.cameraTransition?.owner !== "floor") ||
      !!ctx.stageOptions.floorEffectsFollow
    ) {
      ctx.stageOptions.setLightStates(
        (ctx.config.lights || [])
          .filter((light: LightBinding) => light.entityId)
          .map((lightStateEntry: LightBinding) => {
            const lightState = lightStateForBinding(lightStateEntry);
            return {
              ...lightStateEntry,
              ...(ctx.isEditing && ctx.lightEffectPreview?.id === lightStateEntry.id
                ? lightState
                : ctx.lightRenderState(lightState)),
              ...(previewMode && lightStateEntry.id !== previewLightId
                ? {
                    on: false
                  }
                : {})
            };
          }),
        previewMode
          ? {
              ...options,
              editor: true,
              immediate: true
            }
          : options
      );
    }
  }
  return { applyLightStates, lightStateForBinding, readLightState, resolveLightState };
}
