/**
 * 图片实体面板：经 HA 图片代理取图，滚到可见区才加载。
 *
 * 图片走 `/api/image_proxy/<entity_id>`，带实体状态做缓存键；编辑态只显示占位，
 * 避免编辑器里反复拉流。取图失败给"重新加载图片"入口，而不是反复自动重试。
 */
import { attachFeedback, createVisibilityGate } from "./panel-utils";
import type { ExtraPanelViewModel, FeedbackSlot } from "./panel-utils";

type ImageExtraPanelOptions = {
  element: any;
  feedbackSlot?: FeedbackSlot;
  fetchImage?: (input: string, init?: RequestInit) => Promise<Response>;
};

export function createImageExtraPanel({
  element: hostElement,
  feedbackSlot,
  fetchImage = (...args) => fetch(...args),
}: ImageExtraPanelOptions) {
  const ownerDocument = hostElement.ownerDocument || globalThis.document;
  const frameElement = ownerDocument.createElement("div");
  const imageElement = ownerDocument.createElement("img");
  const placeholderElement = ownerDocument.createElement("p");
  const retryElement = ownerDocument.createElement("button");

  frameElement.className = "i3d-extra-camera-frame";
  imageElement.alt = "实体图片";
  placeholderElement.className = "i3d-extra-camera-placeholder";
  placeholderElement.setAttribute("role", "status");
  retryElement.type = "button";
  retryElement.textContent = "重新加载图片";
  retryElement.className = "i3d-climate-choice i3d-extra-image-retry";
  retryElement.hidden = true;
  frameElement.append(imageElement, placeholderElement, retryElement);
  hostElement.replaceChildren(frameElement);

  const errorElement = ownerDocument.createElement("p");
  errorElement.className = "i3d-climate-error";
  hostElement.append(errorElement);

  let viewModel: ExtraPanelViewModel | null = null;
  let disposed = false;
  let controller: AbortController | null = null;
  let objectUrl = "";
  let loadedSignature = "";
  let generation = 0;

  const releaseFeedback = attachFeedback(feedbackSlot, errorElement, {
    source: () => viewModel?.item?.entityId,
    label: () => viewModel?.item?.label,
  });

  function resetImage() {
    generation++;
    controller?.abort();
    controller = null;
    imageElement.removeAttribute("src");
    imageElement.hidden = true;
    errorElement.textContent = "";
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = "";
    loadedSignature = "";
  }

  function refresh() {
    if (disposed || !viewModel) return;
    const { item, state, editing } = viewModel;
    const available =
      !!state && state.available !== false && !["unknown", "unavailable", "", undefined].includes(state.state);

    if (editing || !gate.visible() || !available || item?.modelAvailable === false) {
      resetImage();
      retryElement.hidden = true;
      placeholderElement.hidden = false;
      placeholderElement.textContent = editing
        ? "图片预览"
        : available
          ? "图片在可见时加载"
          : "图片不可用";
      return;
    }

    const signature = JSON.stringify([item.entityId, state.state, state.updatedAt]);
    if (signature === loadedSignature) return;
    resetImage();
    loadedSignature = signature;
    controller = new AbortController();
    const signal = controller.signal;
    const requestGeneration = generation;

    placeholderElement.hidden = false;
    placeholderElement.textContent = "正在加载图片";
    retryElement.hidden = true;
    fetchImage(`/api/image_proxy/${encodeURIComponent(item.entityId)}?v=${encodeURIComponent(state.state)}`, {
      credentials: "same-origin",
      signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("图片读取失败");
        const blob = await response.blob();
        if (disposed || requestGeneration !== generation) return;
        objectUrl = URL.createObjectURL(blob);
        imageElement.onload = () => {
          if (requestGeneration !== generation) return;
          imageElement.hidden = false;
          placeholderElement.hidden = true;
        };
        imageElement.onerror = () => {
          if (requestGeneration !== generation) return;
          placeholderElement.hidden = false;
          placeholderElement.textContent = "暂无图片";
          errorElement.textContent = "图片无法显示，请重新加载";
          retryElement.hidden = false;
        };
        imageElement.src = objectUrl;
        imageElement.alt = item.label || "实体图片";
      })
      .catch((error: any) => {
        if (disposed || requestGeneration !== generation || signal.aborted) return;
        placeholderElement.textContent = "暂无图片";
        errorElement.textContent = "图片暂时无法读取，请重新加载";
        retryElement.hidden = false;
      })
      .finally(() => {
        if (requestGeneration === generation) controller = null;
      });
  }

  retryElement.addEventListener("click", () => {
    resetImage();
    refresh();
  });

  const gate = createVisibilityGate(frameElement, refresh);

  return {
    root: hostElement,
    update(nextViewModel: ExtraPanelViewModel) {
      viewModel = nextViewModel;
      refresh();
    },
    dispose() {
      disposed = true;
      releaseFeedback();
      gate.dispose();
      resetImage();
      viewModel = null;
      hostElement.replaceChildren();
    },
  };
}
