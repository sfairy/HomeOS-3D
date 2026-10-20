/* 实体与标签（实体命名/解析、灯光统计、组件树遍历） */
import type { EditorContext } from "../editor-context";
import { lightStatisticsEntityStateStatus as lightStatisticsEntityStateStatus2, lightStatisticsEntitySupport as lightStatisticsEntitySupport2 } from "../../../renderer/registry";
import { findComponent as findComponent2 } from "../../component-tree";
import { createIconVisibilityVirtualEntity as createIconVisibilityVirtualEntity2 } from "../../../shared/virtual-entities";

export interface EntityLabelsDeps {
  editorCtx: EditorContext;
  ENTITY_DOMAIN_LABELS: any;
  MAX_LIGHT_STATISTICS_ENTITIES: any;
  currentPage: any;
  effectIconLabelElementById: any;
  effectIconLabelElementByIdById: any;
  effectIconLabelSelector: any;
  effectIconName: any;
  hELPER_ENTITY_DOMAINSSet: any;
  lightStatisticsEntityButtonElement: any;
  lightStatisticsEntityCountElement: any;
  lightStatisticsEntityListElement: any;
  lightStatisticsEntityMessageElement: any;
  lightStatisticsEntityOptionsElement: any;
  lightStatisticsEntityPendingElement: any;
  mutateDocument: any;
  navigationIconValue: any;
  removedComponent: any;
  renderNavigationIconPreview: any;
  runAlt: any;
  runBackup: any;
  runChunk: (...args: any[]) => any[];
  runCursor: any;
  runDelta: any;
  runFallback: any;
  runGroup: any;
  runLimit: any;
  runMode: any;
  runOrder: (...args: any[]) => any[];
  runPortion: any;
  runQueue: any;
  runRange: any;
  runSegment: any;
  runSnapshot: any;
  runSource: any;
}

export function describeEntityDomain(deps: EntityLabelsDeps, entity: any) {
  const be2 = deps.renderNavigationIconPreview(entity);
  return entity?.virtual
    ? "虚拟实体"
    : deps.hELPER_ENTITY_DOMAINSSet.has(be2)
      ? "辅助元素"
      : (deps.ENTITY_DOMAIN_LABELS as any)[be2] || be2 || "实体";
}

export function normalizeWhitespace(deps: EntityLabelsDeps, text: any) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function navigationIconValue(deps: EntityLabelsDeps, entity: any) {
  return deps.runCursor(deps.editorCtx.deviceNamesByDeviceId.get(String(entity?.deviceId || "")));
}

export function resolveEntityDisplayName(deps: EntityLabelsDeps, entity: any, displayName = deps.navigationIconValue(entity)) {
  const ja2 = deps.runCursor(entity?.name),
    ja3 = deps.runCursor(entity?.originalName);
  if (!displayName) return ja2 || ja3 || entity?.entityId || "";
  const navigationIconValueState =
    ja2 === displayName
      ? ""
      : ja2.startsWith(displayName + " ")
        ? ja2.slice(displayName.length).trim()
        : ja2.startsWith(displayName + "·")
          ? ja2.slice(displayName.length + 1).trim()
          : ja2;
  return navigationIconValueState && navigationIconValueState !== displayName
    ? navigationIconValueState
    : ja3 && ja3 !== displayName
      ? ja3
      : "";
}

export function formatEntityLabel(deps: EntityLabelsDeps, entity: any, navigationIconPreviewElement = "") {
  if (entity?.virtual) return entity.name || entity.entityId || "";
  const nw2 = deps.navigationIconValue(entity),
    yE2 = deps.runCursor(navigationIconPreviewElement) || deps.runSource(entity, nw2);
  return nw2 ? (yE2 && yE2 !== nw2 ? nw2 + " · " + yE2 : nw2) : yE2 || entity?.entityId || "";
}

export function formatEntitySummary(deps: EntityLabelsDeps, entity: any) {
  const vt2 = deps.runSnapshot(entity),
    navigationIconPreviewElementState = entity?.entityId || "";
  return (
    "[" +
    deps.runQueue(entity) +
    "] " +
    vt2 +
    (vt2 && vt2 !== navigationIconPreviewElementState
      ? " · " + navigationIconPreviewElementState
      : "")
  );
}

export function collectEntityIds(deps: EntityLabelsDeps, component = deps.removedComponent()) {
  return [
    ...new Set(
      (Array.isArray(component?.properties?.entityIds) ? component.properties.entityIds : [])
        .map((mappedItemsState: any) => String(mappedItemsState || "").trim())
        .filter(Boolean),
    ),
  ];
}

export function describeEntityState(deps: EntityLabelsDeps, entityId: any, entityState: any = null) {
  if (!entityState)
    return {
      label: "实体已删除",
      tone: "missing",
    };
  const navigationIconLabelElementState = deps.editorCtx.editorRenderer?.states?.get?.(entityId),
    navigationIconLabelElementValue =
      navigationIconLabelElementState?.newState || navigationIconLabelElementState,
    lowerCase2 = String(navigationIconLabelElementValue?.state ?? "")
      .trim()
      .toLowerCase(),
    navigationIconLabelElement = lightStatisticsEntityStateStatus2(
      entityState,
      navigationIconLabelElementValue,
    );
  return navigationIconLabelElement === "on"
    ? {
        label: "已开启/运行",
        tone: "on",
      }
    : navigationIconLabelElement === "off"
      ? {
          label: "已关闭",
          tone: "off",
        }
      : lowerCase2 === "unavailable"
        ? {
            label: "暂时不可用",
            tone: "abnormal",
          }
        : lowerCase2 === "unknown"
          ? {
              label: "状态未知",
              tone: "abnormal",
            }
          : lowerCase2
            ? {
                label: "无法判断：" + lowerCase2,
                tone: "abnormal",
              }
            : {
                label: "等待状态",
                tone: "abnormal",
              };
}

export function showLightStatisticsMessage(deps: EntityLabelsDeps, message = "", isError = false) {
  ((deps.lightStatisticsEntityMessageElement.textContent = message),
    (deps.lightStatisticsEntityMessageElement.hidden = !message),
    deps.lightStatisticsEntityMessageElement.classList.toggle("error", !!isError));
}

export function clearLightStatisticsSelection(deps: EntityLabelsDeps, { clearMessage: runBound = true } = {}) {
  ((deps.editorCtx.statisticsEntityId = ""),
    (deps.editorCtx.statisticsReplaceIndex = -1),
    (deps.editorCtx.statisticsComponentId = ""),
    (deps.lightStatisticsEntityPendingElement.hidden = true),
    deps.runBackup(deps.lightStatisticsEntityButtonElement, "选择一个实体"),
    runBound && deps.runDelta(""));
}

export function renderLightStatisticsEntityOptions(deps: EntityLabelsDeps, query = "") {
  if (deps.removedComponent()?.type !== "light-statistics") return;
  const localeLowerCase = query.trim().toLocaleLowerCase("zh-CN"),
    navigationIconLabelElementConfig: HTMLElement[] = deps.runPortion("light-statistics")
      .map((mappedItemsValue: any, mappedItemsConfig: any) => ({
        entity: mappedItemsValue,
        index: mappedItemsConfig,
        support: lightStatisticsEntitySupport2(mappedItemsValue),
      }))
      .filter(
        ({ entity: navigationIconLabelElementRef }: any) =>
          !localeLowerCase ||
          (
            deps.runMode(navigationIconLabelElementRef) +
            " " +
            deps.renderNavigationIconPreview(navigationIconLabelElementRef)
          )
            .toLocaleLowerCase("zh-CN")
            .includes(localeLowerCase),
      )
      .sort(
        (navigationIconLabelElementEntry: any, navigationIconUrlState: any) =>
          Number(navigationIconUrlState.support.supported) -
            Number(navigationIconLabelElementEntry.support.supported) ||
          +(deps.renderNavigationIconPreview(navigationIconUrlState.entity) === "light") -
            +(deps.renderNavigationIconPreview(navigationIconLabelElementEntry.entity) === "light") ||
          navigationIconLabelElementEntry.index - navigationIconUrlState.index,
      )
      .map(({ entity: mappedItemsRef }: any) => {
        const navigationIconUrlElement = document.createElement("button");
        ((navigationIconUrlElement.type = "button"),
          (navigationIconUrlElement.className =
            "inspector-entity-option" +
            (mappedItemsRef.entityId === deps.editorCtx.statisticsEntityId ? " selected" : "")),
          (navigationIconUrlElement.dataset.lightStatisticsEntityId = mappedItemsRef.entityId),
          navigationIconUrlElement.setAttribute("role", "option"),
          navigationIconUrlElement.setAttribute(
            "aria-selected",
            String(mappedItemsRef.entityId === deps.editorCtx.statisticsEntityId),
          ));
        const navigationIconUrlElementElement = document.createElement("span");
        ((navigationIconUrlElementElement.className = "inspector-entity-option-content"),
          (navigationIconUrlElementElement.title = deps.runMode(mappedItemsRef)));
        const navigationIconUrlElementPanel = document.createElement("span");
        navigationIconUrlElementPanel.className =
          "inspector-entity-option-line inspector-entity-name-line";
        const navigationIconUrlElementSection = document.createElement("span");
        ((navigationIconUrlElementSection.className = "inspector-entity-kind"),
          (navigationIconUrlElementSection.textContent = "[" + deps.runQueue(mappedItemsRef) + "] "));
        const navigationIconUrlElementCard = document.createElement("span");
        ((navigationIconUrlElementCard.className = "inspector-entity-name"),
          (navigationIconUrlElementCard.textContent = deps.runSnapshot(mappedItemsRef)),
          navigationIconUrlElementPanel.append(
            navigationIconUrlElementSection,
            navigationIconUrlElementCard,
          ));
        const navigationIconUrlElementBar = document.createElement("span");
        return (
          (navigationIconUrlElementBar.className =
            "inspector-entity-option-line inspector-entity-id"),
          (navigationIconUrlElementBar.textContent = mappedItemsRef.entityId),
          (navigationIconUrlElementBar.title = mappedItemsRef.entityId),
          navigationIconUrlElementElement.append(
            navigationIconUrlElementPanel,
            navigationIconUrlElementBar,
          ),
          deps.runAlt(navigationIconUrlElement, navigationIconUrlElementPanel),
          navigationIconUrlElement.append(navigationIconUrlElementElement),
          navigationIconUrlElement
        );
      });
  if (!navigationIconLabelElementConfig.length) {
    const navigationIconUrlElementList = document.createElement("div");
    ((navigationIconUrlElementList.className = "inspector-picker-empty"),
      (navigationIconUrlElementList.textContent = "没有匹配的实体"),
      navigationIconLabelElementConfig.push(navigationIconUrlElementList));
  }
  (deps.lightStatisticsEntityOptionsElement.replaceChildren(...navigationIconLabelElementConfig),
    (deps.lightStatisticsEntityOptionsElement.scrollTop = 0));
}

export function addLightStatisticsEntity(deps: EntityLabelsDeps, entityId: any, replaceIndex = deps.editorCtx.statisticsReplaceIndex) {
  const navigationIconUrl = deps.removedComponent();
  if (
    navigationIconUrl?.type !== "light-statistics" ||
    !deps.runPortion("light-statistics").find(
      (renderIconButtonEffectIconPreview: any) =>
        renderIconButtonEffectIconPreview.entityId === entityId,
    )
  )
    return;
  const indexOf4 = deps.runOrder(navigationIconUrl).indexOf(entityId);
  if (indexOf4 >= 0 && indexOf4 !== replaceIndex) {
    deps.runDelta("该实体已添加，请选择其它实体。", true);
    return;
  }
  return (
    (deps.editorCtx.statisticsEntityId = entityId),
    (deps.editorCtx.statisticsReplaceIndex = Number.isInteger(replaceIndex) ? replaceIndex : -1),
    (deps.editorCtx.statisticsComponentId = navigationIconUrl.id),
    deps.effectIconName()
  );
}

export function effectIconName(deps: EntityLabelsDeps) {
  const effectIconValueState = deps.editorCtx.selectedComponentId,
    tn2 = deps.editorCtx.statisticsEntityId,
    Ko2 = deps.editorCtx.statisticsReplaceIndex,
    effectIconValue = deps.editorCtx.entities.find(
      (effectIconPreviewElementState: any) => effectIconPreviewElementState.entityId === tn2,
    );
  if (!effectIconValueState || !tn2 || !effectIconValue) return;
  const effectIconPreviewElement = deps.removedComponent();
  if (Ko2 < 0 && deps.runOrder(effectIconPreviewElement).length >= deps.MAX_LIGHT_STATISTICS_ENTITIES) {
    deps.runDelta("每个统计控件最多添加 " + deps.MAX_LIGHT_STATISTICS_ENTITIES + " 个实体。", true);
    return;
  }
  return deps.mutateDocument((effectIconPreviewElementValue: any) => {
    const effectIconPreviewElementConfig = findComponent2(
      effectIconPreviewElementValue,
      effectIconValueState,
    )?.component;
    if (
      !effectIconPreviewElementConfig ||
      effectIconPreviewElementConfig.type !== "light-statistics"
    )
      return "component-invalid";
    const qa2 = deps.runOrder(effectIconPreviewElementConfig),
      indexOf5 = qa2.indexOf(tn2);
    if (indexOf5 >= 0 && indexOf5 !== Ko2) return "duplicate";
    const effectIconPreviewElementRef = Ko2 >= 0 && Ko2 < qa2.length ? qa2[Ko2] : "";
    if (!effectIconPreviewElementRef && qa2.length >= deps.MAX_LIGHT_STATISTICS_ENTITIES)
      return "limit-reached";
    if (Ko2 >= 0 && !effectIconPreviewElementRef) return "component-invalid";
    effectIconPreviewElementRef ? qa2.splice(Ko2, 1, tn2) : qa2.push(tn2);
    const effectIconPreviewState = {
      ...(effectIconPreviewElementConfig.properties?.entityLabels || {}),
    };
    return (
      effectIconPreviewElementRef &&
        effectIconPreviewElementRef !== tn2 &&
        delete effectIconPreviewState[String(effectIconPreviewElementRef)],
      (effectIconPreviewState[tn2] = deps.runSnapshot(effectIconValue)),
      (effectIconPreviewElementConfig.properties = {
        ...(effectIconPreviewElementConfig.properties || {}),
        entityIds: qa2,
        entityLabels: effectIconPreviewState,
      }),
      effectIconPreviewElementRef ? "replaced" : "added"
    );
  }).then((effectIconPreviewElementEntry: any) =>
    effectIconPreviewElementEntry === "limit-reached"
      ? (deps.runDelta("每个统计控件最多添加 " + deps.MAX_LIGHT_STATISTICS_ENTITIES + " 个实体。", true),
        effectIconPreviewElementEntry)
      : effectIconPreviewElementEntry === "duplicate"
        ? (deps.runDelta("该实体已添加，请选择其它实体。", true), effectIconPreviewElementEntry)
        : effectIconPreviewElementEntry === "component-invalid"
          ? (deps.runDelta("当前统计控件已发生变化，请重新选择。", true), effectIconPreviewElementEntry)
          : ((effectIconPreviewElementEntry !== "added" &&
              effectIconPreviewElementEntry !== "replaced") ||
              (deps.runLimit({
                clearMessage: false,
              }),
              deps.runDelta(
                effectIconPreviewElementEntry === "replaced"
                  ? "已更换统计实体。"
                  : "已加入统计列表。",
              )),
            effectIconPreviewElementEntry),
  );
}

export function removeLightStatisticsEntityAt(deps: EntityLabelsDeps, entityIndex: any) {
  const effectIconPreviewElementRecord = deps.editorCtx.selectedComponentId;
  !effectIconPreviewElementRecord ||
    !Number.isInteger(entityIndex) ||
    entityIndex < 0 ||
    (deps.mutateDocument((effectIconPreviewElementName: any) => {
      const effectIconPreviewElementKey = findComponent2(
        effectIconPreviewElementName,
        effectIconPreviewElementRecord,
      )?.component;
      if (!effectIconPreviewElementKey || effectIconPreviewElementKey.type !== "light-statistics")
        return;
      const qa3 = deps.runOrder(effectIconPreviewElementKey),
        [splice2] = qa3.splice(entityIndex, 1),
        effectIconPreviewCache = {
          ...(effectIconPreviewElementKey.properties?.entityLabels || {}),
        };
      (splice2 && delete effectIconPreviewCache[String(splice2)],
        (effectIconPreviewElementKey.properties = {
          ...(effectIconPreviewElementKey.properties || {}),
          entityIds: qa3,
          entityLabels: effectIconPreviewCache,
        }));
    }),
    deps.runLimit());
}

export function renderLightStatisticsEntityList(deps: EntityLabelsDeps, component = deps.removedComponent()) {
  if (component?.type !== "light-statistics") return;
  const qa4 = deps.runOrder(component),
    effectIconPreviewElementPath = component.properties?.entityLabels || {};
  deps.lightStatisticsEntityCountElement.textContent = qa4.length + " 个";
  const mappedItemsRecord = qa4.map((mappedItemsName, mappedItemsKey) => {
    const effectIconPreviewElementText =
        deps.runPortion("light-statistics").find(
          (effectIconNameState: any) => effectIconNameState.entityId === mappedItemsName,
        ) || null,
      xE2 = deps.runRange(mappedItemsName, effectIconPreviewElementText),
      effectIconPreviewElementElement = document.createElement("div");
    effectIconPreviewElementElement.className =
      "light-statistics-entity-row " + xE2.tone + (effectIconPreviewElementText ? "" : " missing");
    const effectIconPreviewElementPanel = document.createElement("div"),
      effectIconPreviewElementSection = document.createElement("strong");
    effectIconPreviewElementSection.textContent = effectIconPreviewElementText
      ? deps.runSnapshot(effectIconPreviewElementText)
      : effectIconPreviewElementPath[String(mappedItemsName)] || mappedItemsName;
    const effectIconValueElement = document.createElement("small");
    ((effectIconValueElement.textContent = mappedItemsName + " · " + xE2.label),
      effectIconPreviewElementPanel.append(
        effectIconPreviewElementSection,
        effectIconValueElement,
      ));
    const effectIconPreviewElementCard = document.createElement("span");
    effectIconPreviewElementCard.className = "light-statistics-entity-actions";
    const effectIconLabelElementElement = document.createElement("button");
    ((effectIconLabelElementElement.type = "button"),
      (effectIconLabelElementElement.dataset.lightStatisticsReplaceIndex = String(mappedItemsKey)),
      (effectIconLabelElementElement.textContent = "更换"));
    const effectIconUrlElement = document.createElement("button");
    return (
      (effectIconUrlElement.type = "button"),
      (effectIconUrlElement.dataset.lightStatisticsRemoveIndex = String(mappedItemsKey)),
      (effectIconUrlElement.textContent = "删除"),
      effectIconPreviewElementCard.append(effectIconLabelElementElement, effectIconUrlElement),
      effectIconPreviewElementElement.append(
        effectIconPreviewElementPanel,
        effectIconPreviewElementCard,
      ),
      effectIconPreviewElementElement
    );
  });
  deps.lightStatisticsEntityListElement.replaceChildren(...mappedItemsRecord);
}

export function flattenComponentTree(deps: EntityLabelsDeps, component: any, collected: any[] = []) {
  for (const effectIconLabelElementState of component || [])
    (collected.push(effectIconLabelElementState),
      flattenComponentTree(deps, effectIconLabelElementState.children, collected));
  return collected;
}

export function collectPageComponents(deps: EntityLabelsDeps, page = deps.currentPage()) {
  if (!page || !deps.editorCtx.activeProject?.document) return [];
  const mappedItemById = new Map(
      (deps.editorCtx.activeProject.document.sharedComponents || []).map((mappedItemsPath: any) => [
        mappedItemsPath.id,
        mappedItemsPath,
      ]),
    ),
    mappedItemsText = (page.sharedComponentIds || [])
      .map((mappedItemsCount: any) => mappedItemById.get(mappedItemsCount))
      .filter(Boolean);
  return deps.runGroup([...(page.components || []), ...mappedItemsText]);
}

export function findIconVisibilityVirtualEntity(deps: EntityLabelsDeps, page = deps.currentPage()) {
  return deps.runChunk(page).some(
    (effectIconLabelElementValue) => effectIconLabelElementValue.type === "icon-button-effect",
  )
    ? [createIconVisibilityVirtualEntity2(page?.path)]
    : [];
}

export function resolveEntityCatalog(deps: EntityLabelsDeps, pageType = "image") {
  return pageType === "scene-mode" ? deps.editorCtx.entities : [...deps.editorCtx.entities, ...deps.runSegment()];
}

export function registerOverflowScrollPreviewRow(deps: EntityLabelsDeps, effectIconLabelElementPanel: any, entityIds: any) {
  const iconButtonFollowsEntity = (Array.isArray(entityIds) ? entityIds : [entityIds]).filter(Boolean);
  for (const effectIconLabelElementSection of iconButtonFollowsEntity)
    effectIconLabelElementSection.dataset.overflowScrollPreview = "true";
  effectIconLabelElementPanel &&
    iconButtonFollowsEntity.length &&
    ((effectIconLabelElementPanel.dataset.overflowScrollPreviewRow = "true"),
    deps.effectIconLabelElementByIdById.set(effectIconLabelElementPanel, iconButtonFollowsEntity));
}

export function resolveOverflowScrollPreviewContainer(deps: EntityLabelsDeps, element: any) {
  const effectIconLabelElementConfig = element.closest?.(deps.effectIconLabelSelector);
  if (effectIconLabelElementConfig) return effectIconLabelElementConfig;
  const effectIconLabelElementRef = element.closest?.("[data-overflow-scroll-preview-row]");
  return deps.effectIconLabelElementByIdById.get(effectIconLabelElementRef)?.[0] || null;
}

export function findEnclosingScrollPreviewRow(deps: EntityLabelsDeps, element: any) {
  return element?.closest?.("[data-overflow-scroll-preview-row]") || element;
}

export function stopOverflowScrollAnimation(deps: EntityLabelsDeps, effectIconLabelElementCard: any) {
  const effectIconLabelElement = deps.effectIconLabelElementById.get(effectIconLabelElementCard);
  (effectIconLabelElement &&
    (window.clearTimeout(effectIconLabelElement.timer),
    window.cancelAnimationFrame(effectIconLabelElement.frame),
    deps.effectIconLabelElementById.delete(effectIconLabelElementCard)),
    (effectIconLabelElementCard.scrollLeft = 0),
    effectIconLabelElementCard.classList.remove("hover-scrolling"));
}

export function ensureInspectorPickerValueSpan(deps: EntityLabelsDeps, effectIconUrlElementElement: any) {
  if (!effectIconUrlElementElement) return null;
  let effectIconUrl = effectIconUrlElementElement.querySelector(".inspector-picker-value");
  return (
    effectIconUrl ||
      ((effectIconUrl = document.createElement("span")),
      (effectIconUrl.className = "inspector-picker-value"),
      (effectIconUrl.textContent = effectIconUrlElementElement.textContent.trim()),
      effectIconUrlElementElement.replaceChildren(effectIconUrl)),
    deps.runAlt(effectIconUrlElementElement, effectIconUrl),
    effectIconUrl
  );
}

export function setPickerButtonLabel(deps: EntityLabelsDeps, triggerButton: any, label: any, renderIconButtonIconPreview = "") {
  const dw2 = deps.runFallback(triggerButton);
  dw2 &&
    ((dw2.textContent = label),
    (dw2.title = renderIconButtonIconPreview || label),
    (triggerButton.title = renderIconButtonIconPreview || label));
}

