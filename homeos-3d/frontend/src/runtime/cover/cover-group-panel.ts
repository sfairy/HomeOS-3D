/**
 * 窗帘组合（一拖多）的控制面板：把组合内两名成员各渲染成一块独立窗帘面板，并排或竖排呈现。
 */
import { createCoverPanel } from "./cover-panel.js";

type CoverPanelApi = {
  root: HTMLElement;
  update: (viewModel: Record<string, unknown>) => void;
  deactivate: () => void;
  dispose: () => void;
};

type CoverGroupPanelOptions = {
  element?: HTMLElement | null;
  onControl?: () => Promise<void> | void;
  onPreview?: () => void;
};

type CoverGroupViewModel = {
  item?: {
    memberItems?: Array<{ id: string; label?: string; [key: string]: unknown }>;
    panelLayout?: string;
    label?: string;
  };
  states?: Record<string, unknown>;
  presentations?: Record<string, unknown>;
  editing?: unknown;
  errors?: Record<string, string>;
};

/**
 * 创建窗帘组合面板。
 */
export function createCoverGroupPanel({
  element: hostElement,
  onControl = async () => {},
  onPreview = () => {}
}: CoverGroupPanelOptions = {}) {
  // 用宿主的 ownerDocument，面板被放进别的文档（弹窗 / 预览）时才不会造出孤儿节点。
  const ownerDocument = hostElement?.ownerDocument || globalThis.document;
  const rootElement = hostElement || ownerDocument.createElement("section");
  rootElement.classList.add("i3d-cover-group-panel");
  // 与登记表里「面板构造时一律 hidden」的约定一致：首帧 renderLightPanel 之前这块面板还没被
  rootElement.hidden = true;
  const titleElement = ownerDocument.createElement("h3");
  titleElement.className = "i3d-cover-group-title";
  rootElement.append(titleElement);
  // 组合固定两名成员，预先建好两块子面板并挂在根上。
  const memberPanels = [0, 1].map(() =>
    (createCoverPanel as (options?: Record<string, unknown>) => CoverPanelApi)({
      element: ownerDocument.createElement("section"),
      onControl,
      onPreview
    })
  );
  // 子面板同样先藏起来：第一次 update() 才按 memberItems 决定显不显示，
  memberPanels.forEach(panel => {
    panel.root.hidden = true;
  });
  memberPanels.forEach(panel => rootElement.append(panel.root));
  return {
    root: rootElement,
    update(nextViewModel: CoverGroupViewModel = {}) {
      const memberItems = nextViewModel.item?.memberItems || [];
      // 竖排 / 并排由组合配置决定，样式层只看这个类名。
      rootElement.classList.toggle(
        "is-vertical",
        nextViewModel.item?.panelLayout === "vertical"
      );
      titleElement.textContent = nextViewModel.item?.label || "双层窗帘";
      rootElement.setAttribute("aria-label", titleElement.textContent);
      memberPanels.forEach((panel, index) => {
        const memberItem = memberItems[index];
        // 成员缺失时隐藏该子面板，并停用它（取消可能进行中的拖动预览）。
        panel.root.hidden = !memberItem;
        panel.root.setAttribute("aria-label", memberItem?.label || "窗帘 " + (index + 1));
        if (memberItem) {
          panel.update({
            item: memberItem,
            // 组级视图模型按成员 id 分发状态 / 展示态 / 错误，子面板各取各的。
            state: nextViewModel.states?.[memberItem.id],
            presentation: nextViewModel.presentations?.[memberItem.id],
            editing: nextViewModel.editing,
            error: nextViewModel.errors?.[memberItem.id] || ""
          });
        } else {
          // 成员缺失时直接把子面板停用，撤销可能进行中的拖动预览。
          panel.deactivate();
        }
      });
    },
    deactivate() {
      memberPanels.forEach(panel => panel.deactivate());
    },
    dispose() {
      memberPanels.forEach(panel => panel.dispose());
      rootElement.replaceChildren();
    }
  };
}
