/* 实体选项列表（弹窗模块 / 弹窗动作共用同一套「主按钮 + 名称行 + id 行」结构） */

interface EntityOptionListEntity {
  entityId: string;
}

interface EntityOptionListDeps<T extends EntityOptionListEntity> {
  runQueue: (entity: T) => string;
  runSnapshot: (entity: T) => string;
  runAlt: (button: HTMLElement, nameLine: HTMLElement) => void;
}

interface EntityOptionListOptions<T extends EntityOptionListEntity> {
  selectedId: T["entityId"];
  datasetKey: "popupModuleEntityId" | "popupActionEntityId";
  deps: EntityOptionListDeps<T>;
}

export function renderEntityOptionButtons<T extends EntityOptionListEntity>(
  container: HTMLElement,
  items: readonly T[],
  { selectedId, datasetKey, deps }: EntityOptionListOptions<T>,
) {
  container.replaceChildren(
    ...items.map((entity) => {
      const button = document.createElement("button");
      ((button.type = "button"),
        (button.className =
          "inspector-entity-option" + (entity.entityId === selectedId ? " selected" : "")),
        (button.dataset[datasetKey] = entity.entityId),
        button.setAttribute("role", "option"),
        button.setAttribute("aria-selected", String(entity.entityId === selectedId)));
      const content = document.createElement("span");
      content.className = "inspector-entity-option-content";
      const nameLine = document.createElement("span");
      ((nameLine.className = "inspector-entity-option-line inspector-entity-name-line"),
        (nameLine.textContent =
          "[" + deps.runQueue(entity) + "] " + deps.runSnapshot(entity)));
      const idLine = document.createElement("span");
      return (
        (idLine.className = "inspector-entity-option-line inspector-entity-id"),
        (idLine.textContent = entity.entityId),
        content.append(nameLine, idLine),
        deps.runAlt(button, nameLine),
        button.append(content),
        button
      );
    }),
  );
}
