/** 配置入口的楼层选择：单楼层直接进入，多楼层弹原生 dialog（Esc / 取消 / 页面离开都返回 null）。 */
export function chooseConfigurationFloor(
  floors: { id: string; name?: string }[] | null | undefined,
  { document: ownerDocument = globalThis.document, signal }: { document?: Document; signal?: AbortSignal } = {},
): Promise<string | null> {
  if (signal?.aborted) return Promise.resolve(null);
  if (!floors?.length)
    return Promise.reject(new Error("户型没有可配置的楼层，请重新载入户型。"));
  if (floors.length === 1) return Promise.resolve(floors[0].id);

  return new Promise((resolve) => {
    const create = (tagName: string, textContent = "", className = ""): any => {
      const node = ownerDocument.createElement(tagName);
      node.textContent = textContent;
      node.className = className;
      return node;
    };
    const dialogElement = create(
      "dialog",
      "",
      "settings-dialog i3d-performance-dialog i3d-floor-entry-dialog",
    );
    dialogElement.setAttribute("aria-label", "选择配置楼层");
    const headingElement = create("h2", "选择配置楼层");
    const optionsElement = create("div", "", "i3d-floor-entry-options");
    let settled = false;

    const finish = (floorId: string | null) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", cancel);
      ownerDocument.defaultView?.removeEventListener("pagehide", cancel);
      dialogElement.close();
      dialogElement.remove();
      resolve(floorId);
    };
    const cancel = () => finish(null);

    for (const floor of floors) {
      const optionButton = create("button", floor.name || "未命名楼层");
      optionButton.type = "button";
      optionButton.addEventListener("click", () => finish(floor.id));
      optionsElement.append(optionButton);
    }
    const actionsElement = create("div", "", "dialog-actions");
    const cancelButton = create("button", "取消");
    cancelButton.type = "button";
    cancelButton.addEventListener("click", cancel);
    actionsElement.append(cancelButton);
    dialogElement.append(headingElement, optionsElement, actionsElement);
    dialogElement.addEventListener("cancel", (cancelEvent: Event) => {
      cancelEvent.preventDefault();
      cancel();
    });
    dialogElement.addEventListener("close", cancel);
    signal?.addEventListener("abort", cancel, { once: true });
    ownerDocument.defaultView?.addEventListener("pagehide", cancel, { once: true });
    ownerDocument.body.append(dialogElement);
    dialogElement.showModal();
    (optionsElement.children[0] as HTMLElement | undefined)?.focus();
  });
}
