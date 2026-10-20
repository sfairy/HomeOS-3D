/* 资源选择与预览（资源 URL/尺寸/菜单/大图预览、实体选择器配置） */
import type { EditorContext } from "../editor-context";
import { clampNumber as clampNumber2 } from "../../editor-utils";
import { TOGGLE_ENTITY_DOMAINS as TOGGLE_ENTITY_DOMAINS2 } from "../../../shared/action-rules";
import { updateRelatedPopup } from "../../home-related-popup";
import { findComponent as findComponent2 } from "../../component-tree";

export interface AssetPickerDeps {
  editorCtx: EditorContext;
  airConditionerEntityButtonElement: any;
  airConditionerEntityMenuElement: any;
  airConditionerEntityOptionsElement: any;
  airConditionerEntitySearchElement: any;
  allAssets: any;
  applyAssetNaturalSize: any;
  assetMatchesId: any;
  cameraEntityButtonElement: any;
  cameraEntityMenuElement: any;
  cameraEntityOptionsElement: any;
  cameraEntitySearchElement: any;
  customSelectsBySelectElement: any;
  handleOperationError: any;
  ibeAssetFolderElement: any;
  ibeAssetMenuElement: any;
  ibeAssetUploadHintElement: any;
  ibeEntityButtonElement: any;
  ibeEntityMenuElement: any;
  ibeEntityOptionsElement: any;
  ibeEntitySearchElement: any;
  iconButtonEntityButtonElement: any;
  iconButtonEntityMenuElement: any;
  iconButtonEntityOptionsElement: any;
  iconButtonEntitySearchElement: any;
  imageAssetButtonElement: any;
  imageAssetFolderSelectElement: any;
  imageAssetLargePreviewImageElement: any;
  imageAssetLargePreviewImageElementElement: any;
  imageAssetLargePreviewNameElement: any;
  imageAssetMenuElement: any;
  imageAssetOptionsElement: any;
  imageAssetUploadHintElement: any;
  imageEntityButtonElement: any;
  imageEntityMenuElement: any;
  imageEntityOptionsElement: any;
  imageEntitySearchElement: any;
  lightStatisticsActionEntityButtonElement: any;
  lightStatisticsActionEntityMenuElement: any;
  lightStatisticsActionEntityOptionsElement: any;
  lightStatisticsActionEntitySearchElement: any;
  lightStatisticsEntityButtonElement: any;
  lightStatisticsEntityMenuElement: any;
  lightStatisticsEntityOptionsElement: any;
  lightStatisticsIconButtonElement: any;
  lightStatisticsIconMenuElement: any;
  lightStatisticsIconOptionsElement: any;
  lineChartEntityButtonElement: any;
  lineChartEntityMenuElement: any;
  lineChartEntityOptionsElement: any;
  lineChartEntitySearchInputElement: any;
  loadNavigationIconOptions: any;
  measureAssetImageSize: any;
  mutateDocument: any;
  navigationEntityButtonElement: any;
  navigationEntityMenuElement: any;
  navigationEntityOptionsElement: any;
  navigationEntitySearchElement: any;
  pendingAssetProbeKeysSet: any;
  positionAssetLargePreview: any;
  removedComponent: any;
  renderNavigationIconPreview: any;
  resolveAssetPreviewUrl: any;
  resolveEffectAssetUrl: any;
  runAlt: any;
  runExtraAlt: any;
  runExtraTwin: any;
  runExtraVariant: any;
  runMode: any;
  runPortion: any;
  runQueue: any;
  runSnapshot: any;
  runState: any;
  syncAssetFolderOptions: any;
  titleButtonEntityButtonElement: any;
  titleButtonEntityMenuElement: any;
  titleButtonEntityOptionsElement: any;
  titleButtonEntitySearchElement: any;
  vacuumMapEntityButtonElement: any;
  vacuumMapEntityMenuElement: any;
  vacuumMapEntityOptionsElement: any;
  vacuumMapEntitySearchElement: any;
  weatherEntityButtonElement: any;
  weatherEntityMenuElement: any;
  weatherEntityOptionsElement: any;
  weatherEntitySearchElement: any;
}

export function positionLightStatisticsIconMenu(deps: AssetPickerDeps) {
  if (deps.lightStatisticsIconMenuElement.hidden) return;
  const parentBoundsRef = deps.lightStatisticsIconButtonElement.parentElement.getBoundingClientRect(),
    relatedPopupStateValue = 5,
    relatedPopupStateConfig = 8,
    availableSizeRef =
      window.innerHeight -
      parentBoundsRef.bottom -
      relatedPopupStateValue -
      relatedPopupStateConfig,
    measuredBoundsEntry = parentBoundsRef.top - relatedPopupStateValue - relatedPopupStateConfig,
    relatedPopupElementValue = availableSizeRef >= 250 || availableSizeRef >= measuredBoundsEntry,
    clampedLowerRef = Math.max(
      150,
      Math.min(390, relatedPopupElementValue ? availableSizeRef : measuredBoundsEntry),
    );
  ((deps.lightStatisticsIconMenuElement.style.left =
    clampNumber2(
      parentBoundsRef.left,
      relatedPopupStateConfig,
      Math.max(
        relatedPopupStateConfig,
        window.innerWidth - parentBoundsRef.width - relatedPopupStateConfig,
      ),
    ) + "px"),
    (deps.lightStatisticsIconMenuElement.style.top = relatedPopupElementValue
      ? parentBoundsRef.bottom + relatedPopupStateValue + "px"
      : Math.max(
          relatedPopupStateConfig,
          parentBoundsRef.top - clampedLowerRef - relatedPopupStateValue,
        ) + "px"),
    (deps.lightStatisticsIconMenuElement.style.width = parentBoundsRef.width + "px"),
    (deps.lightStatisticsIconMenuElement.style.maxHeight = clampedLowerRef + "px"),
    (deps.lightStatisticsIconOptionsElement.style.maxHeight =
      Math.max(90, clampedLowerRef - 57) + "px"));
}

export function positionLightStatisticsEntityMenu(deps: AssetPickerDeps) {
  if (deps.lightStatisticsEntityMenuElement.hidden) return;
  const targetBoundsValue = deps.lightStatisticsEntityButtonElement.getBoundingClientRect(),
    relatedPopupStateRef = 5,
    relatedPopupStateEntry = 8,
    availableSizeEntry = Math.min(
      targetBoundsValue.width,
      window.innerWidth - relatedPopupStateEntry * 2,
    ),
    availableSizeRecord =
      window.innerHeight - targetBoundsValue.bottom - relatedPopupStateRef - relatedPopupStateEntry,
    measuredBoundsRecord = targetBoundsValue.top - relatedPopupStateRef - relatedPopupStateEntry,
    relatedPopupElementConfig =
      availableSizeRecord >= 250 || availableSizeRecord >= measuredBoundsRecord,
    clampedLowerEntry = Math.max(
      150,
      Math.min(430, relatedPopupElementConfig ? availableSizeRecord : measuredBoundsRecord),
    );
  ((deps.lightStatisticsEntityMenuElement.style.left =
    clampNumber2(
      targetBoundsValue.left,
      relatedPopupStateEntry,
      Math.max(
        relatedPopupStateEntry,
        window.innerWidth - availableSizeEntry - relatedPopupStateEntry,
      ),
    ) + "px"),
    (deps.lightStatisticsEntityMenuElement.style.top = relatedPopupElementConfig
      ? targetBoundsValue.bottom + relatedPopupStateRef + "px"
      : Math.max(
          relatedPopupStateEntry,
          targetBoundsValue.top - clampedLowerEntry - relatedPopupStateRef,
        ) + "px"),
    (deps.lightStatisticsEntityMenuElement.style.width = availableSizeEntry + "px"),
    (deps.lightStatisticsEntityMenuElement.style.maxHeight = clampedLowerEntry + "px"),
    (deps.lightStatisticsEntityOptionsElement.style.maxHeight =
      Math.max(90, clampedLowerEntry - 58) + "px"));
}

export function resolveEntityPickerConfig(deps: AssetPickerDeps, componentType = "image") {
  return componentType === "light-statistics"
    ? {
        componentType: componentType,
        button: deps.lightStatisticsActionEntityButtonElement,
        menu: deps.lightStatisticsActionEntityMenuElement,
        search: deps.lightStatisticsActionEntitySearchElement,
        options: deps.lightStatisticsActionEntityOptionsElement,
        except: "light-statistics-action-entity",
        relatedSettings: false,
        recommended: (relatedPopupElementRef: any) =>
          TOGGLE_ENTITY_DOMAINS2.has(deps.renderNavigationIconPreview(relatedPopupElementRef)) ? 2 : 0,
      }
    : ["navigation-button", "scene-mode"].includes(componentType)
      ? {
          componentType: componentType,
          button: deps.navigationEntityButtonElement,
          menu: deps.navigationEntityMenuElement,
          search: deps.navigationEntitySearchElement,
          options: deps.navigationEntityOptionsElement,
          except: "navigation-entity",
          relatedSettings: componentType !== "scene-mode",
          recommended: (relatedPopupElementEntry: any) =>
            relatedPopupElementEntry?.virtual
              ? 3
              : TOGGLE_ENTITY_DOMAINS2.has(deps.renderNavigationIconPreview(relatedPopupElementEntry))
                ? 2
                : 0,
        }
      : componentType === "title-button"
        ? {
            componentType: componentType,
            button: deps.titleButtonEntityButtonElement,
            menu: deps.titleButtonEntityMenuElement,
            search: deps.titleButtonEntitySearchElement,
            options: deps.titleButtonEntityOptionsElement,
            except: "title-button-entity",
            recommended: (relatedPopupElementRecord: any) =>
              relatedPopupElementRecord?.virtual
                ? 3
                : TOGGLE_ENTITY_DOMAINS2.has(deps.renderNavigationIconPreview(relatedPopupElementRecord))
                  ? 2
                  : 0,
          }
        : componentType === "vacuum-map"
          ? {
              componentType: componentType,
              button: deps.vacuumMapEntityButtonElement,
              menu: deps.vacuumMapEntityMenuElement,
              search: deps.vacuumMapEntitySearchElement,
              options: deps.vacuumMapEntityOptionsElement,
              except: "vacuum-map-entity",
              recommended: (relatedPopupElementName: any) =>
                ["camera", "image"].includes(deps.renderNavigationIconPreview(relatedPopupElementName))
                  ? /(?:^|[_.\s-])map(?:$|[_.\s-])|地图/i.test(
                      (relatedPopupElementName.entityId || "") +
                        " " +
                        (relatedPopupElementName.name || ""),
                    )
                    ? 2
                    : 1
                  : 0,
            }
          : componentType === "camera"
            ? {
                componentType: componentType,
                button: deps.cameraEntityButtonElement,
                menu: deps.cameraEntityMenuElement,
                search: deps.cameraEntitySearchElement,
                options: deps.cameraEntityOptionsElement,
                except: "camera-entity",
                recommended: (relatedPopupElementKey: any) =>
                  deps.renderNavigationIconPreview(relatedPopupElementKey) === "camera",
              }
            : componentType === "air-conditioner"
              ? {
                  componentType: componentType,
                  button: deps.airConditionerEntityButtonElement,
                  menu: deps.airConditionerEntityMenuElement,
                  search: deps.airConditionerEntitySearchElement,
                  options: deps.airConditionerEntityOptionsElement,
                  except: "air-conditioner-entity",
                  recommended: (relatedPopupElementPath: any) =>
                    deps.renderNavigationIconPreview(relatedPopupElementPath) === "climate"
                      ? 2
                      : deps.renderNavigationIconPreview(relatedPopupElementPath) === "fan"
                        ? 1
                        : 0,
                }
              : componentType === "device-button"
                ? {
                    componentType: componentType,
                    button: deps.iconButtonEntityButtonElement,
                    menu: deps.iconButtonEntityMenuElement,
                    search: deps.iconButtonEntitySearchElement,
                    options: deps.iconButtonEntityOptionsElement,
                    except: "icon-button-entity",
                    recommended: (relatedPopupElementText: any) =>
                      TOGGLE_ENTITY_DOMAINS2.has(
                        deps.renderNavigationIconPreview(relatedPopupElementText),
                      ),
                  }
                : componentType === "presence-sensor"
                  ? {
                      componentType: componentType,
                      button: deps.iconButtonEntityButtonElement,
                      menu: deps.iconButtonEntityMenuElement,
                      search: deps.iconButtonEntitySearchElement,
                      options: deps.iconButtonEntityOptionsElement,
                      except: "icon-button-entity",
                      recommended: (relatedPopupElementCount: any) => {
                        const relatedPopupElementIndex =
                            (relatedPopupElementCount.entityId || "") +
                            " " +
                            (relatedPopupElementCount.name || "") +
                            " " +
                            (relatedPopupElementCount.originalName || "") +
                            " " +
                            (relatedPopupElementCount.translationKey || ""),
                          relatedPopupElementTotal =
                            deps.removedComponent()?.properties?.sensorKind || "presence",
                          be3 = deps.renderNavigationIconPreview(relatedPopupElementCount);
                        return be3 === "event"
                          ? relatedPopupElementTotal === "presence" &&
                            /motion|occupancy|presence|pir|moving|移动|运动|人体|有人/i.test(
                              relatedPopupElementIndex,
                            )
                            ? 4
                            : 0
                          : be3 !== "binary_sensor"
                            ? 0
                            : relatedPopupElementTotal === "water-leak"
                              ? /moisture|water|leak|flood|wet|水浸|漏水|积水|湿/i.test(
                                  relatedPopupElementIndex,
                                )
                                ? 3
                                : 1
                              : relatedPopupElementTotal === "smoke"
                                ? /smoke|fire|烟雾|烟感|火警/i.test(relatedPopupElementIndex)
                                  ? 3
                                  : 1
                                : relatedPopupElementTotal === "natural-gas"
                                  ? /natural[_ -]?gas|combustible|gas|燃气|天然气|可燃气/i.test(
                                      relatedPopupElementIndex,
                                    )
                                    ? 3
                                    : 1
                                  : relatedPopupElementTotal === "door-window"
                                    ? /door|window|contact|opening|门|窗|接触/i.test(
                                        relatedPopupElementIndex,
                                      )
                                      ? 3
                                      : 1
                                    : /presence|occupancy|人在|有人|存在|人体/i.test(
                                          relatedPopupElementIndex,
                                        )
                                      ? 3
                                      : /motion|移动|运动/i.test(relatedPopupElementIndex)
                                        ? 1
                                        : 2;
                      },
                    }
                  : componentType === "icon-button"
                    ? {
                        componentType: componentType,
                        button: deps.iconButtonEntityButtonElement,
                        menu: deps.iconButtonEntityMenuElement,
                        search: deps.iconButtonEntitySearchElement,
                        options: deps.iconButtonEntityOptionsElement,
                        except: "icon-button-entity",
                        recommended: (relatedPopupElementFlag: any) =>
                          deps.renderNavigationIconPreview(relatedPopupElementFlag) === "light",
                      }
                    : componentType === "icon-button-effect"
                      ? {
                          componentType: componentType,
                          button: deps.ibeEntityButtonElement,
                          menu: deps.ibeEntityMenuElement,
                          search: deps.ibeEntitySearchElement,
                          options: deps.ibeEntityOptionsElement,
                          except: "ibe-entity",
                          recommended: (relatedPopupElementSlot: any) =>
                            deps.renderNavigationIconPreview(relatedPopupElementSlot) === "light",
                        }
                      : componentType === "weather"
                        ? {
                            componentType: componentType,
                            button: deps.weatherEntityButtonElement,
                            menu: deps.weatherEntityMenuElement,
                            search: deps.weatherEntitySearchElement,
                            options: deps.weatherEntityOptionsElement,
                            except: "weather-entity",
                            recommended: (relatedPopupElementCase: any) =>
                              deps.renderNavigationIconPreview(relatedPopupElementCase) === "weather",
                          }
                        : componentType === "line-chart"
                          ? {
                              componentType: componentType,
                              button: deps.lineChartEntityButtonElement,
                              menu: deps.lineChartEntityMenuElement,
                              search: deps.lineChartEntitySearchInputElement,
                              options: deps.lineChartEntityOptionsElement,
                              except: "line-chart-entity",
                              recommended: (relatedPopupElementStep: any) =>
                                deps.renderNavigationIconPreview(relatedPopupElementStep) === "sensor",
                            }
                          : {
                              componentType: "image",
                              button: deps.imageEntityButtonElement,
                              menu: deps.imageEntityMenuElement,
                              search: deps.imageEntitySearchElement,
                              options: deps.imageEntityOptionsElement,
                              except: "entity",
                              recommended: (relatedPopupElementPhase: any) =>
                                ["image", "camera"].includes(
                                  deps.renderNavigationIconPreview(relatedPopupElementPhase),
                                ),
                            };
}

export function renderRelatedPopupEntityOptions(deps: AssetPickerDeps, description = "", componentType = "image") {
  const ao2 = deps.runExtraAlt(componentType),
    relatedPopupElementView = deps.removedComponent()?.bindings?.entity?.entityId || "",
    relatedPopupElementStore = description.trim().toLocaleLowerCase("zh-CN"),
    relatedPopupElementCache = deps.runPortion(componentType)
      .map((mappedItemsFlag: any, mappedItemsSlot: any) => ({
        entity: mappedItemsFlag,
        index: mappedItemsSlot,
      }))
      .filter(
        ({ entity: relatedPopupElementQueue }: any) =>
          !relatedPopupElementStore ||
          (
            deps.runMode(relatedPopupElementQueue) +
            " " +
            deps.renderNavigationIconPreview(relatedPopupElementQueue)
          )
            .toLocaleLowerCase("zh-CN")
            .includes(relatedPopupElementStore),
      )
      .sort((relatedPopupElementBuffer: any, relatedPopupElementCursor: any) => {
        const relatedPopupElementHandler = (relatedPopupElementPointer: any) =>
          relatedPopupElementPointer?.virtual
            ? 100
            : Number(ao2.recommended(relatedPopupElementPointer));
        return (
          relatedPopupElementHandler(relatedPopupElementCursor.entity) -
            relatedPopupElementHandler(relatedPopupElementBuffer.entity) ||
          relatedPopupElementBuffer.index - relatedPopupElementCursor.index
        );
      })
      .map(({ entity: mappedItemsCase }: any) => mappedItemsCase),
    relatedPopupElementElement = document.createElement("button");
  ((relatedPopupElementElement.type = "button"),
    (relatedPopupElementElement.className =
      "inspector-entity-option inspector-entity-clear" +
      (relatedPopupElementView ? "" : " selected")),
    (relatedPopupElementElement.dataset.entityId = ""),
    relatedPopupElementElement.setAttribute("role", "option"),
    relatedPopupElementElement.setAttribute("aria-selected", String(!relatedPopupElementView)),
    (relatedPopupElementElement.textContent = "不使用实体"));
  const mappedItemsStep = relatedPopupElementCache.map((mappedItemsPhase: any) => {
      const relatedPopupElementPanel = document.createElement("button");
      ((relatedPopupElementPanel.type = "button"),
        (relatedPopupElementPanel.className =
          "inspector-entity-option" +
          (mappedItemsPhase.entityId === relatedPopupElementView ? " selected" : "")),
        (relatedPopupElementPanel.dataset.entityId = mappedItemsPhase.entityId),
        relatedPopupElementPanel.setAttribute("role", "option"),
        relatedPopupElementPanel.setAttribute(
          "aria-selected",
          String(mappedItemsPhase.entityId === relatedPopupElementView),
        ));
      const relatedPopupElementSection = document.createElement("span");
      ((relatedPopupElementSection.className = "inspector-entity-option-content"),
        (relatedPopupElementSection.title = deps.runMode(mappedItemsPhase)));
      const relatedPopupElementCard = document.createElement("span");
      relatedPopupElementCard.className = "inspector-entity-option-line inspector-entity-name-line";
      const relatedPopupElementBar = document.createElement("span");
      ((relatedPopupElementBar.className = "inspector-entity-kind"),
        (relatedPopupElementBar.textContent = "[" + deps.runQueue(mappedItemsPhase) + "] "));
      const relatedPopupElementList = document.createElement("span");
      ((relatedPopupElementList.className = "inspector-entity-name"),
        (relatedPopupElementList.textContent = deps.runSnapshot(mappedItemsPhase)),
        relatedPopupElementCard.append(relatedPopupElementBar, relatedPopupElementList));
      const relatedPopupElementRow = document.createElement("span");
      return (
        (relatedPopupElementRow.className = "inspector-entity-option-line inspector-entity-id"),
        (relatedPopupElementRow.textContent = mappedItemsPhase.entityId),
        (relatedPopupElementRow.title = mappedItemsPhase.entityId),
        relatedPopupElementSection.append(relatedPopupElementCard, relatedPopupElementRow),
        deps.runAlt(relatedPopupElementPanel, relatedPopupElementCard),
        relatedPopupElementPanel.append(relatedPopupElementSection),
        relatedPopupElementPanel
      );
    }),
    relatedPopupElementBox = document.createElement("div");
  ((relatedPopupElementBox.className = "inspector-picker-empty"),
    relatedPopupElementCache.length || (relatedPopupElementBox.textContent = "没有匹配的实体"),
    ao2.options.replaceChildren(
      relatedPopupElementElement,
      ...mappedItemsStep,
      ...(relatedPopupElementBox.textContent ? [relatedPopupElementBox] : []),
    ),
    (ao2.options.scrollTop = 0));
}

export function syncPopupEntityPickerButton(deps: AssetPickerDeps, triggerElement: any) {
  const ao3 = deps.runExtraAlt(triggerElement.type),
    relatedPopupElementTarget = triggerElement.bindings?.entity?.entityId || "",
    relatedPopupElementSource = deps.runPortion(triggerElement.type).find(
      (relatedPopupElementOrigin: any) =>
        relatedPopupElementOrigin.entityId === relatedPopupElementTarget,
    ),
    rt2 = relatedPopupElementSource
      ? deps.runMode(relatedPopupElementSource)
      : relatedPopupElementTarget || "不使用实体";
  let relatedPopupElementDraft = ao3.button.querySelector(".inspector-picker-value");
  (relatedPopupElementDraft ||
    ((relatedPopupElementDraft = document.createElement("span")),
    (relatedPopupElementDraft.className = "inspector-picker-value"),
    ao3.button.replaceChildren(relatedPopupElementDraft),
    deps.runAlt(ao3.button, relatedPopupElementDraft)),
    (relatedPopupElementDraft.textContent = rt2),
    (relatedPopupElementDraft.title = rt2),
    (ao3.button.dataset.entityId = relatedPopupElementTarget),
    ao3.button._entityCopySync?.(),
    (ao3.search.value = ""),
    ao3.menu.hidden || deps.runExtraVariant("", triggerElement.type),
    updateRelatedPopup(
      triggerElement,
      ao3.relatedSettings === false ? null : ao3.button.closest(".inspector-picker"),
    ));
}

export function resolveAssetPreviewUrl(deps: AssetPickerDeps, asset = "image") {
  const ao4 = deps.runExtraAlt(asset);
  if (ao4.menu.hidden) return;
  const assetIdText = ao4.button.getBoundingClientRect(),
    userAssetId = 5,
    assetMenuHorizontalMarginPx = 8,
    availableSizeName = Math.min(assetIdText.width, window.innerWidth - assetMenuHorizontalMarginPx * 2),
    availableSizeKey = window.innerHeight - assetIdText.bottom - userAssetId - assetMenuHorizontalMarginPx,
    measuredBoundsName = assetIdText.top - userAssetId - assetMenuHorizontalMarginPx,
    assetRelativePathState = availableSizeKey >= 250 || availableSizeKey >= measuredBoundsName,
    assetRelativePath = Math.max(
      150,
      Math.min(430, assetRelativePathState ? availableSizeKey : measuredBoundsName),
    ),
    left2 = assetIdText.left;
  ((ao4.menu.style.left =
    clampNumber2(
      left2,
      assetMenuHorizontalMarginPx,
      Math.max(assetMenuHorizontalMarginPx, window.innerWidth - availableSizeName - assetMenuHorizontalMarginPx),
    ) + "px"),
    (ao4.menu.style.width = availableSizeName + "px"),
    (ao4.menu.style.maxHeight = assetRelativePath + "px"),
    (ao4.options.style.maxHeight = Math.max(90, assetRelativePath - 58) + "px"),
    (ao4.menu.style.top = assetRelativePathState
      ? assetIdText.bottom + userAssetId + "px"
      : Math.max(assetMenuHorizontalMarginPx, assetIdText.top - assetRelativePath - userAssetId) + "px"));
}

export function refreshImageAssetPickerPreview(deps: AssetPickerDeps) {
  deps.resolveAssetPreviewUrl("image");
}

export function resolveAssetFileUrl(deps: AssetPickerDeps, asset: any) {
  if (asset?.url) return String(asset.url);
  const encodedAssetPath = String(asset?.assetId || "");
  if (encodedAssetPath.startsWith("user:")) {
    const slice2 = encodedAssetPath.slice(5);
    return /^[0-9a-f]{32}$/.test(slice2) ? "/api/v1/assets/user/" + slice2 : "";
  }
  const replace2 = String(asset?.relativePath || encodedAssetPath).replace(
      /^builtin:/,
      "",
    ),
    join = (
      replace2.startsWith("v1/2D/") || replace2.startsWith("v1/3D/")
        ? replace2.replace(/^v1\//, "v1/户型图示例/")
        : replace2
    )
      .split("/")
      .filter(Boolean)
      .map((pathSegment) => encodeURIComponent(pathSegment))
      .join("/");
  if (!join) return "";
  return "/assets/builtin/" + join;
}

export function resolveEffectAssetUrl(deps: AssetPickerDeps, effectAsset: any) {
  const effectVariantUrl = effectAsset?.effectVariant?.url;
  return typeof effectVariantUrl == "string" &&
    effectVariantUrl.startsWith("/api/v1/assets/effect-variant?")
    ? effectVariantUrl
    : deps.runExtraTwin(effectAsset);
}

export function assetMatchesId(deps: AssetPickerDeps, assetRecord: any, targetAssetId: any) {

  return assetRecord?.assetId === targetAssetId;
}

export function allAssets(deps: AssetPickerDeps) {
  return [...deps.editorCtx.userAssetsState, ...deps.editorCtx.userAssets];
}

export function findAssetById(deps: AssetPickerDeps, wantedAssetId: any) {
  return deps.allAssets().find((assetCandidate: any) => deps.assetMatchesId(assetCandidate, wantedAssetId));
}

export function assetDisplayName(deps: AssetPickerDeps, namedAsset: any) {
  return String(namedAsset?.name || namedAsset?.relativePath || namedAsset?.assetId || "").replace(
    /\.(?:png|jpe?g|webp|gif|svg)$/i,
    "",
  );
}

export function exportedAssetsInFolder(deps: AssetPickerDeps, targetFolderName: any) {
  return deps.editorCtx.userAssets.filter(
    (folderAsset: any) =>
      folderAsset.folder === targetFolderName && folderAsset.source === "studio3d-export",
  );
}

export function canDeleteAssetFolder(deps: AssetPickerDeps, folderSource: any, assetFolderName: any) {
  if (folderSource !== "user" || !assetFolderName) return false;
  const folderAssets = deps.editorCtx.userAssets.filter(
    (folderAssetRecord: any) => folderAssetRecord.folder === assetFolderName,
  );
  return (
    folderAssets.length > 0 &&
    folderAssets.every((checkedAsset: any) => checkedAsset.source === "studio3d-export")
  );
}

export function syncAssetFolderOptions(deps: AssetPickerDeps, assetSourceKind: any) {
  const isImageKind = assetSourceKind === "image",
    Zt3 = isImageKind ? deps.editorCtx.imageAssetFolder : deps.editorCtx.effectAssetFolder,
    et2 = isImageKind ? deps.imageAssetMenuElement : deps.ibeAssetMenuElement,
    Ao2 = isImageKind ? deps.imageAssetFolderSelectElement : deps.ibeAssetFolderElement,
    folderSelectInputElement = isImageKind
      ? deps.imageAssetUploadHintElement
      : deps.ibeAssetUploadHintElement,
    folderSelectInput = isImageKind ? "[data-image-asset-source]" : "[data-ibe-asset-source]";
  for (const folderNamesElement of et2.querySelectorAll(folderSelectInput))
    folderNamesElement.classList.toggle(
      "active",
      folderNamesElement.dataset[isImageKind ? "imageAssetSource" : "ibeAssetSource"] === Zt3,
    );
  const folderNames = deps.customSelectsBySelectElement.get(Ao2);
  if (folderNames) {
    const Nt2 = Zt3 === "user" ? deps.editorCtx.userAssets : deps.editorCtx.userAssetsState;
    ((folderNames.wrapper.hidden = !Nt2.some((sourceAssetItem: any) => sourceAssetItem.folder)),
      folderNames.wrapper.hidden && deps.runState(folderNames));
  }
  folderSelectInputElement.hidden = Zt3 !== "user";
}

export function leftFolderName(deps: AssetPickerDeps, rightFolderName: any) {
  const isCurrentFolder = rightFolderName === "image",
    Zt4 = isCurrentFolder ? deps.editorCtx.imageAssetFolder : deps.editorCtx.effectAssetFolder,
    Ao3 = isCurrentFolder ? deps.imageAssetFolderSelectElement : deps.ibeAssetFolderElement,
    Nt3 = Zt4 === "user" ? deps.editorCtx.userAssets : deps.editorCtx.userAssetsState,
    sort3 = [
      ...new Set<string>(
        Nt3.map((mappedItemsView: any) => String(mappedItemsView.folder ?? "")).filter(Boolean),
      ),
    ].sort((leftFolderLabel: string, rightFolderLabel: string) =>
      leftFolderLabel.localeCompare(rightFolderLabel, "zh-CN"),
    ),
    xn2 = isCurrentFolder ? deps.editorCtx.imageAssetFolderState : deps.editorCtx.effectAssetFolderState,
    nextFolder = sort3.includes(xn2) ? xn2 : sort3[0] || "";
  (isCurrentFolder ? (deps.editorCtx.imageAssetFolderState = nextFolder) : (deps.editorCtx.effectAssetFolderState = nextFolder),
    Ao3.replaceChildren(
      ...sort3.map(
        (folderNameToOption) =>
          new Option(
            folderNameToOption === "." ? "根目录" : String(folderNameToOption),
            String(folderNameToOption),
          ),
      ),
    ),
    (Ao3.value = nextFolder),
    deps.loadNavigationIconOptions(Ao3),
    deps.syncAssetFolderOptions(rightFolderName));
}

export function measureAssetImageSize(deps: AssetPickerDeps, measuredAsset: any) {
  return Number(measuredAsset?.width) > 0 && Number(measuredAsset?.height) > 0
    ? Promise.resolve({
        width: Number(measuredAsset.width),
        height: Number(measuredAsset.height),
      })
    : new Promise<{ width: number; height: number }>((resolveImageSize, rejectImageSize) => {
        const image = new Image();
        ((image.decoding = "async"),
          image.addEventListener(
            "load",
            () => {
              ((measuredAsset.width = image.naturalWidth),
                (measuredAsset.height = image.naturalHeight),
                resolveImageSize({
                  width: measuredAsset.width,
                  height: measuredAsset.height,
                }));
            },
            {
              once: true,
            },
          ),
          image.addEventListener(
            "error",
            () => rejectImageSize(new Error("无法读取图片尺寸：" + (measuredAsset?.name || ""))),
            {
              once: true,
            },
          ),
          (image.src = deps.runExtraTwin(measuredAsset)));
      });
}

export function applyAssetNaturalSize(deps: AssetPickerDeps, assetComponent: any, appliedAssetId: any, naturalSize: any) {
  const buildAssetLayout = (layoutPosition: any, layoutScale: any) => {
    const naturalWidth = Number(layoutPosition?.width || naturalSize.width),
      naturalHeight = Number(layoutPosition?.height || naturalSize.height),
      scaleFactor = clampNumber2(Number(layoutScale || 1), 0.01, 5),
      centerY = Number(layoutPosition?.x || 0) + naturalWidth / 2,
      centerYState = Number(layoutPosition?.y || 0) + naturalHeight / 2;
    return {
      position: {
        ...(layoutPosition || {}),
        x: centerY - naturalSize.width / 2,
        y: centerYState - naturalSize.height / 2,
        width: naturalSize.width,
        height: naturalSize.height,
      },
      scale: clampNumber2((naturalWidth * scaleFactor) / naturalSize.width, 0.01, 5),
    };
  };
  if (
    ((assetComponent.properties = {
      ...(assetComponent.properties || {}),
    }),
    assetComponent.properties.layoutMode === "fill")
  ) {
    const freeLayout = assetComponent.properties.freeLayout;
    if (freeLayout?.position) {
      const filledLayout = buildAssetLayout(freeLayout.position, freeLayout.scale);
      assetComponent.properties.freeLayout = filledLayout;
    }
  } else {
    const computedLayout = buildAssetLayout(assetComponent.position, assetComponent.style?.scale);
    ((assetComponent.position = computedLayout.position),
      (assetComponent.style = {
        ...(assetComponent.style || {}),
        scale: computedLayout.scale,
      }));
  }
  assetComponent.properties = {
    ...(assetComponent.properties || {}),
    assetId: appliedAssetId,
    fit: "contain",
    naturalWidth: naturalSize.width,
    naturalHeight: naturalSize.height,
  };
}

export function readEffectNaturalSize(deps: AssetPickerDeps, effectSourceComponent: any, fallbackSize: any = null) {
  const effectNaturalWidth = Number(
      effectSourceComponent?.effectNaturalWidth || fallbackSize?.width || 0,
    ),
    effectNaturalHeight = Number(
      effectSourceComponent?.effectNaturalHeight || fallbackSize?.height || 0,
    );
  return effectNaturalWidth > 0 && effectNaturalHeight > 0
    ? {
        width: effectNaturalWidth,
        height: effectNaturalHeight,
      }
    : null;
}

export function probeAssetNaturalSize(deps: AssetPickerDeps, probedComponent: any, probedAsset: any) {
  if (!probedComponent || !probedAsset) return;
  const probeKey = probedComponent.id + ":" + probedAsset.assetId;
  deps.pendingAssetProbeKeysSet.has(probeKey) ||
    (deps.pendingAssetProbeKeysSet.add(probeKey),
    deps.measureAssetImageSize(probedAsset)
      .then((measuredSize: any) => {
        const liveComponent = findComponent2(
          deps.editorCtx.activeProject?.document,
          probedComponent.id,
        )?.component;
        !liveComponent ||
          liveComponent.properties?.assetId !== probedAsset.assetId ||
          ((liveComponent.properties?.layoutMode === "fill" ||
            (Number(liveComponent.position?.width) === measuredSize.width &&
              Number(liveComponent.position?.height) === measuredSize.height)) &&
            Number(liveComponent.properties?.naturalWidth) === measuredSize.width &&
            Number(liveComponent.properties?.naturalHeight) === measuredSize.height) ||
          deps.mutateDocument((mutatedDocument: any) => {
            const matchedDocumentComponent = findComponent2(
              mutatedDocument,
              probedComponent.id,
            )?.component;
            !matchedDocumentComponent ||
              matchedDocumentComponent.properties?.assetId !== probedAsset.assetId ||
              deps.applyAssetNaturalSize(matchedDocumentComponent, probedAsset.assetId, measuredSize);
          });
      })
      .catch(deps.handleOperationError)
      .finally(() => deps.pendingAssetProbeKeysSet.delete(probeKey)));
}

export function positionImageAssetMenu(deps: AssetPickerDeps) {
  if (deps.imageAssetMenuElement.hidden) return;
  const targetBoundsConfig = deps.imageAssetButtonElement.getBoundingClientRect(),
    imageAssetMenuMarginPx = 5,
    positionImageAssetGapPx = 8,
    availableSizePath =
      window.innerHeight -
      targetBoundsConfig.bottom -
      imageAssetMenuMarginPx -
      positionImageAssetGapPx,
    measuredBoundsKey =
      targetBoundsConfig.top - imageAssetMenuMarginPx - positionImageAssetGapPx,
    positionAssetLargePreviewState =
      availableSizePath >= 260 || availableSizePath >= measuredBoundsKey,
    clampedLowerRecord = Math.max(
      150,
      Math.min(470, positionAssetLargePreviewState ? availableSizePath : measuredBoundsKey),
    );
  ((deps.imageAssetMenuElement.style.left =
    clampNumber2(
      targetBoundsConfig.left,
      positionImageAssetGapPx,
      Math.max(
        positionImageAssetGapPx,
        window.innerWidth - targetBoundsConfig.width - positionImageAssetGapPx,
      ),
    ) + "px"),
    (deps.imageAssetMenuElement.style.width = targetBoundsConfig.width + "px"),
    (deps.imageAssetMenuElement.style.maxHeight = clampedLowerRecord + "px"),
    (deps.imageAssetOptionsElement.style.maxHeight = Math.max(80, clampedLowerRecord - 150) + "px"),
    (deps.imageAssetMenuElement.style.top = positionAssetLargePreviewState
      ? targetBoundsConfig.bottom + imageAssetMenuMarginPx + "px"
      : Math.max(
          positionImageAssetGapPx,
          targetBoundsConfig.top - clampedLowerRecord - imageAssetMenuMarginPx,
        ) + "px"));
}

export function positionAssetLargePreview(deps: AssetPickerDeps, hoveredOptionElement: any, assetMenuElement = deps.imageAssetMenuElement) {
  if (deps.imageAssetLargePreviewImageElement.hidden || !hoveredOptionElement?.isConnected) return;
  const optionRect = hoveredOptionElement.getBoundingClientRect(),
    menuRectState = assetMenuElement.getBoundingClientRect(),
    previewRect = deps.imageAssetLargePreviewImageElement.getBoundingClientRect(),
    previewGapPx = 18,
    previewLeftPx =
      menuRectState.left < window.innerWidth / 2
        ? menuRectState.right + previewGapPx
        : menuRectState.left - previewRect.width - previewGapPx;
  ((deps.imageAssetLargePreviewImageElement.style.left =
    clampNumber2(previewLeftPx, 12, Math.max(12, window.innerWidth - previewRect.width - 12)) +
    "px"),
    (deps.imageAssetLargePreviewImageElement.style.top =
      clampNumber2(optionRect.top, 12, Math.max(12, window.innerHeight - previewRect.height - 12)) +
      "px"));
}

export function scheduleAssetPreview(deps: AssetPickerDeps, 
  previewAsset: any,
  previewAnchorElement: any,
  previewMenuElement = deps.imageAssetMenuElement,
) {
  !previewAsset ||
    !previewAnchorElement ||
    (clearTimeout(deps.editorCtx.assetPreviewTimeoutId),
    (deps.editorCtx.assetPreviewTimeoutId = window.setTimeout(() => {
      const jp2 = deps.resolveEffectAssetUrl(previewAsset);
      !jp2 ||
        previewMenuElement.hidden ||
        !previewAnchorElement.isConnected ||
        ((deps.imageAssetLargePreviewImageElementElement.onload = () =>
          deps.positionAssetLargePreview(previewAnchorElement, previewMenuElement)),
        (deps.imageAssetLargePreviewImageElementElement.src = jp2),
        (deps.imageAssetLargePreviewNameElement.textContent =
          previewAsset.name || previewAsset.relativePath),
        (deps.imageAssetLargePreviewImageElement.hidden = false),
        window.requestAnimationFrame(() =>
          deps.positionAssetLargePreview(previewAnchorElement, previewMenuElement),
        ));
    }, 300)));
}

export function hideAssetLargePreview(deps: AssetPickerDeps) {
  (clearTimeout(deps.editorCtx.assetPreviewTimeoutId),
    (deps.editorCtx.assetPreviewTimeoutId = null),
    (deps.imageAssetLargePreviewImageElement.hidden = true),
    (deps.imageAssetLargePreviewImageElementElement.onload = null));
}

