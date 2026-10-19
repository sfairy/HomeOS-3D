/**
 * 扩展面板：气候 / 播放器这类"主面板 + 附加操作"的复合弹窗。
 *
 * 主面板负责设备主交互（温度、风速、播放控制），附加区补上 0.7.8 新增的
 * 参数化服务（加湿目标、播放队列、搜索媒体等）。两块都按需独立刷新。
 */
import { createClimatePanel } from "../climate/climate-panel";
import { createSpeakerPanel } from "../speaker/speaker-panel";
import { createCompoundExtraPanel } from "./compound-extra-panel";
import { createServiceExtraPanel } from "./service-extra-panel";
import type { ExtraPanelViewModel, FeedbackSlot } from "./panel-utils";

type ExtendedExtraPanelOptions = {
  element: any;
  kind: string;
  onControl: (command: any) => Promise<any>;
  feedbackSlot?: FeedbackSlot;
};

export function createExtendedExtraPanel({
  element: hostElement,
  kind,
  onControl,
  feedbackSlot,
}: ExtendedExtraPanelOptions) {
  const ownerDocument = hostElement.ownerDocument || globalThis.document;
  const primaryElement = ownerDocument.createElement("div");
  const secondaryElement = ownerDocument.createElement("div");
  hostElement.replaceChildren(primaryElement, secondaryElement);

  const primary =
    kind === "climate"
      ? createClimatePanel({
          element: primaryElement,
          onControl,
          feedbackSlot,
        })
      : createSpeakerPanel({ onControl, feedbackSlot });
  const primaryRoot = primary.root;
  if (kind !== "climate") primaryElement.append(primaryRoot);
  primaryRoot.classList.add("i3d-extra-native-panel");

  const secondary =
    kind === "climate"
      ? createCompoundExtraPanel({
          element: secondaryElement,
          onControl,
          feedbackSlot,
          hideStatus: true,
        })
      : createServiceExtraPanel({
          element: secondaryElement,
          onControl,
          feedbackSlot,
          hideStatus: true,
        });

  let viewModel: ExtraPanelViewModel | null = null;
  let disposed = false;

  // 气候主面板带实时动画与图表，滚出视口时停掉，避免弹窗缩略时仍跑 requestAnimationFrame。
  const view = ownerDocument.defaultView;
  const Observer = view?.IntersectionObserver || (globalThis as any).IntersectionObserver;
  let active = !Observer;
  const observer = Observer
    ? new Observer((entries: any[]) => {
        active = entries.some((entry) => entry.isIntersecting);
        refresh();
      })
    : null;
  observer?.observe(hostElement);

  function refresh() {
    if (!viewModel || disposed) return;
    primaryRoot.hidden = false;
    (primary as any).update?.({ ...viewModel, active });
    secondary.update(viewModel);
  }

  return {
    root: hostElement,
    update(nextViewModel: ExtraPanelViewModel) {
      viewModel = nextViewModel;
      refresh();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      observer?.disconnect?.();
      (primary as any).dispose?.();
      secondary.dispose();
      viewModel = null;
      hostElement.replaceChildren();
    },
  };
}
