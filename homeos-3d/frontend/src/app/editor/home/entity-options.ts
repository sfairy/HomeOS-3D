
type AnyObj = Record<string, any>;
/*
 * 实体选项与列表。
 */

import { createIconVisibilityVirtualEntity } from "../../shared/virtual-entities.js";
import { entityPickerConfig, renderEntityPickerOptions, renderIconOptions, renderLightStatisticsEntityOptions } from "./entity-options-pickers.js";
import { entityDomainOf } from "../../utils/entities.js";
import { findComponent } from "../component-tree.js";
import { lightStatisticsEntityStateStatus } from "../../renderer/core/registry.js";
import {
  normalizedPopupClimateDeviceType,
  popupModuleEntityRecommended
} from "../editor-document-management.js";
import { positionFloatingMenu } from "../../shared/menu-positioning.js";
import { resolveStateEntry, stateTextOf } from "../../utils/state-entry.js";

export function createEntityOptions(ctx: any) {
  // 被外提到同目录的新模块（见其文件头）：惰性上下文，调用点传 entityOptionsContext()。
  const entityOptionsContext = () => ({
    ctx,
    entityPickerConfig,
    selectableEntities,
    entityOptionLabel,
    entityKindLabel,
    entityDisplayName,
    registerOverflowPreviewRow,
    iconListState,
    encodeURIComponent,
  });


  /** 取实体在界面上展示的种类标签（如「灯光」「辅助元素」「虚拟实体」）。 */
  function entityKindLabel(entityForLabel: any) {
    const entityDomainName = entityDomainOf(entityForLabel);
    if (entityForLabel?.virtual) {
      return "虚拟实体";
    } else if (ctx.HELPER_ENTITY_DOMAINS.has(entityDomainName)) {
      return "辅助元素";
    } else {
      return ctx.ENTITY_DOMAIN_LABELS[entityDomainName] || entityDomainName || "实体";
    }
  }

  /**
   * 把连续空白压成单个空格并去掉首尾空白，用于拼接实体名。
   */
  function collapseWhitespace(textValue: any) {
    return String(textValue || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * 取实体所属设备的中文名。
   */
  function deviceNameForEntity(deviceEntity: any) {
    return collapseWhitespace(ctx.deviceNamesByDeviceId.get(String(deviceEntity?.deviceId || "")));
  }

  /**
   * 取实体名相对于设备名的「副标题」部分。HA 的实体名常被拼成「设备名 实体名」，直接用会重复；
   */
  function entityDisplaySubtitle(namedEntity: any, entityDeviceName: any = deviceNameForEntity(namedEntity)) {
    const entityName = collapseWhitespace(namedEntity?.name);
    const entityOriginalName = collapseWhitespace(namedEntity?.originalName);
    if (!entityDeviceName) {
      return entityName || entityOriginalName || namedEntity?.entityId || "";
    }
    const entitySubtitle =
      entityName === entityDeviceName
        ? ""
        : entityName.startsWith(entityDeviceName + " ")
          ? entityName.slice(entityDeviceName.length).trim()
          : entityName.startsWith(entityDeviceName + "·")
            ? entityName.slice(entityDeviceName.length + 1).trim()
            : entityName;
    if (entitySubtitle && entitySubtitle !== entityDeviceName) {
      return entitySubtitle;
    } else if (entityOriginalName && entityOriginalName !== entityDeviceName) {
      return entityOriginalName;
    } else {
      return "";
    }
  }

  /**
   * 取实体在界面上的完整展示名：设备名 + 副标题。
   */
  function entityDisplayName(entityForDisplay: any, displayNameOverride: any = "") {
    if (entityForDisplay?.virtual) {
      return entityForDisplay.name || entityForDisplay.entityId || "";
    }
    const displayDeviceName = deviceNameForEntity(entityForDisplay);
    const displaySubtitle =
      collapseWhitespace(displayNameOverride) ||
      entityDisplaySubtitle(entityForDisplay, displayDeviceName);
    if (displayDeviceName) {
      if (displaySubtitle && displaySubtitle !== displayDeviceName) {
        return displayDeviceName + " · " + displaySubtitle;
      } else {
        return displayDeviceName;
      }
    } else {
      return displaySubtitle || entityForDisplay?.entityId || "";
    }
  }

  /**
   * 取实体选择项的单行标签，形如「[灯光] 客厅灯 · light.living_room」。
   */
  function entityOptionLabel(entityForOption: any) {
    const optionDisplayName = entityDisplayName(entityForOption);
    const optionEntityId = entityForOption?.entityId || "";
    return (
      "[" +
      entityKindLabel(entityForOption) +
      "] " +
      optionDisplayName +
      (optionDisplayName && optionDisplayName !== optionEntityId ? " · " + optionEntityId : "")
    );
  }

  /**
   * 取控件绑定（properties.entityIds）里的实体 ID 去重列表。
   */
  function componentEntityIds(componentForEntityIds: any = ctx.selectedComponent()) {
    return [
      ...new Set(
        (Array.isArray(componentForEntityIds?.properties?.entityIds)
          ? componentForEntityIds.properties.entityIds
          : []
        )
          .map((entityIdValue: any) => String(entityIdValue || "").trim())
          .filter(Boolean)
      )
    ];
  }

  /**
   * 汇总灯光统计控件里某个实体的可用性与状态文案。状态取自渲染器的实际运行态（editorRenderer.states），
   */
  function lightStatisticsEntityStatus(statisticsTargetEntityId: any, statisticsEntity: any = null) {
    if (!statisticsEntity) {
      return {
        label: "实体已删除",
        tone: "missing"
      };
    }
    const statisticsStateEntry = ctx.editorRenderer?.states?.get?.(statisticsTargetEntityId);
    const statisticsEntityState = resolveStateEntry(statisticsStateEntry);
    const statisticsStateText = stateTextOf(statisticsEntityState);
    const statisticsStatus = lightStatisticsEntityStateStatus(
      statisticsEntity,
      statisticsEntityState
    );
    if (statisticsStatus === "on") {
      return {
        label: "已开启/运行",
        tone: "on"
      };
    } else if (statisticsStatus === "off") {
      return {
        label: "已关闭",
        tone: "off"
      };
    } else if (statisticsStateText === "unavailable") {
      return {
        label: "暂时不可用",
        tone: "abnormal"
      };
    } else if (statisticsStateText === "unknown") {
      return {
        label: "状态未知",
        tone: "abnormal"
      };
    } else if (statisticsStateText) {
      return {
        label: "无法判断：" + statisticsStateText,
        tone: "abnormal"
      };
    } else {
      return {
        label: "等待状态",
        tone: "abnormal"
      };
    }
  }

  /**
   * 设置灯光统计面板的提示文案（并切换错误样式）。文案为空时整条提示隐藏（用 !text 判断，顺带兜住
   */
  function setLightStatisticsMessage(statisticsMessageText: any = "", isStatisticsMessageError: any = false) {
    ctx.lightStatisticsEntityMessageElement.textContent = statisticsMessageText;
    ctx.lightStatisticsEntityMessageElement.hidden = !statisticsMessageText;
    ctx.lightStatisticsEntityMessageElement.classList.toggle("error", !!isStatisticsMessageError);
  }

  /**
   * 深度优先展开组件树，得到含所有层级子控件的扁平数组。结果数组由递归通过默认参数一路传递并原地追加，
   */
  function flattenComponents(flattenSourceComponents: any, flattenedResult: any = []) {
    for (const flattenedComponent of flattenSourceComponents || []) {
      flattenedResult.push(flattenedComponent);
      flattenComponents(flattenedComponent.children, flattenedResult);
    }
    return flattenedResult;
  }

  function componentsInPage(pageForComponents: any = ctx.currentPage()) {
    if (!pageForComponents || !ctx.activeProject?.document) {
      return [];
    }
    const sharedComponentsById = new Map(
      (ctx.activeProject.document.sharedComponents || []).map((sharedComponentEntry: any) => [
        sharedComponentEntry.id,
        sharedComponentEntry
      ])
    );
    /**
     * 该页引用的共享组件实体列表（保持 sharedComponentIds 的顺序）；引用失效的会被剔除。
     */
    const pageSharedComponents = (pageForComponents.sharedComponentIds || [])
      .map((sharedComponentId: any) => sharedComponentsById.get(sharedComponentId))
      .filter(Boolean);
    return flattenComponents([...(pageForComponents.components || []), ...pageSharedComponents]);
  }

  /**
   * 列出某类选择器可选的实体（真实实体 + 虚拟实体）。
   */
  function selectableEntities(_entityQueryType: any = "image") {
    return [...ctx.entities, ...iconVisibilityVirtualEntities()];
  }

  /**
   * 返回当前页面适用的「图标可见性」虚拟实体（没有则空数组）。虚拟实体不是真实 HA 实体，而是
   */
  function iconVisibilityVirtualEntities(pageForVirtualEntities: any = ctx.currentPage()) {
    if (
      componentsInPage(pageForVirtualEntities).some(
        (effectComponent: any) => effectComponent.type === "icon-button-effect"
      )
    ) {
      return [createIconVisibilityVirtualEntity(pageForVirtualEntities?.path)];
    } else {
      return [];
    }
  }

  function registerOverflowPreviewRow(previewRowElement: any, previewTargetList: any) {
    /**
     * 规范化后的待滚动元素数组；单个元素与数组都接受，空值在这里剔除。
     */
    const previewTargets = (
      Array.isArray(previewTargetList) ? previewTargetList : [previewTargetList]
    ).filter(Boolean);
    for (const previewTarget of previewTargets) {
      previewTarget.dataset.overflowScrollPreview = "true";
    }
    if (previewRowElement && previewTargets.length) {
      previewRowElement.dataset.overflowScrollPreviewRow = "true";
      previewTargetsByRow.set(previewRowElement, previewTargets);
    }
  }

  /**
   * 取（必要时创建）选择器按钮内承载文案的 .inspector-picker-value 元素。
   */
  function ensurePickerValueElement(pickerValueHostElement: any) {
    if (!pickerValueHostElement) {
      return null;
    }
    let pickerValueElement = (pickerValueHostElement.querySelector(".inspector-picker-value")) as any;
    if (!pickerValueElement) {
      pickerValueElement = document.createElement("span");
      pickerValueElement.className = "inspector-picker-value";
      pickerValueElement.textContent = pickerValueHostElement.textContent.trim();
      pickerValueHostElement.replaceChildren(pickerValueElement);
    }
    registerOverflowPreviewRow(pickerValueHostElement, pickerValueElement);
    return pickerValueElement;
  }

  /**
   * 更新选择器按钮的显示文案与 title。
   */
  function setPickerButtonLabel(pickerButtonElement: any, pickerButtonLabel: any, pickerButtonTitle: any = "") {
    const pickerValueTarget = ensurePickerValueElement(pickerButtonElement);
    if (pickerValueTarget) {
      pickerValueTarget.textContent = pickerButtonLabel;
      pickerValueTarget.title = pickerButtonTitle || pickerButtonLabel;
      pickerButtonElement.title = pickerButtonTitle || pickerButtonLabel;
    }
  }

  /**
   * 取某种组件的实体选择器配置（触发按钮、下拉菜单、搜索框、选项容器），含 except（菜单互斥分组名）与
   */
  

  /**
   * 渲染实体选择器的候选列表：虚拟实体固定 100 分排最前（它们代表图标可见性这类特殊绑定），其余按组件自带的
   */
  

  /**
   * 把控件当前绑定的实体回填到选择器按钮上（文档 → 表单）。绑定的实体可能已不存在，此时直接显示原始
   */
  function syncEntityPickerValue(component: any) {
    const componentPickerConfig = entityPickerConfig(component.type, entityOptionsContext());
    const boundEntityId = component.bindings?.entity?.entityId || "";
    const matchedEntity = selectableEntities(component.type).find(
      (candidateEntity: any) => candidateEntity.entityId === boundEntityId
    );
    const pickerLabel = matchedEntity
      ? entityOptionLabel(matchedEntity)
      : boundEntityId || "不使用实体";
    let valueElement = (componentPickerConfig.button.querySelector(".inspector-picker-value")) as any;
    if (!valueElement) {
      valueElement = document.createElement("span");
      valueElement.className = "inspector-picker-value";
      componentPickerConfig.button.replaceChildren(valueElement);
      registerOverflowPreviewRow(componentPickerConfig.button, valueElement);
    }
    valueElement.textContent = pickerLabel;
    valueElement.title = pickerLabel;
    componentPickerConfig.button.dataset.entityId = boundEntityId;
    componentPickerConfig.button._entityCopySync?.();
    componentPickerConfig.search.value = "";
    if (!componentPickerConfig.menu.hidden) {
      renderEntityPickerOptions("", component.type, entityOptionsContext());
    }
    ctx.updateRelatedPopup(
      component,
      componentPickerConfig.relatedSettings === false
        ? null
        : componentPickerConfig.button.closest(".inspector-picker")
    );
  }

  /**
   * 把实体下拉摆到按钮下方（空间不足则翻到上方）。阈值同 positionLightStatisticsEntityMenu
   */
  function positionEntityPickerMenu(pickerComponentType: any = "image") {
    const activePickerConfig = entityPickerConfig(pickerComponentType, entityOptionsContext());
    positionFloatingMenu({
      anchorElement: activePickerConfig.button,
      menuElement: activePickerConfig.menu,
      optionsElement: activePickerConfig.options,
      widthMode: "clamped",
      maxHeightPx: 430,
      listTrimPx: 58
    });
  }

  /**
   * 把图片素材下拉摆到触发按钮下方。直接复用通用的实体选择器菜单定位逻辑（传入 "image" 取图片类的
   */
  function positionImagePickerMenu() {
    positionEntityPickerMenu("image");
  }

  /**
   * 按实体 ID 取显示名。
   */
  function popupEntityDisplayName(entityIdKey: any) {
    return (
      ctx.entities.find((matchedCatalogEntity: any) => matchedCatalogEntity.entityId === entityIdKey)?.name ||
      entityIdKey ||
      "未选择实体"
    );
  }

  function syncPopupEntityInputs() {
    for (const popupEntityInput of document.querySelectorAll("[data-popup-entity]") as any) {
      const popupTriggerElement = popupEntityInput.closest("[data-action-trigger]");
      if (!popupEntityInput.value && ctx.entities[0]?.entityId) {
        popupEntityInput.value = ctx.entities[0].entityId;
      }
      ctx.syncPopupEntityButton(popupTriggerElement);
      const entityMenuPopupElement = (popupTriggerElement?.querySelector("[data-popup-entity-menu]")) as any;
      if (entityMenuPopupElement && !entityMenuPopupElement.hidden) {
        ctx.renderPopupEntityOptions(
          popupTriggerElement,
          (popupTriggerElement as any)?.querySelector("[data-popup-entity-search]")?.value || ""
        );
      }
    }
  }

  function syncPopupModuleDeviceType(
    deviceTypeName = ctx.popupModuleFormElement.elements.deviceType.value
  ) {
    const isClimatePopup = ctx.popupModuleFormElement.elements.type.value === "climate";
    const normalizedDeviceType = normalizedPopupClimateDeviceType(deviceTypeName);
    ctx.popupModuleClimateDeviceTypeElement.hidden = !isClimatePopup;
    ctx.popupModuleFormElement.elements.deviceType.value = normalizedDeviceType;
    for (const climateDeviceTypeButtonElement of ctx.popupModuleClimateDeviceTypeElement.querySelectorAll(
      "[data-popup-module-device-type]"
    )) {
      const isDeviceTypeOptionActive =
        climateDeviceTypeButtonElement.dataset.popupModuleDeviceType === normalizedDeviceType;
      climateDeviceTypeButtonElement.classList.toggle("active", isDeviceTypeOptionActive);
      climateDeviceTypeButtonElement.setAttribute("aria-pressed", String(isDeviceTypeOptionActive));
    }
  }

  /**
   * 回填组合弹窗模块的实体选择按钮：文案、dataset 与按钮内的复制同步钩子。
   */
  function syncPopupModuleEntityButton() {
    const moduleEntityId = ctx.popupModuleFormElement.elements.entityId.value;
    const moduleEntity = ctx.entities.find((entity: any) => entity.entityId === moduleEntityId);
    const moduleEntityLabel = moduleEntity
      ? "[" + entityKindLabel(moduleEntity) + "] " + entityDisplayName(moduleEntity)
      : moduleEntityId || "选择实体";
    setPickerButtonLabel(
      ctx.popupModuleEntityButtonElement,
      moduleEntityLabel,
      moduleEntityId || moduleEntityLabel
    );
    ctx.popupModuleEntityButtonElement.dataset.entityId = moduleEntityId;
    ctx.popupModuleEntityButtonElement._entityCopySync?.();
  }

  function renderPopupModuleEntityOptions(searchText: any = ctx.popupModuleEntitySearchInputElement.value) {
    const boundModuleEntityId = ctx.popupModuleFormElement.elements.entityId.value;
    const normalizedSearch = String(searchText || "")
      .trim()
      .toLocaleLowerCase("zh-CN");
    const candidateModuleEntities = ctx.entities
      .map((entityWithIndex: any, catalogIndex: any) => ({
        entity: entityWithIndex,
        index: catalogIndex
      }))
      .filter(
        ({ entity: filteredEntityOption }: AnyObj) =>
          !normalizedSearch ||
          (entityOptionLabel(filteredEntityOption) + " " + filteredEntityOption.entityId)
            .toLocaleLowerCase("zh-CN")
            .includes(normalizedSearch)
      )
      .sort(
        (leftCandidate: any, rightCandidate: any) =>
          Number(
            popupModuleEntityRecommended(
              rightCandidate.entity,
              ctx.popupModuleFormElement.elements.type.value
            )
          ) -
            Number(
              popupModuleEntityRecommended(
                leftCandidate.entity,
                ctx.popupModuleFormElement.elements.type.value
              )
            ) || leftCandidate.index - rightCandidate.index
      )
      .map(({ entity: orderedEntity }: AnyObj) => orderedEntity);
    ctx.popupModuleEntityOptionsElement.replaceChildren(
      ...candidateModuleEntities.map((moduleEntityOption: any) => {
        const moduleOptionButton = document.createElement("button");
        moduleOptionButton.type = "button";
        moduleOptionButton.className =
          "inspector-entity-option" +
          (moduleEntityOption.entityId === boundModuleEntityId ? " selected" : "");
        moduleOptionButton.dataset.popupModuleEntityId = moduleEntityOption.entityId;
        moduleOptionButton.setAttribute("role", "option");
        moduleOptionButton.setAttribute(
          "aria-selected",
          String(moduleEntityOption.entityId === boundModuleEntityId)
        );
        const moduleOptionContentElement = document.createElement("span");
        moduleOptionContentElement.className = "inspector-entity-option-content";
        const moduleNameLineElement = document.createElement("span");
        moduleNameLineElement.className = "inspector-entity-option-line inspector-entity-name-line";
        moduleNameLineElement.textContent =
          "[" + entityKindLabel(moduleEntityOption) + "] " + entityDisplayName(moduleEntityOption);
        const moduleIdElement = document.createElement("span");
        moduleIdElement.className = "inspector-entity-option-line inspector-entity-id";
        moduleIdElement.textContent = moduleEntityOption.entityId;
        moduleOptionContentElement.append(moduleNameLineElement, moduleIdElement);
        registerOverflowPreviewRow(moduleOptionButton, moduleNameLineElement);
        moduleOptionButton.append(moduleOptionContentElement);
        return moduleOptionButton;
      })
    );
    if (!candidateModuleEntities.length) {
      const moduleNoMatchElement = document.createElement("div");
      moduleNoMatchElement.className = "inspector-picker-empty";
      moduleNoMatchElement.textContent = "没有匹配的实体";
      ctx.popupModuleEntityOptionsElement.append(moduleNoMatchElement);
    }
  }

  /**
   * 取（必要时初始化）某个图标列表容器的滚动加载状态。状态按容器存在 WeakMap 里：同一个页面同时挂着
   */
  function iconListState(iconOptionsElement: any) {
    let iconListStateValue = ctx.iconListStateByElement.get(iconOptionsElement);
    if (!iconListStateValue) {
      iconListStateValue = {
        query: "",
        offset: 0,
        total: 0,
        loading: false,
        complete: false,
        generation: 0
      };
      ctx.iconListStateByElement.set(iconOptionsElement, iconListStateValue);
    }
    return iconListStateValue;
  }

  /**
   * 移除图标名悬浮提示。
   */
  function hideIconTooltip() {
    ctx.iconTooltipElement?.remove();
    ctx.iconTooltipElement = null;
  }

  /**
   * 在锚点元素上方居中显示图标名气泡（空间不足改到下方）。气泡挂在最近的 <dialog> 内而非 body：
   */
  function showIconTooltip(tooltipAnchorElement: any, tooltipText: any) {
    hideIconTooltip();
    const tooltipDialogElement = tooltipAnchorElement.closest("dialog");
    if (!tooltipDialogElement?.open || !tooltipText) {
      return;
    }
    const tooltipContentElement = document.createElement("div");
    tooltipContentElement.className = "editor-icon-name-tooltip";
    tooltipContentElement.textContent = tooltipText;
    tooltipDialogElement.append(tooltipContentElement);
    const anchorRect = tooltipAnchorElement.getBoundingClientRect();
    const tooltipRect = tooltipContentElement.getBoundingClientRect();
    const tooltipLeftPx = Math.min(
      window.innerWidth - tooltipRect.width - 8,
      Math.max(8, anchorRect.left + (anchorRect.width - tooltipRect.width) / 2)
    );
    let tooltipTopPx = anchorRect.top - tooltipRect.height - 8;
    if (tooltipTopPx < 8) {
      tooltipTopPx = anchorRect.bottom + 8;
    }
    tooltipContentElement.style.left = tooltipLeftPx + "px";
    tooltipContentElement.style.top = tooltipTopPx + "px";
    ctx.iconTooltipElement = tooltipContentElement;
  }

  function attachIconTooltip(tooltipTargetElement: any, tooltipLabelText: any) {
    tooltipTargetElement.addEventListener("pointerenter", () =>
      showIconTooltip(tooltipTargetElement, tooltipLabelText)
    );
    tooltipTargetElement.addEventListener("pointerleave", hideIconTooltip);
    tooltipTargetElement.addEventListener("focus", () =>
      showIconTooltip(tooltipTargetElement, tooltipLabelText)
    );
    tooltipTargetElement.addEventListener("blur", hideIconTooltip);
  }

  

  /**
   * 给滚动容器挂上「滚到底部自动加载下一页」的行为。阈值 120px：提前一屏的一小段距离就开始加载，
   */
  function attachInfiniteScroll(infiniteScrollElement: any, loadMoreIcons: any) {
    infiniteScrollElement.addEventListener("scroll", () => {
      if (
        !(
          infiniteScrollElement.scrollHeight -
            infiniteScrollElement.scrollTop -
            infiniteScrollElement.clientHeight >
          120
        )
      ) {
        loadMoreIcons().catch(ctx.handleOperationError);
      }
    });
  }

  /**
   * 加载导航控件的图标候选。
   */
  async function loadNavigationIconOptions(
    navigationIconQuery = "",
    { append: appendNavigationIcons = false } = {}
  ) {
    return renderIconOptions({
      optionsElement: ctx.navigationIconOptionsElement,
      query: navigationIconQuery,
      currentIcon: ctx.selectedComponent()?.properties?.icon || "",
      append: appendNavigationIcons
    }, entityOptionsContext());
  }

  /**
   * 加载图标按钮「效果图标」的候选列表。
   */
  async function loadIconButtonEffectIconOptions(
    effectIconQuery = "",
    { append: appendEffectIcons = false } = {}
  ) {
    return renderIconOptions({
      optionsElement: ctx.iconButtonEffectIconOptionsElement,
      query: effectIconQuery,
      currentIcon: ctx.selectedComponent()?.properties?.icon || "",
      append: appendEffectIcons
    }, entityOptionsContext());
  }

  /**
   * 加载图标按钮「常态图标」的候选列表。设备按钮未指定图标时首项文案是「跟随实体图标」（图标来自实体绑定），
   */
  async function loadIconButtonIconOptions(
    iconButtonIconQuery = "",
    { append: appendIconButtonIcons = false } = {}
  ) {
    const iconButtonIconComponent = ctx.selectedComponent();
    return renderIconOptions({
      optionsElement: ctx.iconButtonIconOptionsElement,
      query: iconButtonIconQuery,
      currentIcon: iconButtonIconComponent?.properties?.icon || "",
      clearLabel: iconButtonIconComponent?.type === "device-button" ? "跟随实体图标" : "不使用图标",
      append: appendIconButtonIcons
    }, entityOptionsContext());
  }

  /**
   * 加载标题按钮图标的候选列表。
   */
  async function loadTitleButtonIconOptions(
    titleIconQuery = "",
    { append: appendTitleIcons = false } = {}
  ) {
    return renderIconOptions({
      optionsElement: ctx.titleButtonIconOptionsElement,
      query: titleIconQuery,
      currentIcon: ctx.selectedComponent()?.properties?.icon || "",
      append: appendTitleIcons
    }, entityOptionsContext());
  }

  async function loadLightStatisticsIconOptions(
    statisticsIconQuery = "",
    { append: appendStatisticsIcons = false } = {}
  ) {
    const statisticsIconProperties = ctx.selectedComponent()?.properties || {};
    const statisticsDefaultIcon = String(
      Object.hasOwn(statisticsIconProperties, "icon")
        ? statisticsIconProperties.icon || ""
        : "mdi:lightbulb-group-outline"
    );
    return renderIconOptions({
      optionsElement: ctx.lightStatisticsIconOptionsElement,
      query: statisticsIconQuery,
      currentIcon: statisticsDefaultIcon,
      datasetKey: "lightStatisticsIconName",
      append: appendStatisticsIcons
    }, entityOptionsContext());
  }

  /**
   * 把导航图标下拉摆到按钮下方（空间不足则翻到上方）。
   */
  function positionNavigationIconMenu() {
    positionFloatingMenu({
      anchorElement: ctx.navigationIconButtonElement.parentElement,
      menuElement: ctx.navigationIconMenuElement,
      optionsElement: ctx.navigationIconOptionsElement
    });
  }

  /**
   * 把图标按钮「效果」图标下拉摆到按钮下方（空间不足则翻到上方）。
   */
  function positionIconButtonEffectIconMenu() {
    positionFloatingMenu({
      anchorElement: ctx.iconButtonEffectIconButtonElement.parentElement,
      menuElement: ctx.iconButtonEffectIconMenuElement,
      optionsElement: ctx.iconButtonEffectIconOptionsElement
    });
  }

  /**
   * 把图标按钮的图标下拉摆到按钮下方（空间不足则翻到上方）。
   */
  function positionIconButtonIconMenu() {
    positionFloatingMenu({
      anchorElement: ctx.iconButtonIconButtonElement.parentElement,
      menuElement: ctx.iconButtonIconMenuElement,
      optionsElement: ctx.iconButtonIconOptionsElement
    });
  }

  /**
   * 把标题按钮图标下拉摆到按钮下方（空间不足则翻到上方）。
   */
  function positionTitleButtonIconMenu() {
    positionFloatingMenu({
      anchorElement: ctx.titleButtonIconButtonElement.parentElement,
      menuElement: ctx.titleButtonIconMenuElement,
      optionsElement: ctx.titleButtonIconOptionsElement
    });
  }

  /**
   * 把灯光统计的图标下拉摆到按钮下方（空间不足则翻到上方）。
   */
  function positionLightStatisticsIconMenu() {
    positionFloatingMenu({
      anchorElement: ctx.lightStatisticsIconButtonElement.parentElement,
      menuElement: ctx.lightStatisticsIconMenuElement,
      optionsElement: ctx.lightStatisticsIconOptionsElement
    });
  }

  /**
   * 把灯光统计的实体下拉摆到按钮下方（空间不足则翻到上方）。
   */
  function positionLightStatisticsEntityMenu() {
    positionFloatingMenu({
      anchorElement: ctx.lightStatisticsEntityButtonElement,
      menuElement: ctx.lightStatisticsEntityMenuElement,
      optionsElement: ctx.lightStatisticsEntityOptionsElement,
      widthMode: "clamped",
      maxHeightPx: 430,
      listTrimPx: 58
    });
  }

  function resetLightStatisticsPicker({ clearMessage: shouldClearMessage = true } = {}) {
    ctx.statisticsEntityId = "";
    ctx.statisticsReplaceIndex = -1;
    ctx.statisticsComponentId = "";
    ctx.lightStatisticsEntityPendingElement.hidden = true;
    setPickerButtonLabel(ctx.lightStatisticsEntityButtonElement, "选择一个实体");
    if (shouldClearMessage) {
      setLightStatisticsMessage("");
    }
  }

  

  /**
   * 选中候选实体并立即写入统计控件。
   */
  function pickLightStatisticsEntity(
    pickedStatisticsEntityId: any,
    statisticsReplaceIndexTarget: any = ctx.statisticsReplaceIndex
  ) {
    const statisticsPickerComponent = ctx.selectedComponent();
    if (
      statisticsPickerComponent?.type !== "light-statistics" ||
      !selectableEntities("light-statistics").find(
        (statisticsEntityCandidate: any) => statisticsEntityCandidate.entityId === pickedStatisticsEntityId
      )
    ) {
      return;
    }
    const existingStatisticsIndex =
      componentEntityIds(statisticsPickerComponent).indexOf(pickedStatisticsEntityId);
    if (existingStatisticsIndex >= 0 && existingStatisticsIndex !== statisticsReplaceIndexTarget) {
      setLightStatisticsMessage("该实体已添加，请选择其它实体。", true);
      return;
    }
    ctx.statisticsEntityId = pickedStatisticsEntityId;
    ctx.statisticsReplaceIndex = Number.isInteger(statisticsReplaceIndexTarget)
      ? statisticsReplaceIndexTarget
      : -1;
    ctx.statisticsComponentId = statisticsPickerComponent.id;
    return addLightStatisticsEntity();
  }

  /**
   * 把当前选中的实体加入统计控件（替换模式下改写对应下标）。校验做了两层：mutateDocument 之外先拦一次
   */
  function addLightStatisticsEntity() {
    const statisticsTargetComponentId = ctx.selectedComponentId;
    const statisticsEntityIdToAdd = ctx.statisticsEntityId;
    const statisticsReplaceIndexValue = ctx.statisticsReplaceIndex;
    const statisticsEntityForAdd = ctx.entities.find(
      (statisticsEntityEntry: any) => statisticsEntityEntry.entityId === statisticsEntityIdToAdd
    );
    if (!statisticsTargetComponentId || !statisticsEntityIdToAdd || !statisticsEntityForAdd) {
      return;
    }
    const statisticsCurrentComponent = ctx.selectedComponent();
    if (
      statisticsReplaceIndexValue < 0 &&
      componentEntityIds(statisticsCurrentComponent).length >= ctx.MAX_LIGHT_STATISTICS_ENTITIES
    ) {
      setLightStatisticsMessage(
        "每个统计控件最多添加 " + ctx.MAX_LIGHT_STATISTICS_ENTITIES + " 个实体。",
        true
      );
      return;
    }
    return ctx.mutateDocument((statisticsAddDocument: any) => {
      const statisticsAddComponent = findComponent(
        statisticsAddDocument,
        statisticsTargetComponentId
      )?.component;
      if (!statisticsAddComponent || statisticsAddComponent.type !== "light-statistics") {
        return "component-invalid";
      }
      const statisticsEntityIds = componentEntityIds(statisticsAddComponent);
      const existingEntityIndex = statisticsEntityIds.indexOf(statisticsEntityIdToAdd);
      if (existingEntityIndex >= 0 && existingEntityIndex !== statisticsReplaceIndexValue) {
        return "duplicate";
      }
      const replacedStatisticsEntityId =
        statisticsReplaceIndexValue >= 0 && statisticsReplaceIndexValue < statisticsEntityIds.length
          ? statisticsEntityIds[statisticsReplaceIndexValue]
          : "";
      if (
        !replacedStatisticsEntityId &&
        statisticsEntityIds.length >= ctx.MAX_LIGHT_STATISTICS_ENTITIES
      ) {
        return "limit-reached";
      }
      if (statisticsReplaceIndexValue >= 0 && !replacedStatisticsEntityId) {
        return "component-invalid";
      }
      if (replacedStatisticsEntityId) {
        statisticsEntityIds.splice(statisticsReplaceIndexValue, 1, statisticsEntityIdToAdd);
      } else {
        statisticsEntityIds.push(statisticsEntityIdToAdd);
      }
      const statisticsEntityLabels = {
        ...(statisticsAddComponent.properties?.entityLabels || {})
      };
      if (replacedStatisticsEntityId && replacedStatisticsEntityId !== statisticsEntityIdToAdd) {
        delete (statisticsEntityLabels as AnyObj)[replacedStatisticsEntityId as any];
      }
      (statisticsEntityLabels as AnyObj)[statisticsEntityIdToAdd as any] = entityDisplayName(statisticsEntityForAdd);
      statisticsAddComponent.properties = {
        ...(statisticsAddComponent.properties || {}),
        entityIds: statisticsEntityIds,
        entityLabels: statisticsEntityLabels
      };
      if (replacedStatisticsEntityId) {
        return "replaced";
      } else {
        return "added";
      }
    }).then((statisticsAddResult: any) =>
      statisticsAddResult === "limit-reached"
        ? (setLightStatisticsMessage(
            "每个统计控件最多添加 " + ctx.MAX_LIGHT_STATISTICS_ENTITIES + " 个实体。",
            true
          ),
          statisticsAddResult)
        : statisticsAddResult === "duplicate"
          ? (setLightStatisticsMessage("该实体已添加，请选择其它实体。", true), statisticsAddResult)
          : statisticsAddResult === "component-invalid"
            ? (setLightStatisticsMessage("当前统计控件已发生变化，请重新选择。", true),
              statisticsAddResult)
            : ((statisticsAddResult !== "added" && statisticsAddResult !== "replaced") ||
                (resetLightStatisticsPicker({
                  clearMessage: false
                }),
                setLightStatisticsMessage(
                  statisticsAddResult === "replaced" ? "已更换统计实体。" : "已加入统计列表。"
                )),
              statisticsAddResult)
    );
  }

  /**
   * 从灯光统计组件的实体列表里移除指定下标的实体，并同步清理 properties.entityLabels 里对应的标签，
   */
  function removeLightStatisticsEntity(statisticsRemoveIndex: any) {
    const statisticsRemoveComponentId = ctx.selectedComponentId;
    if (
      !!statisticsRemoveComponentId &&
      !!Number.isInteger(statisticsRemoveIndex) &&
      !(statisticsRemoveIndex < 0)
    ) {
      ctx.mutateDocument((statisticsRemoveDocument: any) => {
        const statisticsRemoveComponent = findComponent(
          statisticsRemoveDocument,
          statisticsRemoveComponentId
        )?.component;
        if (!statisticsRemoveComponent || statisticsRemoveComponent.type !== "light-statistics") {
          return;
        }
        const statisticsRemoveEntityIds = componentEntityIds(statisticsRemoveComponent);
        const [removedStatisticsEntityId] = statisticsRemoveEntityIds.splice(
          statisticsRemoveIndex,
          1
        );
        const statisticsRemoveEntityLabels = {
          ...(statisticsRemoveComponent.properties?.entityLabels || {})
        };
        if (removedStatisticsEntityId) {
          delete (statisticsRemoveEntityLabels as AnyObj)[removedStatisticsEntityId as any];
        }
        statisticsRemoveComponent.properties = {
          ...(statisticsRemoveComponent.properties || {}),
          entityIds: statisticsRemoveEntityIds,
          entityLabels: statisticsRemoveEntityLabels
        };
      });
      resetLightStatisticsPicker();
    }
  }

  /**
   * 渲染「已加入统计」的实体行（名称、ID、运行状态与更换 / 删除按钮）。实体可能已从系统里消失，
   */
  function renderLightStatisticsEntities(statisticsRowComponent: any = ctx.selectedComponent()) {
    if (statisticsRowComponent?.type !== "light-statistics") {
      return;
    }
    const statisticsRowEntityIds = componentEntityIds(statisticsRowComponent);
    const statisticsRowEntityLabels = statisticsRowComponent.properties?.entityLabels || {};
    ctx.lightStatisticsEntityCountElement.textContent = statisticsRowEntityIds.length + " 个";
    const statisticsRowElements = statisticsRowEntityIds.map(
      (statisticsRowEntityId, statisticsRowIndex) => {
        const statisticsRowEntityEntry =
          selectableEntities("light-statistics").find(
            (statisticsRowEntity: any) => statisticsRowEntity.entityId === statisticsRowEntityId
          ) || null;
        const statisticsRowStatus = lightStatisticsEntityStatus(
          statisticsRowEntityId,
          statisticsRowEntityEntry
        );
        const statisticsRowElement = document.createElement("div");
        statisticsRowElement.className =
          "light-statistics-entity-row " +
          statisticsRowStatus.tone +
          (statisticsRowEntityEntry ? "" : " missing");
        const statisticsRowCopyElement = document.createElement("div");
        const statisticsRowNameElement = document.createElement("strong");
        statisticsRowNameElement.textContent = statisticsRowEntityEntry
          ? entityDisplayName(statisticsRowEntityEntry)
          : (statisticsRowEntityLabels as AnyObj)[statisticsRowEntityId as any] || statisticsRowEntityId;
        const statisticsRowMetaElement = document.createElement("small");
        statisticsRowMetaElement.textContent =
          statisticsRowEntityId + " · " + statisticsRowStatus.label;
        statisticsRowCopyElement.append(statisticsRowNameElement, statisticsRowMetaElement);
        const statisticsRowActionsElement = document.createElement("span");
        statisticsRowActionsElement.className = "light-statistics-entity-actions";
        const statisticsRowReplaceButtonElement = document.createElement("button");
        statisticsRowReplaceButtonElement.type = "button";
        statisticsRowReplaceButtonElement.dataset.lightStatisticsReplaceIndex =
          String(statisticsRowIndex);
        statisticsRowReplaceButtonElement.textContent = "更换";
        const statisticsRowRemoveButtonElement = document.createElement("button");
        statisticsRowRemoveButtonElement.type = "button";
        statisticsRowRemoveButtonElement.dataset.lightStatisticsRemoveIndex =
          String(statisticsRowIndex);
        statisticsRowRemoveButtonElement.textContent = "删除";
        statisticsRowActionsElement.append(
          statisticsRowReplaceButtonElement,
          statisticsRowRemoveButtonElement
        );
        statisticsRowElement.append(statisticsRowCopyElement, statisticsRowActionsElement);
        return statisticsRowElement;
      }
    );
    ctx.lightStatisticsEntityListElement.replaceChildren(...statisticsRowElements);
  }

  /**
   * 停止某一行的悬停滚动并复位。定时器与动画帧都要清：元素被移除后 rAF 会一直跑下去；
   */
  function stopHoverScroll(hoverScrollRowElement: any) {
    const hoverScrollState = hoverScrollStateByRow.get(hoverScrollRowElement);
    if (hoverScrollState) {
      window.clearTimeout(hoverScrollState.timer);
      window.cancelAnimationFrame(hoverScrollState.frame);
      hoverScrollStateByRow.delete(hoverScrollRowElement);
    }
    hoverScrollRowElement.scrollLeft = 0;
    hoverScrollRowElement.classList.remove("hover-scrolling");
  }

  /**
   * 从事件目标向上找到可横向滚动的预览元素。先按选择器找直接命中项，找不到再退回到所在行登记的
   */
  function findOverflowPreviewTarget(closestSourceElement: any) {
    const previewTargetElement = closestSourceElement.closest?.(HOVER_SCROLL_TARGET_SELECTOR);
    if (previewTargetElement) {
      return previewTargetElement;
    }
    const previewRowSourceElement = closestSourceElement.closest?.(
      "[data-overflow-scroll-preview-row]"
    );
    return previewTargetsByRow.get(previewRowSourceElement)?.[0] || null;
  }

  /**
   * 找到元素所属的滚动预览行。
   */
  function findOverflowRow(overflowRowCandidate: any) {
    return (
      overflowRowCandidate?.closest?.("[data-overflow-scroll-preview-row]") || overflowRowCandidate
    );
  }

  const hoverScrollStateByRow = new WeakMap<any, any>();

  const previewTargetsByRow = new WeakMap<any, any>();

  const HOVER_SCROLL_TARGET_SELECTOR =
    "[data-overflow-scroll-preview], .inspector-picker-value, .inspector-entity-name-line";

  return { HOVER_SCROLL_TARGET_SELECTOR, addLightStatisticsEntity, attachIconTooltip, attachInfiniteScroll, collapseWhitespace, componentEntityIds, componentsInPage, deviceNameForEntity, ensurePickerValueElement, entityDisplayName, entityDisplaySubtitle, entityKindLabel, entityOptionLabel, entityPickerConfig: (...args: any[]) => (entityPickerConfig as any)(...args, entityOptionsContext()), findOverflowPreviewTarget, findOverflowRow, flattenComponents, hideIconTooltip, hoverScrollStateByRow, iconListState, iconVisibilityVirtualEntities, lightStatisticsEntityStatus, loadIconButtonEffectIconOptions, loadIconButtonIconOptions, loadLightStatisticsIconOptions, loadNavigationIconOptions, loadTitleButtonIconOptions, pickLightStatisticsEntity, popupEntityDisplayName, positionEntityPickerMenu, positionIconButtonEffectIconMenu, positionIconButtonIconMenu, positionImagePickerMenu, positionLightStatisticsEntityMenu, positionLightStatisticsIconMenu, positionNavigationIconMenu, positionTitleButtonIconMenu, previewTargetsByRow, registerOverflowPreviewRow, removeLightStatisticsEntity, renderEntityPickerOptions: (...args: any[]) => (renderEntityPickerOptions as any)(...args, entityOptionsContext()), renderIconOptions: (...args: any[]) => (renderIconOptions as any)(...args, entityOptionsContext()), renderLightStatisticsEntities, renderLightStatisticsEntityOptions: (...args: any[]) => (renderLightStatisticsEntityOptions as any)(...args, entityOptionsContext()), renderPopupModuleEntityOptions, resetLightStatisticsPicker, selectableEntities, setLightStatisticsMessage, setPickerButtonLabel, showIconTooltip, stopHoverScroll, syncEntityPickerValue, syncPopupEntityInputs, syncPopupModuleDeviceType, syncPopupModuleEntityButton };
}
