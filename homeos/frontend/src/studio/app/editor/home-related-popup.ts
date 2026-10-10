/** Device popup related-entity picker. */
import { findComponent as findComponent2 } from "./component-tree";
import {
  RELATED_ENTITY_DOMAIN_LABELS as RELATED_ENTITY_DOMAIN_LABELS2,
  manualRelatedEntityConfig as manualRelatedEntityConfig2,
  relatedEntityIsAvailable as relatedEntityIsAvailable2,
  relatedEntityLabel as relatedEntityLabel2,
  relatedEntityNeedsConfirmation as relatedEntityNeedsConfirmation2,
  relatedPopupCandidates as relatedPopupCandidates2,
  relatedPopupContext as relatedPopupContext2,
  relatedPopupSelectionLimit as relatedPopupSelectionLimit2,
  selectedRelatedEntityIds as selectedRelatedEntityIds2,
} from "../shared/related-entities";

export interface RelatedPopupContext {
  get entities(): any[];
  get devices(): any[];
  getSelectedComponentId: () => any;
  removedComponent: () => any;
  mutateDocument: (mutateDraft: (draftDocument: any) => void) => void;
  runAlt: (panel: any, aux: any) => void;
  runSnapshot: (sample: any, preview?: string) => string;
}

let relatedPopupCtx: RelatedPopupContext | null = null;

let relatedPopupElement: any = null,
  relatedPopupTitleElement: any = null,
  relatedPopupSummaryElement: any = null,
  relatedPopupHintElement: any = null,
  relatedPopupListElement: any = null,
  relatedPopupOpenButtonElement: any = null,
  relatedPopupDialogElement: any = null,
  relatedPopupDialogTitleElement: any = null,
  relatedPopupSearchInputElement: any = null;

function entitiesByEntityId() {
  const ctx = relatedPopupCtx!;
  return new Map(
    ctx.entities
      .map((entityRecord: any) => [String(entityRecord.entityId || ""), entityRecord] as const)
      .filter(([entityValue]: any) => entityValue),
  );
}

function devicesByDeviceId() {
  const ctx = relatedPopupCtx!;
  return new Map(
    ctx.devices
      .map((deviceRecord: any) => [String(deviceRecord.deviceId || ""), deviceRecord] as const)
      .filter(([deviceValue]: any) => deviceValue),
  );
}

function filterRelatedEntityOptions() {
  const searchTerm = String(relatedPopupSearchInputElement?.value || "")
    .trim()
    .toLocaleLowerCase("zh-CN");
  let visibleCount = 0;
  for (const optionElement of relatedPopupListElement?.querySelectorAll(
    "[data-related-entity-id]",
  ) || []) {
    const isVisible =
      !searchTerm || String(optionElement.dataset.relatedEntitySearch || "").includes(searchTerm);
    ((optionElement.hidden = !isVisible), isVisible && (visibleCount += 1));
  }
  const filterEmptyElement = relatedPopupListElement?.querySelector(
    ".popup-related-entity-filter-empty",
  );
  filterEmptyElement && (filterEmptyElement.hidden = visibleCount > 0);
}

function ensureRelatedPopupElement() {
  if (relatedPopupElement) return relatedPopupElement;
  const ctx = relatedPopupCtx!;
  ((relatedPopupElement = document.createElement("div")),
    (relatedPopupElement.id = "popup-related-entity-settings"),
    (relatedPopupElement.className = "popup-related-entity-settings"),
    (relatedPopupTitleElement = document.createElement("strong")),
    (relatedPopupSummaryElement = document.createElement("span")),
    (relatedPopupOpenButtonElement = document.createElement("button")),
    (relatedPopupOpenButtonElement.type = "button"),
    (relatedPopupOpenButtonElement.className = "popup-related-entity-open"));
  const arrowIconElement = document.createElement("i");
  (arrowIconElement.setAttribute("aria-hidden", "true"),
    (arrowIconElement.textContent = "›"),
    relatedPopupOpenButtonElement.append(relatedPopupSummaryElement, arrowIconElement),
    (relatedPopupHintElement = document.createElement("p")),
    relatedPopupElement.append(
      relatedPopupTitleElement,
      relatedPopupOpenButtonElement,
      relatedPopupHintElement,
    ),
    (relatedPopupDialogElement = document.createElement("dialog")),
    (relatedPopupDialogElement.id = "popup-related-entity-dialog"),
    (relatedPopupDialogElement.className = "popup-related-entity-dialog"));
  const dialogCardElement = document.createElement("div");
  dialogCardElement.className = "popup-related-entity-dialog-card";
  const dialogHeadingElement = document.createElement("div");
  dialogHeadingElement.className = "popup-related-entity-dialog-heading";
  const headingTextElement = document.createElement("div");
  relatedPopupDialogTitleElement = document.createElement("strong");
  const headingHintElement = document.createElement("span");
  ((headingHintElement.textContent = "选择要放进设备弹窗的功能"),
    headingTextElement.append(relatedPopupDialogTitleElement, headingHintElement));
  const closeButtonElement = document.createElement("button");
  ((closeButtonElement.type = "button"),
    closeButtonElement.setAttribute("aria-label", "关闭关联功能选择"),
    (closeButtonElement.textContent = "×"),
    dialogHeadingElement.append(headingTextElement, closeButtonElement));
  const searchLabelElement = document.createElement("label");
  ((searchLabelElement.className = "popup-related-entity-dialog-search"),
    (relatedPopupSearchInputElement = document.createElement("input")),
    (relatedPopupSearchInputElement.type = "search"),
    (relatedPopupSearchInputElement.name = "popup-related-entity-search"),
    (relatedPopupSearchInputElement.placeholder = "搜索功能名称或实体 ID"),
    (relatedPopupSearchInputElement.autocomplete = "off"),
    searchLabelElement.append(relatedPopupSearchInputElement),
    (relatedPopupListElement = document.createElement("div")),
    (relatedPopupListElement.className = "popup-related-entity-list"));
  const dialogFooterElement = document.createElement("div");
  dialogFooterElement.className = "popup-related-entity-dialog-footer";
  const doneButtonElement = document.createElement("button");
  return (
    (doneButtonElement.type = "button"),
    (doneButtonElement.textContent = "完成"),
    dialogFooterElement.append(doneButtonElement),
    dialogCardElement.append(
      dialogHeadingElement,
      searchLabelElement,
      relatedPopupListElement,
      dialogFooterElement,
    ),
    relatedPopupDialogElement.append(dialogCardElement),
    document.body.append(relatedPopupDialogElement),
    relatedPopupOpenButtonElement.addEventListener("click", () => {
      relatedPopupDialogElement.open ||
        ((relatedPopupSearchInputElement.value = ""),
        filterRelatedEntityOptions(),
        relatedPopupDialogElement.showModal(),
        window.requestAnimationFrame(() =>
          relatedPopupSearchInputElement.focus({
            preventScroll: true,
          }),
        ));
    }),
    relatedPopupSearchInputElement.addEventListener("input", filterRelatedEntityOptions),
    closeButtonElement.addEventListener("click", () => relatedPopupDialogElement.close()),
    doneButtonElement.addEventListener("click", () => relatedPopupDialogElement.close()),
    relatedPopupDialogElement.addEventListener("click", (dialogClickEvent: any) => {
      dialogClickEvent.target === relatedPopupDialogElement && relatedPopupDialogElement.close();
    }),
    relatedPopupListElement.addEventListener("click", (listClickEvent: any) => {
      const relatedOptionElement = listClickEvent.target.closest("[data-related-entity-id]"),
        activeComponentId = ctx.getSelectedComponentId();
      if (!relatedOptionElement || !activeComponentId || relatedOptionElement.disabled) return;
      const entityMap = String(relatedOptionElement.dataset.relatedEntityId || ""),
        deviceMap = ctx.removedComponent(),
        rs2 = entitiesByEntityId(),
        as2 = devicesByDeviceId();
      if (!relatedPopupContext2(deviceMap, rs2, as2)) return;
      const configuredRelatedIds = selectedRelatedEntityIds2(deviceMap),
        selectedIdSet = new Set(configuredRelatedIds === null ? [] : configuredRelatedIds),
        popup = relatedPopupContext2(deviceMap, rs2, as2),
        selectionLimit = relatedPopupSelectionLimit2(popup);
      if (selectedIdSet.has(entityMap)) selectedIdSet.delete(entityMap);
      else {
        if (!selectionLimit || selectedIdSet.size < selectionLimit) selectedIdSet.add(entityMap);
        else return;
      }
      ctx.mutateDocument((draftDocument: any) => {
        const targetComponent = findComponent2(draftDocument, activeComponentId)?.component;
        targetComponent &&
          (targetComponent.properties = {
            ...(targetComponent.properties || {}),
            relatedEntities: manualRelatedEntityConfig2([...selectedIdSet]),
          });
      });
    }),
    relatedPopupElement
  );
}

export function updateRelatedPopup(editedComponent: any, anchorElement: any) {
  const ctx = relatedPopupCtx!;
  const lL2 = ensureRelatedPopupElement(),
    rs3 = entitiesByEntityId(),
    as3 = devicesByDeviceId(),
    related = relatedPopupContext2(editedComponent, rs3, as3);
  if (!related || !anchorElement) {
    ((lL2.hidden = true), relatedPopupDialogElement?.open && relatedPopupDialogElement.close());
    return;
  }
  (lL2.previousElementSibling !== anchorElement &&
    anchorElement.insertAdjacentElement("afterend", lL2),
    (lL2.hidden = false));
  const storedRelatedIds = selectedRelatedEntityIds2(editedComponent),
    isAutomaticSelection = storedRelatedIds === null,
    currentRelatedIdSet = new Set(isAutomaticSelection ? [] : storedRelatedIds),
    popupSelectionLimit = relatedPopupSelectionLimit2(related),
    isLimitReached = popupSelectionLimit > 0 && currentRelatedIdSet.size >= popupSelectionLimit,
    candidateEntities = relatedPopupCandidates2(editedComponent, rs3, as3),
    knownEntityIdSet = new Set(
      candidateEntities.map((candidateEntityRecord) => candidateEntityRecord.entityId),
    );
  for (const relatedEntityId of currentRelatedIdSet)
    knownEntityIdSet.has(relatedEntityId) ||
      candidateEntities.push({
        entityId: relatedEntityId,
        domain: String(relatedEntityId).split(".", 1)[0],
        name: relatedEntityId,
        status: "missing",
      });
  ((relatedPopupTitleElement.textContent = related.deviceLabel + "弹窗功能"),
    (relatedPopupSummaryElement.textContent = isAutomaticSelection
      ? "自动适配"
      : "已选 " +
        currentRelatedIdSet.size +
        (popupSelectionLimit ? " / " + popupSelectionLimit : "") +
        " 项"),
    relatedPopupSummaryElement.classList.toggle("is-automatic", isAutomaticSelection),
    (relatedPopupHintElement.textContent = isAutomaticSelection
      ? "当前沿用原来的自动适配，点击可改为手动选择。"
      : "只显示已勾选的关联功能" +
        (popupSelectionLimit ? "，最多 " + popupSelectionLimit + " 项" : "") +
        "。"),
    (relatedPopupDialogTitleElement.textContent =
      related.deviceLabel +
      "弹窗功能 · " +
      (isAutomaticSelection
        ? "自动适配"
        : "已选 " +
          currentRelatedIdSet.size +
          (popupSelectionLimit ? " / " + popupSelectionLimit : "") +
          " 项")));
  const optionButtons: HTMLElement[] = candidateEntities.map((candidate) => {
    const isSelected = currentRelatedIdSet.has(candidate.entityId),
      isAvailable = relatedEntityIsAvailable2(candidate),
      candidateButton = document.createElement("button");
    candidateButton.type = "button";
    const isDisabledByLimit = isLimitReached && !isSelected;
    ((candidateButton.className =
      "popup-related-entity-option" +
      (isSelected ? " selected" : "") +
      (isAvailable ? "" : " unavailable") +
      (isDisabledByLimit ? " limit-reached" : "")),
      (candidateButton.dataset.relatedEntityId = candidate.entityId),
      candidateButton.setAttribute("aria-pressed", String(isSelected)),
      (candidateButton.disabled = (!isAvailable && !isSelected) || isDisabledByLimit));
    const iconElement = document.createElement("i");
    iconElement.setAttribute("aria-hidden", "true");
    const labelElement = document.createElement("span"),
      entityNameElement = document.createElement("strong"),
      entityLabel = relatedEntityLabel2(related, candidate);
    entityNameElement.textContent = ctx.runSnapshot(candidate, entityLabel);
    const metaElement = document.createElement("small"),
      metaParts = [
        (RELATED_ENTITY_DOMAIN_LABELS2 as any)[
          String(candidate.domain || candidate.entityId || "").split(".", 1)[0]
        ] || "实体",
        candidate.entityId,
      ];
    return (
      isAvailable
        ? isDisabledByLimit
          ? metaParts.push("最多选择 " + popupSelectionLimit + " 项")
          : relatedEntityNeedsConfirmation2(candidate) && metaParts.push("点击时需确认")
        : metaParts.push("暂时不可用"),
      (metaElement.textContent = metaParts.join(" · ")),
      (candidateButton.dataset.relatedEntitySearch = (
        entityNameElement.textContent +
        " " +
        (candidate.name || "") +
        " " +
        (candidate.originalName || "") +
        " " +
        metaElement.textContent
      ).toLocaleLowerCase("zh-CN")),
      ctx.runAlt(candidateButton, entityNameElement),
      labelElement.append(entityNameElement, metaElement),
      candidateButton.append(iconElement, labelElement),
      candidateButton
    );
  });
  if (optionButtons.length) {
    const noMatchElement = document.createElement("div");
    ((noMatchElement.className = "popup-related-entity-empty popup-related-entity-filter-empty"),
      (noMatchElement.textContent = "没有匹配的关联功能。"),
      (noMatchElement.hidden = true),
      optionButtons.push(noMatchElement));
  } else {
    const emptyMessageElement = document.createElement("div");
    ((emptyMessageElement.className = "popup-related-entity-empty"),
      (emptyMessageElement.textContent = "这个 HA 设备暂时没有可选择的关联实体。"),
      optionButtons.push(emptyMessageElement));
  }
  (relatedPopupListElement.replaceChildren(...optionButtons), filterRelatedEntityOptions());
}

export function setupRelatedPopup(ctx: RelatedPopupContext) {
  relatedPopupCtx = ctx;
  return { updateRelatedPopup };
}
