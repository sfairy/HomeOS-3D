/**
 * 摄像头附加面板：开关按钮 + 可见时才挂载实时流/快照。
 *
 * 实时流由 `@app/renderer/registry/camera-media` 统一处理（go2rtc / HLS / 快照回退）；
 * 面板只负责决定"该不该播"：编辑态、实体关闭、滚动出视口都主动卸载。
 */
const cameraMedia = await import("@app/renderer/registry/camera-media");
import { attributesOf, extraContextChanged, featureFlags } from "../device/entity-capabilities";
import { attachFeedback, createVisibilityGate } from "./panel-utils";
import type { ExtraPanelViewModel, FeedbackSlot } from "./panel-utils";

/** 摄像头能力位：1=支持开关；2=支持实时流。 */
const CAMERA_TURN_ON = 0x1;
const CAMERA_STREAM = 0x2;

type CameraExtraPanelOptions = {
  element: any;
  feedbackSlot?: FeedbackSlot;
  onControl?: (command: any) => Promise<any>;
  loadMedia?: () => Promise<any>;
};

function cameraPowerState(state: any) {
  const attributes = attributesOf(state);
  if (typeof attributes.is_on == "boolean") return attributes.is_on;
  if (state?.state === "off") return true;
  if (state?.state === "on") return false;
  return null;
}

export function createCameraExtraPanel({
  element: hostElement,
  feedbackSlot,
  onControl = async () => {},
  loadMedia = async () => cameraMedia,
}: CameraExtraPanelOptions = {} as any) {
  const ownerDocument = hostElement.ownerDocument || globalThis.document;
  const actionsElement = ownerDocument.createElement("div");
  const placeholderElement = ownerDocument.createElement("p");
  const errorElement = ownerDocument.createElement("p");
  const frameElement = ownerDocument.createElement("div");

  frameElement.className = "i3d-extra-camera-frame";
  placeholderElement.className = "i3d-extra-camera-placeholder";
  placeholderElement.setAttribute("role", "status");
  frameElement.append(placeholderElement);
  actionsElement.className = "i3d-extra-actions i3d-extra-camera-actions";
  errorElement.className = "i3d-climate-error";
  errorElement.setAttribute("role", "status");
  hostElement.replaceChildren(actionsElement, frameElement, errorElement);

  let viewModel: ExtraPanelViewModel | null = null;
  let pending = false;
  let generation = 0;
  let mountedSignature = "";
  let cleanupCallbacks: Array<() => void> = [];
  let disposed = false;

  const powerButtons = (
    [
      ["turn_on", "开启摄像头"],
      ["turn_off", "关闭摄像头"],
    ] as const
  ).map(([service, label]) => {
    const button = ownerDocument.createElement("button");
    button.type = "button";
    button.className = "i3d-climate-choice";
    button.textContent = label;
    actionsElement.append(button);
    button.addEventListener("click", async () => {
      if (!viewModel || button.disabled || pending) return;
      const requestGeneration = generation;
      pending = true;
      errorElement.textContent = "";
      refresh();
      try {
        await onControl({
          entityId: viewModel.item.entityId,
          domain: "camera",
          service,
          data: {},
        });
      } catch (error: any) {
        if (!disposed && requestGeneration === generation) {
          errorElement.textContent = error.message || "摄像头开关失败";
        }
      } finally {
        if (!disposed && requestGeneration === generation) {
          pending = false;
          refresh();
        }
      }
    });
    return button;
  });

  function unmountMedia() {
    generation++;
    mountedSignature = "";
    for (const cleanup of cleanupCallbacks.splice(0)) cleanup();
    frameElement.classList.remove?.("is-ready", "is-connecting", "is-unavailable", "is-suspended");
    frameElement.setAttribute("aria-busy", "false");
    frameElement.dataset.cameraState = "suspended";
    delete frameElement.dataset.cameraTransport;
    frameElement.replaceChildren(placeholderElement);
    placeholderElement.hidden = false;
  }

  async function refresh() {
    if (disposed || !viewModel) return;
    const { item, state, editing } = viewModel;
    const available =
      !!state &&
      state.available !== false &&
      typeof state.state == "string" &&
      !["", "unknown", "unavailable"].includes(state.state);
    const cameraOff = cameraPowerState(state) === false;
    const flags = featureFlags(attributesOf(state));
    actionsElement.hidden = !(flags & CAMERA_TURN_ON);

    const disabled = editing || pending || !available || item.modelAvailable === false || actionsElement.hidden;
    powerButtons[0].disabled = disabled || cameraPowerState(state) === true;
    powerButtons[1].disabled = disabled || cameraOff;

    const streamEnabled = !!(flags & CAMERA_STREAM);
    const signature = JSON.stringify([item.entityId, streamEnabled]);
    frameElement.setAttribute("aria-label", item.label || item.entityId);

    if (editing || !available || cameraOff || !gate.visible() || item.modelAvailable === false) {
      if (mountedSignature) unmountMedia();
      frameElement.dataset.cameraState = editing
        ? "preview"
        : available
          ? cameraOff
            ? "off"
            : "suspended"
          : "unavailable";
      placeholderElement.hidden = false;
      placeholderElement.textContent = editing
        ? "摄像头画面预览"
        : available
          ? cameraOff
            ? "摄像头已关闭"
            : "画面在可见时加载"
          : "摄像头不可用";
      return;
    }

    if (mountedSignature === signature || frameElement.dataset.cameraState === "connecting") return;
    unmountMedia();
    mountedSignature = signature;
    placeholderElement.textContent = "正在加载摄像头画面";
    const requestGeneration = generation;
    try {
      const media = await loadMedia();
      if (disposed || requestGeneration !== generation || !gate.visible() || viewModel.editing) return;
      const mountOptions = {
        container: frameElement,
        entityId: item.entityId,
        label: item.label || item.entityId,
        objectFit: "contain",
        placeholder: placeholderElement,
        cleanup: (cleanup: () => void) => cleanupCallbacks.push(cleanup),
      };
      if (streamEnabled) media.mountCameraMedia(mountOptions);
      else media.mountCameraSnapshot({ ...mountOptions, refreshInterval: 10 });
    } catch {
      if (!disposed && requestGeneration === generation) {
        frameElement.dataset.cameraState = "load-failed";
        placeholderElement.hidden = false;
        placeholderElement.textContent = "摄像头画面暂时无法加载，请重新打开弹窗";
      }
    }
  }

  const releaseFeedback = attachFeedback(feedbackSlot, errorElement, {
    source: () => viewModel?.item?.entityId,
    label: () => viewModel?.item?.label,
  });
  const gate = createVisibilityGate(frameElement, () => void refresh());

  return {
    root: hostElement,
    update(nextViewModel: ExtraPanelViewModel) {
      if (disposed) return;
      if (extraContextChanged(viewModel, nextViewModel)) {
        generation++;
        pending = false;
        errorElement.textContent = "";
      }
      viewModel = nextViewModel;
      void refresh();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      releaseFeedback();
      generation++;
      gate.dispose();
      unmountMedia();
      viewModel = null;
      hostElement.replaceChildren();
    },
  };
}
