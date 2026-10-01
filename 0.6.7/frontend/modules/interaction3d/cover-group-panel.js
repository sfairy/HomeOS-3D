import { createCoverPanel } from "./cover-panel.js?v=20260925-cover-axis-v1-20260926-airer-v2";
export function createCoverGroupPanel({
  element: panelElement,
  onControl: onControl = async () => {},
  onPreview: onPreview = () => {},
} = {}) {
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
      update(state = {}) {
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
