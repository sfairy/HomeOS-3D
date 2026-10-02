import { createCoverPanel } from "./cover-panel";
/** 分组面板的宿主元素与回调。 */
type CoverGroupPanelOptions = {
  element?: any;
  onControl?: (...args: any[]) => any;
  onPreview?: (...args: any[]) => any;
};

/** 分组面板一次 update 的输入：分组条目 + 各成员的实时状态。 */
type CoverGroupUpdateState = {
  /** 分组条目：memberItems / panelLayout / label。 */
  item?: any;
  /** 成员 id → cover 状态。 */
  states?: Record<string, any>;
  /** 成员 id → 展示状态（位置 / 角度等）。 */
  presentations?: Record<string, any>;
  /** 是否处于编辑态。 */
  editing?: boolean;
  /** 成员 id → 错误文案。 */
  errors?: Record<string, any>;
};

export function createCoverGroupPanel({
  element: panelElement,
  onControl: onControl = async () => {},
  onPreview: onPreview = () => {},
}: CoverGroupPanelOptions = {}) {
  const documentNode = panelElement?.ownerDocument || globalThis.document,
    rootElement = panelElement || documentNode.createElement("section");
  rootElement.classList.add("i3d-cover-group-panel");
  const titleElement = documentNode.createElement("h3");
  ((titleElement.className = "i3d-cover-group-title"), rootElement.append(titleElement));
  const panels = [0, 1].map(() =>
    createCoverPanel({
      element: documentNode.createElement("section"),
      onControl: onControl,
      onPreview: onPreview,
    }),
  );
  return (
    panels.forEach((mountedPanel) => rootElement.append(mountedPanel.root)),
    {
      root: rootElement,
      update(state: CoverGroupUpdateState = {}) {
        const memberItems = state.item?.memberItems || [];
        (rootElement.classList.toggle("is-vertical", state.item?.panelLayout === "vertical"),
          (titleElement.textContent = state.item?.label || "双层窗帘"),
          rootElement.setAttribute("aria-label", titleElement.textContent),
          panels.forEach((layerPanel, index) => {
            const member = memberItems[index];
            ((layerPanel.root.hidden = !member),
              layerPanel.root.setAttribute("aria-label", member?.label || "窗帘 " + (index + 1)),
              member
                ? layerPanel.update({
                    item: member,
                    state: state.states?.[member.id],
                    presentation: state.presentations?.[member.id],
                    editing: state.editing,
                    error: state.errors?.[member.id] || "",
                  })
                : layerPanel.deactivate());
          }));
      },
      deactivate() {
        panels.forEach((deactivatedPanel) => deactivatedPanel.deactivate());
      },
      dispose() {
        (panels.forEach((disposedPanel) => disposedPanel.dispose()), rootElement.replaceChildren());
      },
    }
  );
}
